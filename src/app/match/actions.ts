"use server";

import { refresh } from "next/cache";
import { requireFlag } from "@/lib/flags";
import { formObject, runAction, type ActionResult } from "@/server/core";
import { requestIntro, respondIntro, upsertProfile, withdrawIntro } from "@/server/match";
import { actingMember } from "@/server/teams";

// Thin wrappers over src/server/match.ts. The matchmaker can be switched off
// (flag `match`); team creation and joining never depend on it.

export type MatchFormState = ActionResult<unknown> | null;

export async function saveProfileAction(_prev: MatchFormState, form: FormData): Promise<MatchFormState> {
  return runAction(async () => {
    await requireFlag("match");
    const out = await upsertProfile(await actingMember(), { ...formObject(form), source: "web" });
    refresh();
    return { data: null, receipt: out.receipt };
  });
}

export async function requestIntroAction(_prev: MatchFormState, form: FormData): Promise<MatchFormState> {
  return runAction(async () => {
    await requireFlag("match");
    const receipt = await requestIntro(await actingMember(), formObject(form));
    refresh();
    return { data: null, receipt };
  });
}

export async function respondIntroAction(introId: number, accept: boolean): Promise<MatchFormState> {
  const out = await runAction(async () => respondIntro(await actingMember(), introId, accept));
  refresh();
  return out;
}

export async function withdrawIntroAction(introId: number): Promise<MatchFormState> {
  const out = await runAction(async () => withdrawIntro(await actingMember(), introId));
  refresh();
  return out;
}
