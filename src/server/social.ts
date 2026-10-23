import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { get } from "@vercel/blob";
import { query } from "@/lib/db";
import { isEnabled } from "@/lib/flags";
import { event } from "@/data/hackday";
import { AppError, idempotent, parse, serverNow, siteUrl, withAudit, z, zx, type Receipt } from "./core";
import { draftObject } from "./ai";
import { staffActor, type Staff } from "./auth";
import { evaluateConsent, getPhoto, type PersonInPhoto, type PhotoRow } from "./photos";

// Social drafts for approved event photos (SPEC §8, fallback/06). Three
// caption styles + alt text, drafted by the AI Gateway with a template
// fallback, each with checks: consent, claims backed by a verified milestone,
// image rights, duplicates and length. A human approves every post. Publishing
// to X is env-gated (X_API_*) and behind the `social_publish` flag (default
// off); copy/download and the Buffer CSV are the manual path.

export type Style = "hype" | "story" | "proof" | "plain";
export const STYLE_LABEL: Record<Style, string> = { hype: "Punchy", story: "Witty", proof: "Product / evidence story", plain: "Plain (human)" };

export type DraftRow = {
  id: number;
  photo_id: number | null;
  team_id: number | null;
  team_name: string | null;
  style: Style;
  proposed_text: string;
  alt_text: string | null;
  claim_ids: number[];
  generated_by: "llm" | "template" | "human";
  checks: Checks;
  status: "draft" | "approved" | "rejected" | "published";
  approved_by_name: string | null;
  approved_at: Date | null;
  created_at: Date;
  photo_status: string | null;
  pathname: string | null;
  post_status: string | null;
  post_url: string | null;
  remote_post_id: string | null;
};

export type Check = { ok: boolean; detail: string };
export type Checks = { consent: Check; claims: Check; rights: Check; duplicate: Check; length: Check };
export const allOk = (c: Checks | null | undefined) => !!c && Object.values(c).every((x) => x?.ok);

const X_MAX = 280;

// ── Context ──────────────────────────────────────────────────────────────────

type Milestone = { id: number; title: string; claim: string };

async function draftContext(photoId: number) {
  const { photo, people } = await getPhoto(photoId);
  const [project] = photo.team_id
    ? await query<{ id: number; name: string; summary: string | null; showcase_state: string; slug: string }>(
        "select id, name, summary, showcase_state, slug from projects where team_id = $1",
        [photo.team_id],
      )
    : [];
  // Only a verified, public milestone may back a public claim.
  const [milestone] = project
    ? await query<Milestone>(
        `select id, title, claim from milestones
          where project_id = $1 and confidence = 'verified' and visibility = 'public'
          order by coalesce(approved_at, created_at) desc limit 1`,
        [project.id],
      )
    : [];
  return { photo, people, project: project ?? null, milestone: milestone ?? null };
}

type Ctx = Awaited<ReturnType<typeof draftContext>>;

// ── Checks ───────────────────────────────────────────────────────────────────

const CLAIMY = /\b(\d+(\.\d+)?\s?(%|x|bugs?|tests?|runs?|ms|seconds?|hours?|minutes?)|passed|verified|caught|found|fixed|zero bugs|faster|bug-free|100%)\b/i;

