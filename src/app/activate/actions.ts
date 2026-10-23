"use server";

import { refresh } from "next/cache";
import type { ActivationStepId } from "@/data/activation-steps";
import { requirePersonalMember } from "@/server/auth";
import { runAction } from "@/server/core";
import { assignCodexCode, claimPlan, setTick, type ClaimView } from "@/server/event-activation";

// /activate checklist actions. The member always comes from the personal
// session; nothing about who they are (least of all the email) is read from the form.

export type ActState = { ok: boolean; message?: string; outcome?: ClaimView["outcome"] } | null;

export async function tickAction(step: ActivationStepId, done: boolean): Promise<ActState> {
  const r = await runAction(async () => setTick(await requirePersonalMember(), step, done));
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}

export async function claimPlanAction(): Promise<ActState> {
  const r = await runAction(async () => claimPlan(await requirePersonalMember()));
  refresh();
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: r.data.outcome === "claimed", message: r.data.message, outcome: r.data.outcome };
}

export async function codexCodeAction(): Promise<ActState> {
  const r = await runAction(async () => assignCodexCode(await requirePersonalMember()));
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}
