import "server-only";
import { after } from "next/server";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { getEvent } from "@/lib/event";
import { draftObject } from "./ai";
import {
  getMember,
  getStaff,
  hasRole,
  memberActor,
  requireBearer,
  staffActor,
  tokenActor,
  type MemberRow,
  type Staff,
} from "./auth";
import { AppError, idempotent, parse, siteUrl, transaction, writeAudit, z, zx, type Actor, type Receipt } from "./core";
import { PAPER_LATE_AFTER_MINUTES, parsePaperTime, redactRestricted, scrubSecrets, type RedactionKind } from "./help-rules";

// Help desk (Tier-0, SPEC §12). Tickets come from the hub, from /help for
// members without a team, from the CLI/MCP, or from a paper slip typed in by
// staff. Mentors claim atomically; a second claim gets 409 "already claimed".
//
// This must keep working when AI, Slack and the renderer are down: the web
// queue at /ops/help is the source of truth, Slack is a courtesy ping (outbox
// + one immediate try), and help_diagnose falls back to a rule-based docs map.
//
// Every function here re-checks who is asking. Server actions, /api/v1/help*
// and the MCP tools (help_create, help_get_status, help_diagnose) are thin
// wrappers around these.

// ── Vocabulary ───────────────────────────────────────────────────────────────

export const HELP_CATEGORIES = ["kane_cli", "test_manager", "auth", "ci_cloud", "mobile", "idea", "github", "other"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<HelpCategory, string> = {
  kane_cli: "Kane CLI",
  test_manager: "Test Manager",
  auth: "Auth",
  ci_cloud: "CI / Cloud",
  mobile: "Mobile",
  idea: "Idea",
  github: "GitHub",
  other: "Other",
};

export const HELP_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type HelpPriority = (typeof HELP_PRIORITIES)[number];
export const PRIORITY_LABEL: Record<HelpPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent · blocked on a deadline",
};

export const HELP_STATUSES = ["new", "triaged", "claimed", "in_progress", "resolved", "closed", "escalated", "duplicate"] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];
export const STATUS_LABEL: Record<HelpStatus, string> = {
  new: "Open",
  triaged: "Triaged",
  claimed: "Claimed",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  escalated: "Escalated",
  duplicate: "Duplicate",
};

/** Waiting for, or being worked on by, a human. */
export const OPEN_STATUSES: HelpStatus[] = ["new", "triaged", "claimed", "in_progress", "escalated"];
/** A mentor can pick these up. Escalated tickets go back in the pool for a senior mentor. */
const CLAIMABLE: HelpStatus[] = ["new", "triaged", "escalated"];
const DONE_STATUSES: HelpStatus[] = ["resolved", "closed", "duplicate"];

/** Ops roles that work the queue. Admin passes everything (hasRole). */
const HELP_STAFF_ROLES = ["mentor", "organizer"] as const;

const MAX_OPEN_PER_MEMBER = 3;
const MAX_CREATED_PER_15_MIN = 5;

// Secret scrubbing, mentor redaction and slip-time parsing are pure rules in
// help-rules.ts (unit-tested without a database).
export { scrubSecrets };

// ── Rows and views ───────────────────────────────────────────────────────────

type TicketRow = {
  id: number;
  code: string;
  member_id: number | null;
  team_id: number | null;
  table_label: string | null;
  category: HelpCategory;
  summary: string;
  details: string | null;
  tried: string | null;
  priority: HelpPriority;
  status: HelpStatus;
  assigned_mentor_id: number | null;
  safe_run_id: string | null;
  source: "web" | "mcp" | "paper";
  duplicate_of: number | null;
  paper_original_at: Date | null;
  entered_by: number | null;
  created_at: Date;
  claimed_at: Date | null;
  resolved_at: Date | null;
  updated_at: Date;
};

type TicketJoined = TicketRow & {
  team_slug: string | null;
  team_name: string | null;
  opener_name: string | null;
  opener_code: string | null;
  mentor_name: string | null;
  duplicate_code: string | null;
  entered_by_name: string | null;
  age_seconds: number;
};

const TICKET_SELECT = `
  select t.*, tm.slug as team_slug, tm.name as team_name,
         coalesce(m.display_name, m.name) as opener_name, m.public_code as opener_code,
         s.name as mentor_name, d.code as duplicate_code, e.name as entered_by_name,
         extract(epoch from now() - coalesce(t.paper_original_at, t.created_at))::int as age_seconds
    from help_tickets t
    left join teams tm on tm.id = t.team_id
    left join members m on m.id = t.member_id
    left join staff_accounts s on s.id = t.assigned_mentor_id
    left join help_tickets d on d.id = t.duplicate_of
    left join staff_accounts e on e.id = t.entered_by`;

export type HelpMessageView = {
  id: number;
  author_type: "member" | "staff" | "system";
  /** First name for people; "Help desk" for system lines. */
  author: string;
  body: string;
  visibility: "ticket" | "staff_only";
  created_at: string;
};

export type HelpTicketView = {
  id: number;
  code: string;
  status: HelpStatus;
  status_label: string;
  category: HelpCategory;
  category_label: string;
  priority: HelpPriority;
  summary: string;
  details: string | null;
  tried: string | null;
  safe_run_id: string | null;
  table_label: string | null;
  source: "web" | "mcp" | "paper";
  team: { slug: string; name: string } | null;
  /** Opener's first name. */
  opener: string | null;
  /** Mentor's first name, only once the ticket is claimed (blueprint: "mentor name only when claimed"). */
  mentor: string | null;
  duplicate_of: string | null;
  /** When the person asked: the slip time for paper tickets, otherwise when it was opened online. */
  opened_at: string;
  /** When it reached the system (entry time for paper tickets). */
  created_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
  updated_at: string;
  age_seconds: number;
  url: string;
  messages: HelpMessageView[];
  /** What was hidden from this viewer (secrets, private-repo excerpts, biometrics). Empty for the ticket's author. */
  redacted: RedactionKind[];
};

