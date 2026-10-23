"use client";

import { useActionState, useState } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import { personalLogin, type PersonalLoginState } from "./actions";

export default function PersonalLoginForm({ next, initialMode = "password" }: { next: string; initialMode?: "password" | "code" }) {
  const [state, action] = useActionState<PersonalLoginState, FormData>(personalLogin, null);
  const [mode, setMode] = useState<"password" | "code">(initialMode);
  // Controlled, so a wrong password doesn't also wipe the email (React resets forms after an action).
  const [email, setEmail] = useState(state?.email ?? "");
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="pl-email">Your email</Label>
        <input id="pl-email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </div>
      {mode === "password" ? (
        <div>
          <Label htmlFor="pl-password" hint="Your team’s, or your own">
            Password
          </Label>
          <input id="pl-password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
        </div>
      ) : (
        <div>
          <Label htmlFor="pl-code" hint="From the desk or your other device">
            One-time code
          </Label>
          <input id="pl-code" name="code" required autoComplete="one-time-code" placeholder="XXXX-XXXX" className={`${inputCls} uppercase tracking-[0.2em]`} />
        </div>
      )}
      <FormError message={state?.error} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pending="Checking…" className="min-h-11">
          Open my passport →
        </SubmitButton>
        <button
          type="button"
          onClick={() => setMode(mode === "password" ? "code" : "password")}
          className="min-h-11 px-1 font-plex text-xs text-lightgray underline-offset-4 hover:text-bright hover:underline"
        >
          {mode === "password" ? "Use a one-time code instead" : "Use a password instead"}
        </button>
      </div>
    </form>
  );
}
