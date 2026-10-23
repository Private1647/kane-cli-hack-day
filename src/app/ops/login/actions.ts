"use server";

import { redirect } from "next/navigation";
import { adminPasswordLogin, getStaff, staffLoginWithCode } from "@/server/auth";
import { formObject, parse, toAppError, z } from "@/server/core";
import { clientKey, enforceRateLimit } from "@/server/ratelimit";

export type StaffLoginState = { error?: string; email?: string } | null;

const schema = z.object({
  email: z.string().trim().max(200).optional(),
  code: z.string().trim().max(40).optional(),
  password: z.string().max(200).optional(),
  next: z.string().max(200).optional(),
});

/** Only same-site /ops paths, so ?next= can't bounce anyone off-site. */
const safeNext = (s?: string) => (s && /^\/ops(\/[\w\-/]*)?$/.test(s) ? s : "/ops");

// Email + one-time code from an organizer, or the break-glass ADMIN_PASSWORD.
export async function staffLogin(_prev: StaffLoginState, form: FormData): Promise<StaffLoginState> {
  const input = parse(schema, formObject(form));
  try {
    await enforceRateLimit(`staff-login:${await clientKey()}`, { limit: 10, windowSec: 300 });
    if (input.password) await adminPasswordLogin(input.password);
    else if (input.email && input.code) await staffLoginWithCode(input.email, input.code);
    else return { error: "Enter your staff email and code.", email: input.email };
  } catch (e) {
    // A double-submitted form: the first request signed this person in and spent the
    // code, so the second sees it as used. They are in; carry on instead of showing an error.
    const staff = await getStaff();
    if (staff?.email && input.email && staff.email.toLowerCase() === input.email.toLowerCase()) redirect(safeNext(input.next));
    return { error: toAppError(e).userMessage, email: input.email };
  }
  redirect(safeNext(input.next));
}