/** What staff see in addition: full names, participant code, who typed in a paper slip, staff-only notes. */
export type HelpTicketStaffView = HelpTicketView & {
  mentor_full: string | null;
  assigned_mentor_id: number | null;
  opener_full: string | null;
  opener_code: string | null;
  entered_by: string | null;
  paper_original_at: string | null;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const firstName = (s: string | null) => (s ? s.trim().split(/\s+/)[0] : null);

function toView(t: TicketJoined, messages: HelpMessageView[]): HelpTicketView {
  const claimedOrLater = !["new", "triaged"].includes(t.status);
  return {
    id: t.id,
    code: t.code,
    status: t.status,
    status_label: STATUS_LABEL[t.status],
    category: t.category,
    category_label: CATEGORY_LABEL[t.category],
    priority: t.priority,
    summary: t.summary,
    details: t.details,
    tried: t.tried,
    safe_run_id: t.safe_run_id,
    table_label: t.table_label,
    source: t.source,
    team: t.team_slug && t.team_name ? { slug: t.team_slug, name: t.team_name } : null,
    opener: firstName(t.opener_name),
    mentor: claimedOrLater ? firstName(t.mentor_name) : null,
    duplicate_of: t.duplicate_code,
    opened_at: iso(t.paper_original_at ?? t.created_at)!,
    created_at: iso(t.created_at)!,
    claimed_at: iso(t.claimed_at),
    resolved_at: iso(t.resolved_at),
    updated_at: iso(t.updated_at)!,
    age_seconds: t.age_seconds,
    url: `/help/${t.code}`,
    messages,
    redacted: [],
  };
}

function toStaffView(t: TicketJoined, messages: HelpMessageView[]): HelpTicketStaffView {
  return {
    ...toView(t, messages),
    mentor: firstName(t.mentor_name),
    mentor_full: t.mentor_name,
    assigned_mentor_id: t.assigned_mentor_id,
    opener_full: t.opener_name,
    opener_code: t.opener_code,
    entered_by: t.entered_by_name,
    paper_original_at: iso(t.paper_original_at),
  };
}

// ── Privacy: who reads a ticket decides what they see ────────────────────────
//
// The author sees their own words. Teammates see the team's private repo but
// not someone else's face data. Mentors and organizers (web queue, REST, MCP)
// see neither, and the UI says what was hidden. Applied on read, so the stored
// ticket stays the participant's own text.

type Audience = "author" | "team" | "staff";

/** Linked private repositories per team (repository_links.permission_scope has "private"). */
async function privateReposByTeam(teamIds: (number | null)[]): Promise<Map<number, string[]>> {
  const ids = [...new Set(teamIds.filter((x): x is number => x !== null))];
  const map = new Map<number, string[]>();
  if (!ids.length) return map;
  const rows = await query<{ team_id: number; repo: string }>(
    `select p.team_id, rl.repo_full_name as repo
       from repository_links rl join projects p on p.id = rl.project_id
      where p.team_id = any($1::bigint[]) and rl.permission_scope ? 'private'`,
    [ids],
  );
  for (const r of rows) map.set(r.team_id, [...(map.get(r.team_id) ?? []), r.repo]);
  return map;
}

function restrictView<V extends HelpTicketView>(v: V, audience: Audience, privateRepos: string[]): V {
  if (audience === "author") return v;
  const ctx = { privateRepos, repoAccess: audience === "team" };
  const kinds = new Set<RedactionKind>();
  const r = (text: string | null) => {
    if (!text) return text;
    const out = redactRestricted(text, ctx);
    for (const k of out.kinds) kinds.add(k);
    return out.text;
  };
  return {
    ...v,
    summary: r(v.summary)!,
    details: r(v.details),
    tried: r(v.tried),
    safe_run_id: r(v.safe_run_id),
    messages: v.messages.map((m) => ({ ...m, body: r(m.body)! })),
    redacted: [...kinds],
  };
}

async function restrictMany<V extends HelpTicketView>(views: { view: V; teamId: number | null; audience: Audience }[]): Promise<V[]> {
  const repos = await privateReposByTeam(views.filter((x) => x.audience !== "author").map((x) => x.teamId));
  return views.map((x) => restrictView(x.view, x.audience, (x.teamId && repos.get(x.teamId)) || []));
}

async function loadMessages(ticketId: number, includeStaffOnly: boolean): Promise<HelpMessageView[]> {
  const rows = await query<{
    id: number;
    author_type: HelpMessageView["author_type"];
    member_name: string | null;
    staff_name: string | null;
    body: string;
    visibility: HelpMessageView["visibility"];
    created_at: Date;
  }>(
    `select h.id, h.author_type, coalesce(m.display_name, m.name) as member_name, s.name as staff_name, h.body, h.visibility, h.created_at
       from help_messages h
       left join members m on m.id = h.author_member_id
       left join staff_accounts s on s.id = h.author_staff_id
      where h.ticket_id = $1 ${includeStaffOnly ? "" : "and h.visibility = 'ticket'"}
      order by h.created_at, h.id`,
    [ticketId],
  );
  return rows.map((r) => ({
    id: r.id,
    author_type: r.author_type,
    author: r.author_type === "system" ? "Help desk" : r.author_type === "staff" ? (firstName(r.staff_name) ?? "Staff") : (firstName(r.member_name) ?? "Participant"),
    body: r.body,
    visibility: r.visibility,
    created_at: iso(r.created_at)!,
  }));
}

/** "H-0012", "h-12", "12" (an id) → a lookup. Codes are case-insensitive. */
function ticketWhere(ref: string): { sql: string; value: string | number } {
  const s = ref.trim();
  if (/^\d+$/.test(s)) return { sql: "t.id = $1", value: Number(s) };
  return { sql: "upper(t.code) = upper($1)", value: s };
}

async function findTicket(ref: string): Promise<TicketJoined | null> {
  if (!ref || ref.length > 40) return null;
  const w = ticketWhere(ref);
  const [row] = await query<TicketJoined>(`${TICKET_SELECT} where ${w.sql}`, [w.value]);
  return row ?? null;
}

async function lockTicket(tx: PoolClient, ref: string): Promise<TicketRow> {
  const w = ticketWhere(ref);
  const { rows } = await tx.query<TicketRow>(`select t.* from help_tickets t where ${w.sql} for update`, [w.value]);
  if (!rows[0]) throw new AppError("NOT_FOUND", { userMessage: `No help ticket ${ref}.` });
  return rows[0];
}

async function systemMessage(tx: PoolClient, ticketId: number, body: string, visibility: "ticket" | "staff_only" = "ticket", staffId: number | null = null) {
  await tx.query(
    `insert into help_messages (ticket_id, author_type, author_staff_id, body, visibility) values ($1, 'system', $2, $3, $4)`,
    [ticketId, staffId, body, visibility],
  );
}

const nowIso = async (tx: PoolClient) => {
  const { rows } = await tx.query<{ now: Date }>("select now() as now");
  return rows[0].now.toISOString();
};

// ── Who is asking ────────────────────────────────────────────────────────────

/** A participant opening or following tickets: who they are, the audit actor, and the channel. */
export type HelpRequester = { member: MemberRow; actor: Actor; source: "web" | "mcp" };

/** Cookie (web) requester, or UNAUTHENTICATED. */
export async function webRequester(): Promise<HelpRequester> {
  const member = await getMember();
  if (!member) throw new AppError("UNAUTHENTICATED", { userMessage: "Sign in to open or follow a help ticket. No sign-in? Walk to the help desk." });
  return { member, actor: memberActor(member), source: "web" };
}

/** Bearer (CLI / MCP) requester, or UNAUTHENTICATED. */
export async function bearerRequester(req: Request): Promise<HelpRequester> {
  const auth = await requireBearer(req);
  return { member: auth.member, actor: tokenActor(auth), source: "mcp" };
}

/** Throws unless `staff` works the help queue (mentor, organizer, admin). */
export function assertHelpStaff(staff: Staff | null): Staff {
  if (!staff) throw new AppError("UNAUTHENTICATED", { userMessage: "Staff sign-in required." });
  if (!hasRole(staff, ...HELP_STAFF_ROLES)) throw new AppError("FORBIDDEN");
  return staff;
}

/** Cookie staff session, or UNAUTHENTICATED / FORBIDDEN. */
export async function requireHelpStaff(): Promise<Staff> {
  return assertHelpStaff(await getStaff());
}

/**
 * Staff for an /api/v1 request: the hd_staff cookie, or a bearer token whose
 * member is linked to an active staff account (staff_accounts.member_id).
 */
export async function requireHelpStaffFromRequest(req: Request): Promise<Staff> {
  const cookieStaff = await getStaff();
  if (cookieStaff) return assertHelpStaff(cookieStaff);
  const auth = await requireBearer(req);
  const [row] = await query<Staff>("select id, name, email, role from staff_accounts where member_id = $1 and active order by id limit 1", [auth.member.id]);
  return assertHelpStaff(row ?? null);
}

function canSee(t: Pick<TicketRow, "member_id" | "team_id">, viewer: { member?: MemberRow | null; staff?: Staff | null }) {
  if (viewer.staff && hasRole(viewer.staff, ...HELP_STAFF_ROLES)) return true;
  const m = viewer.member;
  if (!m) return false;
  return t.member_id === m.id || (!!m.team_id && t.team_id === m.team_id);
}

// ── Create ───────────────────────────────────────────────────────────────────

export const createTicketSchema = z.object({
  category: z.enum(HELP_CATEGORIES),
  priority: z.enum(HELP_PRIORITIES).default("normal"),
  summary: z.string().trim().min(8, "Say what is wrong in a short sentence").max(200, "Keep it to one sentence (200 characters)"),
  details: zx.optText(2000),
  tried: zx.optText(1000),
  safe_run_id: zx.optText(120),
  table_label: zx.optText(40),
  idempotency_key: zx.idempotencyKey,
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export type CreatedTicket = {
  ticket: { id: number; code: string; status: HelpStatus; url: string };
  receipt: Receipt;
  replayed: boolean;
  warnings: string[];
};

/**
 * Open a ticket for the requester (with or without a team). Idempotent on
 * `idempotency_key`: a double-submit or CLI retry returns the same H-code.
 */
export async function createHelpTicket(who: HelpRequester, raw: unknown): Promise<CreatedTicket> {
  const input = parse(createTicketSchema, raw);
  const warnings: string[] = [];
  const clean = (s: string | null) => {
    if (!s) return s;
    const r = scrubSecrets(s);
    if (r.redacted && !warnings.length) warnings.push("We removed something that looked like a password or key. Never paste secrets into a ticket.");
    return r.text;
  };
  const summary = clean(input.summary)!;
  const details = clean(input.details);
  const tried = clean(input.tried);
  const safeRun = clean(input.safe_run_id);

  const { result, replayed } = await idempotent(input.idempotency_key, `help.create:member:${who.member.id}`, async () => {
    // Same key already landed (e.g. idempotency row expired): hand back that ticket.
    if (input.idempotency_key) {
      const [prior] = await query<{ id: number; code: string; status: HelpStatus; created_at: Date }>(
        "select id, code, status, created_at from help_tickets where member_id = $1 and idempotency_key = $2",
        [who.member.id, input.idempotency_key],
      );
      if (prior) return { id: prior.id, code: prior.code, status: prior.status, server_time: prior.created_at.toISOString() };
    }

    const [load] = await query<{ open: number; recent: number }>(
      `select count(*) filter (where status = any($2))::int as open,
              count(*) filter (where created_at > now() - interval '15 minutes')::int as recent
         from help_tickets where member_id = $1`,
      [who.member.id, OPEN_STATUSES],
    );
    if (load.open >= MAX_OPEN_PER_MEMBER) {
      throw new AppError("RATE_LIMITED", { userMessage: `You already have ${load.open} open tickets. Add a reply to one of them, or walk to the help desk.` });
    }
    if (load.recent >= MAX_CREATED_PER_15_MIN) throw new AppError("RATE_LIMITED");

    return transaction(async (tx) => {
      // Paper slips can carry any H- number, so the sequence may land on one
      // already entered from paper. Skip taken codes instead of failing the
      // participant's ticket (a savepoint keeps the transaction usable).
      let t: TicketRow | undefined;
      for (let attempt = 0; !t; attempt++) {
        await tx.query("savepoint help_code");
        try {
          const { rows } = await tx.query<TicketRow>(
            `insert into help_tickets (member_id, team_id, table_label, category, summary, details, tried, priority, safe_run_id, source, idempotency_key)
             values ($1, $2, coalesce($3, (select table_label from teams where id = $2)), $4, $5, $6, $7, $8, $9, $10, $11)
             returning *`,
            [who.member.id, who.member.team_id, input.table_label, input.category, summary, details, tried, input.priority, safeRun, who.source, input.idempotency_key ?? null],
          );
          t = rows[0];
        } catch (e) {
          const pg = e as { code?: string; constraint?: string };
          if (attempt >= 5 || pg.code !== "23505" || pg.constraint !== "help_tickets_code_key") throw e;
          await tx.query("rollback to savepoint help_code");
        }
      }
      await writeAudit(
        who.actor,
        { action: "help.create", resourceType: "help_ticket", resourceId: t.id, after: { code: t.code, category: t.category, priority: t.priority, source: t.source }, payload: { code: t.code } },
        tx,
      );
      await queueSlack(tx, t, "new");
      return { id: t.id, code: t.code, status: t.status, server_time: t.created_at.toISOString() };
    });
  });

  if (!replayed) flushSlackSoon();
  return {
    ticket: { id: result.id, code: result.code, status: result.status, url: `/help/${result.code}` },
    receipt: { id: result.code, server_time: result.server_time },
    replayed,
    warnings,
  };
}

// ── Read (participant) ───────────────────────────────────────────────────────

/** One ticket, if the viewer opened it, is on its team, or works the queue. Staff-only notes are left out. */
export async function getHelpTicket(ref: string, viewer: { member?: MemberRow | null; staff?: Staff | null }): Promise<HelpTicketView> {
  const t = await findTicket(ref);
  // Same answer for "missing" and "not yours", so codes can't be probed.
  if (!t || !canSee(t, viewer)) throw new AppError("NOT_FOUND", { userMessage: "No ticket with that code on your account." });
  const audience: Audience = viewer.member && t.member_id === viewer.member.id ? "author" : viewer.staff && hasRole(viewer.staff, ...HELP_STAFF_ROLES) ? "staff" : "team";
  const [view] = await restrictMany([{ view: toView(t, await loadMessages(t.id, false)), teamId: t.team_id, audience }]);
  return view;
}

/** The member's own tickets plus their team's, newest first. */
export async function listTicketsFor(who: { memberId: number | null; teamId: number | null }, limit = 20): Promise<HelpTicketView[]> {
  if (!who.memberId && !who.teamId) return [];
  const rows = await query<TicketJoined>(
    `${TICKET_SELECT}
      where ($1::bigint is not null and t.member_id = $1) or ($2::bigint is not null and t.team_id = $2)
      order by (t.status = any($3)) desc, t.created_at desc
      limit $4`,
    [who.memberId, who.teamId, OPEN_STATUSES, limit],
  );
  return restrictMany(rows.map((r) => ({ view: toView(r, []), teamId: r.team_id, audience: r.member_id !== null && r.member_id === who.memberId ? ("author" as const) : ("team" as const) })));
}

// ── Replies and reopen (participant or staff) ────────────────────────────────

const replySchema = z.object({
  body: z.string().trim().min(1, "Write a reply").max(2000),
  staff_only: zx.checkbox.optional(),
});

/** Add a reply. Members reply on tickets they can see; staff may add a staff-only note. */
export async function replyToTicket(ref: string, who: { requester?: HelpRequester; staff?: Staff }, raw: unknown): Promise<Receipt & { warnings: string[] }> {
  const input = parse(replySchema, raw);
  const { text, redacted } = scrubSecrets(input.body);
  const staff = who.staff ? assertHelpStaff(who.staff) : null;
  const member = who.requester?.member ?? null;
  if (!staff && !member) throw new AppError("UNAUTHENTICATED");
  const actor = staff ? staffActor(staff) : who.requester!.actor;

  return transaction(async (tx) => {
    const t = await lockTicket(tx, ref);
    if (!canSee(t, { member, staff })) throw new AppError("NOT_FOUND", { userMessage: "No ticket with that code on your account." });
    const staffOnly = !!staff && !!input.staff_only;
    const { rows } = await tx.query<{ id: number; created_at: Date }>(
      `insert into help_messages (ticket_id, author_type, author_member_id, author_staff_id, body, visibility)
       values ($1, $2, $3, $4, $5, $6) returning id, created_at`,
      [t.id, staff ? "staff" : "member", staff ? null : member!.id, staff?.id ?? null, text, staffOnly ? "staff_only" : "ticket"],
    );
    // A mentor's first public reply means work has started.
    if (staff && !staffOnly && t.status === "claimed") await tx.query("update help_tickets set status = 'in_progress', updated_at = now() where id = $1", [t.id]);
    else await tx.query("update help_tickets set updated_at = now() where id = $1", [t.id]);
    await writeAudit(actor, { action: staffOnly ? "help.note" : "help.reply", resourceType: "help_ticket", resourceId: t.id, payload: { code: t.code, message_id: rows[0].id } }, tx);
    return {
      id: `${t.code}#${rows[0].id}`,
      server_time: rows[0].created_at.toISOString(),
      warnings: redacted ? ["We removed something that looked like a password or key."] : [],
    };
  });
}

const reasonSchema = z.object({ reason: zx.optText(500) });

/**
 * Put a resolved / closed / duplicate ticket back in the queue. History is
 * kept: the old claim and resolution stay in messages and the audit log.
 */
export async function reopenHelpTicket(ref: string, who: { requester?: HelpRequester; staff?: Staff }, raw: unknown = {}): Promise<Receipt> {
  const { reason } = parse(reasonSchema, raw);
  const staff = who.staff ? assertHelpStaff(who.staff) : null;
  const member = who.requester?.member ?? null;
  if (!staff && !member) throw new AppError("UNAUTHENTICATED");
  const actor = staff ? staffActor(staff) : who.requester!.actor;
  const out = await transaction(async (tx) => {
    const t = await lockTicket(tx, ref);
    if (!canSee(t, { member, staff })) throw new AppError("NOT_FOUND", { userMessage: "No ticket with that code on your account." });
    if (!DONE_STATUSES.includes(t.status)) throw new AppError("CONFLICT", { userMessage: `${t.code} is still open (${STATUS_LABEL[t.status]}).` });
    const { rows } = await tx.query<TicketRow>(
      `update help_tickets set status = 'new', assigned_mentor_id = null, claimed_at = null, resolved_at = null, duplicate_of = null, updated_at = now()
        where id = $1 returning *`,
      [t.id],
    );
    const by = staff ? `${firstName(staff.name)} (staff)` : (firstName(member!.display_name ?? member!.name) ?? "The participant");
    await systemMessage(tx, t.id, `Reopened by ${by}${reason ? `: ${reason}` : "."}`);
    await writeAudit(actor, { action: "help.reopen", resourceType: "help_ticket", resourceId: t.id, reason, before: { status: t.status, mentor: t.assigned_mentor_id }, after: { status: "new" } }, tx);
    await queueSlack(tx, rows[0], "reopened");
    return { id: t.code, server_time: (await nowIso(tx)) };
  });
  flushSlackSoon();
  return out;
}

// ── Queue (staff) ────────────────────────────────────────────────────────────

export type HelpQueue = {
  server_time: string;
  open: HelpTicketStaffView[];
  recent_done: HelpTicketStaffView[];
  counts: Record<HelpStatus, number>;
};

/** Everything open, oldest and most urgent first, plus the last few finished tickets. Staff only. */
export async function listHelpQueue(staff: Staff | null, opts: { mine?: boolean; doneLimit?: number } = {}): Promise<HelpQueue> {
  const s = assertHelpStaff(staff);
  const mineOnly = !!opts.mine && s.id !== null;
  const [open, done, counts, [{ now }]] = await Promise.all([
    query<TicketJoined>(
      `${TICKET_SELECT}
        where t.status = any($1) ${mineOnly ? "and t.assigned_mentor_id = $2" : ""}
        order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
                 coalesce(t.paper_original_at, t.created_at)`,
      mineOnly ? [OPEN_STATUSES, s.id] : [OPEN_STATUSES],
    ),
    query<TicketJoined>(`${TICKET_SELECT} where t.status = any($1) order by coalesce(t.resolved_at, t.updated_at) desc limit $2`, [DONE_STATUSES, opts.doneLimit ?? 15]),
    query<{ status: HelpStatus; n: number }>("select status, count(*)::int as n from help_tickets group by status"),
    query<{ now: Date }>("select now() as now"),
  ]);
  const c = Object.fromEntries(HELP_STATUSES.map((k) => [k, 0])) as Record<HelpStatus, number>;
  for (const r of counts) c[r.status] = r.n;
  const staffViews = (rows: TicketJoined[]) => restrictMany(rows.map((r) => ({ view: toStaffView(r, []), teamId: r.team_id, audience: "staff" as const })));
  return { server_time: now.toISOString(), open: await staffViews(open), recent_done: await staffViews(done), counts: c };
}

/** One ticket with every message, staff-only notes included, restricted content redacted. */
export async function getHelpTicketForStaff(ref: string, staff: Staff | null): Promise<HelpTicketStaffView> {
  assertHelpStaff(staff);
  const t = await findTicket(ref);
  if (!t) throw new AppError("NOT_FOUND", { userMessage: `No help ticket ${ref}.` });
  const [view] = await restrictMany([{ view: toStaffView(t, await loadMessages(t.id, true)), teamId: t.team_id, audience: "staff" }]);
  return view;
}

// ── Claim / start / release / resolve / escalate / duplicate / triage ────────

/**
 * Atomic claim. Two mentors pressing Claim at once: the UPDATE … WHERE status
 * IN (claimable) lets exactly one through; the other gets 409 "already
 * claimed by X" (A15).
 */
export async function claimHelpTicket(ref: string, staffIn: Staff | null): Promise<Receipt & { code: string; status: HelpStatus }> {
  const staff = assertHelpStaff(staffIn);
  const w = ticketWhere(ref);
  return transaction(async (tx) => {
    const { rows } = await tx.query<TicketRow>(
      `update help_tickets t set status = 'claimed', assigned_mentor_id = $2, claimed_at = coalesce(t.claimed_at, now()), updated_at = now()
        where ${w.sql} and t.status = any($3) returning t.*`,
      [w.value, staff.id, CLAIMABLE],
    );
    const t = rows[0];
    if (!t) {
      const { rows: cur } = await tx.query<{ code: string; status: HelpStatus; mentor: string | null }>(
        `select t.code, t.status, s.name as mentor from help_tickets t left join staff_accounts s on s.id = t.assigned_mentor_id where ${w.sql}`,
        [w.value],
      );
      if (!cur[0]) throw new AppError("NOT_FOUND", { userMessage: `No help ticket ${ref}.` });
      const c = cur[0];
      throw new AppError("CONFLICT", {
        userMessage: ["claimed", "in_progress"].includes(c.status)
          ? `${c.code} is already claimed by ${c.mentor ?? "another organizer"}.`
          : `${c.code} is ${STATUS_LABEL[c.status].toLowerCase()} and can't be claimed. Reopen it first.`,
        details: { status: c.status, claimed_by: firstName(c.mentor) },
      });
    }
    await systemMessage(tx, t.id, `Claimed by ${firstName(staff.name) ?? "a mentor"}. They're on their way to ${t.table_label ? `table ${t.table_label}` : "you"}.`);
    await writeAudit(staffActor(staff), { action: "help.claim", resourceType: "help_ticket", resourceId: t.id, after: { status: "claimed", mentor: staff.id } }, tx);
    return { id: t.code, code: t.code, status: t.status, server_time: t.updated_at.toISOString() };
  });
}

type Transition = {
  action: string;
  from: HelpStatus[];
  to: HelpStatus;
  /** Only the assigned mentor (or an organizer/admin) may do it. */
  ownerOnly?: boolean;
  set?: string;
  message: (staff: Staff, note: string | null) => string;
  slack?: "escalated";
};

const TRANSITIONS = {
  start: {
    action: "help.start",
    from: ["claimed"],
    to: "in_progress",
    ownerOnly: true,
    message: (s) => `${firstName(s.name)} is working on it.`,
  },
  release: {
    action: "help.release",
    from: ["claimed", "in_progress"],
    to: "new",
    ownerOnly: true,
    set: "assigned_mentor_id = null, claimed_at = null",
    message: (s, note) => `${firstName(s.name)} put it back in the queue${note ? `: ${note}` : "."} Another mentor will pick it up.`,
  },
  resolve: {
    action: "help.resolve",
    from: ["new", "triaged", "claimed", "in_progress", "escalated"],
    to: "resolved",
    set: "resolved_at = now(), assigned_mentor_id = coalesce(assigned_mentor_id, $3), claimed_at = coalesce(claimed_at, now())",
    message: (s, note) => `Resolved by ${firstName(s.name)}${note ? `: ${note}` : "."} Still stuck? Reopen it.`,
  },
  close: {
    action: "help.close",
    from: ["new", "triaged", "claimed", "in_progress", "escalated", "resolved"],
    to: "closed",
    set: "resolved_at = coalesce(resolved_at, now())",
    message: (s, note) => `Closed by ${firstName(s.name)}${note ? `: ${note}` : "."}`,
  },
  escalate: {
    action: "help.escalate",
    from: ["new", "triaged", "claimed", "in_progress"],
    to: "escalated",
    set: "priority = case when priority in ('low','normal') then 'high' else priority end",
    message: (s, note) => `Escalated by ${firstName(s.name)}${note ? `: ${note}` : "."} A senior mentor or organizer will take it.`,
    slack: "escalated",
  },
} satisfies Record<string, Transition>;

export type HelpTransition = keyof typeof TRANSITIONS;

/** Move a ticket through its lifecycle (start, release, resolve, close, escalate), with a reason line and an audit row. */
export async function transitionHelpTicket(ref: string, staffIn: Staff | null, kind: HelpTransition, raw: unknown = {}): Promise<Receipt & { code: string; status: HelpStatus }> {
  const staff = assertHelpStaff(staffIn);
  const tr: Transition = TRANSITIONS[kind];
  const { reason } = parse(reasonSchema, raw);
  const note = reason ? scrubSecrets(reason).text : null;
  if (kind === "escalate" && !note) throw new AppError("VALIDATION_FAILED", { userMessage: "Say why it needs escalating." });

  const out = await transaction(async (tx) => {
    const t = await lockTicket(tx, ref);
    if (!tr.from.includes(t.status)) {
      throw new AppError("CONFLICT", { userMessage: `${t.code} is ${STATUS_LABEL[t.status].toLowerCase()}; it can't be moved to ${STATUS_LABEL[tr.to].toLowerCase()} now.` });
    }
    const organizer = hasRole(staff, "organizer");
    if (tr.ownerOnly && !organizer && t.assigned_mentor_id !== staff.id) {
      throw new AppError("FORBIDDEN", { userMessage: `${t.code} is claimed by someone else.` });
    }
    const usesStaffParam = tr.set?.includes("$3");
    const { rows } = await tx.query<TicketRow>(
      `update help_tickets set status = $2, updated_at = now()${tr.set ? `, ${tr.set}` : ""} where id = $1 returning *`,
      usesStaffParam ? [t.id, tr.to, staff.id] : [t.id, tr.to],
    );
    await systemMessage(tx, t.id, tr.message(staff, note));
    await writeAudit(staffActor(staff), { action: tr.action, resourceType: "help_ticket", resourceId: t.id, reason: note, before: { status: t.status }, after: { status: tr.to } }, tx);
    if (tr.slack) await queueSlack(tx, rows[0], tr.slack);
    return { id: t.code, code: t.code, status: rows[0].status, server_time: rows[0].updated_at.toISOString() };
  });
  if (tr.slack) flushSlackSoon();
  return out;
}

const duplicateSchema = z.object({ of: z.string().trim().min(1, "Which ticket is the original?").max(40) });

/** Mark `ref` as a duplicate of another ticket (the original stays open). */
export async function markHelpDuplicate(ref: string, staffIn: Staff | null, raw: unknown): Promise<Receipt> {
  const staff = assertHelpStaff(staffIn);
  const { of } = parse(duplicateSchema, raw);
  return transaction(async (tx) => {
    const t = await lockTicket(tx, ref);
    const orig = await lockTicket(tx, of);
    if (orig.id === t.id) throw new AppError("VALIDATION_FAILED", { userMessage: "A ticket can't duplicate itself." });
    if (orig.status === "duplicate") throw new AppError("VALIDATION_FAILED", { userMessage: `${orig.code} is itself a duplicate; point at the original.` });
    if (DONE_STATUSES.includes(t.status)) throw new AppError("CONFLICT", { userMessage: `${t.code} is already ${STATUS_LABEL[t.status].toLowerCase()}.` });
    const { rows } = await tx.query<TicketRow>(
      "update help_tickets set status = 'duplicate', duplicate_of = $2, resolved_at = now(), updated_at = now() where id = $1 returning *",
      [t.id, orig.id],
    );
    await systemMessage(tx, t.id, `Merged into ${orig.code}; follow that ticket for updates.`);
    await writeAudit(staffActor(staff), { action: "help.duplicate", resourceType: "help_ticket", resourceId: t.id, before: { status: t.status }, after: { status: "duplicate", of: orig.code } }, tx);
    return { id: t.code, server_time: rows[0].updated_at.toISOString() };
  });
}

const triageSchema = z.object({
  priority: z.enum(HELP_PRIORITIES).optional(),
  category: z.enum(HELP_CATEGORIES).optional(),
  table_label: zx.optText(40),
});

/** Set priority / category / table and mark a new ticket triaged. */
export async function triageHelpTicket(ref: string, staffIn: Staff | null, raw: unknown): Promise<Receipt> {
  const staff = assertHelpStaff(staffIn);
  const input = parse(triageSchema, raw);
  return transaction(async (tx) => {
    const t = await lockTicket(tx, ref);
    if (DONE_STATUSES.includes(t.status)) throw new AppError("CONFLICT", { userMessage: `${t.code} is ${STATUS_LABEL[t.status].toLowerCase()}; reopen it first.` });
    const { rows } = await tx.query<TicketRow>(
      `update help_tickets
          set priority = coalesce($2, priority), category = coalesce($3, category), table_label = coalesce($4, table_label),
              status = case when status = 'new' then 'triaged' else status end, updated_at = now()
        where id = $1 returning *`,
      [t.id, input.priority ?? null, input.category ?? null, input.table_label],
    );
    const n = rows[0];
    await writeAudit(
      staffActor(staff),
      { action: "help.triage", resourceType: "help_ticket", resourceId: t.id, before: { status: t.status, priority: t.priority, category: t.category, table: t.table_label }, after: { status: n.status, priority: n.priority, category: n.category, table: n.table_label } },
      tx,
    );
    return { id: t.code, server_time: n.updated_at.toISOString() };
  });
}

// ── Paper tickets (A16) ──────────────────────────────────────────────────────

const paperStatus = z.enum(["new", "claimed", "in_progress", "resolved"]);

export const paperTicketSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^H-[0-9A-Z]{1,8}$/, "Use the number printed on the slip, e.g. H-9012"),
  // Either one opened_at ("2026-10-24 13:05", "1:05 PM", ISO) or the form's date + 24-hour time.
  opened_at: zx.optText(40),
  opened_date: zx.optText(10),
  opened_time: zx.optText(40),
  team: zx.optText(80),
  participant: zx.optText(40),
  table_label: zx.optText(40),
  category: z.enum(HELP_CATEGORIES),
  priority: z.enum(HELP_PRIORITIES).default("normal"),
  summary: z.string().trim().min(3, "Copy the one-sentence problem").max(200),
  tried: zx.optText(1000),
  safe_run_id: zx.optText(120),
  status: paperStatus.default("new"),
  claimed_by: zx.optText(80),
  claimed_at: zx.optText(40),
  resolved_at: zx.optText(40),
  resolution: zx.optText(500),
  staff_initials: zx.optText(12),
  /** Why the slip is entered late. Required once the slip time is PAPER_LATE_AFTER_MINUTES old. */
  late_reason: zx.optText(500),
});
export type PaperTicketInput = z.input<typeof paperTicketSchema>;

