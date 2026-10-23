"use server";

import { refresh } from "next/cache";
import { requireFlag } from "@/lib/flags";
import {
  confirmAdmission,
  issuePhoneHandoff,
  markCameraOpened,
  redeemActivationCode,
  saveActivationConsents,
  saveIdentity,
  skipSelfie,
} from "@/server/activation";
import { requirePersonalMember } from "@/server/auth";
import { formObject, parse, runAction, z, zx } from "@/server/core";
import { CONSENT_CATEGORIES, profileSchema, type ConsentCategory } from "@/server/passport";

// /activate steps. Each one validates, re-checks who is signed in, and moves
// the server-side state machine; the page then re-renders from that state,
// so a reload or a crashed tab always lands on the right step.

export type StepState = { error?: string; needsEmail?: boolean; code?: string; email?: string } | null;

const fail = (e: { message: string; next_action: string }) => ({ error: `${e.message} ${e.next_action}` });

export async function redeemCode(_prev: StepState, form: FormData): Promise<StepState> {
  const input = { code: String(form.get("code") ?? ""), email: String(form.get("email") ?? "") || undefined };
  const r = await runAction(async () => {
    await requireFlag("activation");
    const v = parse(z.object({ code: z.string().trim().min(8).max(20), email: zx.email.optional() }), input);
    return redeemActivationCode(v.code, v.email ?? null);
  });
  if (!r.ok) return { ...fail(r.error), code: input.code, email: input.email };
  if (r.data.kind === "needs_email") return { needsEmail: true, code: input.code };
  refresh();
  return null;
}

export async function admission(_prev: StepState, form: FormData): Promise<StepState> {
  const isMe = form.get("answer") === "yes";
  const r = await runAction(async () => confirmAdmission(await requirePersonalMember(), isMe));
  refresh();
  return r.ok ? null : fail(r.error);
}

const identitySchema = profileSchema.pick({ display_name: true, github_handle: true, x_handle: true, skills: true, interests: true }).extend({
  display_name: z.string().trim().min(1, "Tell us what to call you").max(60),
});

export async function identity(_prev: StepState, form: FormData): Promise<StepState> {
  const r = await runAction(async () => {
    const input = parse(identitySchema, formObject(form));
    return saveIdentity(await requirePersonalMember(), input);
  });
  if (!r.ok) return fail(r.error);
  refresh();
  return null;
}

export async function consents(_prev: StepState, form: FormData): Promise<StepState> {
  // Every category gets an explicit answer: a missing checkbox is a "no".
  const answers = Object.fromEntries(CONSENT_CATEGORIES.map((c) => [c, form.get(c) === "on"])) as Record<ConsentCategory, boolean>;
  const r = await runAction(async () => saveActivationConsents(await requirePersonalMember(), answers));
  if (!r.ok) return fail(r.error);
  refresh();
  return null;
}

export async function openCamera() {
  const r = await runAction(async () => markCameraOpened(await requirePersonalMember(), "desktop"));
  return r.ok ? null : fail(r.error);
}

export async function skipPhoto(_prev: StepState, form: FormData): Promise<StepState> {
  const reason = z.enum(["declined", "no_camera", "no_consent", "later"]).catch("declined").parse(form.get("reason"));
  const r = await runAction(async () => skipSelfie(await requirePersonalMember(), reason));
  if (!r.ok) return fail(r.error);
  refresh();
  return null;
}

export async function phoneHandoff(): Promise<{ url?: string; minutes?: number; error?: string }> {
  const r = await runAction(async () => issuePhoneHandoff(await requirePersonalMember()));
  return r.ok ? { url: r.data.url, minutes: r.data.expires_minutes } : fail(r.error);
}

export async function refreshActivation() {
  refresh();
}
