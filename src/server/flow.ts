import "server-only";
import { query } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password";
import { normalizeX } from "@/lib/photos";
import { clearMemberSession, setMemberSession } from "@/lib/session";
import { redeemActivationCode } from "./activation";
import { getMemberById, memberActor, type MemberRow } from "./auth";
import { AppError, emailHash, parse, sha256, transaction, withAudit, writeAudit, z, zx, type Actor } from "./core";
import { memberLoginWithCode } from "./pairing";
import { appendConsents } from "./passport";
import { respondIntro } from "./match";
import { admitToTeam, currentTeamOf, listRecruitingTeams, normalizeTags, type ActingMember } from "./teams";

// The event-day participant flow (branch event-day-flow):
//   /register  profile (name, Luma email, skills, interests, handles, a personal
//              password) → photo (human shutter, or skip) → "looking for a team?"
//   yes → the matchmaking pool (/match); no → /team (create or join by invite)
//   on a team → /activate (3-step checklist) → /setup (Codex skills) → the hub.
// The account is created at the end of the profile step, with a personal
// session, so the photo step has an owner. An email that already has an
// account is never silently taken over: its password or a desk one-time code
// is required first.

export type FlowStage = "profile" | "photo" | "choice" | "pool" | "team" | "activate" | "codex" | "hub";

export const FLOW_STEPS = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "activate", label: "Activate" },
  { id: "codex", label: "Codex" },
  { id: "hub", label: "Hub" },
] as const;
export type FlowStep = (typeof FLOW_STEPS)[number]["id"];

/** Which progress-bar step a stage belongs to. */
export const stepOfStage = (s: FlowStage): FlowStep => (s === "profile" || s === "photo" || s === "choice" ? "profile" : s === "pool" ? "team" : s);

export type FlowState = { stage: FlowStage; next: string; teamSlug: string | null };

/** Where this person is in the flow, and the page that continues it. */
export async function flowState(memberId: number): Promise<FlowState> {
  const [m] = await query<{ photo_step_at: Date | null; looking_for_team: boolean | null; slug: string | null; ticks: number; paired: boolean; has_password: boolean }>(
    `select m.photo_step_at, m.looking_for_team, t.slug, m.password_hash is not null as has_password,
            (select count(*)::int from activation_ticks a where a.member_id = m.id) as ticks,
            exists (select 1 from member_tokens k where k.member_id = m.id and k.kind = 'bearer' and k.revoked_at is null) as paired
       from members m left join teams t on t.id = m.team_id
      where m.id = $1 and m.deleted_at is null`,
    [memberId],
  );
  if (!m || !m.has_password) return { stage: "profile", next: "/register", teamSlug: null };
  if (!m.slug) {
    if (!m.photo_step_at) return { stage: "photo", next: "/register", teamSlug: null };
    if (m.looking_for_team === null) return { stage: "choice", next: "/register", teamSlug: null };
    return m.looking_for_team ? { stage: "pool", next: "/match", teamSlug: null } : { stage: "team", next: "/team", teamSlug: null };
  }
  if (m.ticks < 3) return { stage: "activate", next: "/activate", teamSlug: m.slug };
  if (!m.paired) return { stage: "codex", next: "/setup", teamSlug: m.slug };
  return { stage: "hub", next: `/t/${m.slug}`, teamSlug: m.slug };
}

// ── Profile ──────────────────────────────────────────────────────────────────

const handle = z.string().trim().max(60).optional().transform((s) => s || "");

export const profileInputSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name (2+ characters).").max(60),
  email: zx.email,
  skills: z.string().max(600).optional().transform((v) => normalizeTags(v)),
  interests: z.string().max(600).optional().transform((v) => normalizeTags(v)),
  github: handle.pipe(z.string().regex(/^$|^@?[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/, "That isn’t a GitHub username.")).transform((s) => s.replace(/^@/, "")),
  x: handle,
  password: z.string().max(200).optional().transform((s) => s ?? ""),
  /** Proof for an email that already has an account. */
  proof_password: z.string().max(200).optional(),
  proof_code: z.string().trim().max(20).optional(),
});
export type ProfileInput = z.input<typeof profileInputSchema>;

export type ProfileResult = { kind: "ok"; memberId: number; created: boolean } | { kind: "needs_proof" };

