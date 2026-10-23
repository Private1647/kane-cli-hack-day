"use server";

import { refresh } from "next/cache";
import { formObject, runAction, type Receipt } from "@/server/core";
import { requireRole } from "@/server/auth";
import { RUBRIC, saveJudgeScore } from "@/server/judging";

export type ScoreState = {
  /** Bumps on every response, so the form gets a fresh idempotency key for its next submit. */
  seq: number;
  ok?: string;
  error?: string;
  issues?: { path: string; message: string }[];
  receipt?: Receipt;
} | null;

// Save a draft or commit a score. A double-click on Commit sends the same
// idempotency key (form key + seq + intent) and gets the original receipt back.
export async function scoreAction(prev: ScoreState, form: FormData): Promise<ScoreState> {
  const seq = (prev?.seq ?? 0) + 1;
  const obj = formObject(form);
  const intent = obj.intent === "commit" ? "commit" : "save";
  if (intent === "commit" && obj.confirm_commit !== "on") {
    return { seq, error: "Tick the box to confirm: a committed score can't be changed." };
  }
  const res = await runAction(async () => {
    const staff = await requireRole("judge", "organizer");
    const anchors: Record<string, unknown> = {};
    const evidence: Record<string, unknown> = {};
    for (const r of RUBRIC) {
      anchors[r.key] = obj[`anchor_${r.key}`];
      evidence[r.key] = obj[`evidence_${r.key}`];
    }
    return saveJudgeScore(staff, {
      submission_id: obj.submission_id,
      round: obj.round,
      intent,
      anchors,
      evidence,
      comments: obj.comments,
      uncertainty: obj.uncertainty,
      idempotency_key: typeof obj.form_key === "string" ? `${obj.form_key}:${intent}` : undefined,
    });
  });
  if (!res.ok) {
    const issues = (res.error.details as { issues?: { path: string; message: string }[] } | null)?.issues;
    return { seq, error: res.error.message, issues };
  }
  refresh();
  return { seq, ok: intent === "commit" ? "Score committed. It is now frozen." : "Draft saved.", receipt: res.receipt };
}
