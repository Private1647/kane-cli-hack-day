"use client";

import { useActionState, useState } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import { staffLogin, type StaffLoginState } from "./actions";

export default function StaffLoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<StaffLoginState, FormData>(staffLogin, null);
  const [mode, setMode] = useState<"code" | "password">("code");
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      {mode === "code" ? (
        <>
          <div>
            <Label htmlFor="email">Staff email</Label>
            <input id="email" name="email" type="email" required autoFocus autoComplete="email" defaultValue={state?.email} className={inputCls} />
          </div>
          <div>
            <Label htmlFor="code" hint="From an organizer">
              One-time code
            </Label>
            <input id="code" name="code" required autoComplete="one-time-code" placeholder="XXXX-XXXX" className={`${inputCls} uppercase tracking-[0.2em]`} />
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="password">Admin password</Label>
          <input id="password" name="password" type="password" required autoFocus autoComplete="current-password" className={inputCls} />
        </div>
      )}
      <FormError message={state?.error} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pending="Checking…" className="min-h-11">
          Sign in →
        </SubmitButton>
        <button
          type="button"
          onClick={() => setMode(mode === "code" ? "password" : "code")}
          className="min-h-11 px-1 font-plex text-xs text-lightgray underline-offset-4 hover:text-bright hover:underline"
        >
          {mode === "code" ? "Use the admin password instead" : "Use email and code"}
        </button>
      </div>
    </form>
  );
}