const PROOF_FAILED = "That password or code doesn’t match this email. Ask at the desk for a one-time code.";

/** The roster guest for this email on the current event that no other member holds. */
async function linkRoster(tx: { query: (sql: string, p: unknown[]) => Promise<unknown> }, memberId: number, email: string) {
  // Link only; never tell the person whether they were on the roster.
  await tx.query(
    `with g as (
       select id, admission_status, checked_in_at from roster_guests
        where event_id = current_event_id() and email_hash = $2 and (member_id is null or member_id = $1)
          and not exists (select 1 from members x where x.guest_id = roster_guests.id and x.id <> $1)
        order by (admission_status = 'admitted') desc, id limit 1
     ), lg as (
       update roster_guests r set member_id = $1, updated_at = now() from g where r.id = g.id returning r.id
     )
     update members m set guest_id = coalesce(m.guest_id, g.id),
            admission_state = case g.admission_status when 'admitted' then 'admitted' when 'needs_reconciliation' then 'needs_reconciliation' else m.admission_state end,
            checked_in_at = coalesce(m.checked_in_at, g.checked_in_at)
       from g where m.id = $1 and (m.guest_id is null or m.guest_id = g.id)`,
    [memberId, emailHash(email)],
  );
}

async function saveProfileFields(memberId: number, data: z.infer<typeof profileInputSchema>, x: string | null, actor: Actor, action: string) {
  const pw = data.password ? await hashPassword(data.password) : null;
  await withAudit(actor, action, "member", async (tx) => {
    await tx.query(
      `update members set name = $2, display_name = $2, skills = $3, interests = $4, github_handle = nullif($5, ''), x_handle = $6,
              password_hash = coalesce($7, password_hash) where id = $1`,
      [memberId, data.name, data.skills, data.interests, data.github, x, pw],
    );
    await tx.query(
      `insert into teammate_profiles (member_id, discoverable, skills, interests, updated_at) values ($1, false, $2, $3, now())
       on conflict (member_id) do update set skills = excluded.skills, interests = excluded.interests, updated_at = now()`,
      [memberId, data.skills, data.interests],
    );
    await linkRoster(tx, memberId, data.email);
    return { result: null, resourceId: memberId, payload: { fields: ["name", "skills", "interests", "github", "x", ...(pw ? ["password"] : [])] } };
  });
}

/** A desk code for `email`: a member sign-in code, or a desk activation code issued to this person. */
async function proveWithCode(existing: { id: number; guest_id: number | null }, email: string, code: string) {
  try {
    const id = await memberLoginWithCode(email, code);
    return id === existing.id;
  } catch {
    /* not a sign-in code: try a desk activation code */
  }
  const key = sha256(`code:${code.toUpperCase().replace(/[^0-9A-Z]/g, "")}`);
  const [s] = await query<{ member_id: number | null; guest_id: number | null }>(
    "select member_id, guest_id from activation_sessions where pair_token_hash = $1 and status = 'invited' and expires_at > now()",
    [key],
  );
  if (!s) return false;
  const mine = s.member_id === existing.id || (s.member_id === null && s.guest_id !== null && (s.guest_id === existing.guest_id || (await query("select 1 from roster_guests where id = $1 and email_hash = $2", [s.guest_id, emailHash(email)])).length > 0));
  if (!mine) return false;
  const out = await redeemActivationCode(code, email);
  if (out.kind !== "ok" || out.memberId !== existing.id) {
    await clearMemberSession();
    return false;
  }
  return true;
}

/**
 * Step (a) of /register. `viewer` is the personally signed-in member, if any
 * (then this edits their own profile). Otherwise: a new email creates an
 * account; an existing one needs its password or a desk code (needs_proof).
 * The personal session is set on success.
 */
