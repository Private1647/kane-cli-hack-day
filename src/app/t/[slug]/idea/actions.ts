"use server";

import { refresh } from "next/cache";
import { memberActor, requireTeamMember } from "@/server/auth";
import { AppError, formObject, runAction, type ActionResult } from "@/server/core";
import { ideaRadar, saveIdea, selectIdea, validateTeamIdea, type Assessment, type RadarResult } from "@/server/ideas";
import { getTeamInfo } from "@/server/teams";

// The idea tab's server actions. Membership is re-checked from the cookie on
// every call; organizers viewing a hub read-only can't write here.

export type IdeaFormState = ActionResult<unknown> | null;
export type ValidateState = ActionResult<Assessment> | null;
export type RadarState = ActionResult<RadarResult> | null;

async function teamMember(slug: string) {
  const { team, member } = await requireTeamMember(slug);
  if (!member) throw new AppError("FORBIDDEN", { userMessage: "Organizers can read this tab but only team members can change it." });
  return { teamId: team.id, who: { member, actor: memberActor(member) } };
}

export async function saveIdeaAction(slug: string, _prev: IdeaFormState, form: FormData): Promise<IdeaFormState> {
  return runAction(async () => {
    const { teamId, who } = await teamMember(slug);
    const out = await saveIdea(who, teamId, { ...formObject(form), source: "web" });
    refresh();
    return { data: null, receipt: out.receipt };
  });
}

export async function validateIdeaAction(slug: string, _prev: ValidateState, form: FormData): Promise<ValidateState> {
  return runAction(async () => {
    const { teamId, who } = await teamMember(slug);
    const out = await validateTeamIdea(who, teamId, { useAi: form.get("use_ai") === "on" });
    refresh();
    return { data: out.assessment, receipt: out.receipt };
  });
}

export async function selectIdeaAction(slug: string): Promise<IdeaFormState> {
  const out = await runAction(async () => {
    const { teamId, who } = await teamMember(slug);
    const team = await getTeamInfo({ id: teamId });
    return { data: null, receipt: await selectIdea(who, teamId, team?.captain_id ?? null) };
  });
  refresh();
  return out;
}

export async function radarAction(slug: string): Promise<RadarState> {
  return runAction(async () => {
    const { teamId, who } = await teamMember(slug);
    return ideaRadar(who, teamId);
  });
}