export type PaperResult = {
  code: string;
  status: "created" | "already_entered";
  /** The slip time as recorded, in the event zone with its abbreviation ("2026-10-23 00:15 PDT"). */
  opened_at_local: string;
  receipt: Receipt;
};

/** "2026-10-23 00:15 PDT": 24-hour wall time in the event zone, the same shape staff typed. */
function slipClock(d: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

/**
 * Type in a paper slip. The slip's time goes to paper_original_at; created_at
 * stays the real entry time, so nothing is backdated. A slip entered more
 * than PAPER_LATE_AFTER_MINUTES after its time needs a reason, kept on the
 * audit row and a staff-only note. Re-entering the same slip (same code +
 * same original time) is a no-op that writes nothing; a different slip with a
 * used code is a CONFLICT to reconcile by hand.
 */
export async function addPaperTicket(staffIn: Staff | null, raw: unknown): Promise<PaperResult> {
  const staff = assertHelpStaff(staffIn);
  const input = parse(paperTicketSchema, raw);
  const ev = await getEvent();
  const tz = ev.timezone;
  const eventDate = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ev.startsAt);

  // The form sends a date and a 24-hour time; a full date-time typed into the time box wins.
  const openedRaw = input.opened_at ?? (input.opened_time && /^\d{4}-/.test(input.opened_time) ? input.opened_time : [input.opened_date, input.opened_time].filter(Boolean).join(" "));
  const opened = parsePaperTime(openedRaw ?? "", eventDate);
  if (!opened.ok) throw new AppError("VALIDATION_FAILED", { userMessage: `Opened time: ${opened.message}` });
  // Claimed / resolved times without a date are on the slip's own day.
  const slipDate = opened.local ? opened.value.slice(0, 10) : eventDate;
  const later = (label: string, v: string | null | undefined) => {
    if (!v) return null;
    const t = parsePaperTime(v, slipDate);
    if (!t.ok) throw new AppError("VALIDATION_FAILED", { userMessage: `${label} time: ${t.message}` });
    return t;
  };
  const times = { opened, claimed: later("Claimed", input.claimed_at), resolved: later("Resolved", input.resolved_at) };
  // Local slip times are read in the event zone ($4); ISO times with an offset are taken as written.
  const tsExpr = (n: number, t: { local: boolean } | null) => (t?.local ? `($${n}::timestamp at time zone $4::text)` : `$${n}::timestamptz`);

  return transaction(async (tx) => {
    // One writer per slip number, so a double-submit can't race past the replay check.
    await tx.query("select pg_advisory_xact_lock(hashtext('help.paper:' || $1))", [input.code]);
    // Resolve times in the DB (the event zone, DST-correct) and refuse slips from the future.
    const { rows: tr } = await tx.query<{ opened: Date; claimed: Date | null; resolved: Date | null; now: Date }>(
      `select ${tsExpr(1, times.opened)} as opened, ${tsExpr(2, times.claimed)} as claimed, ${tsExpr(3, times.resolved)} as resolved, now() as now, $4::text as tz`,
      [times.opened.value, times.claimed?.value ?? null, times.resolved?.value ?? null, tz],
    );
    const at = tr[0];
    const fmt = (d: Date | null) => (d ? slipClock(d, tz) : "—");

    const { rows: existing } = await tx.query<{ id: number; source: string; paper_original_at: Date | null; created_at: Date }>(
      "select id, source, paper_original_at, created_at from help_tickets where upper(code) = $1",
      [input.code],
    );
    if (existing[0]) {
      const e = existing[0];
      if (e.source === "paper" && e.paper_original_at?.getTime() === at.opened.getTime()) {
        return { code: input.code, status: "already_entered", opened_at_local: fmt(e.paper_original_at), receipt: { id: input.code, server_time: e.created_at.toISOString() } };
      }
      throw new AppError("CONFLICT", {
        userMessage: `${input.code} is already used${e.paper_original_at ? ` by a slip from ${fmt(e.paper_original_at)}` : " by another ticket"}. Check the time on the slip, or write the portal code on it and reconcile by hand.`,
      });
    }

    const future = (d: Date | null) => d && d.getTime() > at.now.getTime() + 5 * 60_000;
    if (future(at.opened) || future(at.claimed) || future(at.resolved)) {
      throw new AppError("VALIDATION_FAILED", { userMessage: `A time on the slip is after now (${fmt(at.now)}). Check the date and AM/PM; times are 24-hour.` });
    }
    if (at.claimed && at.claimed < at.opened) throw new AppError("VALIDATION_FAILED", { userMessage: "Claimed before it was opened? Check the times." });
    if (at.resolved && at.resolved < at.opened) throw new AppError("VALIDATION_FAILED", { userMessage: "Resolved before it was opened? Check the times." });
    const lateMinutes = Math.floor((at.now.getTime() - at.opened.getTime()) / 60_000);
    if (lateMinutes >= PAPER_LATE_AFTER_MINUTES && !input.late_reason) {
      throw new AppError("VALIDATION_FAILED", { userMessage: `The slip is from ${fmt(at.opened)}, ${lateMinutes} minutes ago. Say why it is being entered late (e.g. Wi-Fi outage).` });
    }
    const lateReason = input.late_reason ? scrubSecrets(input.late_reason).text : null;

    // Link the team (slug, name or id) and participant (P-####) when given.
    let teamId: number | null = null;
    if (input.team) {
      const { rows } = await tx.query<{ id: number }>(
        "select id from teams where slug = lower($1) or lower(name) = lower($1) or id = $2 order by (id = $2) desc, id limit 1",
        [input.team, /^\d{1,12}$/.test(input.team) ? Number(input.team) : null],
      );
      teamId = rows[0]?.id ?? null;
    }
    let memberId: number | null = null;
    if (input.participant) {
      const { rows } = await tx.query<{ id: number; team_id: number | null }>("select id, team_id from members where upper(public_code) = upper($1) and deleted_at is null", [input.participant]);
      memberId = rows[0]?.id ?? null;
      teamId ??= rows[0]?.team_id ?? null;
    }

    // A slip that says "claimed by Ann" links Ann's account if the name matches one mentor exactly.
    let mentorId: number | null = null;
    if (input.claimed_by) {
      const { rows } = await tx.query<{ id: number }>(
        "select id from staff_accounts where active and (lower(name) = lower($1) or lower(split_part(name, ' ', 1)) = lower($1))",
        [input.claimed_by],
      );
      if (rows.length === 1) mentorId = rows[0].id;
    }
    const status = input.status === "new" && (input.claimed_by || at.claimed) ? "claimed" : input.status;
    const claimedAt = status === "new" ? null : (at.claimed ?? (status === "resolved" ? at.resolved : null) ?? at.now);
    const resolvedAt = status === "resolved" ? (at.resolved ?? at.now) : null;

    const { rows } = await tx.query<TicketRow>(
      `insert into help_tickets (code, member_id, team_id, table_label, category, summary, tried, priority, status, assigned_mentor_id, safe_run_id,
                                 source, paper_original_at, entered_by, claimed_at, resolved_at)
       values ($1, $2, $3, coalesce($4, (select table_label from teams where id = $3)), $5, $6, $7, $8, $9, $10, $11, 'paper', $12, $13, $14, $15)
       returning *`,
      [input.code, memberId, teamId, input.table_label, input.category, scrubSecrets(input.summary).text, input.tried ? scrubSecrets(input.tried).text : null, input.priority, status, mentorId, input.safe_run_id, at.opened, staff.id, claimedAt, resolvedAt],
    );
    const t = rows[0];
    await systemMessage(
      tx,
      t.id,
      `Entered from a paper slip by ${staff.name}${input.staff_initials ? ` (slip initials ${input.staff_initials})` : ""}. Slip opened ${fmt(at.opened)}; claimed ${fmt(at.claimed)}${input.claimed_by ? ` by ${input.claimed_by}` : ""}; resolved ${fmt(at.resolved)}. Entered ${fmt(at.now)}.` +
        (lateReason ? ` Entered late: ${lateReason}` : "") +
        (input.team && !teamId ? ` Team "${input.team}" not matched.` : "") +
        (input.participant && !memberId ? ` Participant "${input.participant}" not matched.` : ""),
      "staff_only",
      staff.id,
    );
    if (input.resolution) await systemMessage(tx, t.id, `Resolution (from slip): ${scrubSecrets(input.resolution).text}`);
    await writeAudit(
      staffActor(staff),
      {
        action: "help.paper_entry",
        resourceType: "help_ticket",
        resourceId: t.id,
        reason: lateReason ?? "Paper ticket reconciliation",
        after: { code: t.code, status, source: "paper" },
        payload: {
          code: t.code,
          slip_opened_at: at.opened.toISOString(),
          slip_opened_local: fmt(at.opened),
          slip_claimed_at: at.claimed?.toISOString() ?? null,
          slip_resolved_at: at.resolved?.toISOString() ?? null,
          entered_at: at.now.toISOString(),
          late_minutes: lateMinutes,
          late_reason: lateReason,
          team_matched: !!teamId,
          participant_matched: !!memberId,
        },
      },
      tx,
    );
    return { code: t.code, status: "created", opened_at_local: fmt(at.opened), receipt: { id: t.code, server_time: t.created_at.toISOString() } };
  });
}

