import "server-only";
import { put } from "@vercel/blob";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { EVENT_PREFIX } from "@/lib/photos";
import { requireFlag } from "@/lib/flags";
import { AppError, idempotent, parse, sha256, withAudit, writeAudit, z, zx, type Actor, type Receipt } from "./core";
import { staffActor, tokenHash, type Staff } from "./auth";

// Event photos (SPEC §8, fallback/06). A photo is private until a human has
// identified everyone in it, every one of them has photo_publication consent
// *now*, and an organizer approved and published it. Camera matching alone is
// never permission: face-match candidates (opted-in only) are suggestions that
// a staff member confirms per photo; QR/badge scan and manual lookup are the
// reliable path. Unknown identity or unknown consent means HOLD.
//
// State machine (event_photos.status):
//   captured → identity_review → consent_checked → caption_drafted → approved → published
//   any → rejected; published → identity_review when a consent is revoked (unpublish)

export type PhotoStatus = "captured" | "identity_review" | "consent_checked" | "caption_drafted" | "approved" | "published" | "rejected";
export const PHOTO_STATUSES: PhotoStatus[] = ["captured", "identity_review", "consent_checked", "caption_drafted", "approved", "published", "rejected"];
export const STATUS_LABEL: Record<PhotoStatus, string> = {
  captured: "Captured",
  identity_review: "Identify people",
  consent_checked: "Consent checked",
  caption_drafted: "Caption drafted",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
};

export const STUDIO_PREFIX = `${EVENT_PREFIX}studio/`;
const MAX_BYTES = 4 * 1024 * 1024;

type Tx = Pick<PoolClient, "query">;

// ── Consent ──────────────────────────────────────────────────────────────────

export type PersonInPhoto = {
  member_id: number;
  name: string;
  public_code: string | null;
  team_id: number | null;
  team_name: string | null;
  match_basis: "qr_badge" | "manual_confirmation" | "opted_in_candidate";
  confirmed_at: Date | null;
  /** Latest photo_publication answer; null = never asked. */
  publication: boolean | null;
  /** Latest social_mention answer (may we name/tag them in a post?). */
  mention: boolean | null;
  x_handle: string | null;
};

async function peopleIn(photoId: number, db: Tx | null = null): Promise<PersonInPhoto[]> {
  const sql = `select pp.member_id, coalesce(m.display_name, m.name) as name, m.public_code, m.team_id, t.name as team_name,
                      pp.match_basis, pp.confirmed_at,
                      (select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'photo_publication') as publication,
                      (select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'social_mention') as mention,
                      m.x_handle
                 from photo_people pp join members m on m.id = pp.member_id left join teams t on t.id = m.team_id
                where pp.photo_id = $1 order by pp.created_at`;
  if (db) return (await db.query<PersonInPhoto>(sql, [photoId])).rows;
  return query<PersonInPhoto>(sql, [photoId]);
}

export type ConsentCheck = { ok: boolean; problems: string[]; people: PersonInPhoto[] };

