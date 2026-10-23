import "server-only";
import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { getEvent } from "@/lib/event";
import { randomCode, staffActor, type Staff } from "./auth";
import { AppError, idempotent, sha256, stableStringify, withAudit, writeAudit, type Receipt } from "./core";
import { csvObjects } from "./csv";

// /ops/recovery (T-OPS-05, T-FB-02): incidents, and the manual intake paths
// that keep Tier-0 alive when the online flow can't be used: paper help
// tickets, manual submission receipts, and batch CSV upload of paper ledgers
// (signed check-in slips, submissions, help) with their original timestamps.
//
// Never backdate: the paper time goes in its own column (paper_original_at /
// received_at) and the server time of entry is always recorded too.
//
// Cross-area note: help_tickets belongs to the help area and submissions to
// submission-showcase. These are the minimal intake writers the recovery desk
// needs; when those areas export their own intake functions, these should
// delegate to them (see the result notes for the manager).

type Db = Pick<PoolClient, "query">;

// ── Incidents ────────────────────────────────────────────────────────────────

export const SUBSYSTEMS = ["checkin", "help", "submission", "database", "blob", "slack", "github", "luma", "kane", "renderer", "x", "live_tv", "wifi", "other"] as const;
export type Severity = "sev1" | "sev2" | "sev3";
/** Runbook SEV-0/1/2 map onto the table's sev1/2/3. */
export const SEVERITY_LABEL: Record<Severity, string> = { sev1: "SEV-0 · Tier-0 down", sev2: "SEV-1 · degraded", sev3: "SEV-2 · cosmetic / media" };

export type IncidentRow = {
  id: number;
  code: string;
  subsystem: string;
  severity: Severity;
  description: string;
  recovery_basis: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  closed_at: Date | null;
  created_at: Date;
};

export async function listIncidents(limit = 50) {
  return query<IncidentRow>(
    `select r.id, r.code, r.subsystem, r.severity, r.description, r.recovery_basis, o.name as opened_by_name, c.name as closed_by_name, r.closed_at, r.created_at
       from recovery_cases r left join staff_accounts o on o.id = r.opened_by left join staff_accounts c on c.id = r.closed_by
      where r.event_id = current_event_id()
      order by r.closed_at is not null, r.severity, r.created_at desc limit $1`,
    [limit],
  );
}

export async function openIncident(input: { subsystem: string; severity: Severity; description: string }, staff: Staff) {
  return withAudit(staffActor(staff), "incident.open", "recovery_case", async (tx) => {
    const { rows } = await tx.query<{ id: number; code: string; created_at: Date }>(
      "insert into recovery_cases (subsystem, severity, description, opened_by) values ($1, $2, $3, $4) returning id, code, created_at",
      [input.subsystem, input.severity, input.description, staff.id],
    );
    const r = rows[0];
    return { result: { id: r.code, server_time: new Date(r.created_at).toISOString() } satisfies Receipt, resourceId: r.id, after: { ...input, code: r.code } };
  });
}

/** Close with what restored service ("recovery basis"); closing twice is refused. */
export async function closeIncident(id: number, recoveryBasis: string, staff: Staff) {
  return withAudit(staffActor(staff), "incident.close", "recovery_case", async (tx) => {
    const { rows } = await tx.query<{ code: string; closed_at: Date }>(
      "update recovery_cases set closed_at = now(), closed_by = $2, recovery_basis = $3 where id = $1 and closed_at is null returning code, closed_at",
      [id, staff.id, recoveryBasis],
    );
    if (!rows[0]) throw new AppError("CONFLICT", { userMessage: "That incident is already closed or doesn't exist." });
    return { result: { id: rows[0].code, server_time: new Date(rows[0].closed_at).toISOString() } satisfies Receipt, resourceId: id, reason: recoveryBasis, after: { closed: true } };
  });
}

// ── Paper help ticket (manual help) ──────────────────────────────────────────

export const HELP_CATEGORIES = ["kane_cli", "test_manager", "auth", "ci_cloud", "mobile", "idea", "github", "other"] as const;
export const HELP_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const HELP_STATUSES = ["new", "triaged", "claimed", "in_progress", "resolved", "closed", "escalated", "duplicate"] as const;

export type PaperTicketInput = {
  code: string | null;
  openedAt: Date | null;
  participantCode: string | null;
  teamSlug: string | null;
  table: string | null;
  category: (typeof HELP_CATEGORIES)[number];
  priority: (typeof HELP_PRIORITIES)[number];
  summary: string;
  tried: string | null;
  status?: (typeof HELP_STATUSES)[number];
};