/** The mentor-queue-template.csv header, in order. */
export const PAPER_CSV_HEADER = [
  "manual_ticket_id",
  "opened_at",
  "team_id",
  "participant_id",
  "table",
  "category",
  "priority",
  "summary",
  "claimed_by",
  "claimed_at",
  "resolved_at",
  "status",
  "staff_initials",
] as const;

/** Minimal RFC-4180 CSV: quotes, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const CATEGORY_ALIASES: Record<string, HelpCategory> = {
  "kane cli": "kane_cli",
  kane: "kane_cli",
  "test manager": "test_manager",
  "ci/cloud": "ci_cloud",
  ci: "ci_cloud",
  cloud: "ci_cloud",
};
const normCategory = (s: string) => {
  const k = s.trim().toLowerCase();
  return (CATEGORY_ALIASES[k] ?? k.replace(/[\s/-]+/g, "_")) || "other";
};
const normStatus = (s: string) => {
  const k = s.trim().toLowerCase().replace(/\s+/g, "_");
  return k === "open" || k === "triaged" || !k ? "new" : k;
};

export type PaperImportRow = { line: number; code: string; ok: boolean; status?: PaperResult["status"]; error?: string };

/**
 * Import a mentor-queue-template.csv export. Rows are independent: one bad row
 * doesn't stop the rest. `lateReason` covers every row entered late; an
 * optional late_reason column overrides it per row.
 */