/** Every person confirmed, every person consented, or nobody identifiable attested. */
export function evaluateConsent(people: PersonInPhoto[], attestedNone: boolean): ConsentCheck {
  const problems: string[] = [];
  for (const p of people) {
    if (!p.confirmed_at) problems.push(`${p.name}: face-match suggestion not confirmed by a person yet.`);
    if (p.publication === false) problems.push(`${p.name} said no to photo publication.`);
    else if (p.publication !== true) problems.push(`${p.name} hasn't answered photo publication (unknown means hold).`);
  }
  if (!people.length && !attestedNone) problems.push("No one identified. Identify everyone in frame, or attest that nobody is identifiable.");
  return { ok: problems.length === 0, problems, people };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export type PhotoRow = {
  id: number;
  team_id: number | null;
  team_name: string | null;
  team_slug: string | null;
  photo_key: string;
  pathname: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  alt_text: string | null;
  status: PhotoStatus;
  source: string;
  rights_basis: string | null;
  hold_reason: string | null;
  rejected_reason: string | null;
  photographer_name: string | null;
  approved_by_name: string | null;
  no_people_attested_at: Date | null;
  captured_at: Date | null;
  consent_checked_at: Date | null;
  approved_at: Date | null;
  created_at: Date;
  people_count: number;
  draft_count: number;
};

const PHOTO_COLS = `e.id, e.team_id, t.name as team_name, t.slug as team_slug, e.photo_key, e.pathname, e.width, e.height, e.caption, e.alt_text,
  e.status, e.source, e.rights_basis, e.hold_reason, e.rejected_reason, ph.name as photographer_name, ap.name as approved_by_name,
  e.no_people_attested_at, e.captured_at, e.consent_checked_at, e.approved_at, e.created_at,
  (select count(*)::int from photo_people pp where pp.photo_id = e.id) as people_count,
  (select count(*)::int from social_drafts d where d.photo_id = e.id) as draft_count`;
const PHOTO_FROM = `event_photos e left join teams t on t.id = e.team_id
  left join staff_accounts ph on ph.id = e.photographer_id left join staff_accounts ap on ap.id = e.approved_by`;

export async function getPhoto(id: number) {
  const [row] = await query<PhotoRow>(`select ${PHOTO_COLS} from ${PHOTO_FROM} where e.id = $1`, [id]);
  if (!row) throw new AppError("NOT_FOUND", { userMessage: "No photo with that id." });
  return { photo: row, people: await peopleIn(id) };
}

export async function listPhotos(opts: { statuses?: PhotoStatus[]; photographerId?: number | null; limit?: number } = {}) {
  const params: unknown[] = [opts.statuses ?? PHOTO_STATUSES, opts.limit ?? 200];
  let where = "e.status = any($1)";
  if (opts.photographerId) {
    params.push(opts.photographerId);
    where += ` and e.photographer_id = $${params.length}`;
  }
  return query<PhotoRow>(`select ${PHOTO_COLS} from ${PHOTO_FROM} where ${where} order by e.created_at desc limit $2`, params);
}

export async function photoCounts() {
  const rows = await query<{ status: PhotoStatus; n: number }>("select status, count(*)::int as n from event_photos group by status");
  return Object.fromEntries(PHOTO_STATUSES.map((s) => [s, rows.find((r) => r.status === s)?.n ?? 0])) as Record<PhotoStatus, number>;
}

// ── People lookup (QR/badge scan or manual) ──────────────────────────────────

export type LookupHit = { id: number; name: string; public_code: string | null; team_name: string | null; checked_in: boolean; publication: boolean | null };

/** Manual lookup by P-code, name or team. Staff only; returns no emails. */
export async function lookupPeople(q: string): Promise<LookupHit[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  return query<LookupHit>(
    `select m.id, coalesce(m.display_name, m.name) as name, m.public_code, t.name as team_name, (m.checked_in_at is not null) as checked_in,
            (select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'photo_publication') as publication
       from members m left join teams t on t.id = m.team_id
      where m.deleted_at is null
        and (upper(m.public_code) = upper($1) or m.name ilike $2 or m.display_name ilike $2 or t.name ilike $2 or t.slug = lower($1))
      order by (upper(m.public_code) = upper($1)) desc, m.name limit 20`,
    [s, `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`],
  );
}

/** A scanned badge: a P-#### code anywhere in the text, or a badge token (khk_…, hash lookup). */
export async function resolveBadge(scan: string): Promise<LookupHit | null> {
  const code = scan.toUpperCase().match(/\bP-\d{3,}\b/)?.[0];
  const token = scan.match(/khk_[A-Za-z0-9_-]{8,}/)?.[0];
  let memberId: number | null = null;
  if (code) {
    const [m] = await query<{ id: number }>("select id from members where upper(public_code) = $1 and deleted_at is null", [code]);
    memberId = m?.id ?? null;
  } else if (token) {
    const [t] = await query<{ member_id: number }>(
      "select member_id from member_tokens where token_hash = $1 and kind = 'badge' and revoked_at is null and expires_at > now()",
      [tokenHash(token)],
    );
    memberId = t?.member_id ?? null;
  }
  if (!memberId) return null;
  const [hit] = await query<LookupHit>(
    `select m.id, coalesce(m.display_name, m.name) as name, m.public_code, t.name as team_name, (m.checked_in_at is not null) as checked_in,
            (select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'photo_publication') as publication
       from members m left join teams t on t.id = m.team_id where m.id = $1`,
    [memberId],
  );
  return hit ?? null;
}

// ── Studio capture ───────────────────────────────────────────────────────────

const receipt = (id: number | string, at: Date | string = new Date()): Receipt => ({ id: `PH-${id}`, server_time: new Date(at).toISOString() });

/** Photographer upload → private Blob → status captured. Same bytes twice = same photo. */
export async function createStudioPhoto(staff: Staff, file: File, meta: { width?: number; height?: number } = {}) {
  await requireFlag("photo_studio");
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new AppError("VALIDATION_FAILED", { userMessage: "Upload a JPEG, PNG or WebP image." });
  if (file.size > MAX_BYTES) throw new AppError("VALIDATION_FAILED", { userMessage: "That image is over 4 MB. The camera page shrinks photos; try it from there." });
  const bytes = Buffer.from(await file.arrayBuffer());
  const key = sha256(bytes).slice(0, 40);
  const [existing] = await query<{ id: number; created_at: Date }>("select id, created_at from event_photos where source = 'studio' and photo_key = $1", [key]);
  if (existing) return { data: { id: existing.id, duplicate: true }, receipt: receipt(existing.id, existing.created_at) };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const pathname = `${STUDIO_PREFIX}${key}.${ext}`;
  await put(pathname, bytes, { access: "private", contentType: file.type, allowOverwrite: true });
  const id = await withAudit<number>(staffActor(staff), "photo.capture", "event_photo", async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `insert into event_photos (team_id, photo_key, pathname, width, height, status, photographer_id, source, rights_basis, captured_at)
       values (null, $1, $2, $3, $4, 'captured', $5, 'studio', 'staff_photographer', now())
       on conflict (photo_key) where source = 'studio' do update set photo_key = excluded.photo_key
       returning id`,
      [key, pathname, meta.width ?? null, meta.height ?? null, staff.id],
    );
    return { result: rows[0].id, resourceId: rows[0].id, payload: { pathname } };
  });
  return { data: { id, duplicate: false }, receipt: receipt(id) };
}

