"use server";

import { redirect } from "next/navigation";
import { isRegistrationOpen } from "@/lib/teams";
import { getPersonalMember, requirePersonalMember } from "@/server/auth";
import { skipAvatar } from "@/server/avatar";
import { formObject, runAction, sha256 } from "@/server/core";
import { setTeamChoice, submitProfile } from "@/server/flow";
import { clientKey, rateLimit } from "@/server/ratelimit";

// /register steps. Each re-checks who is signed in on the server; the page then
// re-renders the next step from the database, so a reload lands on the right step.

export type ProfileState = { error?: string; needsProof?: boolean; values?: Record<string, string> } | null;

const KEEP = ["name", "email", "skills", "interests", "github", "x"] as const;

export async function profileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const values = Object.fromEntries(KEEP.map((k) => [k, String(form.get(k) ?? "")]));
  const viewer = await getPersonalMember();
  if (!viewer && !(await isRegistrationOpen())) return { error: "Registration is closed. Ask at the help desk.", values };
  // Proof attempts (password / desk code for an existing email) are throttled like sign-in.
  const proving = !!(form.get("proof_password") || form.get("proof_code"));
  if (proving) {
    const email = values.email.trim().toLowerCase();
    const [a, b] = await Promise.all([
      rateLimit(`register-proof:${await clientKey()}`, { limit: 10, windowSec: 300 }),
      rateLimit(`register-proof-email:${sha256(email)}`, { limit: 10, windowSec: 900 }),
    ]);
    if (!a.ok || !b.ok) return { error: "Too many tries. Wait a few minutes, or ask at the desk.", needsProof: true, values };
  }
  const r = await runAction(() => submitProfile(formObject(form), viewer));
  if (!r.ok) return { error: r.error.message, needsProof: proving, values };
  if (r.data.kind === "needs_proof") return { needsProof: true, values };
  redirect("/register");
}

export async function skipPhotoAction() {
  const member = await requirePersonalMember();
  await skipAvatar(member);
  redirect("/register");
}

export type ChoiceState = { error?: string } | null;

export async function choiceAction(_prev: ChoiceState, form: FormData): Promise<ChoiceState> {
  const answer = form.get("looking");
  if (answer !== "yes" && answer !== "no") return { error: "Pick one: yes or no." };
  const r = await runAction(async () => setTeamChoice(await requirePersonalMember(), answer === "yes"));
  if (!r.ok) return { error: r.error.message };
  redirect(r.data.inPool ? "/match" : "/team");
}
