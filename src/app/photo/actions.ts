"use server";

import { refresh } from "next/cache";
import { formObject, runAction } from "@/server/core";
import { requireRole } from "@/server/auth";
import {
  attestNoPeople,
  checkPhotoConsent,
  identifyPerson,
  lookupPeople,
  resolveBadge,
  reviewCandidate,
  setPhotoTeam,
  type LookupHit,
} from "@/server/photos";
import { editDraft, generateDrafts } from "@/server/social";

// Photographer studio actions. Every one re-checks the role and goes through
// the photos/social service (validation, audit, receipt).

export type PhotoState = { ok?: string; error?: string; problems?: string[] } | null;

async function run(fn: (o: Record<string, unknown>) => Promise<unknown>, form: FormData, ok: string): Promise<PhotoState> {
  const res = await runAction(async () => fn(formObject(form)));
  if (!res.ok) {
    const problems = (res.error.details as { problems?: string[] } | null)?.problems;
    return { error: res.error.message, problems };
  }
  refresh();
  return { ok: res.receipt ? `${ok} · ${res.receipt.id}` : ok };
}

const photographer = () => requireRole("photographer", "organizer");

export async function identifyAction(_p: PhotoState, form: FormData) {
  return run(async (o) => identifyPerson(await photographer(), o), form, "Person confirmed in photo");
}

export async function candidateAction(_p: PhotoState, form: FormData) {
  return run(async (o) => reviewCandidate(await photographer(), o), form, "Updated");
}

export async function attestAction(_p: PhotoState, form: FormData) {
  return run(async (o) => attestNoPeople(await photographer(), o), form, "Attested: nobody identifiable");
}

export async function teamAction(_p: PhotoState, form: FormData) {
  return run(async (o) => setPhotoTeam(await photographer(), o), form, "Team set");
}

export async function consentAction(_p: PhotoState, form: FormData): Promise<PhotoState> {
  const res = await runAction(async () => checkPhotoConsent(await photographer(), formObject(form)));
  if (!res.ok) return { error: res.error.message };
  refresh();
  return res.data.ok ? { ok: "Consent check passed. Draft captions next." } : { error: "Held. Fix these before it can go further:", problems: res.data.problems };
}

export async function draftAction(_p: PhotoState, form: FormData): Promise<PhotoState> {
  const res = await runAction(async () => generateDrafts(await photographer(), formObject(form)));
  if (!res.ok) return { error: res.error.message };
  refresh();
  return { ok: res.data.generator === "llm" ? "Drafted 3 captions (advisory AI draft)." : `Drafted 3 captions from templates${res.data.warning ? ` (${res.data.warning})` : ""}.` };
}

export async function editDraftAction(_p: PhotoState, form: FormData) {
  return run(async (o) => editDraft(await photographer(), o), form, "Saved; checks re-run");
}

/** Lookup for the identify panel: a badge scan (P-code or badge token) or a name/team search. */
export async function lookupAction(q: string): Promise<{ hits: LookupHit[]; error?: string }> {
  const res = await runAction(async () => {
    await photographer();
    const badge = /P-\d{3,}|khk_/i.test(q) ? await resolveBadge(q) : null;
    return badge ? [badge] : await lookupPeople(q.slice(0, 100));
  });
  return res.ok ? { hits: res.data } : { hits: [], error: res.error.message };
}
