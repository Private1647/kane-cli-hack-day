"use server";

import { refresh } from "next/cache";
import { requireTeamMember } from "@/server/auth";
import { AppError, formObject, runAction } from "@/server/core";
import { approveMilestone, proposeMilestone, recordManualRun, updateDefect } from "@/server/kane";

// Proof tab actions. Each re-checks the team session server-side (staff can
// look but never act as a member) and calls the kane service, which does the
// validation, audit and receipts.

export type ProofFormState = { error?: string; ok?: string } | null;

async function teamMember(slug: string) {
  const { member } = await requireTeamMember(slug);
  if (!member) throw new AppError("FORBIDDEN", { userMessage: "Only team members can change proof." });
  return member;
}

const toState = (r: Awaited<ReturnType<typeof runAction<string>>>): ProofFormState => (r.ok ? { ok: r.data } : { error: r.error.message });

/** T-KANE-01: paste a run you did by hand. Shown as UNVERIFIED and never counted. */
export async function logManualRun(slug: string, _prev: ProofFormState, form: FormData): Promise<ProofFormState> {
  const r = await runAction(async () => {
    const member = await teamMember(slug);
    const receipt = await recordManualRun(member, formObject(form));
    refresh();
    return `Logged ${receipt.id} as unverified at ${new Date(receipt.server_time).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" })}.`;
  });
  return toState(r);
}

export async function defectAction(slug: string, _prev: ProofFormState, form: FormData): Promise<ProofFormState> {
  const r = await runAction(async () => {
    const member = await teamMember(slug);
    const out = await updateDefect({ kind: "member", member }, formObject(form));
    refresh();
    return `${out.id} is now ${out.defect.status.replace("_", " ")}.`;
  });
  return toState(r);
}

export async function proposeMilestoneAction(slug: string, _prev: ProofFormState, form: FormData): Promise<ProofFormState> {
  const r = await runAction(async () => {
    const member = await teamMember(slug);
    const o = formObject(form);
    const ids = String(o.evidence_ids ?? "")
      .split(/[\s,]+/)
      .map((s) => s.replace(/^EV-/i, ""))
      .filter(Boolean)
      .map(Number);
    const run = String(o.source_run_id ?? "").replace(/^KR-/i, "");
    const out = await proposeMilestone({ kind: "member", member }, { ...o, evidence_ids: ids, source_run_id: run ? Number(run) : undefined });
    refresh();
    return out.needs_team_approval
      ? `${out.id} proposed (${out.confidence.replace("_", " ")}). A teammate approves ${out.requested_visibility} visibility below.`
      : `${out.id} added for the team (${out.confidence.replace("_", " ")}).`;
  });
  return toState(r);
}

export async function milestoneDecision(slug: string, id: number, decision: "approve" | "withdraw"): Promise<ProofFormState> {
  const r = await runAction(async () => {
    const member = await teamMember(slug);
    const out = await approveMilestone(member, id, decision);
    refresh();
    return `${out.id} ${out.status}.`;
  });
  return toState(r);
}
