import "server-only";
import { pool, query } from "./db";
import { emailHash } from "@/server/core";
import { hashPassword } from "./password";

export const MAX_MEMBERS = 5;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

export type Member = { id: number; name: string; email: string };
export type Team = {
  id: number;
  slug: string;
  name: string;
  track: string;
  idea: string;
  is_solo: boolean;
  created_at: Date;
};
export type ProgressRow = {
  item: string;
  value: string;
  done: boolean;
  updated_at: Date;
  updated_by_name: string | null;
};
export type ActivityRow = { id: number; action: string; created_at: Date; member_name: string | null };

// ── Settings ────────────────────────────────────────────────────────────────

export async function isRegistrationOpen() {
  const [row] = await query<{ value: string }>("select value from settings where key = 'registration_open'");
  return row?.value !== "false";
}

export async function setRegistrationOpen(open: boolean) {
  await query(
    "insert into settings (key, value) values ('registration_open', $1) on conflict (key) do update set value = excluded.value",
    [String(open)],
  );
}

// ── Registration ────────────────────────────────────────────────────────────

export class RegistrationError extends Error {}

export async function registerTeam(input: {
  name: string;
  track: string;
  idea: string;
  isSolo: boolean;
  password: string;
  photoUrl: string | null;
  /** The registrant's own answer; teammates are asked when they open the hub. */
  captainConsent: boolean;
  members: { name: string; email: string; photoUrl: string | null; linkedin: string | null; xHandle: string | null }[];
}) {
  const slug = slugify(input.name);
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: number }>(
      `insert into teams (slug, name, track, idea, is_solo, password_hash, photo_url)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [slug, input.name, input.track, input.idea, input.isSolo, passwordHash, input.photoUrl],
    );
    const teamId = rows[0].id;
    for (const [i, m] of input.members.entries()) {
      // The first member is the person registering: theirs is the only answer we have.
      const consent = i === 0 ? input.captainConsent : null;
      // A walk-in admitted at the desk (or anyone with a personal account) is
      // already a member with no team: adopt that row instead of colliding
      // on the unique email. A member already on a team still conflicts.
      const { rows: added } = await client.query<{ id: number }>(
        `insert into members (team_id, name, email, email_hash, photo_url, linkedin, x_handle, consent_social, consent_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::boolean, case when $8::boolean is not null then now() end)
         on conflict ((lower(email))) do update
           set team_id = excluded.team_id,
               photo_url = coalesce(members.photo_url, excluded.photo_url),
               linkedin = coalesce(members.linkedin, excluded.linkedin),
               x_handle = coalesce(members.x_handle, excluded.x_handle),
               consent_social = coalesce(excluded.consent_social, members.consent_social),
               consent_at = case when excluded.consent_social is not null then now() else members.consent_at end
           where members.team_id is null and members.deleted_at is null
         returning id`,
        [teamId, m.name, m.email, emailHash(m.email), m.photoUrl, m.linkedin, m.xHandle, consent],
      );
      if (!added[0]) throw new RegistrationError(`${m.email} is already registered on another team.`);
      const memberId = added[0].id;
      // Hack OS: membership history, captain, and per-person consent rows.
      await client.query("insert into team_memberships (team_id, member_id, role) values ($1, $2, $3)", [teamId, memberId, i === 0 ? "captain" : "member"]);
      if (i === 0) await client.query("update teams set captain_id = $2, state = 'formed' where id = $1", [teamId, memberId]);
      if (consent !== null) {
        await client.query(
          `insert into member_consents (member_id, category, granted, source)
           select $1, c, $2, 'web' from unnest(array['photo_publication','social_mention']) c`,
          [memberId, consent],
        );
      }
    }
    // Reserve the showcase slug (/ship/{slug}) and seed the private idea.
    await client.query("insert into projects (team_id, name, slug) values ($1, $2, $3) on conflict do nothing", [teamId, input.name, slug]);
    await client.query("insert into ideas (team_id, title, private_description) values ($1, $2, $3) on conflict do nothing", [teamId, input.name.slice(0, 120), input.idea]);
    await client.query("insert into activity (team_id, action) values ($1, 'Team registered')", [teamId]);
    await client.query("commit");
    return { teamId, slug };
  } catch (err) {
    await client.query("rollback");
    throw toRegistrationError(err);
  } finally {
    client.release();
  }
}

function toRegistrationError(err: unknown) {
  const e = err as { code?: string; constraint?: string };
  if (e.code === "23505" && e.constraint === "teams_slug_key")
    return new RegistrationError("That team name is taken. Try another.");
  if (e.code === "23505" && e.constraint === "members_email_idx")
    return new RegistrationError("One of those emails is already registered on another team.");
  return err;
}

/** A team slug is also the team's /ship/{slug}, so a project slug or a ship redirect blocks it too. */
export async function isSlugTaken(slug: string) {
  const rows = await query(
    "select 1 from teams where slug = $1 union all select 1 from projects where slug = $1 union all select 1 from project_slug_redirects where old_slug = $1",
    [slug],
  );
  return rows.length > 0;
}

// ── Team reads ──────────────────────────────────────────────────────────────

export async function getTeamBySlug(slug: string) {
  const [team] = await query<Team & { password_hash: string }>("select * from teams where slug = $1", [slug]);
  return team ?? null;
}

export async function getMembers(teamId: number) {
  return query<Member>("select id, name, email from members where team_id = $1 order by id", [teamId]);
}

export async function getProgress(teamId: number) {
  return query<ProgressRow>(
    `select p.item, p.value, p.done, p.updated_at, m.name as updated_by_name
       from progress p left join members m on m.id = p.updated_by
      where p.team_id = $1`,
    [teamId],
  );
}

export async function getActivity(teamId: number, limit = 30) {
  return query<ActivityRow>(
    `select a.id, a.action, a.created_at, m.name as member_name
       from activity a left join members m on m.id = a.member_id
      where a.team_id = $1 order by a.created_at desc limit $2`,
    [teamId, limit],
  );
}

// ── Team writes ─────────────────────────────────────────────────────────────

export async function logActivity(teamId: number, memberId: number | null, action: string) {
  await query("insert into activity (team_id, member_id, action) values ($1, $2, $3)", [teamId, memberId, action]);
}

export async function saveProgress(teamId: number, memberId: number, item: string, value: string, done: boolean) {
  await query(
    `insert into progress (team_id, item, value, done, updated_by, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (team_id, item) do update
       set value = excluded.value, done = excluded.done,
           updated_by = excluded.updated_by, updated_at = now()`,
    [teamId, item, value, done, memberId],
  );
}

export async function addMember(teamId: number, name: string, email: string) {
  try {
    const [row] = await query<{ id: number }>(
      // Adopts a teamless member (walk-in / personal account) with this email.
      `with m as (insert into members (team_id, name, email, email_hash) values ($1, $2, $3, $4)
                  on conflict ((lower(email))) do update set team_id = excluded.team_id
                  where members.team_id is null and members.deleted_at is null
                  returning id),
            h as (insert into team_memberships (team_id, member_id) select $1, id from m)
       select id from m`,
      [teamId, name, email, emailHash(email)],
    );
    if (!row) throw new RegistrationError("That email is already registered on another team.");
    return row.id;
  } catch (err) {
    throw toRegistrationError(err);
  }
}

// ── Admin ───────────────────────────────────────────────────────────────────

export type TeamSummary = Team & {
  member_count: number;
  member_names: string[];
  done_items: string[];
  last_activity: Date | null;
};

export async function listTeams() {
  return query<TeamSummary>(
    `select t.id, t.slug, t.name, t.track, t.idea, t.is_solo, t.created_at,
            (select count(*)::int from members m where m.team_id = t.id) as member_count,
            (select coalesce(array_agg(m.name order by m.id), '{}') from members m where m.team_id = t.id) as member_names,
            (select coalesce(array_agg(p.item), '{}') from progress p where p.team_id = t.id and p.done) as done_items,
            (select max(a.created_at) from activity a where a.team_id = t.id) as last_activity
       from teams t
      order by t.created_at`,
  );
}

export async function listAllMembers() {
  return query<Member & { team_name: string; team_slug: string; track: string }>(
    `select m.id, m.name, m.email, t.name as team_name, t.slug as team_slug, t.track
       from members m join teams t on t.id = m.team_id
      order by t.created_at, m.id`,
  );
}

export async function listAllProgress() {
  return query<{ team_id: number; item: string; value: string; done: boolean }>(
    "select team_id, item, value, done from progress",
  );
}

export async function getTeamById(id: number) {
  const [team] = await query<Pick<Team, "id" | "slug" | "name">>("select id, slug, name from teams where id = $1", [id]);
  return team ?? null;
}

// ── Setup ticks ─────────────────────────────────────────────────────────────

export async function getSetupTicks(memberId: number) {
  const rows = await query<{ step: string }>("select step from setup_ticks where member_id = $1", [memberId]);
  return rows.map((r) => r.step);
}

export async function setSetupTick(memberId: number, step: string, done: boolean) {
  if (done) {
    await query("insert into setup_ticks (member_id, step) values ($1, $2) on conflict do nothing", [memberId, step]);
  } else {
    await query("delete from setup_ticks where member_id = $1 and step = $2", [memberId, step]);
  }
}