async function resolveRefs(tx: Db, participantCode: string | null, teamRef: string | null) {
  let memberId: number | null = null;
  let teamId: number | null = null;
  if (participantCode) {
    const { rows } = await tx.query<{ id: number; team_id: number | null }>("select id, team_id from members where upper(public_code) = upper($1)", [participantCode.trim()]);
    memberId = rows[0]?.id ?? null;
    teamId = rows[0]?.team_id ?? null;
  }
  if (teamRef) {
    const { rows } = await tx.query<{ id: number }>("select id from teams where slug = lower($1) or id::text = $1 or lower(name) = lower($1) limit 1", [teamRef.trim()]);
    teamId = rows[0]?.id ?? teamId;
  }
  return { memberId, teamId };
}

async function insertPaperTicket(tx: Db, input: PaperTicketInput, staff: Staff, now: Date) {
  if (input.openedAt && input.openedAt.getTime() > now.getTime() + 60_000) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "The paper time is in the future. Enter the time written on the slip." });
  }
  const { memberId, teamId } = await resolveRefs(tx, input.participantCode, input.teamSlug);
  const cols = ["member_id", "team_id", "table_label", "category", "summary", "tried", "priority", "status", "source", "paper_original_at", "entered_by"];
  const vals: unknown[] = [memberId, teamId, input.table, input.category, input.summary, input.tried, input.priority, input.status ?? "new", "paper", input.openedAt, staff.id];
  if (input.code) {
    cols.unshift("code");
    vals.unshift(input.code.toUpperCase());
  }
  const { rows } = await tx.query<{ id: number; code: string; created_at: Date }>(
    `insert into help_tickets (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id, code, created_at`,
    vals,
  );
  return { ...rows[0], memberId, teamId };
}

export async function recordPaperTicket(input: PaperTicketInput, staff: Staff, idempotencyKey?: string | null) {
  const { result } = await idempotent(idempotencyKey, `recovery.paper_ticket:${staff.id ?? "admin"}`, () =>
    withAudit(staffActor(staff), "help.paper_intake", "help_ticket", async (tx) => {
      const { rows: n } = await tx.query<{ now: Date }>("select now()");
      const t = await insertPaperTicket(tx, input, staff, n[0].now);
      return {
        result: { id: t.code, server_time: new Date(t.created_at).toISOString(), matched: { member: !!t.memberId, team: !!t.teamId } },
        resourceId: t.id,
        after: { code: t.code, category: input.category, priority: input.priority, paper_original_at: input.openedAt },
      };
    }),
  );
  return result;
}

// ── Manual submission receipt (fallback/05) ──────────────────────────────────

export type ManualReceiptInput = {
  code: string | null;
  teamSlug: string;
  receivedAt: Date;
  submitterCode: string | null;
  projectName: string;
  repoUrl: string | null;
  commitSha: string | null;
  artifactHash: string | null;
  liveUrl: string | null;
  harness: string | null;
  evidence: string | null;
  caveats: string | null;
  officer: string;
  witness: string;
  incidentRef: string | null;
  participantConfirmed: boolean;
};

function signSnapshot(digest: string) {
  const key = process.env.RECEIPT_SIGNING_KEY;
  return key ? createHmac("sha256", key).update(digest).digest("hex") : null;
}

/**
 * Record a backup receipt written at the desk during an outage. The paper's
 * "received at" time is kept as received_at; finalized_at is the server time
 * of entry, so nothing is backdated. A receipt received after the official
 * lock is stored as an organizer_exception, not as an on-time submission.
 * A team that already has a finalized online receipt gets CONFLICT.
 */
