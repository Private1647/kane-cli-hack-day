"use server";

import { refresh } from "next/cache";
import { formObject, runAction, type ActionResult } from "@/server/core";
import { query } from "@/lib/db";
import { createHelpTicket, diagnoseHelp, reopenHelpTicket, replyToTicket, webRequester, type CreatedTicket, type Diagnosis } from "@/server/help";

// Participant help actions, shared by the team hub tab (/t/[slug]/help) and
// /help (members without a team). The service re-checks who is asking.

export type HelpFormState<T> = ActionResult<T> | null;

export async function openTicket(_prev: HelpFormState<CreatedTicket>, form: FormData): Promise<HelpFormState<CreatedTicket>> {
  const res = await runAction(async () => {
    const out = await createHelpTicket(await webRequester(), formObject(form));
    return { data: out, receipt: out.receipt };
  });
  if (res.ok) refresh();
  return res;
}

export async function diagnose(_prev: HelpFormState<Diagnosis>, form: FormData): Promise<HelpFormState<Diagnosis>> {
  return runAction(async () => {
    // Signed-in only, so the docs map isn't an open LLM endpoint.
    const who = await webRequester();
    const [team] = who.member.team_id ? await query<{ slug: string }>("select slug from teams where id = $1", [who.member.team_id]) : [];
    return diagnoseHelp(formObject(form), { teamSlug: team?.slug ?? null });
  });
}

export async function replyTicket(code: string, _prev: HelpFormState<{ warnings: string[] }>, form: FormData): Promise<HelpFormState<{ warnings: string[] }>> {
  const res = await runAction(async () => {
    const r = await replyToTicket(code, { requester: await webRequester() }, formObject(form));
    return { data: { warnings: r.warnings }, receipt: { id: r.id, server_time: r.server_time } };
  });
  if (res.ok) refresh();
  return res;
}

export async function reopenTicket(code: string, _prev: HelpFormState<null>, form: FormData): Promise<HelpFormState<null>> {
  const res = await runAction(async () => {
    const receipt = await reopenHelpTicket(code, { requester: await webRequester() }, formObject(form));
    return { data: null, receipt };
  });
  if (res.ok) refresh();
  return res;
}
