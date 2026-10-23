"use server";

import { refresh } from "next/cache";
import { getStaff } from "@/server/auth";
import { formObject, runAction, type ActionResult } from "@/server/core";
import {
  addPaperTicket,
  claimHelpTicket,
  importPaperTicketsCsv,
  markHelpDuplicate,
  reopenHelpTicket,
  replyToTicket,
  transitionHelpTicket,
  triageHelpTicket,
  type HelpTransition,
  type PaperImportRow,
  type PaperResult,
} from "@/server/help";

// Mentor / organizer queue actions. Every one re-reads the staff session and
// the service re-checks the role and the ticket's current state.

export type OpsHelpState<T = unknown> = ActionResult<T> | null;

export async function claimTicket(code: string): Promise<OpsHelpState> {
  const res = await runAction(async () => {
    const r = await claimHelpTicket(code, await getStaff());
    return { data: { status: r.status }, receipt: { id: r.id, server_time: r.server_time } };
  });
  refresh();
  return res;
}

export async function moveTicket(code: string, kind: HelpTransition, _prev: OpsHelpState, form: FormData): Promise<OpsHelpState> {
  const res = await runAction(async () => {
    const r = await transitionHelpTicket(code, await getStaff(), kind, formObject(form));
    return { data: { status: r.status }, receipt: { id: r.id, server_time: r.server_time } };
  });
  refresh();
  return res;
}

export async function duplicateTicket(code: string, _prev: OpsHelpState, form: FormData): Promise<OpsHelpState> {
  const res = await runAction(async () => ({ data: null, receipt: await markHelpDuplicate(code, await getStaff(), formObject(form)) }));
  if (res.ok) refresh();
  return res;
}

export async function triageTicket(code: string, _prev: OpsHelpState, form: FormData): Promise<OpsHelpState> {
  const res = await runAction(async () => ({ data: null, receipt: await triageHelpTicket(code, await getStaff(), formObject(form)) }));
  if (res.ok) refresh();
  return res;
}

export async function reopenTicketAsStaff(code: string, _prev: OpsHelpState, form: FormData): Promise<OpsHelpState> {
  const res = await runAction(async () => {
    return { data: null, receipt: await reopenHelpTicket(code, { staff: (await getStaff()) ?? undefined }, formObject(form)) };
  });
  if (res.ok) refresh();
  return res;
}

export async function staffReply(code: string, _prev: OpsHelpState, form: FormData): Promise<OpsHelpState> {
  const res = await runAction(async () => {
    const r = await replyToTicket(code, { staff: (await getStaff()) ?? undefined }, formObject(form));
    return { data: null, receipt: { id: r.id, server_time: r.server_time } };
  });
  if (res.ok) refresh();
  return res;
}

export async function addPaper(_prev: OpsHelpState<PaperResult>, form: FormData): Promise<OpsHelpState<PaperResult>> {
  const res = await runAction(async () => {
    const r = await addPaperTicket(await getStaff(), formObject(form));
    return { data: r, receipt: r.receipt };
  });
  if (res.ok) refresh();
  return res;
}

export async function importPaperCsv(
  _prev: OpsHelpState<{ rows: PaperImportRow[]; created: number; skipped: number; failed: number }>,
  form: FormData,
): Promise<OpsHelpState<{ rows: PaperImportRow[]; created: number; skipped: number; failed: number }>> {
  const res = await runAction(async () => {
    const file = form.get("file");
    const text = file instanceof File && file.size > 0 ? await file.text() : String(form.get("csv") ?? "");
    return importPaperTicketsCsv(await getStaff(), text);
  });
  if (res.ok) refresh();
  return res;
}