export async function computeChecks(text: string, ctx: Ctx, draftId: number | null = null): Promise<Checks> {
  const consent = evaluateConsent(ctx.people, !!ctx.photo.no_people_attested_at);
  const lower = text.toLowerCase();
  const unnamed = ctx.people.filter((p) => p.mention !== true);
  const namedWithout = unnamed.filter((p) => p.name.length > 2 && lower.includes(p.name.toLowerCase()));
  const handleWithout = unnamed.filter((p) => p.x_handle && lower.includes(`@${p.x_handle.toLowerCase()}`));
  const consentProblems = [...consent.problems, ...namedWithout.map((p) => `${p.name} is named but hasn't agreed to be mentioned.`), ...handleWithout.map((p) => `@${p.x_handle} tagged without consent.`)];

  const claimy = CLAIMY.test(text);
  const claims: Check = ctx.milestone
    ? { ok: true, detail: `Backed by verified milestone #${ctx.milestone.id}: ${ctx.milestone.title}.` }
    : claimy
      ? { ok: false, detail: "Mentions results or numbers, but the team has no verified public milestone. Remove the claim." }
      : { ok: true, detail: "Makes no result claims." };

  const rights: Check =
    ctx.photo.rights_basis === "staff_photographer" || ctx.photo.rights_basis === "pipeline"
      ? { ok: true, detail: `Event photographer (${ctx.photo.rights_basis.replace("_", " ")}).` }
      : { ok: false, detail: "Image rights not recorded for this photo." };

  const dup = await query<{ id: number }>(
    "select id from social_drafts where lower(proposed_text) = lower($1) and status in ('approved','published') and ($2::bigint is null or id <> $2) limit 1",
    [text, draftId],
  );
  const posted = ctx.photo.id
    ? await query<{ id: number }>(
        "select d.id from social_drafts d where d.photo_id = $1 and d.status = 'published' and ($2::bigint is null or d.id <> $2) limit 1",
        [ctx.photo.id, draftId],
      )
    : [];
  const duplicate: Check = dup.length
    ? { ok: false, detail: `Same text as draft #${dup[0].id}.` }
    : posted.length
      ? { ok: false, detail: `This photo was already posted (draft #${posted[0].id}).` }
      : { ok: true, detail: "No duplicate text or repost." };

  const length: Check = text.length <= X_MAX ? { ok: true, detail: `${text.length}/${X_MAX} characters.` } : { ok: false, detail: `${text.length}/${X_MAX} characters: too long for X.` };

  return {
    consent: consentProblems.length ? { ok: false, detail: consentProblems.join(" ") } : { ok: true, detail: consent.people.length ? "Everyone in frame confirmed and consented." : "Nobody identifiable (attested)." },
    claims,
    rights,
    duplicate,
    length,
  };
}

// ── Drafting ─────────────────────────────────────────────────────────────────

const draftSchema = z.object({
  punchy: z.string().max(X_MAX),
  witty: z.string().max(X_MAX),
  proof: z.string().max(X_MAX),
  alt_text: z.string().max(500),
});

function templates(ctx: Ctx) {
  const tag = event.hashtag;
  const team = ctx.photo.team_name ?? "A team";
  const project = ctx.project?.name;
  const mentions = mentionable(ctx.people);
  const who = mentions.length ? ` with ${mentions.join(", ")}` : "";
  const proof = ctx.milestone ? `${team} ${project ? `(${project}) ` : ""}just reached a verified milestone: ${ctx.milestone.title}.` : `${team} is building${project ? ` ${project}` : ""} and testing it with Kane CLI.`;
  return {
    punchy: `${team}${who}, heads down at ${event.name}. Build with OpenAI, test with Kane CLI. ${tag}`.slice(0, X_MAX),
    witty: `Coffee in, commits out. ${team}${who} at ${event.name}. ${tag}`.slice(0, X_MAX),
    proof: `${proof} ${tag}`.slice(0, X_MAX),
    alt_text: `${ctx.people.length ? `${ctx.people.length} ${ctx.people.length === 1 ? "person" : "people"}` : "A team table"} at ${event.name}${ctx.photo.team_name ? `, team ${ctx.photo.team_name}` : ""}, working on laptops.`,
  };
}

/** Names/handles we may use: confirmed people who said yes to being mentioned. */
function mentionable(people: PersonInPhoto[]) {
  return people.filter((p) => p.confirmed_at && p.mention === true && p.publication === true).map((p) => (p.x_handle ? `@${p.x_handle}` : p.name));
}