export async function submitProfile(input: unknown, viewer: MemberRow | null): Promise<ProfileResult> {
  const data = parse(profileInputSchema, input);
  const x = data.x ? normalizeX(data.x) : "";
  if (x === null) throw new AppError("VALIDATION_FAILED", { userMessage: "Your X handle should look like @handle." });
  if (data.password && data.password.length < 8) throw new AppError("VALIDATION_FAILED", { userMessage: "Use at least 8 characters for your password." });

  if (viewer) {
    if (viewer.email.toLowerCase() !== data.email) {
      const taken = await query("select 1 from members where lower(email) = $1 and id <> $2", [data.email, viewer.id]);
      if (taken.length) throw new AppError("CONFLICT", { userMessage: "That email belongs to another account. Sign out first to use it." });
      await query("update members set email = $2, email_hash = $3 where id = $1", [viewer.id, data.email, emailHash(data.email)]);
    }
    const [row] = await query<{ has: boolean }>("select password_hash is not null as has from members where id = $1", [viewer.id]);
    if (!row.has && !data.password) throw new AppError("VALIDATION_FAILED", { userMessage: "Choose a password (8+ characters) so you can sign in on another device." });
    await saveProfileFields(viewer.id, data, x || null, memberActor(viewer), "member.profile");
    return { kind: "ok", memberId: viewer.id, created: false };
  }

  const [existing] = await query<{ id: number; name: string; team_id: number | null; guest_id: number | null; password_hash: string | null }>(
    "select id, name, team_id, guest_id, password_hash from members where lower(email) = $1 and deleted_at is null",
    [data.email],
  );
  if (existing) {
    // Never adopt an existing account on the email alone.
    let ok = false;
    if (data.proof_password && existing.password_hash) ok = await verifyPassword(data.proof_password, existing.password_hash);
    else if (data.proof_code) ok = await proveWithCode(existing, data.email, data.proof_code);
    if (!data.proof_password && !data.proof_code) return { kind: "needs_proof" };
    if (!ok) throw new AppError("UNAUTHENTICATED", { userMessage: PROOF_FAILED });
    await setMemberSession({ memberId: existing.id, personal: true });
    const [{ has }] = await query<{ has: boolean }>("select password_hash is not null as has from members where id = $1", [existing.id]);
    if (!has && !data.password) throw new AppError("VALIDATION_FAILED", { userMessage: "You’re signed in. Now choose a password (8+ characters) and save again." });
    await saveProfileFields(existing.id, data, x || null, memberActor(existing), "member.profile_claimed");
    return { kind: "ok", memberId: existing.id, created: false };
  }

  if (!data.password) throw new AppError("VALIDATION_FAILED", { userMessage: "Choose a password (8+ characters) so you can sign in on another device." });
  const pw = await hashPassword(data.password);
  let memberId: number;
  try {
    memberId = await transaction(async (tx) => {
      const { rows } = await tx.query<{ id: number }>(
        `insert into members (team_id, name, display_name, email, email_hash, password_hash, skills, interests, github_handle, x_handle)
         values (null, $1, $1, $2, $3, $4, $5, $6, nullif($7, ''), $8) returning id`,
        [data.name, data.email, emailHash(data.email), pw, data.skills, data.interests, data.github, x || null],
      );
      const id = rows[0].id;
      await tx.query("insert into teammate_profiles (member_id, discoverable, skills, interests, updated_at) values ($1, false, $2, $3, now())", [id, data.skills, data.interests]);
      await linkRoster(tx, id, data.email);
      await writeAudit({ type: "member", id, label: data.name }, { action: "member.register", resourceType: "member", resourceId: id, payload: { source: "event_day_register" } }, tx);
      return id;
    });
  } catch (e) {
    // Lost a race with someone registering the same email: treat it as existing.
    if ((e as { code?: string }).code === "23505") return { kind: "needs_proof" };
    throw e;
  }
  await setMemberSession({ memberId, personal: true });
  return { kind: "ok", memberId, created: true };
}

// ── Matchmaking choice and pool ──────────────────────────────────────────────

/**
 * Step (c): "Are you looking to form a team?" Yes puts the person in the pool
 * (and records teammate_discovery = on); no records it off. Someone already
 * on a team just stays there.
 */
export async function setTeamChoice(member: MemberRow, looking: boolean) {
  const team = await currentTeamOf(member.id);
  const inPool = looking && !team;
  await withAudit(memberActor(member), inPool ? "match.pool_join" : "match.pool_leave", "member", async (tx) => {
    await tx.query("update members set looking_for_team = $2, photo_step_at = coalesce(photo_step_at, now()) where id = $1", [member.id, inPool]);
    await tx.query(
      `insert into teammate_profiles (member_id, discoverable, skills, interests, updated_at)
       select id, $2, coalesce(skills, '{}'), coalesce(interests, '{}'), now() from members where id = $1
       on conflict (member_id) do update set discoverable = excluded.discoverable, updated_at = now()`,
      [member.id, inPool],
    );
    await appendConsents(tx, member.id, { teammate_discovery: inPool }, "web");
    return { result: null, resourceId: member.id, payload: { looking } };
  });
  return { inPool };
}

