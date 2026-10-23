"use server";

import { formObject, parse, z, zx } from "@/server/core";
import { HELP_CATEGORIES, HELP_PRIORITIES, LEDGERS, SUBSYSTEMS, closeIncident, importLedger, openIncident, recordManualReceipt, recordPaperTicket, type LedgerKind } from "@/server/recovery";
import { pool } from "@/lib/db";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// /ops/recovery (T-OPS-05): incidents and the manual intake paths. Incidents
// and receipts are organizer-only; paper help tickets can be typed in by
// mentors too (they run the help desk).

/** A wall time typed by staff (datetime-local, event zone) → an instant, via the DB so DST is right. */
async function wallToInstant(s: string) {
  const { rows } = await pool.query<{ t: Date; tz: string }>(
    "select ($1::timestamp at time zone timezone) as t, timezone as tz from hack_events where id = current_event_id()",
    [s],
  );
  return rows[0]?.t ?? new Date(s);
}

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the date-time picker");

const incidentSchema = z.object({
  subsystem: z.enum(SUBSYSTEMS),
  severity: z.enum(["sev1", "sev2", "sev3"]),
  description: zx.text(500),
});

export async function openIncidentAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(incidentSchema, formObject(form));
    const r = await openIncident(input, staff);
    return {
      message: `${r.id} opened.${input.severity === "sev1" ? " SEV-0: switch to paper forms, announce the interruption, assign a two-person receipt team." : ""}`,
      receipt: r,
    };
  });
}

export async function closeIncidentAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(z.object({ id: zx.id, recovery_basis: zx.text(500) }), formObject(form));
    const r = await closeIncident(input.id, input.recovery_basis, staff);
    return { message: `${r.id} closed. Reconcile anything taken on paper below.`, receipt: r };
  });
}

const ticketSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(H-[A-Z0-9-]{2,12})?$/, "Paper ticket ids look like H-P012")
    .optional()
    .transform((s) => s || null),
  opened_at: wall.optional().or(z.literal("")),
  participant: zx.optText(12),
  team: zx.optText(80),
  table: zx.optText(40),
  category: z.enum(HELP_CATEGORIES),
  priority: z.enum(HELP_PRIORITIES),
  summary: zx.text(300),
  tried: zx.optText(500),
  idempotency_key: zx.idempotencyKey,
});

export async function paperTicketAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer", "mentor"], form, async (staff) => {
    const input = parse(ticketSchema, formObject(form));
    const openedAt = input.opened_at ? await wallToInstant(input.opened_at) : null;
    const r = await recordPaperTicket(
      { code: input.code, openedAt, participantCode: input.participant, teamSlug: input.team, table: input.table, category: input.category, priority: input.priority, summary: input.summary, tried: input.tried },
      staff,
      input.idempotency_key,
    );
    return {
      message: `Paper ticket ${r.id} is in the help queue.${r.matched.member || r.matched.team ? "" : " Participant/team not matched: add them in the help queue."}`,
      receipt: { id: r.id, server_time: r.server_time },
    };
  });
}

const receiptSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(S-[A-Z0-9-]{2,12})?$/, "Paper receipt ids look like S-P004")
      .optional()
      .transform((s) => s || null),
    team: zx.text(80),
    received_at: wall,
    submitter: zx.optText(12),
    project_name: zx.text(120),
    repo_url: zx.httpsUrl.optional().or(z.literal("")).transform((s) => s || null),
    commit_sha: zx.commitSha.optional().or(z.literal("")).transform((s) => s || null),
    artifact_hash: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^([0-9a-f]{64})?$/, "Archive hash must be a 64-character SHA-256")
      .optional()
      .transform((s) => s || null),
    live_url: zx.httpsUrl.optional().or(z.literal("")).transform((s) => s || null),
    harness: zx.optText(1000),
    evidence: zx.optText(1000),
    caveats: zx.optText(1000),
    officer: zx.text(80),
    witness: zx.text(80),
    incident: zx.optText(20),
    confirmed: zx.checkbox,
    idempotency_key: zx.idempotencyKey,
  })
  .refine((v) => v.commit_sha || v.artifact_hash, { message: "Enter the exact commit SHA or an archive SHA-256", path: ["commit_sha"] })
  .refine((v) => v.confirmed, { message: "The participant must confirm the frozen contents", path: ["confirmed"] });

export async function manualReceiptAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(receiptSchema, formObject(form));
    const r = await recordManualReceipt(
      {
        code: input.code,
        teamSlug: input.team,
        receivedAt: await wallToInstant(input.received_at),
        submitterCode: input.submitter,
        projectName: input.project_name,
        repoUrl: input.repo_url,
        commitSha: input.commit_sha,
        artifactHash: input.artifact_hash,
        liveUrl: input.live_url,
        harness: input.harness,
        evidence: input.evidence,
        caveats: input.caveats,
        officer: input.officer,
        witness: input.witness,
        incidentRef: input.incident,
        participantConfirmed: input.confirmed,
      },
      staff,
      input.idempotency_key,
    );
    return {
      message: r.late
        ? `${r.id} recorded for ${r.team} as an ORGANIZER EXCEPTION: received after the lock. The event director decides under the published policy.`
        : `${r.id} recorded for ${r.team}. Snapshot sha256 ${r.sha256.slice(0, 16)}…${r.signed ? " (signed)" : " (unsigned: RECEIPT_SIGNING_KEY not set)"}.`,
      receipt: { id: r.id, server_time: r.server_time },
      data: r,
    };
  });
}

const ledgerSchema = z.object({ kind: z.enum(Object.keys(LEDGERS) as [LedgerKind, ...LedgerKind[]]), csv: z.string().min(1, "Choose a CSV file").max(950_000) });

export async function ledgerAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async (staff) => {
    const input = parse(ledgerSchema, formObject(form));
    const r = await importLedger(input.kind, input.csv, staff);
    return { message: `${LEDGERS[input.kind].label}: ${r.imported} of ${r.total} rows imported, ${r.failed} need a look.`, receipt: { id: r.id, server_time: r.server_time }, data: r };
  });
}