/** Draft three captions + alt text for a consent-checked photo and store them with their checks. */
export async function generateDrafts(staff: Staff, raw: unknown): Promise<{ data: { ids: number[]; generator: string; warning?: string }; receipt: Receipt }> {
  const { photo_id } = parse(z.object({ photo_id: zx.id }), raw);
  const ctx = await draftContext(photo_id);
  if (!["consent_checked", "caption_drafted", "approved", "published"].includes(ctx.photo.status)) {
    throw new AppError("CONSENT_REQUIRED", { userMessage: "Run the consent check before drafting captions." });
  }
  const fb = templates(ctx);
  const others = ctx.people.filter((p) => p.mention !== true).length;
  const drafted = await draftObject({
    schema: draftSchema,
    system:
      "You write short, factual social captions for photos from a hackathon. Never invent results, numbers, quotes or names. Only use the milestone claim given, word for word in meaning. Only name the people listed as mentionable. No hype words, no emoji spam, at most one hashtag. Each caption under 260 characters.",
    prompt: JSON.stringify({
      event: event.name,
      hashtag: event.hashtag,
      team: ctx.photo.team_name,
      project: ctx.project?.name ?? null,
      project_summary: ctx.project?.showcase_state === "public" ? ctx.project.summary : null,
      verified_milestone: ctx.milestone ? { title: ctx.milestone.title, claim: ctx.milestone.claim } : null,
      mentionable: mentionable(ctx.people),
      others_not_to_name: others,
      styles: { punchy: "short and energetic", witty: "light wordplay", proof: "product and evidence story, cite the milestone if present" },
      alt_text: "Describe the visible scene plainly for a screen reader. Do not identify people by name.",
    }),
    fallback: () => fb,
  });
  const v = drafted.value;
  const generated = drafted.generator === "llm" ? "llm" : "template";
  const claimIds = ctx.milestone ? [ctx.milestone.id] : [];
  const rows: [Style, string][] = [
    ["hype", v.punchy],
    ["story", v.witty],
    ["proof", v.proof],
  ];
  const checks = await Promise.all(rows.map(([, text]) => computeChecks(text, ctx)));
  const ids = await withAudit<number[]>(staffActor(staff), "social.draft", "event_photo", async (tx) => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = await tx.query<{ id: number }>(
        `insert into social_drafts (photo_id, project_id, team_id, style, proposed_text, alt_text, claim_ids, generated_by, checks, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [photo_id, ctx.project?.id ?? null, ctx.photo.team_id, rows[i][0], rows[i][1], v.alt_text, JSON.stringify(claimIds), generated, JSON.stringify(checks[i]), staff.id],
      );
      out.push(r.rows[0].id);
    }
    await tx.query(
      "update event_photos set alt_text = coalesce(alt_text, $2), status = case when status = 'consent_checked' then 'caption_drafted' else status end where id = $1",
      [photo_id, v.alt_text],
    );
    return { result: out, resourceId: photo_id, payload: { generator: drafted.generator, model: drafted.model, drafts: out } };
  });
  return { data: { ids, generator: drafted.generator, warning: drafted.warning }, receipt: { id: `PH-${photo_id}`, server_time: (await serverNow()).toISOString() } };
}

// ── Reads ────────────────────────────────────────────────────────────────────

const DRAFT_SELECT = `select d.id, d.photo_id, d.team_id, t.name as team_name, d.style, d.proposed_text, d.alt_text, d.claim_ids, d.generated_by, d.checks,
       d.status, ap.name as approved_by_name, d.approved_at, d.created_at, e.status as photo_status, e.pathname,
       sp.status as post_status, sp.url as post_url, sp.remote_post_id
  from social_drafts d left join teams t on t.id = d.team_id left join event_photos e on e.id = d.photo_id
  left join staff_accounts ap on ap.id = d.approved_by left join social_posts sp on sp.draft_id = d.id`;

export async function listDrafts(opts: { photoId?: number; statuses?: DraftRow["status"][] } = {}) {
  const params: unknown[] = [opts.statuses ?? ["draft", "approved", "published", "rejected"]];
  let where = "d.status = any($1)";
  if (opts.photoId) {
    params.push(opts.photoId);
    where += ` and d.photo_id = $${params.length}`;
  }
  return query<DraftRow>(`${DRAFT_SELECT} where ${where} order by d.created_at desc limit 300`, params);
}

async function loadDraft(id: number) {
  const [d] = await query<DraftRow>(`${DRAFT_SELECT} where d.id = $1`, [id]);
  if (!d) throw new AppError("NOT_FOUND", { userMessage: "No social draft with that id." });
  return d;
}

// ── Edit / approve / reject ──────────────────────────────────────────────────

export async function editDraft(staff: Staff, raw: unknown) {
  const input = parse(z.object({ draft_id: zx.id, text: zx.text(1000), alt_text: zx.optText(500) }), raw);
  const d = await loadDraft(input.draft_id);
  if (d.status !== "draft") throw new AppError("CONFLICT", { userMessage: `This draft is ${d.status}; only drafts can be edited.` });
  if (!d.photo_id) throw new AppError("NOT_FOUND");
  const checks = await computeChecks(input.text, await draftContext(d.photo_id), d.id);
  await withAudit(staffActor(staff), "social.edit", "social_draft", async (tx) => {
    await tx.query("update social_drafts set proposed_text = $2, alt_text = coalesce($3, alt_text), generated_by = 'human', checks = $4 where id = $1", [
      d.id,
      input.text,
      input.alt_text,
      JSON.stringify(checks),
    ]);
    return { result: null, resourceId: d.id, before: d.proposed_text, after: input.text };
  });
  return { data: checks, receipt: { id: `SD-${d.id}`, server_time: (await serverNow()).toISOString() } };
}

/** Organizer approval. Checks are re-run now and must all pass; the photo must be approved or published. */
export async function approveDraft(staff: Staff, raw: unknown) {
  const { draft_id } = parse(z.object({ draft_id: zx.id }), raw);
  const d = await loadDraft(draft_id);
  if (d.status !== "draft") throw new AppError("CONFLICT", { userMessage: `This draft is already ${d.status}.` });
  if (!d.photo_id) throw new AppError("NOT_FOUND");
  const ctx = await draftContext(d.photo_id);
  if (!["approved", "published"].includes(ctx.photo.status)) throw new AppError("CONFLICT", { userMessage: "Approve the photo itself first." });
  const checks = await computeChecks(d.proposed_text, ctx, d.id);
  if (!allOk(checks)) {
    await query("update social_drafts set checks = $2 where id = $1", [d.id, JSON.stringify(checks)]);
    const failed = Object.entries(checks).find(([, c]) => !c.ok)!;
    throw new AppError("CONSENT_REQUIRED", { userMessage: `Hold: ${failed[0]} check failed. ${failed[1].detail}` });
  }
  await withAudit(staffActor(staff), "social.approve", "social_draft", async (tx) => {
    const r = await tx.query("update social_drafts set status = 'approved', approved_by = $2, approved_at = now(), checks = $3 where id = $1 and status = 'draft'", [
      d.id,
      staff.id,
      JSON.stringify(checks),
    ]);
    if (!r.rowCount) throw new AppError("CONFLICT");
    // Other styles for the same photo can't also be approved: one post per photo.
    await tx.query("update social_drafts set status = 'rejected' where photo_id = $1 and id <> $2 and status = 'draft'", [d.photo_id, d.id]);
    return { result: null, resourceId: d.id };
  });
  return { data: null, receipt: { id: `SD-${d.id}`, server_time: (await serverNow()).toISOString() } };
}

export async function rejectDraft(staff: Staff, raw: unknown) {
  const { draft_id } = parse(z.object({ draft_id: zx.id }), raw);
  await withAudit(staffActor(staff), "social.reject", "social_draft", async (tx) => {
    const r = await tx.query("update social_drafts set status = 'rejected' where id = $1 and status in ('draft','approved')", [draft_id]);
    if (!r.rowCount) throw new AppError("CONFLICT", { userMessage: "Only drafts and approved posts can be rejected." });
    return { result: null, resourceId: draft_id };
  });
  return { data: null, receipt: { id: `SD-${draft_id}`, server_time: (await serverNow()).toISOString() } };
}

// ── Manual path: posted by hand, Buffer CSV ──────────────────────────────────

export async function markPostedManually(staff: Staff, raw: unknown) {
  const input = parse(z.object({ draft_id: zx.id, url: zx.httpsUrl.optional().or(z.literal("").transform(() => undefined)) }), raw);
  const d = await loadDraft(input.draft_id);
  if (d.status !== "approved") throw new AppError("CONFLICT", { userMessage: "Only approved posts can be marked as posted." });
  await withAudit(staffActor(staff), "social.manual_post", "social_draft", async (tx) => {
    await tx.query(
      `insert into social_posts (draft_id, platform, url, status, published_at) values ($1, 'manual', $2, 'manual', now())
       on conflict (draft_id) do update set url = coalesce(excluded.url, social_posts.url), status = 'manual', published_at = now()`,
      [d.id, input.url ?? null],
    );
    await tx.query("update social_drafts set status = 'published' where id = $1", [d.id]);
    return { result: null, resourceId: d.id, payload: { url: input.url ?? null } };
  });
  return { data: null, receipt: { id: `SD-${d.id}`, server_time: (await serverNow()).toISOString() } };
}

/** Buffer bulk-upload CSV of approved posts. Image URL is the public gallery URL (only for published photos). */
export async function bufferCsv() {
  const rows = await listDrafts({ statuses: ["approved"] });
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [["Text", "Image URL", "Tags", "Posting Time"].map(cell).join(",")];
  for (const r of rows) {
    const img = r.photo_status === "published" && r.pathname ? siteUrl(`/photos/${r.pathname}`) : "";
    lines.push([r.proposed_text, img, `x,${r.team_name ?? ""}`, ""].map(cell).join(","));
  }
  return lines.join("\r\n");
}

// ── X publishing (env-gated, flag social_publish) ────────────────────────────

const X = {
  key: process.env.X_API_KEY,
  secret: process.env.X_API_KEY_SECRET,
  token: process.env.X_API_ACCESS_TOKEN,
  tokenSecret: process.env.X_API_ACCESS_SECRET,
};
export const xConfigured = () => !!(X.key && X.secret && X.token && X.tokenSecret);

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** OAuth 1.0a user-context header (JSON and multipart bodies are not part of the signature). */
function oauthHeader(method: string, url: string) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: X.key!,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    // OAuth needs wall-clock seconds; this is a protocol field, not a deadline decision.
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: X.token!,
    oauth_version: "1.0",
  };
  const params = Object.keys(oauth)
    .sort()
    .map((k) => `${enc(k)}=${enc(oauth[k])}`)
    .join("&");
  const base = [method.toUpperCase(), enc(url), enc(params)].join("&");
  const sig = createHmac("sha1", `${enc(X.secret!)}&${enc(X.tokenSecret!)}`).update(base).digest("base64");
  return (
    "OAuth " +
    Object.entries({ ...oauth, oauth_signature: sig })
      .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
      .join(", ")
  );
}

async function xUploadMedia(pathname: string) {
  const file = await get(pathname, { access: "private" });
  if (!file) throw new AppError("NOT_FOUND", { userMessage: "The photo file is missing from storage." });
  const bytes = await new Response(file.stream).arrayBuffer();
  const url = "https://api.x.com/2/media/upload";
  const form = new FormData();
  form.set("media", new Blob([bytes], { type: file.blob.contentType ?? "image/jpeg" }), "photo.jpg");
  form.set("media_category", "tweet_image");
  const res = await fetch(url, { method: "POST", headers: { authorization: oauthHeader("POST", url) }, body: form, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; media_id_string?: string };
  const id = body.data?.id ?? body.media_id_string;
  if (!res.ok || !id) throw new AppError("DOWNSTREAM_DEGRADED", { userMessage: `X media upload failed (${res.status}). Post it by hand instead.`, details: { status: res.status } });
  return id;
}

async function xPost(text: string, mediaId: string | null, altText: string | null) {
  if (mediaId && altText) {
    const metaUrl = "https://api.x.com/2/media/metadata";
    await fetch(metaUrl, {
      method: "POST",
      headers: { authorization: oauthHeader("POST", metaUrl), "content-type": "application/json" },
      body: JSON.stringify({ id: mediaId, metadata: { alt_text: { text: altText.slice(0, 1000) } } }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null); // Alt text is best effort; the post still goes out.
  }
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: oauthHeader("POST", url), "content-type": "application/json" },
    body: JSON.stringify(mediaId ? { text, media: { media_ids: [mediaId] } } : { text }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: { id?: string } };
  if (!res.ok || !body.data?.id) {
    throw new AppError(res.status === 429 ? "RATE_LIMITED" : "DOWNSTREAM_DEGRADED", { userMessage: `X refused the post (${res.status}). Post it by hand instead.`, details: { status: res.status } });
  }
  return body.data.id;
}

async function markX(ok: boolean, code?: string) {
  await query(
    ok
      ? "update integration_state set status = 'ok', last_success_at = now(), updated_at = now() where system = 'x'"
      : "update integration_state set status = 'degraded', last_error_at = now(), last_error_code = $1, updated_at = now() where system = 'x'",
    ok ? [] : [code ?? "error"],
  ).catch(() => {});
}

/**
 * Publish an approved draft from the official account. Requires the
 * social_publish flag, X_API_* env, a published photo, all checks passing
 * now, and explicit confirmation. Idempotent per draft (social_posts.draft_id
 * unique; a second call returns the existing remote_post_id). Rate limited to
 * one post per minute.
 */
export async function publishDraft(staff: Staff, raw: unknown) {
  const input = parse(z.object({ draft_id: zx.id, explicit_confirmation: zx.checkbox, idempotency_key: zx.idempotencyKey }), raw);
  if (!input.explicit_confirmation) throw new AppError("VALIDATION_FAILED", { userMessage: "Confirm that a human reviewed this post before publishing." });
  if (!(await isEnabled("social_publish"))) throw new AppError("FEATURE_DISABLED", { userMessage: "Publishing to X is switched off. Copy the text and image and post by hand, or use the Buffer CSV." });
  if (!xConfigured()) throw new AppError("FEATURE_DISABLED", { userMessage: "X API keys aren't configured. Post by hand or use the Buffer CSV." });

  const { result } = await idempotent(input.idempotency_key, `social.publish:${input.draft_id}`, async () => {
    const d = await loadDraft(input.draft_id);
    if (d.post_status === "published" && d.remote_post_id) return { remote_post_id: d.remote_post_id, url: d.post_url, replayed: true };
    if (d.status !== "approved") throw new AppError("CONFLICT", { userMessage: "Only approved posts can be published." });
    if (!d.photo_id || !d.pathname) throw new AppError("NOT_FOUND");
    const ctx = await draftContext(d.photo_id);
    if (ctx.photo.status !== "published") throw new AppError("CONFLICT", { userMessage: "Publish the photo to the gallery first; the post makes it public." });
    const checks = await computeChecks(d.proposed_text, ctx, d.id);
    if (!allOk(checks)) throw new AppError("CONSENT_REQUIRED", { userMessage: "A check no longer passes (consent may have changed). The post is held." });
    const recent = await query("select 1 from social_posts where platform = 'x' and published_at > now() - interval '60 seconds' limit 1");
    if (recent.length) throw new AppError("RATE_LIMITED", { userMessage: "One post per minute. Try again shortly." });

    // Claim the draft: one social_posts row per draft (unique), so a racing second call stops here.
    const claim = await query<{ id: number }>(
      `insert into social_posts (draft_id, platform, status) values ($1, 'x', 'queued')
       on conflict (draft_id) do update set status = 'queued', error_code = null
         where social_posts.status = 'failed'
       returning id`,
      [d.id],
    );
    if (!claim.length) throw new AppError("CONFLICT", { userMessage: "This post is already being published." });

    try {
      const media = await xUploadMedia(d.pathname);
      const remoteId = await xPost(d.proposed_text, media, d.alt_text);
      const url = `https://x.com/i/web/status/${remoteId}`;
      await withAudit(staffActor(staff), "social.publish", "social_draft", async (tx) => {
        await tx.query("update social_posts set status = 'published', remote_post_id = $2, url = $3, published_at = now() where draft_id = $1", [d.id, remoteId, url]);
        await tx.query("update social_drafts set status = 'published' where id = $1", [d.id]);
        await tx.query(
          `insert into activity (team_id, action, source, source_event_id, type, visibility, payload, signature_status)
           values ($1, 'social.post', 'x', $2, 'social.post', 'public', $3, 'not_applicable') on conflict do nothing`,
          [d.team_id, remoteId, JSON.stringify({ url, draft_id: d.id, photo_id: d.photo_id })],
        );
        return { result: null, resourceId: d.id, payload: { remote_post_id: remoteId } };
      });
      await markX(true);
      return { remote_post_id: remoteId, url, replayed: false };
    } catch (e) {
      const code = e instanceof AppError ? e.code : "INTERNAL";
      await query("update social_posts set status = 'failed', error_code = $2 where draft_id = $1 and status = 'queued'", [d.id, code]).catch(() => {});
      await markX(false, code);
      throw e;
    }
  });
  return { data: result, receipt: { id: `SD-${input.draft_id}`, server_time: (await serverNow()).toISOString() } };
}

export type { PhotoRow };