// ── Identification ───────────────────────────────────────────────────────────

const identifySchema = z.object({
  photo_id: zx.id,
  member_id: zx.id,
  basis: z.enum(["qr_badge", "manual_confirmation"]),
});

/** A human identified someone (badge scan or lookup). Sets the photo's team if it has none. */
export async function identifyPerson(staff: Staff, raw: unknown) {
  const input = parse(identifySchema, raw);
  await withAudit(staffActor(staff), "photo.identify", "event_photo", async (tx) => {
    const { rows } = await tx.query<{ status: PhotoStatus; team_id: number | null }>("select status, team_id from event_photos where id = $1 for update", [input.photo_id]);
    const photo = rows[0];
    if (!photo) throw new AppError("NOT_FOUND");
    if (photo.status === "published" || photo.status === "rejected") throw new AppError("CONFLICT", { userMessage: `This photo is ${photo.status}. Reject or hold it before changing who is in it.` });
    const m = await tx.query<{ team_id: number | null }>("select team_id from members where id = $1 and deleted_at is null", [input.member_id]);
    if (!m.rowCount) throw new AppError("NOT_FOUND", { userMessage: "No participant with that id." });
    await tx.query(
      `insert into photo_people (photo_id, member_id, match_basis, reviewer_staff_id, confirmed_at)
       values ($1, $2, $3, $4, now())
       on conflict (photo_id, member_id) do update set match_basis = excluded.match_basis, reviewer_staff_id = excluded.reviewer_staff_id, confirmed_at = now()`,
      [input.photo_id, input.member_id, input.basis, staff.id],
    );
    // People changed: any earlier consent check or caption no longer applies.
    await tx.query(
      `update event_photos set status = 'identity_review', team_id = coalesce(team_id, $2), consent_checked_at = null, no_people_attested_at = null, no_people_attested_by = null
        where id = $1`,
      [input.photo_id, m.rows[0].team_id],
    );
    await tx.query("update social_drafts set status = 'rejected' where photo_id = $1 and status in ('draft','approved')", [input.photo_id]);
    return { result: null, resourceId: input.photo_id, payload: { member_id: input.member_id, basis: input.basis } };
  });
  return { data: null, receipt: receipt(input.photo_id) };
}