async function insertManualReceipt(tx: Db, input: ManualReceiptInput, staff: Staff, batchHash: string | null) {
  if (input.officer.trim().toLowerCase() === input.witness.trim().toLowerCase()) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "Officer and witness must be two different people." });
  }
  if (!input.commitSha && !input.artifactHash) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "A manual receipt needs the exact commit SHA or an archive SHA-256." });
  }
  const { rows: n } = await tx.query<{ now: Date }>("select now()");
  const now = n[0].now;
  if (input.receivedAt.getTime() > now.getTime() + 60_000) throw new AppError("VALIDATION_FAILED", { userMessage: "The received time is in the future. Never backdate or forward-date a receipt." });

  const { rows: t } = await tx.query<{ id: number; slug: string; name: string }>("select id, slug, name from teams where slug = lower($1) or id::text = $1 limit 1", [input.teamSlug.trim()]);
  const team = t[0];
  if (!team) throw new AppError("NOT_FOUND", { userMessage: `No team "${input.teamSlug}".` });
  const { rows: p } = await tx.query<{ id: number }>("select id from projects where team_id = $1 for update", [team.id]);
  let projectId = p[0]?.id;
  if (!projectId) {
    const { rows } = await tx.query<{ id: number }>(
      "insert into projects (team_id, name, slug) values ($1, $2, $3) on conflict (team_id) do update set updated_at = now() returning id",
      [team.id, team.name, team.slug],
    );
    projectId = rows[0].id;
  }
  const { rows: live } = await tx.query<{ id: number; status: string; receipt_code: string | null; source: string }>(
    "select id, status, receipt_code, source from submissions where project_id = $1 and status not in ('withdrawn','organizer_exception') for update",
    [projectId],
  );
  if (live[0] && ["finalized", "locked"].includes(live[0].status)) {
    throw new AppError("CONFLICT", { userMessage: `${team.name} already has receipt ${live[0].receipt_code ?? "(no code)"}. Record a note or an organizer exception instead.` });
  }
  const event = await getEvent();
  const late = input.receivedAt.getTime() >= event.submissionLocksAt.getTime();
  // A draft that never finalized is superseded by the manual receipt (draft rows aren't immutable).
  if (live[0] && !late) await tx.query("update submissions set status = 'withdrawn' where id = $1", [live[0].id]);

  const { rows: sub } = await tx.query<{ id: number; public_code: string | null }>("select id, public_code from members where upper(public_code) = upper($1)", [input.submitterCode ?? ""]);
  const snapshot = {
    kind: "manual_offline_receipt",
    team: { id: team.id, slug: team.slug, name: team.name },
    project: { id: projectId, name: input.projectName },
    repo_url: input.repoUrl,
    commit_sha: input.commitSha,
    artifact_sha256: input.artifactHash,
    live_url: input.liveUrl,
    harness: input.harness,
    evidence: input.evidence,
    caveats: input.caveats,
    submitter: input.submitterCode,
    received_at: input.receivedAt.toISOString(),
    entered_at: new Date(now).toISOString(),
    lock_at: event.submissionLocksAt.toISOString(),
    officer: input.officer,
    witness: input.witness,
    incident_ref: input.incidentRef,
    participant_confirmed: input.participantConfirmed,
    batch_sha256: batchHash,
  };
  const digest = sha256(stableStringify(snapshot));
  const code = (input.code?.toUpperCase() || `S-${randomCode(4)}`).slice(0, 20);
  const { rows } = await tx.query<{ id: number; receipt_code: string; finalized_at: Date }>(
    `insert into submissions (project_id, team_id, status, draft, receipt_code, finalized_by, finalized_by_staff, finalized_at, received_at, witness,
                              incident_ref, immutable_snapshot, snapshot_sha256, signature, source, exception_ref)
     values ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10, $11, $12, $13, 'manual_offline', $14)
     returning id, receipt_code, finalized_at`,
    [
      projectId,
      team.id,
      late ? "organizer_exception" : "finalized",
      JSON.stringify({ manual: true }),
      code,
      sub[0]?.id ?? null,
      staff.id,
      input.receivedAt,
      input.witness,
      input.incidentRef,
      JSON.stringify(snapshot),
      digest,
      signSnapshot(digest),
      late ? `late manual receipt (${input.incidentRef ?? "no incident"})` : null,
    ],
  );
  return { row: rows[0], team, late, digest, signed: !!process.env.RECEIPT_SIGNING_KEY };
}

export async function recordManualReceipt(input: ManualReceiptInput, staff: Staff, idempotencyKey?: string | null) {
  const { result } = await idempotent(idempotencyKey, `recovery.manual_receipt:${input.teamSlug.toLowerCase()}`, () =>
    withAudit(staffActor(staff), "submission.manual_receipt", "submission", async (tx) => {
      const r = await insertManualReceipt(tx, input, staff, null);
      return {
        result: {
          id: r.row.receipt_code,
          server_time: new Date(r.row.finalized_at).toISOString(),
          team: r.team.name,
          late: r.late,
          sha256: r.digest,
          signed: r.signed,
        },
        resourceId: r.row.id,
        reason: input.incidentRef ? `incident ${input.incidentRef}` : "manual receipt",
        after: { receipt_code: r.row.receipt_code, snapshot_sha256: r.digest, late: r.late, received_at: input.receivedAt },
        payload: { officer: input.officer, witness: input.witness },
      };
    }),
  );
  return result;
}

// ── Batch CSV upload of paper ledgers (manual_offline) ───────────────────────

