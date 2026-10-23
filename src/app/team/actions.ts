"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth";
import { AppError, formObject, runAction, type ActionResult } from "@/server/core";
import {
  actingMember,
  advanceTeamState,
  createInvite,
  createTeam,
  getTeamInfo,
  joinTeam,
  leaveTeam,
  organizerOverride,
  removeMember,
  revokeInvite,
  transferCaptain,
  updateTeamSettings,
  type CreatedInvite,
} from "@/server/teams";
import { setMemberSession, setTeamSession } from "@/lib/session";

// Thin wrappers: every rule (who, when, how many) lives in src/server/teams.ts.
// After creating or joining, the browser gets the team cookie (so the hub at
// /t/[slug] opens) and the member cookie (so the person stays signed in even
// if they later leave).

export type TeamFormState = ActionResult<unknown> | null;
export type InviteFormState = ActionResult<CreatedInvite> | null;

async function teamId(slug: string) {
  const t = await getTeamInfo({ slug });
  if (!t) throw new AppError("NOT_FOUND", { userMessage: "Team not found." });
  return t.id;
}

export async function createTeamAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  return runAction(async () => {
    const who = await actingMember();
    const team = await createTeam(who, formObject(form));
    await setMemberSession({ memberId: who.member.id });
    await setTeamSession({ teamId: team.teamId, memberId: who.member.id });
    redirect(`/team/${team.slug}/manage?created=1`);
  });
}

export async function joinTeamAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  return runAction(async () => {
    const who = await actingMember();
    const joined = await joinTeam(who, formObject(form));
    await setMemberSession({ memberId: who.member.id });
    await setTeamSession({ teamId: joined.teamId, memberId: who.member.id });
    redirect(`/t/${joined.slug}`);
  });
}

export async function createInviteAction(slug: string, _prev: InviteFormState, form: FormData): Promise<InviteFormState> {
  return runAction(async () => {
    const out = await createInvite(await actingMember(), await teamId(slug), formObject(form));
    refresh();
    return { data: out, receipt: out.receipt };
  });
}

export async function revokeInviteAction(slug: string, inviteId: number) {
  const out = await runAction(async () => revokeInvite(await actingMember(), await teamId(slug), inviteId));
  refresh();
  return out;
}

export async function updateSettingsAction(slug: string, _prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  return runAction(async () => {
    const receipt = await updateTeamSettings(await actingMember(), await teamId(slug), formObject(form));
    refresh();
    return { data: null, receipt };
  });
}

export async function removeMemberAction(slug: string, memberId: number): Promise<TeamFormState> {
  return runAction(async () => {
    const receipt = await removeMember(await actingMember(), await teamId(slug), memberId);
    refresh();
    return { data: null, receipt };
  });
}

export async function transferCaptainAction(slug: string, memberId: number): Promise<TeamFormState> {
  return runAction(async () => {
    const receipt = await transferCaptain(await actingMember(), await teamId(slug), memberId);
    refresh();
    return { data: null, receipt };
  });
}

export async function advanceStateAction(slug: string, to: "formed" | "active"): Promise<TeamFormState> {
  return runAction(async () => {
    const receipt = await advanceTeamState(await actingMember(), await teamId(slug), to);
    refresh();
    return { data: null, receipt };
  });
}

export async function leaveTeamAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  return runAction(async () => {
    if (form.get("confirm") !== "on") throw new AppError("VALIDATION_FAILED", { userMessage: "Tick the box to confirm you're leaving." });
    const who = await actingMember();
    await leaveTeam(who);
    // Stay signed in as a person; the team cookie no longer matches.
    await setMemberSession({ memberId: who.member.id });
    redirect("/team");
  });
}

export async function overrideAction(slug: string, _prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  return runAction(async () => {
    const staff = await requireRole("organizer");
    const receipt = await organizerOverride(staff, await teamId(slug), formObject(form));
    refresh();
    return { data: null, receipt };
  });
}