/** Confirm a face-match suggestion (a human looked at it) or drop it. */
export async function reviewCandidate(staff: Staff, raw: unknown) {
  const input = parse(z.object({ photo_id: zx.id, member_id: zx.id, decision: z.enum(["confirm", "remove"]) }), raw);
  await withAudit(staffActor(staff), input.decision === "confirm" ? "photo.candidate_confirm" : "photo.person_remove", "event_photo", async (tx) => {
    const { rows } = await tx.query<{ status: PhotoStatus }>("select status from event_photos where id = $1 for update", [input.photo_id]);
    if (!rows[0]) throw new AppError("NOT_FOUND");
    if (rows[0].status === "published") throw new AppError("CONFLICT", { userMessage: "Hold or reject the photo before changing who is in it." });
    if (input.decision === "confirm") {
      const r = await tx.query("update photo_people set confirmed_at = now(), reviewer_staff_id = $3 where photo_id = $1 and member_id = $2", [input.photo_id, input.member_id, staff.id]);
      if (!r.rowCount) throw new AppError("NOT_FOUND");
    } else {
      await tx.query("delete from photo_people where photo_id = $1 and member_id = $2", [input.photo_id, input.member_id]);
    }
    await tx.query("update event_photos set status = case when status = 'captured' then 'captured' else 'identity_review' end, consent_checked_at = null where id = $1", [input.photo_id]);
    await tx.query("update social_drafts set status = 'rejected' where photo_id = $1 and status in ('draft','approved')", [input.photo_id]);
    return { result: null, resourceId: input.photo_id, payload: { member_id: input.member_id } };
  });
  return { data: null, receipt: receipt(input.photo_id) };
}

/** "Nobody identifiable in frame", attested by staff instead of per-person consent. */
export async function attestNoPeople(staff: Staff, raw: unknown) {
  const input = parse(z.object({ photo_id: zx.id, team_id: zx.id.optional() }), raw);
  await withAudit(staffActor(staff), "photo.attest_no_people", "event_photo", async (tx) => {
    const n = await tx.query("select 1 from photo_people where photo_id = $1", [input.photo_id]);
    if (n.rowCount) throw new AppError("CONFLICT", { userMessage: "People are linked to this photo. Remove them first if nobody is identifiable." });
    const r = await tx.query(
      `update event_photos set no_people_attested_at = now(), no_people_attested_by = $2, team_id = coalesce($3, team_id), status = 'identity_review'
        where id = $1 and status not in ('published','rejected')`,
      [input.photo_id, staff.id, input.team_id ?? null],
    );
    if (!r.rowCount) throw new AppError("CONFLICT", { userMessage: "This photo is published or rejected." });
    return { result: null, resourceId: input.photo_id };
  });
  return { data: null, receipt: receipt(input.photo_id) };
}