export type PoolPerson = { member_id: number; name: string; skills: string[]; interests: string[]; photo: Date | null; intro: string | null };
export type PoolTeam = { team_id: number; slug: string; name: string; track: string; summary_public: string | null; seeking_skills: string[]; open_seats: number; intro: string | null };

/** Everyone in the pool except `viewerId`. Name, photo, skills and interests only: never email or phone. */
export async function listPool(viewerId: number | null): Promise<PoolPerson[]> {
  return query<PoolPerson>(
    `select m.id as member_id, coalesce(m.display_name, m.name) as name, coalesce(p.skills, m.skills, '{}') as skills, coalesce(p.interests, m.interests, '{}') as interests,
            (select s.captured_at from selfies s where s.member_id = m.id and s.deleted_at is null
                and exists (select 1 from member_consent_current c2 where c2.member_id = m.id and c2.category = 'selfie_storage' and c2.granted)) as photo,
            (select i.status from teammate_introductions i where i.requester_id = $1 and i.target_member_id = m.id order by i.created_at desc limit 1) as intro
       from members m
       left join teammate_profiles p on p.member_id = m.id
       join member_consent_current c on c.member_id = m.id and c.category = 'teammate_discovery' and c.granted
      where m.looking_for_team and m.team_id is null and m.deleted_at is null and m.id <> coalesce($1, 0)
      order by m.id`,
    [viewerId],
  );
}

export async function listOpenTeams(viewerId: number): Promise<PoolTeam[]> {
  const teams = await listRecruitingTeams({ limit: 100 });
  if (!teams.length) return [];
  const intros = await query<{ target_team_id: number; status: string }>(
    `select distinct on (target_team_id) target_team_id, status from teammate_introductions
      where requester_id = $1 and target_team_id = any($2::bigint[]) order by target_team_id, created_at desc`,
    [viewerId, teams.map((t) => t.id)],
  );
  const by = new Map(intros.map((i) => [i.target_team_id, i.status]));
  return teams.map((t) => ({
    team_id: t.id,
    slug: t.slug,
    name: t.name,
    track: t.track,
    summary_public: t.summary_public,
    seeking_skills: t.seeking_skills,
    open_seats: Math.max(0, t.cap - t.member_count),
    intro: by.get(t.id) ?? null,
  }));
}

/** Organizer view of the pool: adds the P-code and check-in time. Staff only (callers check the role). */
export async function listPoolForOps() {
  return query<{ member_id: number; name: string; public_code: string | null; skills: string[]; interests: string[]; checked_in_at: Date | null; since: Date | null }>(
    `select m.id as member_id, coalesce(m.display_name, m.name) as name, m.public_code, coalesce(p.skills, m.skills, '{}') as skills,
            coalesce(p.interests, m.interests, '{}') as interests, m.checked_in_at, p.updated_at as since
       from members m left join teammate_profiles p on p.member_id = m.id
      where m.looking_for_team and m.team_id is null and m.deleted_at is null
      order by p.updated_at nulls last, m.id`,
  );
}

/**
 * Answer an intro request. Accepting a request to join *my team* also puts
 * the requester on the team (if there's still a seat), which takes them out
 * of the pool.
 */
export async function answerIntro(who: ActingMember, introId: number, accept: boolean) {
  const [intro] = await query<{ requester_id: number; target_team_id: number | null; status: string }>("select requester_id, target_team_id, status from teammate_introductions where id = $1", [introId]);
  const receipt = await respondIntro(who, introId, accept);
  if (accept && intro?.target_team_id && intro.target_team_id === who.member.team_id) {
    const requester = await getMemberById(intro.requester_id);
    if (requester && !requester.team_id) {
      await admitToTeam(who.actor, intro.target_team_id, requester.id, `intro:${introId}`);
      return { receipt, joined: requester.display_name ?? requester.name };
    }
  }
  return { receipt, joined: null };
}