export const LEDGERS = {
  checkin_ledger: {
    label: "Check-in ledger (signed paper slips)",
    file: "checkin-ledger-template.csv",
    headers: ["receipt_id", "attendee_id", "checked_in_at", "timezone", "delay_reason", "staff_id", "staff_signature", "witness_id"],
  },
  submission_ledger: {
    label: "Submission ledger",
    file: "submission-ledger-template.csv",
    headers: ["manual_receipt_id", "received_at", "timezone", "team_id", "project_name", "repo_url", "commit_sha", "artifact_hash", "evidence_references", "submitter_id", "officer_id", "witness_id", "incident_id", "canonical_receipt_after_reconcile"],
  },
  mentor_queue: {
    label: "Mentor queue (paper help)",
    file: "mentor-queue-template.csv",
    headers: ["manual_ticket_id", "opened_at", "team_id", "participant_id", "table", "category", "priority", "summary", "claimed_by", "claimed_at", "resolved_at", "status", "staff_initials"],
  },
  roster_import: {
    label: "Roster import",
    file: "roster-import-template.csv",
    headers: ["event_id", "luma_guest_id", "approval_status", "display_name", "checked_in_at", "source_version", "staff_reference"],
  },
  team_roster: {
    label: "Team roster (paper)",
    file: "team-roster-template.csv",
    headers: ["manual_id", "event_id", "team_name", "participant_id", "role", "joined_at", "staff_initials", "verified_or_pending"],
  },
  activity_reconciliation: {
    label: "Activity reconciliation",
    file: "activity-reconciliation-template.csv",
    headers: ["source_event_id", "source_system", "event_type", "event_time", "ingested_time", "team_id", "verification_state", "evidence_hash", "manual_witness", "canonical_event_id", "reconciliation_status"],
  },
} as const;
export type LedgerKind = keyof typeof LEDGERS;

/** A wall time from paper ("2026-10-24 17:42", with the ledger's timezone column) → an instant, via Postgres. */
async function paperTime(tx: Db, raw: string, tz: string | null): Promise<Date | null> {
  const s = raw.trim();
  if (!s) return null;
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(s);
  try {
    const { rows } = await tx.query<{ t: Date }>(hasZone ? "select $1::timestamptz as t" : "select ($1::timestamp at time zone $2) as t", hasZone ? [s] : [s, tz || "America/Los_Angeles"]);
    return rows[0].t;
  } catch {
    return null;
  }
}

// ── Check-in ledger rows ─────────────────────────────────────────────────────

export type CheckinLedgerRow = {
  receiptId: string;
  /** As written on the slip: a Luma guest id, a P-#### code or a roster row id (R-12). */
  attendeeRef: string;
  /** The wall time on the slip, unparsed; paperTime() turns it into an instant. */
  rawTime: string;
  timezone: string | null;
  reason: string;
  staffId: string;
  signature: string;
  witness: string | null;
};

/**
 * Validate one checkin-ledger-template.csv row. No database: the time is
 * resolved and the attendee matched in applyCheckinLedgerRow.
 */
export function parseCheckinLedgerRow(v: Record<string, string | undefined>): CheckinLedgerRow {
  const t = (k: string) => (v[k] ?? "").trim();
  const bad = (userMessage: string) => new AppError("VALIDATION_FAILED", { userMessage });
  const receiptId = t("receipt_id").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(receiptId)) throw bad("receipt_id is missing or not a slip id (e.g. CHK-OFF042, P-OFF-0042)");
  const attendeeRef = t("attendee_id");
  if (!attendeeRef || attendeeRef.length > 80) throw bad("attendee_id is missing (Luma guest id, P-code or roster id)");
  const rawTime = t("checked_in_at");
  if (!rawTime) throw bad("checked_in_at is missing: enter the time written on the slip");
  const reason = t("delay_reason");
  if (reason.length < 3) throw bad("delay_reason is required: say why this check-in is entered late");
  const staffId = t("staff_id");
  const signature = t("staff_signature");
  if (!staffId || !signature) throw bad("A paper check-in needs the staff_id and staff_signature from the slip");
  const witness = t("witness_id") || null;
  if (witness && witness.toLowerCase() === staffId.toLowerCase()) throw bad("witness_id must be a different person from staff_id");
  return {
    receiptId,
    attendeeRef,
    rawTime,
    timezone: t("timezone") || null,
    reason: reason.slice(0, 300),
    staffId: staffId.slice(0, 80),
    signature: signature.slice(0, 80),
    witness: witness?.slice(0, 80) ?? null,
  };
}

