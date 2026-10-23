"use server";

import { redirect } from "next/navigation";
import { formObject, parse, sha256, toAppError, z } from "@/server/core";
import { clientKey, rateLimit } from "@/server/ratelimit";
import { memberLoginWithCode, memberLoginWithPassword } from "@/server/pairing";

export type PersonalLoginState = { error?: string; email?: string } | null;

const schema = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().max(200).optional(),
  code: z.string().trim().max(20).optional(),
  next: z.string().max(200).optional(),
});

/** Only our own personal pages, so ?next= can't bounce anyone off-site. */
const safeNext = (s?: string) => (s && /^\/(passport|activate|pair|readiness)(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(s) ? s : "/passport");

// Personal sign-in for anyone registered through the team form: email + the
// team password (or a personal password), or email + a one-time code.
export async function personalLogin(_prev: PersonalLoginState, form: FormData): Promise<PersonalLoginState> {
  const input = parse(schema, formObject(form));
  // Throttle per client and per email, so team passwords and one-time codes can't be guessed here.
  const [byClient, byEmail] = await Promise.all([
    rateLimit(`member-login:${await clientKey()}`, { limit: 10, windowSec: 300 }),
    rateLimit(`member-login-email:${sha256(input.email)}`, { limit: 10, windowSec: 900 }),
  ]);
  if (!byClient.ok || !byEmail.ok) return { error: "Too many tries. Wait a few minutes and try again.", email: input.email };
  try {
    if (input.code) await memberLoginWithCode(input.email, input.code);
    else if (input.password) await memberLoginWithPassword(input.email, input.password);
    else return { error: "Enter your password or a one-time code.", email: input.email };
  } catch (e) {
    return { error: toAppError(e).userMessage, email: input.email };
  }
  redirect(safeNext(input.next));
}
