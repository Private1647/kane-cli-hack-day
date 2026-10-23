"use server";

import { refresh } from "next/cache";
import { memberActor, requireTeamMember } from "@/server/auth";
import { AppError, formObject, runAction, type ActionResult } from "@/server/core";
import { getProjectByTeam, setTeamShowcaseState } from "@/server/showcase";
import {
  draftInputFromForm,
  finalizeSubmission,
  runPreflight,
  saveDraft,
  setCreditConsent,
  type FinalizeResult,
  type PreflightReport,
} from "@/server/submission";

// Thin wrappers: every rule (team scope, deadline, idempotency, audit) lives
// in src/server/submission.ts and src/server/showcase.ts.

export type Result<T> = ActionResult<T> | null;

export async function saveDraftAction(slug: string, _prev: Result<{ submissionId: number }>, form: FormData) {
  const res = await runAction(() => saveDraft(slug, draftInputFromForm(form)));
  if (res.ok) refresh();
  return res;
}

export async function preflightAction(slug: string, _prev: Result<PreflightReport>, form: FormData) {
  const res = await runAction(() => runPreflight(slug, { checkGithub: form.get("check_github") === "on" }));
  if (res.ok) refresh();
  return res;
}

export async function finalizeAction(slug: string, _prev: Result<FinalizeResult>, form: FormData) {
  const res = await runAction(() => finalizeSubmission(slug, formObject(form)));
  if (res.ok) refresh();
  return res;
}

export async function creditConsentAction(slug: string, granted: boolean) {
  const res = await runAction(() => setCreditConsent(slug, granted));
  if (res.ok) refresh();
  return res;
}

export async function showcaseStateAction(slug: string, _prev: Result<{ state: string }>, form: FormData) {
  const res = await runAction(async () => {
    const { team, member } = await requireTeamMember(slug);
    if (!member) throw new AppError("FORBIDDEN");
    const project = await getProjectByTeam(team.id);
    if (!project) throw new AppError("NOT_FOUND");
    const out = await setTeamShowcaseState(memberActor(member), project.id, { state: form.get("state") });
    return { data: { state: out.state }, receipt: out.receipt };
  });
  if (res.ok) refresh();
  return res;
}