export async function importPaperTicketsCsv(staffIn: Staff | null, csv: string, lateReason: string | null = null): Promise<{ rows: PaperImportRow[]; created: number; skipped: number; failed: number }> {
  const staff = assertHelpStaff(staffIn);
  if (csv.length > 500_000) throw new AppError("VALIDATION_FAILED", { userMessage: "That CSV is too large; split it up." });
  const all = parseCsv(csv);
  if (!all.length) throw new AppError("VALIDATION_FAILED", { userMessage: "The CSV is empty." });
  const header = all[0].map((h) => h.trim().toLowerCase());
  const missing = ["manual_ticket_id", "opened_at", "category", "summary"].filter((h) => !header.includes(h));
  if (missing.length) throw new AppError("VALIDATION_FAILED", { userMessage: `Missing columns: ${missing.join(", ")}. Use mentor-queue-template.csv.` });
  const col = (r: string[], name: string) => (header.includes(name) ? (r[header.indexOf(name)] ?? "").trim() : "");

  const out: PaperImportRow[] = [];
  for (const [i, r] of all.slice(1).entries()) {
    const code = col(r, "manual_ticket_id").toUpperCase();
    try {
      const res = await addPaperTicket(staff, {
        code: code && !code.startsWith("H-") ? `H-${code}` : code,
        opened_at: col(r, "opened_at"),
        team: col(r, "team_id") || undefined,
        participant: col(r, "participant_id") || undefined,
        table_label: col(r, "table") || undefined,
        category: normCategory(col(r, "category")),
        priority: col(r, "priority").toLowerCase() || undefined,
        summary: col(r, "summary"),
        claimed_by: col(r, "claimed_by") || undefined,
        claimed_at: col(r, "claimed_at") || undefined,
        resolved_at: col(r, "resolved_at") || undefined,
        status: normStatus(col(r, "status")),
        staff_initials: col(r, "staff_initials") || undefined,
        late_reason: col(r, "late_reason") || lateReason || undefined,
      });
      out.push({ line: i + 2, code: res.code, ok: true, status: res.status });
    } catch (e) {
      const err = e instanceof AppError ? e : null;
      const issues = (err?.details?.issues as { path: string; message: string }[] | undefined)?.map((x) => `${x.path}: ${x.message}`).join("; ");
      out.push({ line: i + 2, code: code || "?", ok: false, error: issues || err?.userMessage || "Could not import this row." });
    }
  }
  return {
    rows: out,
    created: out.filter((r) => r.status === "created").length,
    skipped: out.filter((r) => r.status === "already_entered").length,
    failed: out.filter((r) => !r.ok).length,
  };
}