/** Run the consent gate. Passing moves the photo to consent_checked; failing holds it with the reasons. */
export async function checkPhotoConsent(staff: Staff, raw: unknown) {
  const { photo_id } = parse(z.object({ photo_id: zx.id }), raw);
  const check = await withAudit<ConsentCheck>(staffActor(staff), "photo.consent_check", "event_photo", async (tx) => {
    const { rows } = await tx.query<{ status: PhotoStatus; no_people_attested_at: Date | null; team_id: number | null }>(
      "select status, no_people_attested_at, team_id from event_photos where id = $1 for update",
      [photo_id],
    );
    const photo = rows[0];
    if (!photo) throw new AppError("NOT_FOUND");
    if (photo.status === "published" || photo.status === "rejected") throw new AppError("CONFLICT", { userMessage: `This photo is ${photo.status}.` });
    const people = await peopleIn(photo_id, tx);
    const result = evaluateConsent(people, !!photo.no_people_attested_at);
    if (result.ok && !photo.team_id) result.problems.push("Pick the team this photo belongs to.");
    result.ok = result.problems.length === 0;
    await tx.query(
      result.ok
        ? "update event_photos set status = case when status in ('caption_drafted','approved') then status else 'consent_checked' end, consent_checked_at = now(), hold_reason = null where id = $1"
        : "update event_photos set status = 'identity_review', consent_checked_at = null, hold_reason = $2 where id = $1",
      result.ok ? [photo_id] : [photo_id, result.problems.join(" ")],
    );
    return { result, resourceId: photo_id, after: { ok: result.ok, problems: result.problems } };
  });
  return { data: check, receipt: receipt(photo_id) };
}

// ── Approval and publication (organizer) ─────────────────────────────────────

async function regate(tx: Tx, photoId: number) {
  const { rows } = await tx.query<{ status: PhotoStatus; no_people_attested_at: Date | null; team_id: number | null; pathname: string; caption: string | null; alt_text: string | null }>(
    "select status, no_people_attested_at, team_id, pathname, caption, alt_text from event_photos where id = $1 for update",
    [photoId],
  );
  const photo = rows[0];
  if (!photo) throw new AppError("NOT_FOUND");
  const check = evaluateConsent(await peopleIn(photoId, tx), !!photo.no_people_attested_at);
  if (!check.ok) {
    throw new AppError("CONSENT_REQUIRED", { userMessage: `Held: ${check.problems[0]}`, details: { problems: check.problems } });
  }
  return { photo, check };
}

export async function approvePhoto(staff: Staff, raw: unknown) {
  const input = parse(z.object({ photo_id: zx.id, caption: zx.optText(300), alt_text: zx.optText(500) }), raw);
  await withAudit(staffActor(staff), "photo.approve", "event_photo", async (tx) => {
    const { photo } = await regate(tx, input.photo_id);
    if (!["consent_checked", "caption_drafted"].includes(photo.status)) throw new AppError("CONFLICT", { userMessage: "Run the consent check first." });
    if (!photo.team_id) throw new AppError("VALIDATION_FAILED", { userMessage: "Pick a team for this photo first." });
    if (!(input.alt_text ?? photo.alt_text)) throw new AppError("VALIDATION_FAILED", { userMessage: "Add alt text before approving." });
    await tx.query(
      `update event_photos set status = 'approved', approved_by = $2, approved_at = now(), caption = coalesce($3, caption), alt_text = coalesce($4, alt_text), hold_reason = null where id = $1`,
      [input.photo_id, staff.id, input.caption, input.alt_text],
    );
    return { result: null, resourceId: input.photo_id };
  });
  return { data: null, receipt: receipt(input.photo_id) };
}

/** Publish to the team gallery(ies). Consent is re-checked at this moment. */
export async function publishPhoto(staff: Staff, raw: unknown) {
  const { photo_id } = parse(z.object({ photo_id: zx.id }), raw);
  const out = await withAudit(staffActor(staff), "photo.publish", "event_photo", async (tx) => {
    const { photo, check } = await regate(tx, photo_id);
    if (photo.status !== "approved") throw new AppError("CONFLICT", { userMessage: "Approve the photo before publishing it." });
    await tx.query("update event_photos set status = 'published', hold_reason = null where id = $1", [photo_id]);
    const teams = new Set<number>([photo.team_id!, ...check.people.map((p) => p.team_id).filter((t): t is number => !!t)]);
    return { result: { teams: [...teams], pathname: photo.pathname, caption: photo.caption }, resourceId: photo_id };
  });
  const slugs = await query<{ id: number; slug: string }>("select id, slug from teams where id = any($1)", [out.teams]);
  for (const t of slugs) {
    await notify({
      teamId: t.id,
      kind: "photo",
      title: "New photo of your team",
      body: out.caption ?? "A photographer just caught you in action. See it in your gallery.",
      href: `/t/${t.slug}/photos`,
      imagePath: out.pathname,
    }).catch(() => {});
  }
  return { data: null, receipt: receipt(photo_id) };
}

