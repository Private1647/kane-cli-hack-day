"use client";

import { useActionState, useState } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import { login, type LoginState } from "./actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<LoginState, FormData>(login, null);
  // Controlled, so a wrong password doesn't also wipe the team name (React resets forms after an action).
  const [team, setTeam] = useState("");
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="team">Team name</Label>
        <input id="team" name="team" value={team} onChange={(e) => setTeam(e.target.value)} required autoFocus autoComplete="organization" placeholder="Byte Me" className={inputCls} />
      </div>
      <div>
        <Label htmlFor="password">Team password</Label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
      </div>
      <FormError message={state?.error} />
      <SubmitButton pending="Checking…">Open team hub →</SubmitButton>
    </form>
  );
}