// ── Diagnose (docs-grounded, before a ticket) ────────────────────────────────

type DocLink = { label: string; url: string };
type KbEntry = { id: string; categories: HelpCategory[]; keywords: string[]; title: string; steps: string[]; links: DocLink[] };

// Official URLs only (blueprint docs/DOCUMENTATION_INDEX.md, checked Oct 22).
// Steps stay generic on purpose: exact flags live in the CLI reference, and we
// don't invent commands.
const DOCS = {
  readme: { label: "Kane CLI README", url: "https://github.com/LambdaTest/kane-cli" },
  agents: { label: "Kane CLI agent guide", url: "https://www.testmuai.com/kane-cli/agents.md" },
  reference: { label: "CLI reference", url: "https://www.testmuai.com/docs/kane-cli-cli-reference" },
  modes: { label: "Modes", url: "https://www.testmuai.com/docs/kane-cli-modes" },
  auth: { label: "Authentication", url: "https://www.testmuai.com/docs/kane-cli-authentication" },
  generate: { label: "Generate", url: "https://www.testmuai.com/docs/kane-cli-generate" },
  testrun: { label: "Test runs", url: "https://www.testmuai.com/docs/kane-cli-testrun" },
  assurance: { label: "Assurance", url: "https://www.testmuai.com/docs/kane-cli-assurance" },
  coverage: { label: "Coverage", url: "https://www.testmuai.com/docs/kane-cli-assurance-coverage" },
  evidence: { label: "Evidence", url: "https://www.testmuai.com/docs/kane-cli-evidence" },
  remote: { label: "Remote execution", url: "https://www.testmuai.com/docs/kane-cli-remote-execution" },
  devices: { label: "Real devices", url: "https://www.testmuai.com/docs/kane-cli-mobile-real-device" },
  tms: { label: "Test Manager integration", url: "https://www.testmuai.com/docs/kane-cli-tms-integration" },
  tm: { label: "Test Manager docs", url: "https://www.testmuai.com/support/docs/test-manager/" },
  ghWebhooks: { label: "GitHub webhooks", url: "https://docs.github.com/en/webhooks/using-webhooks" },
} satisfies Record<string, DocLink>;