/** Reject (from any state). A published photo disappears from galleries at once. */
export async function rejectPhoto(staff: Staff, raw: unknown) {
  const input = parse(z.object({ photo_id: zx.id, reason: zx.text(300) }), raw);
  await withAudit(staffActor(staff), "photo.reject", "event_photo", async (tx) => {
    const r = await tx.query<{ status: string }>("update event_photos set status = 'rejected', rejected_reason = $2 where id = $1 returning status", [input.photo_id, input.reason]);
    if (!r.rowCount) throw new AppError("NOT_FOUND");
    await tx.query("update social_drafts set status = 'rejected' where photo_id = $1 and status in ('draft','approved')", [input.photo_id]);
    return { result: null, resourceId: input.photo_id, reason: input.reason };
  });
  return { data: null, receipt: receipt(input.photo_id) };
}

/** Put a published/approved photo back into review (unpublish) with a reason. */
export async function holdPhoto(actor: Actor, photoId: number, reason: string, db?: Tx) {
  const run = async (tx: Tx) => {
    const r = await tx.query(
      "update event_photos set status = 'identity_review', consent_checked_at = null, hold_reason = $2 where id = $1 and status in ('consent_checked','caption_drafted','approved','published')",
      [photoId, reason],
    );
    await tx.query("update social_drafts set status = 'rejected' where photo_id = $1 and status in ('draft','approved')", [photoId]);
    return r.rowCount ?? 0;
  };
  if (db) {
    const n = await run(db);
    if (n) await writeAudit(actor, { action: "photo.hold", resourceType: "event_photo", resourceId: photoId, reason }, db);
    return n;
  }
  return withAudit(actor, "photo.hold", "event_photo", async (tx) => ({ result: await run(tx), resourceId: photoId, reason }));
}

export async function setPhotoTeam(staff: Staff, raw: unknown) {
  const input = parse(z.object({ photo_id: zx.id, team_id: zx.id }), raw);
  await withAudit(staffActor(staff), "photo.set_team", "event_photo", async (tx) => {
    const r = await tx.query("update event_photos set team_id = $2 where id = $1 and status not in ('published','rejected')", [input.photo_id, input.team_id]);
    if (!r.rowCount) throw new AppError("CONFLICT", { userMessage: "This photo is published or rejected." });
    return { result: null, resourceId: input.photo_id, payload: { team_id: input.team_id } };
  });
  return { data: null, receipt: receipt(input.photo_id) };
}

// ── Consent revocation (T-PHOTO-07) ──────────────────────────────────────────

/**
 * Call after any consent change for a member (the hub's photo answer calls it
 * on "no"). Drops unconfirmed face-match suggestions for them if they no
 * longer allow matching, holds every photo of them that is past the consent
 * check, and pulls their unpublished social drafts. Galleries also re-check
 * consent on every read, so a revoked photo is hidden even before this runs.
 * Face templates are rebuilt by the local pipeline's next enroll, which
 * excludes anyone without matching consent (see photo-pipeline README).
 */
export async function onConsentChanged(memberId: number) {
  const actor: Actor = { type: "system", label: "consent revocation" };
  const [c] = await query<{ publication: boolean | null; matching: boolean | null }>(
    `select (select granted from member_consent_current where member_id = $1 and category = 'photo_publication') as publication,
            (select granted from member_consent_current where member_id = $1 and category = 'face_matching') as matching`,
    [memberId],
  );
  if (c?.matching === false || c?.publication === false) {
    await query("delete from photo_people where member_id = $1 and match_basis = 'opted_in_candidate' and confirmed_at is null", [memberId]);
  }
  if (c?.publication === true) return 0;
  const photos = await query<{ id: number }>(
    `select e.id from event_photos e join photo_people pp on pp.photo_id = e.id
      where pp.member_id = $1 and e.status in ('consent_checked','caption_drafted','approved','published')`,
    [memberId],
  );
  let held = 0;
  for (const p of photos) held += await holdPhoto(actor, p.id, "A person in this photo withdrew photo consent.");
  return held;
}

