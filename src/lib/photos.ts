import "server-only";
import { timingSafeEqual } from "node:crypto";
import { query } from "./db";

// Registration photos (reg/...) and event photos (event/<slug>/...) live in a
// private Blob store. The database keeps pathnames; browsers load them through
// /photos/<pathname>, which decides who may see what.

export const REG_PREFIX = "reg/";
export const EVENT_PREFIX = "event/";

export const photoSrc = (pathname: string | null | undefined) => (pathname ? `/photos/${pathname}` : null);

/** Pathnames come back from the browser after a client upload; only accept our own upload folder. */
export const isRegPath = (p: unknown): p is string =>
  typeof p === "string" && p.startsWith(REG_PREFIX) && p.length < 300 && /^[\w./-]+$/.test(p) && !p.includes("..");

/** x-export-token check for the local photo pipeline. */
export function hasExportToken(request: Request) {
  const expected = process.env.EXPORT_TOKEN;
  const given = request.headers.get("x-export-token");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Social handles ──────────────────────────────────────────────────────────

/** Accepts a profile URL, "in/name" or just the name; returns a canonical https://www.linkedin.com/in/... URL, "" for blank, null if invalid. */
export function normalizeLinkedin(raw: string) {
  const s = raw.trim().replace(/^@/, "");
  if (!s) return "";
  const m =
    s.match(/^(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/(in|company)\/([\w\-%.]+)\/?(?:[?#].*)?$/i) ?? s.match(/^(in)\/([\w\-%.]+)\/?$/i) ?? s.match(/^()([\w\-%.]{3,100})$/);
  return m ? `https://www.linkedin.com/${(m[1] || "in").toLowerCase()}/${m[2]}` : null;
}

/** Accepts @handle, handle or an x.com / twitter.com URL; returns the bare handle, "" for blank, null if invalid. */
export function normalizeX(raw: string) {
  const s = raw.trim();
  if (!s) return "";
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?(\w{1,15})\/?(?:[?#].*)?$/i) ?? s.match(/^@?(\w{1,15})$/);
  return m ? m[1] : null;
}

// ── Access ──────────────────────────────────────────────────────────────────

/** Which team a registration photo belongs to, if any. */
export async function teamForRegPhoto(pathname: string) {
  const [row] = await query<{ team_id: number }>(
    `select id as team_id from teams where photo_url = $1
     union all
     select team_id from members where photo_url = $1
     limit 1`,
    [pathname],
  );
  return row?.team_id ?? null;
}

// ── Profiles ────────────────────────────────────────────────────────────────

export type MemberProfile = {
  id: number;
  name: string;
  photo_url: string | null;
  linkedin: string | null;
  x_handle: string | null;
  /** null: not asked yet. */
  consent_social: boolean | null;
  consent_at: Date | null;
};

export async function getTeamPhotoInfo(teamId: number) {
  const [row] = await query<{ photo_url: string | null }>("select photo_url from teams where id = $1", [teamId]);
  return row ?? { photo_url: null };
}

export async function getMemberProfiles(teamId: number) {
  return query<MemberProfile>(
    "select id, name, photo_url, linkedin, x_handle, consent_social, consent_at from members where team_id = $1 order by id",
    [teamId],
  );
}

export async function setTeamPhoto(teamId: number, pathname: string | null) {
  await query("update teams set photo_url = $2 where id = $1", [teamId, pathname]);
}

/**
 * Each person answers for themselves; the time is kept for either answer.
 * The hub's one "photos and posts" answer covers photo_publication and
 * social_mention, appended to the consent ledger (never rewritten). A "no"
 * holds every photo of them and pulls unpublished social drafts right away.
 */
export async function setMemberConsent(memberId: number, consent: boolean) {
  await query("update members set consent_social = $2, consent_at = now() where id = $1", [memberId, consent]);
  await query(
    `insert into member_consents (member_id, category, granted, source)
     select $1, c, $2, 'web' from unnest(array['photo_publication','social_mention']) c`,
    [memberId, consent],
  );
  if (!consent) {
    const { onConsentChanged } = await import("@/server/photos");
    await onConsentChanged(memberId);
  }
}

export async function updateMemberProfile(
  memberId: number,
  patch: { photo_url?: string | null; linkedin?: string | null; x_handle?: string | null },
) {
  const cols = Object.keys(patch) as (keyof typeof patch)[];
  if (!cols.length) return;
  await query(
    `update members set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`,
    [memberId, ...cols.map((c) => patch[c])],
  );
}

// ── Event photos ────────────────────────────────────────────────────────────

export type EventPhoto = { id: number; pathname: string; width: number | null; height: number | null; caption: string | null; created_at: Date };

/**
 * SQL predicate (alias `e` = event_photos) for a photo anyone may see:
 * published, nobody linked to it lacks photo_publication consent *now*, and
 * either it has a human-confirmed person, a "nobody identifiable" attestation,
 * or (pipeline team tags) every current member of its team has consented.
 * Checked at read time too, so a revoked consent hides a photo immediately.
 */
export const PUBLIC_PHOTO_SQL = `(
  e.status = 'published'
  and not exists (
    select 1 from photo_people pp
      left join member_consent_current c on c.member_id = pp.member_id and c.category = 'photo_publication'
     where pp.photo_id = e.id and c.granted is not true)
  and (
    exists (select 1 from photo_people pp where pp.photo_id = e.id and pp.confirmed_at is not null)
    or e.no_people_attested_at is not null
    or (e.team_id is not null and not exists (
      select 1 from members m
        left join member_consent_current c on c.member_id = m.id and c.category = 'photo_publication'
       where m.team_id = e.team_id and m.deleted_at is null and c.granted is not true))
  )
)`;

/** The team's gallery: published, consent-clean photos tagged to the team or showing a confirmed member of it. */
export async function getEventPhotos(teamId: number) {
  return query<EventPhoto>(
    `select e.id, e.pathname, e.width, e.height, coalesce(e.caption, e.alt_text) as caption, e.created_at
       from event_photos e
      where (e.team_id = $1 or exists (
               select 1 from photo_people pp join members m on m.id = pp.member_id
                where pp.photo_id = e.id and pp.confirmed_at is not null and m.team_id = $1))
        and ${PUBLIC_PHOTO_SQL}
      order by e.created_at desc`,
    [teamId],
  );
}

export async function isPublishedEventPhoto(pathname: string) {
  const rows = await query(`select 1 from event_photos e where e.pathname = $1 and ${PUBLIC_PHOTO_SQL} limit 1`, [pathname]);
  return rows.length > 0;
}

// ── Export for the photo pipeline ───────────────────────────────────────────

export type ExportTeam = {
  slug: string;
  name: string;
  track: string;
  idea: string;
  is_solo: boolean;
  /** Every member said yes: only then may the group photo be used for matching. */
  all_consented: boolean;
  any_consented: boolean;
  photo_url: string | null;
  members: {
    name: string;
    /** May this person be face-matched and named? (see MATCHABLE_SQL) */
    consent_social: boolean | null;
    public_code: string | null;
    linkedin: string | null;
    x_handle: string | null;
    photo_url: string | null;
  }[];
};

/**
 * Per member (alias `m`): may the pipeline enrol and match them? Yes when
 * face_matching is granted, or, for people who answered before face_matching
 * existed, when they have no face_matching answer and photo_publication is
 * granted. Any explicit "no" (either category) stops matching on the next enroll.
 */
const MATCHABLE_SQL = `(
  coalesce((select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'face_matching'),
           (select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'photo_publication'))
  is true
  and coalesce((select c.granted from member_consent_current c where c.member_id = m.id and c.category = 'photo_publication'), false)
)`;

export async function exportTeams() {
  return query<ExportTeam>(
    `select t.slug, t.name, t.track, t.idea, t.is_solo, t.photo_url,
            coalesce((select bool_and(${MATCHABLE_SQL}) from members m where m.team_id = t.id and m.deleted_at is null), false) as all_consented,
            coalesce((select bool_or(${MATCHABLE_SQL}) from members m where m.team_id = t.id and m.deleted_at is null), false) as any_consented,
            -- Handles, codes and photos of people who haven't said yes never leave the site.
            coalesce((select json_agg(json_build_object(
                        'name', m.name,
                        'consent_social', ${MATCHABLE_SQL},
                        'public_code', case when ${MATCHABLE_SQL} then m.public_code end,
                        'linkedin', case when ${MATCHABLE_SQL} then m.linkedin end,
                        'x_handle', case when ${MATCHABLE_SQL} then m.x_handle end,
                        'photo_url', case when ${MATCHABLE_SQL} then m.photo_url end) order by m.id)
                        from members m where m.team_id = t.id and m.deleted_at is null), '[]') as members
       from teams t order by t.created_at`,
  );
}
