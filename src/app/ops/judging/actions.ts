"use server";

import { refresh } from "next/cache";
import { formObject, runAction } from "@/server/core";
import { requireRole } from "@/server/auth";
import { confirmDemoQueue, lockJudging, removeAward, reopenJudging, setAward } from "@/server/judging";

// Organizer-only judging controls. Each wraps a service function that checks
// input, writes the audit event and returns a receipt.

export type OpsJudgingState = { ok?: string; error?: string } | null;

async function run(fn: (form: Record<string, unknown>) => Promise<unknown>, form: FormData, ok: string): Promise<OpsJudgingState> {
  const res = await runAction(() => fn(formObject(form)));
  if (!res.ok) return { error: res.error.message };
  refresh();
  return { ok };
}

export async function lockAction(_prev: OpsJudgingState, form: FormData) {
  return run(async (o) => lockJudging(await requireRole("organizer"), o), form, "Judging locked. Scores are read-only; awards can be recorded.");
}

export async function reopenAction(_prev: OpsJudgingState, form: FormData) {
  return run(async (o) => reopenJudging(await requireRole("organizer"), o), form, "Judging reopened. Committed scores stay frozen.");
}

export async function demoQueueAction(_prev: OpsJudgingState, form: FormData) {
  return run(
    async (o) => {
      const raw = o.slot;
      const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((v) => v !== "");
      return confirmDemoQueue(await requireRole("organizer"), { ids });
    },
    form,
    "Demo queue confirmed.",
  );
}

export async function awardAction(_prev: OpsJudgingState, form: FormData) {
  return run(async (o) => setAward(await requireRole("organizer"), o), form, "Award recorded.");
}

export async function removeAwardAction(award: string, submissionId: number) {
  await runAction(async () => removeAward(await requireRole("organizer"), { award, submission_id: submissionId }));
  refresh();
}
