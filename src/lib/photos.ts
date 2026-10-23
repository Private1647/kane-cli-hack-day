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

/** Accepts a profile URL or "in/name"; returns a canonical https://www.linkedin.com/in/... URL, "" for blank, null if invalid. */
export function normalizeLinkedin(raw: string) {
  const s = raw.trim();
  if (!s) return "";
  const m = s.match(/^(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/(in|company)\/([\w\-%.]+)\/?(?:[?#].*)?$/i) ?? s.match(/^(in)\/([\w\-%.]+)\/?$/i);
  return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` : null;
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

/** Each person answers for themselves; the time is kept for either answer. */
export async function setMemberConsent(memberId: number, consent: boolean) {
  await query("update members set consent_social = $2, consent_at = now() where id = $1", [memberId, consent]);
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

export async function getEventPhotos(teamId: number) {
  return query<EventPhoto>(
    "select id, pathname, width, height, caption, created_at from event_photos where team_id = $1 order by created_at desc",
    [teamId],
  );
}

export async function isPublishedEventPhoto(pathname: string) {
  const rows = await query("select 1 from event_photos where pathname = $1 limit 1", [pathname]);
  return rows.length > 0;
}

/** Records a photo for a team; returns false when this team already had it. */
export async function addEventPhoto(input: { teamId: number; photoKey: string; pathname: string; width?: number; height?: number; caption?: string }) {
  const rows = await query(
    `insert into event_photos (team_id, photo_key, pathname, width, height, caption)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (team_id, photo_key) do nothing returning id`,
    [input.teamId, input.photoKey, input.pathname, input.width ?? null, input.height ?? null, input.caption ?? null],
  );
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
  members: { name: string; consent_social: boolean | null; linkedin: string | null; x_handle: string | null; photo_url: string | null }[];
};

export async function exportTeams() {
  return query<ExportTeam>(
    `select t.slug, t.name, t.track, t.idea, t.is_solo, t.photo_url,
            coalesce((select bool_and(m.consent_social is true) from members m where m.team_id = t.id), false) as all_consented,
            coalesce((select bool_or(m.consent_social is true) from members m where m.team_id = t.id), false) as any_consented,
            -- Handles and photos of people who haven't said yes never leave the site.
            coalesce((select json_agg(json_build_object(
                        'name', m.name,
                        'consent_social', m.consent_social,
                        'linkedin', case when m.consent_social then m.linkedin end,
                        'x_handle', case when m.consent_social then m.x_handle end,
                        'photo_url', case when m.consent_social then m.photo_url end) order by m.id)
                        from members m where m.team_id = t.id), '[]') as members
       from teams t order by t.created_at`,
  );
}