/**
 * Enter one signed paper check-in. The slip's time becomes the attendance
 * time (it is when they arrived) but is never silently backdated: the row
 * keeps the slip id, the entry time and the delayed-entry reason beside it,
 * and both facts are audited. A slip id seen before changes nothing (replay);
 * an attendee already checked in keeps that earlier record. Admission is never
 * created here: a guest who isn't admitted on the roster is refused.
 */
async function applyCheckinLedgerRow(tx: Db, r: CheckinLedgerRow, staff: Staff, batchHash: string) {
  const { rows: seen } = await tx.query<{ attendee_ref: string; outcome: string }>(
    "select attendee_ref, outcome from checkin_reconciliations where event_id = current_event_id() and receipt_id = $1",
    [r.receiptId],
  );
  if (seen[0]) {
    if (seen[0].attendee_ref.toLowerCase() !== r.attendeeRef.toLowerCase()) {
      throw new AppError("CONFLICT", { userMessage: `${r.receiptId} was already entered for ${seen[0].attendee_ref}. Check the slip.` });
    }
    return { replayed: true, message: `Already reconciled (${seen[0].outcome.replace(/_/g, " ")}); nothing changed` };
  }
  const paperAt = await paperTime(tx, r.rawTime, r.timezone);
  if (!paperAt) throw new AppError("VALIDATION_FAILED", { userMessage: "checked_in_at is not a date" });
  const { rows: n } = await tx.query<{ now: Date }>("select now()");
  const now = n[0].now;
  if (paperAt.getTime() > now.getTime() + 60_000) throw new AppError("VALIDATION_FAILED", { userMessage: "checked_in_at is in the future. Enter the time written on the slip." });

  const { rows: gs } = await tx.query<{ id: number; name: string; admission_status: string; checked_in_at: Date | null; checkin_source: string | null; member_id: number | null }>(
    `select g.id, g.name, g.admission_status, g.checked_in_at, g.checkin_source, m.id as member_id
       from roster_guests g
       left join members m on m.id = coalesce(g.member_id, (select x.id from members x where x.guest_id = g.id limit 1)) and m.deleted_at is null
      where g.event_id = current_event_id()
        and (g.luma_guest_id = $1 or upper(m.public_code) = upper($1) or 'R-' || g.id::text = upper($1))
      limit 1 for update of g`,
    [r.attendeeRef],
  );
  const g = gs[0];
  if (!g) throw new AppError("NOT_FOUND", { userMessage: `No roster row for ${r.attendeeRef}. A walk-in is admitted at the desk, with the slip id in the note.` });
  if (g.admission_status !== "admitted") {
    throw new AppError("NOT_APPROVED", { userMessage: `${g.name} is ${g.admission_status.replace(/_/g, " ")} on the roster, so the slip can't check them in. An organizer decides first.` });
  }

  const already = !!g.checked_in_at;
  if (!already) {
    await tx.query(
      `update roster_guests set checked_in_at = $2, checked_in_by = $3, checkin_source = 'offline_ledger', checkin_ref = $4, checkin_entered_at = now(), updated_at = now()
        where id = $1`,
      [g.id, paperAt, staff.id, r.receiptId],
    );
    if (g.member_id) {
      await tx.query("update members set checked_in_at = coalesce(checked_in_at, $2), admission_state = 'admitted', guest_id = coalesce(guest_id, $3) where id = $1", [g.member_id, paperAt, g.id]);
    }
  }
  const outcome = already ? "already_checked_in" : "checked_in";
  const note = already ? `Already checked in ${new Date(g.checked_in_at!).toISOString()} (${g.checkin_source ?? "desk"}); that record is kept.` : null;
  await tx.query(
    `insert into checkin_reconciliations (receipt_id, attendee_ref, guest_id, member_id, paper_at, delay_reason, staff_id, staff_signature, witness_id, outcome, note, batch_sha256, entered_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [r.receiptId, r.attendeeRef, g.id, g.member_id, paperAt, r.reason, r.staffId, r.signature, r.witness, outcome, note, batchHash, staff.id],
  );
  const actor = staffActor(staff);
  const facts = {
    receipt_id: r.receiptId,
    attendee_id: r.attendeeRef,
    guest_id: g.id,
    paper_at: paperAt.toISOString(),
    entered_at: new Date(now).toISOString(),
    staff_id: r.staffId,
    staff_signature: r.signature,
    witness_id: r.witness,
    batch_sha256: batchHash,
  };
  // The reconciliation (found in /ops/audit by the slip id), then the attendance fact on the roster row.
  await writeAudit(actor, { action: "checkin.offline_ledger", resourceType: "checkin_reconciliation", resourceId: r.receiptId, reason: r.reason, after: { outcome }, payload: { ...facts, outcome } }, tx);
  if (!already) {
    await writeAudit(actor, { action: "checkin.guest", resourceType: "roster_guest", resourceId: g.id, reason: r.reason, after: { checked_in_at: paperAt }, payload: { via: "offline_ledger", ...facts } }, tx);
  }
  return { replayed: false, message: already ? `${g.name} was already checked in: slip recorded, earlier check-in kept` : `${g.name} checked in at the paper time` };
}

export type BatchLine = { line: number; ok: boolean; id?: string; message: string };
export type BatchResult = Receipt & { kind: LedgerKind; sha256: string; total: number; imported: number; failed: number; lines: BatchLine[] };

/**
 * Import a paper ledger CSV. Each row is its own savepoint, so one bad row
 * doesn't sink the batch; every row's outcome is returned for the
 * reconciliation view, and the batch's file hash is audited.
 * Roster and team ledgers aren't applied here: the roster goes through the
 * previewed import (/ops/roster/import) and team changes need every member's
 * consent, so those return "review by hand".
 */
export async function importLedger(kind: LedgerKind, csv: string, staff: Staff): Promise<BatchResult> {
  const text = csv.replace(/^﻿/, "");
  const digest = sha256(text);
  const { headers, rows } = csvObjects(text);
  const want = LEDGERS[kind].headers;
  const missing = want.filter((h) => !headers.includes(h));
  if (missing.length) throw new AppError("VALIDATION_FAILED", { userMessage: `Missing columns: ${missing.join(", ")}. Use the ${LEDGERS[kind].file} template.` });
  if (rows.length > 1000) throw new AppError("VALIDATION_FAILED", { userMessage: "Split ledgers over 1000 rows into several files." });
  if (kind === "roster_import") throw new AppError("VALIDATION_FAILED", { userMessage: "Roster CSVs go through Roster → Import, which previews the diff first." });

  const run = () =>
    withAudit(staffActor(staff), `recovery.ledger_import.${kind}`, "ledger_batch", async (tx) => {
      const lines: BatchLine[] = [];
      for (const { line, values: v } of rows) {
        await tx.query("savepoint row_sp");
        try {
          if (kind === "checkin_ledger") {
            const r = parseCheckinLedgerRow(v);
            const out = await applyCheckinLedgerRow(tx, r, staff, digest);
            lines.push({ line, ok: true, id: r.receiptId, message: out.message });
          } else if (kind === "submission_ledger") {
            const receivedAt = await paperTime(tx, v.received_at, v.timezone || null);
            if (!receivedAt) throw new AppError("VALIDATION_FAILED", { userMessage: "received_at is missing or not a date" });
            const sha = v.commit_sha?.trim().toLowerCase() || null;
            if (sha && !/^[0-9a-f]{40}$/.test(sha)) throw new AppError("VALIDATION_FAILED", { userMessage: "commit_sha must be the full 40-character SHA" });
            const r = await insertManualReceipt(
              tx,
              {
                code: v.manual_receipt_id || null,
                teamSlug: v.team_id,
                receivedAt,
                submitterCode: v.submitter_id || null,
                projectName: v.project_name || v.team_id,
                repoUrl: v.repo_url || null,
                commitSha: sha,
                artifactHash: v.artifact_hash || null,
                liveUrl: null,
                harness: null,
                evidence: v.evidence_references || null,
                caveats: null,
                officer: v.officer_id,
                witness: v.witness_id,
                incidentRef: v.incident_id || null,
                participantConfirmed: true,
              },
              staff,
              digest,
            );
            lines.push({ line, ok: true, id: r.row.receipt_code, message: r.late ? "Recorded as organizer exception (after lock)" : "Receipt recorded" });
          } else if (kind === "mentor_queue") {
            const openedAt = await paperTime(tx, v.opened_at, null);
            const cat = (HELP_CATEGORIES as readonly string[]).includes(v.category) ? (v.category as PaperTicketInput["category"]) : "other";
            const pri = (HELP_PRIORITIES as readonly string[]).includes(v.priority) ? (v.priority as PaperTicketInput["priority"]) : "normal";
            const st = (HELP_STATUSES as readonly string[]).includes(v.status?.toLowerCase()) ? (v.status.toLowerCase() as PaperTicketInput["status"]) : "new";
            if (!v.summary) throw new AppError("VALIDATION_FAILED", { userMessage: "summary is required" });
            const { rows: n } = await tx.query<{ now: Date }>("select now()");
            const t = await insertPaperTicket(
              tx,
              { code: v.manual_ticket_id || null, openedAt, participantCode: v.participant_id || null, teamSlug: v.team_id || null, table: v.table || null, category: cat, priority: pri, summary: v.summary.slice(0, 300), tried: null, status: st },
              staff,
              n[0].now,
            );
            if (st === "resolved" || st === "closed") {
              const resolvedAt = await paperTime(tx, v.resolved_at, null);
              await tx.query("update help_tickets set resolved_at = coalesce($2, now()) where id = $1", [t.id, resolvedAt]);
            }
            lines.push({ line, ok: true, id: t.code, message: `Paper ticket entered${t.memberId ? "" : " (participant not matched)"}` });
          } else {
            lines.push({ line, ok: false, message: "Recorded for review only: apply team and activity changes by hand after checking consent and evidence." });
          }
          await tx.query("release savepoint row_sp");
        } catch (err) {
          await tx.query("rollback to savepoint row_sp");
          const msg = err instanceof AppError ? err.userMessage : (err as { code?: string }).code === "23505" ? "Duplicate id (already imported?)" : "Couldn't import this row";
          lines.push({ line, ok: false, message: msg });
        }
      }
      const { rows: n } = await tx.query<{ now: Date }>("select now()");
      const imported = lines.filter((l) => l.ok).length;
      return {
        result: { id: `LB-${digest.slice(0, 8).toUpperCase()}`, server_time: new Date(n[0].now).toISOString(), kind, sha256: digest, total: rows.length, imported, failed: rows.length - imported, lines },
        resourceId: digest.slice(0, 16),
        after: { kind, total: rows.length, imported },
        payload: { sha256: digest, failed_lines: lines.filter((l) => !l.ok).map((l) => l.line) },
      };
    });
  // A check-in ledger is idempotent per slip (receipt_id), so a re-upload after
  // fixing the roster applies what failed before; other ledgers replay the
  // first result for the same file.
  if (kind === "checkin_ledger") return run();
  const { result } = await idempotent(digest, `recovery.ledger:${kind}`, run);
  return result;
}

// ── Reconciliation view ──────────────────────────────────────────────────────

export type ReconRow = {
  kind: "checkin" | "submission" | "help" | "roster" | "member" | "batch";
  ref: string;
  title: string;
  detail: string;
  at: Date | null;
  entered_at: Date | null;
  state: "needs_review" | "recorded" | "conflict";
  /** Where to confirm it against the online record (roster, desk, audit). */
  links?: { label: string; href: string }[];
};

/** Everything that came in by hand and still needs a human to confirm it against the online record. */
export async function reconciliationView(): Promise<{ rows: ReconRow[]; partial: string[] }> {
  const partial: string[] = [];
  const safe = async <T>(name: string, p: Promise<T[]>) =>
    p.catch(() => {
      partial.push(name);
      return [] as T[];
    });
  const [checkins, subs, help, roster, members, batches] = await Promise.all([
    safe(
      "check-ins",
      query<{
        receipt_id: string;
        attendee_ref: string;
        outcome: string;
        note: string | null;
        paper_at: Date;
        entered_at: Date;
        delay_reason: string;
        staff_id: string;
        staff_signature: string;
        witness_id: string | null;
        guest_name: string | null;
        luma_guest_id: string | null;
        public_code: string | null;
      }>(
        `select c.receipt_id, c.attendee_ref, c.outcome, c.note, c.paper_at, c.entered_at, c.delay_reason, c.staff_id, c.staff_signature, c.witness_id,
                g.name as guest_name, g.luma_guest_id, m.public_code
           from checkin_reconciliations c
           left join roster_guests g on g.id = c.guest_id
           left join members m on m.id = coalesce(c.member_id, g.member_id)
          where c.event_id = current_event_id() order by c.entered_at desc limit 200`,
      ),
    ),
    safe(
      "submissions",
      query<{ receipt_code: string; team_name: string; status: string; received_at: Date | null; finalized_at: Date | null; witness: string | null; incident_ref: string | null }>(
        `select s.receipt_code, t.name as team_name, s.status, s.received_at, s.finalized_at, s.witness, s.incident_ref
           from submissions s join teams t on t.id = s.team_id where s.source = 'manual_offline' order by s.finalized_at desc limit 200`,
      ),
    ),
    safe(
      "help",
      query<{ code: string; summary: string; status: string; paper_original_at: Date | null; created_at: Date; member_id: number | null }>(
        "select code, summary, status, paper_original_at, created_at, member_id from help_tickets where source = 'paper' order by created_at desc limit 200",
      ),
    ),
    safe(
      "roster",
      query<{ id: number; name: string; source: string; admission_status: string; checked_in_at: Date | null; updated_at: Date }>(
        `select id, name, source, admission_status, checked_in_at, updated_at from roster_guests
          where event_id = current_event_id() and (admission_status = 'needs_reconciliation' or source = 'manual_offline') order by updated_at desc limit 200`,
      ),
    ),
    safe(
      "members",
      query<{ public_code: string | null; name: string; created_at: Date }>(
        "select public_code, name, created_at from members where deleted_at is null and role = 'participant' and admission_state = 'needs_reconciliation' order by created_at desc limit 200",
      ),
    ),
    safe(
      "batches",
      query<{ action: string; resource_id: string; payload: { sha256?: string; failed_lines?: number[] }; created_at: Date; actor_label: string | null }>(
        "select action, resource_id, payload, created_at, actor_label from audit_events where action like 'recovery.ledger_import.%' order by id desc limit 50",
      ),
    ),
  ]);
  const rows: ReconRow[] = [
    ...checkins.map((c) => {
      const who = c.luma_guest_id ?? c.public_code ?? c.attendee_ref;
      return {
        kind: "checkin" as const,
        ref: c.receipt_id,
        title: `${c.guest_name ?? c.attendee_ref} · paper check-in`,
        detail: [
          `Attendee ${c.attendee_ref}${c.public_code && c.public_code !== c.attendee_ref ? ` (${c.public_code})` : ""}`,
          c.outcome === "checked_in" ? "checked in at the paper time" : (c.note ?? "already checked in"),
          `Delayed entry: ${c.delay_reason}`,
          `Signed ${c.staff_signature} (${c.staff_id})${c.witness_id ? ` · witness ${c.witness_id}` : ""}`,
        ].join(" · "),
        at: c.paper_at,
        entered_at: c.entered_at,
        state: c.outcome === "checked_in" ? ("recorded" as const) : ("needs_review" as const),
        links: [
          { label: "Roster", href: `/ops/roster?q=${encodeURIComponent(who)}` },
          { label: "Check-in desk", href: `/ops/checkin?q=${encodeURIComponent(who)}` },
          { label: "Audit", href: `/ops/audit?resource_id=${encodeURIComponent(c.receipt_id)}` },
        ],
      };
    }),
    ...subs.map((s) => ({
      kind: "submission" as const,
      ref: s.receipt_code,
      title: `${s.team_name} · manual receipt`,
      detail: `${s.status === "organizer_exception" ? "After lock: organizer exception. " : ""}Witness ${s.witness ?? "—"}${s.incident_ref ? ` · ${s.incident_ref}` : ""}`,
      at: s.received_at,
      entered_at: s.finalized_at,
      state: s.status === "organizer_exception" ? ("conflict" as const) : ("recorded" as const),
    })),
    ...help.map((h) => ({
      kind: "help" as const,
      ref: h.code,
      title: h.summary,
      detail: `${h.status}${h.member_id ? "" : " · participant not matched"}`,
      at: h.paper_original_at,
      entered_at: h.created_at,
      state: h.member_id ? ("recorded" as const) : ("needs_review" as const),
    })),
    ...roster.map((g) => ({
      kind: "roster" as const,
      ref: `R-${g.id}`,
      title: g.name,
      detail: `${g.source} · ${g.admission_status.replace("_", " ")}${g.checked_in_at ? " · checked in" : ""}`,
      at: g.checked_in_at,
      entered_at: g.updated_at,
      state: "needs_review" as const,
    })),
    ...members.map((m) => ({
      kind: "member" as const,
      ref: m.public_code ?? "—",
      title: m.name,
      detail: "Registered on site, no roster match",
      at: null,
      entered_at: m.created_at,
      state: "needs_review" as const,
    })),
    ...batches.map((b) => ({
      kind: "batch" as const,
      ref: b.resource_id,
      title: b.action.replace("recovery.ledger_import.", "Ledger: "),
      detail: `${b.payload.failed_lines?.length ? `${b.payload.failed_lines.length} rows failed (lines ${b.payload.failed_lines.slice(0, 10).join(", ")})` : "All rows imported"} · by ${b.actor_label ?? "—"}`,
      at: null,
      entered_at: b.created_at,
      state: b.payload.failed_lines?.length ? ("needs_review" as const) : ("recorded" as const),
    })),
  ];
  return { rows, partial };
}

/** The reconciliation view as activity-reconciliation-template.csv rows. */
export function reconciliationCsvRows(rows: ReconRow[]) {
  return rows.map((r) => [r.ref, r.kind, r.title, r.at, r.entered_at, "", r.state === "recorded" ? "manual_unverified" : "needs_review", "", "", "", r.state]);
}
