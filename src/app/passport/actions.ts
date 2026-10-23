"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { clearTeamSession } from "@/lib/session";
import { memberActor, memberLogout, requirePersonalMember } from "@/server/auth";
import { formObject, parse, runAction, z } from "@/server/core";
import { issueMemberLoginCode, revokeBearerToken, setMemberPassword } from "@/server/pairing";
import { CONSENT_CATEGORIES, profileSchema, rotateBadgeToken, updateProfile, type ConsentCategory } from "@/server/passport";

// Passport settings. Every change is checked against the signed-in member on
// the server; consents are appended (the history is the audit trail).

export type FormState = { error?: string; ok?: string; code?: string } | null;

const msg = (e: { message: string; next_action: string }) => ({ error: `${e.message} ${e.next_action}` });

export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const r = await runAction(async () => {
    const member = await requirePersonalMember();
    const raw = formObject(form);
    const consents = Object.fromEntries(CONSENT_CATEGORIES.map((c) => [c, form.get(c) === "on"])) as Record<ConsentCategory, boolean>;
    const input = parse(profileSchema, {
      display_name: raw.display_name,
      x_handle: raw.x_handle ?? "",
      github_handle: raw.github_handle ?? "",
      skills: raw.skills ?? "",
      interests: raw.interests ?? "",
      consents,
    });
    return updateProfile(member, memberActor(member), input, "web");
  });
  if (!r.ok) return msg(r.error);
  refresh();
  return { ok: "Saved. Each privacy change is recorded with the time." };
}

export async function setPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const r = await runAction(async () => {
    const input = parse(z.object({ password: z.string().min(8, "Use at least 8 characters").max(200) }), formObject(form));
    return setMemberPassword(await requirePersonalMember(), input.password);
  });
  return r.ok ? { ok: "Personal password set. You can sign in with your email and this password." } : msg(r.error);
}

export async function newLoginCode(): Promise<FormState> {
  const r = await runAction(async () => {
    const member = await requirePersonalMember();
    return issueMemberLoginCode(member.id, memberActor(member));
  });
  return r.ok ? { code: r.data } : msg(r.error);
}

export async function rotateBadge(): Promise<FormState> {
  const r = await runAction(async () => {
    const member = await requirePersonalMember();
    return rotateBadgeToken(member.id, memberActor(member));
  });
  if (!r.ok) return msg(r.error);
  refresh();
  return { ok: "New badge QR issued. The old one no longer works." };
}

export async function revokeToken(form: FormData) {
  const id = z.coerce.number().int().positive().safeParse(form.get("id"));
  if (!id.success) return;
  await runAction(async () => revokeBearerToken(await requirePersonalMember(), id.data));
  refresh();
}

export async function signOut() {
  await Promise.all([memberLogout(), clearTeamSession()]);
  redirect("/passport/login");
}
