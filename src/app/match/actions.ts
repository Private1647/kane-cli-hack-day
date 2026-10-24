"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireFlag } from "@/lib/flags";
import { memberActor, requirePersonalMember } from "@/server/auth";
import { formObject, runAction, type ActionResult } from "@/server/core";
import { answerIntro, setTeamChoice, updateMatchProfile } from "@/server/flow";
import { inviteToTeam, requestIntro, withdrawIntro } from "@/server/match";
import type { ActingMember } from "@/server/teams";

// Thin wrappers over src/server/match.ts and flow.ts, always as the person
// signed in personally. The matchmaker can be switched off (flag `match`);
// creating and joining teams by invite never depend on it.

export type MatchFormState = ActionResult<unknown> | null;

async function me(): Promise<ActingMember> {
  const member = await requirePersonalMember();
  return { member, actor: memberActor(member) };
}

export async function joinPoolAction() {
  await setTeamChoice(await requirePersonalMember(), true);
  redirect("/match");
}

export async function leavePoolAction() {
  await setTeamChoice(await requirePersonalMember(), false);
  redirect("/team");
}

export async function requestIntroAction(_prev: MatchFormState, form: FormData): Promise<MatchFormState> {
  return runAction(async () => {
    await requireFlag("match");
    const receipt = await requestIntro(await me(), formObject(form));
    refresh();
    return { data: null, receipt };
  });
}

/** Accepting someone's request to join *your team* also adds them (if a seat is free). */
export async function respondIntroAction(introId: number, accept: boolean): Promise<MatchFormState> {
  const out = await runAction(async () => {
    const r = await answerIntro(await me(), introId, accept);
    return { data: { joined: r.joined, joinedTeam: r.joinedTeam }, receipt: r.receipt };
  });
  refresh();
  return out;
}

export async function withdrawIntroAction(introId: number): Promise<MatchFormState> {
  const out = await runAction(async () => withdrawIntro(await me(), introId));
  refresh();
  return out;
}

/** A team member invites someone from the pool to their team (/team, "People looking for a team"). */
export async function inviteToTeamAction(targetMemberId: number, _prev: MatchFormState, form: FormData): Promise<MatchFormState> {
  return runAction(async () => {
    await requireFlag("match");
    const receipt = await inviteToTeam(await me(), targetMemberId, String(form.get("message") ?? ""));
    refresh();
    return { data: null, receipt };
  });
}

export async function updateMatchProfileAction(_prev: MatchFormState, form: FormData): Promise<MatchFormState> {
  return runAction(async () => {
    await updateMatchProfile(await requirePersonalMember(), { skills: String(form.get("skills") ?? ""), interests: String(form.get("interests") ?? "") });
    refresh();
    return null;
  });
}