/**
 * Sweep: hold any photo past the consent check whose people no longer all
 * consent (catches changes made outside the hub, e.g. MCP or staff). Run on
 * the media queue page; idempotent.
 */
export async function reconcilePhotoConsent() {
  const rows = await query<{ id: number }>(
    `select distinct e.id from event_photos e join photo_people pp on pp.photo_id = e.id
       left join member_consent_current c on c.member_id = pp.member_id and c.category = 'photo_publication'
      where e.status in ('consent_checked','caption_drafted','approved','published') and c.granted is not true`,
  );
  let held = 0;
  for (const r of rows) held += await holdPhoto({ type: "system", label: "consent sweep" }, r.id, "Consent for a person in this photo is missing or withdrawn.");
  return held;
}

// ── Pipeline import gate (T-PHOTO-01) ────────────────────────────────────────

export type ImportOutcome = "added" | "already there" | "held for review" | "unknown team";

/**
 * One pipeline photo for one team. Published straight away only when every
 * suggested person and every current member of the team has photo_publication
 * consent; otherwise held in identity_review for /ops/media. `people` are
 * P-codes the pipeline face-matched; only members who allow matching are kept,
 * as unconfirmed suggestions.
 */
export async function importPipelinePhoto(input: {
  team: { id: number; slug: string };
  photoKey: string;
  pathname: string;
  width?: number;
  height?: number;
  caption?: string;
  people: string[];
}): Promise<ImportOutcome> {
  const actor: Actor = { type: "pipeline", label: "photo-pipeline" };
  return withAudit<ImportOutcome>(actor, "photo.import", "event_photo", async (tx) => {
    const ins = await tx.query<{ id: number }>(
      `insert into event_photos (team_id, photo_key, pathname, width, height, caption, status, source, rights_basis, captured_at)
       values ($1, $2, $3, $4, $5, $6, 'identity_review', 'pipeline', 'pipeline', now())
       on conflict (team_id, photo_key) do nothing returning id`,
      [input.team.id, input.photoKey, input.pathname, input.width ?? null, input.height ?? null, input.caption ?? null],
    );
    if (!ins.rowCount) return { result: "already there", resourceId: `${input.team.slug}/${input.photoKey}` };
    const id = ins.rows[0].id;

    if (input.people.length) {
      await tx.query(
        `insert into photo_people (photo_id, member_id, match_basis)
         select $1, m.id, 'opted_in_candidate' from members m
          where upper(m.public_code) = any($2) and m.deleted_at is null
            and coalesce((select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'face_matching'),
                         (select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'photo_publication')) is true
         on conflict do nothing`,
        [id, input.people.map((p) => p.toUpperCase())],
      );
    }
    const gate = await tx.query<{ team_ok: boolean; people_ok: boolean }>(
      `select
         exists (select 1 from members m where m.team_id = $2 and m.deleted_at is null)
         and not exists (select 1 from members m left join member_consent_current c on c.member_id = m.id and c.category = 'photo_publication'
                          where m.team_id = $2 and m.deleted_at is null and c.granted is not true) as team_ok,
         not exists (select 1 from photo_people pp left join member_consent_current c on c.member_id = pp.member_id and c.category = 'photo_publication'
                      where pp.photo_id = $1 and c.granted is not true) as people_ok`,
      [id, input.team.id],
    );
    const ok = gate.rows[0].team_ok && gate.rows[0].people_ok;
    await tx.query(
      ok
        ? "update event_photos set status = 'published', consent_checked_at = now() where id = $1"
        : "update event_photos set hold_reason = 'Consent unknown or missing for someone who may be in frame; identify people and re-check.' where id = $1",
      [id],
    );
    return { result: ok ? "added" : "held for review", resourceId: id, payload: { team: input.team.slug, published: ok } };
  });
}

// ── Idempotent helpers for API callers ───────────────────────────────────────

export async function withKey<T>(key: string | null | undefined, scope: string, fn: () => Promise<T>) {
  return (await idempotent(key, scope, fn)).result;
}