const KB: KbEntry[] = [
  {
    id: "kane-install",
    categories: ["kane_cli"],
    keywords: ["install", "not found", "command not found", "path", "npm", "node", "version", "permission denied", "eacces", "npx"],
    title: "Kane CLI won't install or isn't on your PATH",
    steps: [
      "Follow the install steps in the README exactly; check the Node version it asks for.",
      "Open a fresh terminal after installing so your PATH picks it up.",
      "Use the version command from the CLI reference to confirm which build you have.",
    ],
    links: [DOCS.readme, DOCS.reference],
  },
  {
    id: "kane-auth",
    categories: ["kane_cli", "auth", "ci_cloud"],
    keywords: ["login", "log in", "auth", "401", "403", "unauthorized", "forbidden", "credential", "token", "oauth", "sign in", "expired"],
    title: "Kane CLI says you're not signed in",
    steps: [
      "On a laptop, sign in with the interactive OAuth flow; in CI, use CI credentials instead.",
      "Check you are signed in to the TestMu AI account that has event access.",
      "Never paste keys into a ticket or chat; a mentor can check this with you at the table.",
    ],
    links: [DOCS.auth],
  },
  {
    id: "kane-agent-mode",
    categories: ["kane_cli"],
    keywords: ["agent", "ndjson", "json", "parse", "output", "codex", "headless", "interactive", "mode", "stdout"],
    title: "Driving Kane from your agent (NDJSON / modes)",
    steps: [
      "Pick the right mode: interactive for you, agent or headless for Codex and scripts.",
      "In agent mode, read the NDJSON events line by line and use the terminal event and exit code as the result.",
    ],
    links: [DOCS.agents, DOCS.modes],
  },
  {
    id: "kane-generate",
    categories: ["kane_cli"],
    keywords: ["generate", "plain english", "write test", "objective", "prompt", "test case"],
    title: "Writing tests in plain English",
    steps: ["Start from one user flow with a clear expected result.", "Keep objectives short and observable; add assertions for what must be true at the end."],
    links: [DOCS.generate],
  },
  {
    id: "kane-run-failing",
    categories: ["kane_cli"],
    keywords: ["fail", "failed", "failing", "flaky", "timeout", "timed out", "assertion", "red", "testrun", "suite", "blocked", "errored"],
    title: "A Kane run fails",
    steps: [
      "A failing run is a detection, not a confirmed bug: check whether the app or the test is wrong.",
      "Re-run the single test against the same commit, then read the run report for the failing step.",
      "If the failure is infra (login, network), say so in the ticket; it won't count against you.",
    ],
    links: [DOCS.testrun, DOCS.agents],
  },
  {
    id: "kane-evidence",
    categories: ["kane_cli"],
    keywords: ["evidence", "report", "pack", "upload", "proof", "screenshot", "video", "artifact"],
    title: "Evidence packs and run reports",
    steps: ["Evidence packs are sealed by Kane; share the run ID, not raw logs.", "Use `kanehack report` from a paired machine so the run shows on your Proof tab."],
    links: [DOCS.evidence],
  },
  {
    id: "kane-assurance",
    categories: ["kane_cli"],
    keywords: ["assurance", "coverage", "requirement", "acceptance", "criteria", "designed", "proven", "gap"],
    title: "Assurance and coverage",
    steps: ["Link each acceptance criterion to a test, then read designed vs proven to find gaps."],
    links: [DOCS.assurance, DOCS.coverage],
  },
  {
    id: "ci-remote",
    categories: ["ci_cloud"],
    keywords: ["ci", "github actions", "pipeline", "remote", "grid", "cloud", "parallel", "workflow", "runner"],
    title: "Kane in CI or on the cloud grid",
    steps: ["CI needs CI credentials (not your laptop login), stored as repository secrets.", "Remote runs have plan requirements; check the remote execution guide."],
    links: [DOCS.remote, DOCS.auth],
  },
  {
    id: "mobile",
    categories: ["mobile"],
    keywords: ["mobile", "android", "ios", "emulator", "simulator", "device", "apk", "ipa", "app"],
    title: "Mobile apps and devices",
    steps: ["Check which device targets your account can use before you start.", "Bring the build file (APK/IPA) and the exact device you want to a mentor."],
    links: [DOCS.devices],
  },
  {
    id: "test-manager",
    categories: ["test_manager"],
    keywords: ["test manager", "tms", "project", "publish", "test case", "exploratory", "dashboard"],
    title: "Test Manager",
    steps: ["Check you are in the right project, then publish cases and evidence from Kane."],
    links: [DOCS.tms, DOCS.tm],
  },
  {
    id: "github",
    categories: ["github"],
    keywords: ["github", "repo", "push", "permission", "private", "webhook", "commit", "sha", "branch", "app"],
    title: "GitHub repo and webhooks",
    steps: [
      "Judges must be able to open your repo: make it public or invite the judging account.",
      "Push before you submit; the receipt records the commit SHA.",
    ],
    links: [DOCS.ghWebhooks],
  },
];

/** Event-site links that depend on the team (relative; the UI and envelope make them absolute). */
function eventLinks(category: HelpCategory, slug: string | null): DocLink[] {
  const hub = (tab: string) => (slug ? `/t/${slug}/${tab}` : "/me");
  if (category === "idea") return [{ label: "Your Idea tab", url: hub("idea") }, { label: "Challenge brief", url: hub("brief") }];
  return [{ label: "Event resources", url: hub("resources") }];
}

export const diagnoseSchema = z.object({
  category: z.enum(HELP_CATEGORIES).default("other"),
  summary: z.string().trim().min(3, "Describe the problem first").max(200),
  details: zx.optText(2000),
});

export type Diagnosis = {
  suggestions: { id: string; title: string; steps: string[]; links: DocLink[]; tip: string | null }[];
  /** "llm" = ranked by the model from our docs map; "rules" = keyword match. Never authoritative. */
  generator: "llm" | "rules";
  model: string | null;
  warning?: string;
  /** Always true: a ticket is one click away whatever this says. */
  can_open_ticket: true;
};

function ruleRank(category: HelpCategory, text: string) {
  const t = ` ${text.toLowerCase()} `;
  return KB.map((e) => {
    const hits = e.keywords.filter((k) => t.includes(k)).length;
    return { e, score: hits * 2 + (e.categories.includes(category) ? 1.5 : 0) };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.e);
}

/**
 * Suggest docs to try before opening a ticket. The model may only choose from
 * our map and add a one-line tip; links always come from the map, never from
 * the model. With no gateway, a keyword match does the same job.
 */
export async function diagnoseHelp(raw: unknown, ctx: { teamSlug?: string | null } = {}): Promise<Diagnosis> {
  const input = parse(diagnoseSchema, raw);
  const text = scrubSecrets(`${input.summary}\n${input.details ?? ""}`).text;
  const rules = ruleRank(input.category, text);
  const ids = KB.map((e) => e.id) as [string, ...string[]];

  const drafted = await draftObject({
    schema: z.object({ picks: z.array(z.object({ id: z.enum(ids), tip: z.string().max(200) })).max(3) }),
    system:
      "You triage hackathon help requests about Kane CLI (a TestMu AI testing CLI). Choose up to 3 entries from the provided docs map that best match. " +
      "Write a one-sentence tip for each, grounded only in the entry's steps. Never invent commands, flags or URLs. Never ask for secrets.",
    prompt: `Category: ${CATEGORY_LABEL[input.category]}\nProblem: ${text}\n\nDocs map:\n${KB.map((e) => `- ${e.id}: ${e.title} — ${e.steps.join(" ")}`).join("\n")}`,
    fallback: () => ({ picks: rules.map((e) => ({ id: e.id, tip: "" })) }),
  });

  const seen = new Set<string>();
  const picks = drafted.value.picks.filter((p) => !seen.has(p.id) && seen.add(p.id));
  const suggestions = picks
    .map((p) => {
      const e = KB.find((k) => k.id === p.id);
      return e ? { id: e.id, title: e.title, steps: e.steps, links: e.links, tip: p.tip?.trim() || null } : null;
    })
    .filter((s): s is NonNullable<typeof s> => !!s);
  const evt = eventLinks(input.category, ctx.teamSlug ?? null);
  if (suggestions.length === 0) {
    suggestions.push({
      id: "event",
      title: input.category === "idea" ? "Shape the idea with the brief" : "Nothing in the docs map matched",
      steps: ["Open a ticket below; a mentor will come to your table."],
      links: evt,
      tip: null,
    });
  } else suggestions[0] = { ...suggestions[0], links: [...suggestions[0].links, ...evt] };
  return { suggestions, generator: drafted.generator, model: drafted.model, warning: drafted.warning, can_open_ticket: true };
}

// ── Slack (courtesy ping; the web queue is the source of truth) ──────────────

type SlackKind = "new" | "reopened" | "escalated";

/** The only ticket fields that leave the building: code, category, priority, table, team name. Never the summary or logs. */
function slackText(p: { code: string; category: HelpCategory; priority: HelpPriority; table: string | null; team: string | null; kind: SlackKind }) {
  const head = { new: "New help ticket", reopened: "Help ticket reopened", escalated: "Help ticket ESCALATED" }[p.kind];
  const pr = p.priority === "urgent" ? " · *URGENT*" : p.priority === "high" ? " · high" : "";
  return `${head} *${p.code}* · ${CATEGORY_LABEL[p.category]}${pr} · ${p.table ? `table ${p.table}` : "no table"}${p.team ? ` · ${p.team}` : ""}\n<${siteUrl(`/ops/help/${p.code}`)}|Open in the queue>`;
}

async function queueSlack(tx: PoolClient, t: TicketRow, kind: SlackKind) {
  const { rows } = await tx.query<{ name: string }>("select name from teams where id = $1", [t.team_id]);
  await tx.query(
    `insert into outbox_events (kind, payload, dedupe_key) values ('slack.help', $1, $2) on conflict (dedupe_key) do nothing`,
    [
      JSON.stringify({ text: slackText({ code: t.code, category: t.category, priority: t.priority, table: t.table_label, team: rows[0]?.name ?? null, kind }) }),
      `help:${t.code}:${kind}:${t.updated_at.toISOString()}`,
    ],
  );
}

async function markSlack(ok: boolean, detail?: string) {
  await query(
    ok
      ? "update integration_state set status = 'ok', last_success_at = now(), detail = null, updated_at = now() where system = 'slack'"
      : "update integration_state set status = 'degraded', last_error_at = now(), last_error_code = $1, detail = 'Help pings not reaching Slack; the /ops/help queue still has every ticket.', updated_at = now() where system = 'slack'",
    ok ? [] : [detail ?? "error"],
  ).catch(() => {});
}

/**
 * Deliver one outbox payload of kind 'slack.help'. Exported for the cron
 * drain (admissions-ops). Returns false when Slack isn't configured or fails;
 * the caller leaves the row for a retry.
 */
export async function deliverSlackHelp(payload: { text?: string }): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || !payload?.text) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: payload.text }),
      signal: AbortSignal.timeout(4000),
    });
    await markSlack(res.ok, res.ok ? undefined : `http_${res.status}`);
    return res.ok;
  } catch (err) {
    await markSlack(false, (err as Error)?.name ?? "fetch_failed");
    return false;
  }
}

/** Try to send pending help pings now (oldest first, a few at a time). Safe to call often. */
export async function flushSlackHelp(limit = 10): Promise<{ sent: number; failed: number }> {
  if (!process.env.SLACK_WEBHOOK_URL) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  // Claim rows by pushing available_at forward, so two flushes don't double-post.
  const rows = await query<{ id: number; payload: { text?: string } }>(
    `update outbox_events set available_at = now() + interval '2 minutes'
      where id in (select id from outbox_events where kind = 'slack.help' and published_at is null and available_at <= now() and retries < 10
                   order by id limit $1 for update skip locked)
      returning id, payload`,
    [limit],
  );
  for (const r of rows) {
    if (await deliverSlackHelp(r.payload)) {
      sent++;
      await query("update outbox_events set published_at = now(), last_error = null where id = $1", [r.id]);
    } else {
      failed++;
      await query("update outbox_events set retries = retries + 1, last_error = 'slack_failed', available_at = now() + make_interval(mins => least(retries + 1, 10)) where id = $1", [r.id]);
    }
  }
  return { sent, failed };
}

/** After the response is sent, try Slack once. Never blocks or fails the ticket. */
function flushSlackSoon() {
  const run = () => flushSlackHelp(5).then(() => undefined, (e) => console.error("[help] slack flush failed", (e as Error)?.name));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Slack status for the ops banner. */
export async function slackHealth(): Promise<{ configured: boolean; status: string; last_error_at: string | null; pending: number }> {
  const [[s], [p]] = await Promise.all([
    query<{ status: string; last_error_at: Date | null }>("select status, last_error_at from integration_state where system = 'slack' order by id limit 1"),
    query<{ n: number }>("select count(*)::int as n from outbox_events where kind = 'slack.help' and published_at is null"),
  ]).catch(() => [[undefined], [undefined]] as const);
  return { configured: !!process.env.SLACK_WEBHOOK_URL, status: s?.status ?? "unknown", last_error_at: iso(s?.last_error_at ?? null), pending: p?.n ?? 0 };
}

// ── Metrics (aggregates only; for /live and /ops) ────────────────────────────

export type HelpMetric = {
  name: "help_open" | "help_median_claim_seconds" | "help_median_resolution_seconds";
  /** null when there is no sample yet: render "—", never 0. */
  value: number | null;
  denominator: number | null;
  sample_n: number;
  source: "help_tickets";
  definition_version: 1;
  as_of: string;
};

/**
 * help_open: tickets new/triaged/claimed/in_progress/escalated.
 * help_median_claim_seconds: median(claimed_at − asked_at) over claimed tickets.
 * help_median_resolution_seconds: median(resolved_at − asked_at) over resolved/closed (duplicates excluded).
 * asked_at is the slip time for paper tickets. No ticket content is read.
 */
export async function helpMetrics(): Promise<HelpMetric[]> {
  const [r] = await query<{ open: number; total: number; claim_med: number | null; claim_n: number; res_med: number | null; res_n: number; now: Date }>(
    `select count(*) filter (where status = any($1))::int as open,
            count(*)::int as total,
            percentile_cont(0.5) within group (order by extract(epoch from claimed_at - coalesce(paper_original_at, created_at)))
              filter (where claimed_at is not null and status <> 'duplicate') as claim_med,
            count(*) filter (where claimed_at is not null and status <> 'duplicate')::int as claim_n,
            percentile_cont(0.5) within group (order by extract(epoch from resolved_at - coalesce(paper_original_at, created_at)))
              filter (where resolved_at is not null and status in ('resolved','closed')) as res_med,
            count(*) filter (where resolved_at is not null and status in ('resolved','closed'))::int as res_n,
            now() as now
       from help_tickets`,
    [OPEN_STATUSES],
  );
  const asOf = r.now.toISOString();
  const base = { source: "help_tickets" as const, definition_version: 1 as const, as_of: asOf };
  return [
    { name: "help_open", value: r.open, denominator: r.total, sample_n: r.total, ...base },
    { name: "help_median_claim_seconds", value: r.claim_n ? Math.round(Number(r.claim_med)) : null, denominator: null, sample_n: r.claim_n, ...base },
    { name: "help_median_resolution_seconds", value: r.res_n ? Math.round(Number(r.res_med)) : null, denominator: null, sample_n: r.res_n, ...base },
  ];
}

// ── MCP-shaped helpers (kane-mcp registers these as tools) ───────────────────

/** help_create: open a ticket for the bearer's member. */
export async function mcpHelpCreate(req: Request, input: unknown) {
  return createHelpTicket(await bearerRequester(req), input);
}

/** help_get_status: status, mentor first name once claimed, last public reply, update URL. */
export async function mcpHelpGetStatus(req: Request, ticketId: string) {
  const who = await bearerRequester(req);
  const t = await getHelpTicket(ticketId, { member: who.member });
  const last = [...t.messages].reverse().find((m) => m.author_type !== "member") ?? null;
  return {
    code: t.code,
    status: t.status,
    status_label: t.status_label,
    mentor: t.mentor,
    last_reply: last ? { author: last.author, body: last.body, at: last.created_at } : null,
    opened_at: t.opened_at,
    url: siteUrl(t.url),
  };
}

/** help_diagnose: docs suggestions; uses the bearer's team for event links. */
export async function mcpHelpDiagnose(req: Request, input: unknown) {
  const who = await bearerRequester(req);
  const [team] = who.member.team_id ? await query<{ slug: string }>("select slug from teams where id = $1", [who.member.team_id]) : [];
  return diagnoseHelp(input, { teamSlug: team?.slug ?? null });
}
