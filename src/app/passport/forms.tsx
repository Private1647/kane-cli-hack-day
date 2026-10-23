"use client";

import { useActionState, useState, useTransition } from "react";
import { FormError, Label, SubmitButton, Toggle, inputCls } from "@/components/forms/fields";
import { newLoginCode, rotateBadge, saveProfile, setPassword, type FormState } from "./actions";

function Ok({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="status" className="border-l-2 border-hairline pl-3 font-plex text-sm text-bright">
      {text}
    </p>
  );
}

export function ProfileForm({
  defaults,
  consents,
}: {
  defaults: { display_name: string; github_handle: string; x_handle: string; skills: string; interests: string };
  consents: { name: string; label: string; description: string; on: boolean }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile, null);
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-display">Display name</Label>
          <input id="p-display" name="display_name" required maxLength={60} defaultValue={defaults.display_name} className={inputCls} />
        </div>
        <div>
          <Label htmlFor="p-x" hint="Optional">
            X handle
          </Label>
          <input id="p-x" name="x_handle" maxLength={60} defaultValue={defaults.x_handle} placeholder="@handle" className={inputCls} />
        </div>
        <div>
          <Label htmlFor="p-gh" hint="Typed handles show as unverified">
            GitHub username
          </Label>
          <input id="p-gh" name="github_handle" maxLength={39} defaultValue={defaults.github_handle} className={inputCls} />
        </div>
        <div>
          <Label htmlFor="p-skills" hint="Comma separated">
            Skills
          </Label>
          <input id="p-skills" name="skills" defaultValue={defaults.skills} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="p-int" hint="Comma separated">
            Interests
          </Label>
          <input id="p-int" name="interests" defaultValue={defaults.interests} className={inputCls} />
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Privacy, one switch each</legend>
        <ul className="divide-y divide-dashed divide-hairline border-y border-dashed border-hairline">
          {consents.map((c) => (
            <li key={c.name} className="py-2">
              <Toggle name={c.name} label={c.label} description={c.description} defaultChecked={c.on} />
            </li>
          ))}
        </ul>
      </fieldset>
      <FormError message={state?.error} />
      <Ok text={state?.ok} />
      <SubmitButton pending="Saving…" className="min-h-11">
        Save changes
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(setPassword, null);
  return (
    <form action={action} className="space-y-3">
      <Label htmlFor="pw" hint="8+ characters">
        Personal password
      </Label>
      <input id="pw" name="password" type="password" minLength={8} required autoComplete="new-password" className={inputCls} />
      <FormError message={state?.error} />
      <Ok text={state?.ok} />
      <SubmitButton pending="Saving…" className="min-h-11">
        Set password
      </SubmitButton>
    </form>
  );
}

export function LoginCodeButton() {
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setState(await newLoginCode()))}
        className="min-h-11 border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-60"
      >
        {pending ? "Making code…" : "One-time code for another device"}
      </button>
      {state?.code && (
        <p role="status" className="font-plex text-sm text-bright">
          <span className="font-dots text-2xl tracking-[0.1em]">{state.code}</span>
          <span className="block text-xs text-lightgray">Use it once at /passport/login within 24 hours. Making a new one cancels this one.</span>
        </p>
      )}
      <FormError message={state?.error} />
    </div>
  );
}

export function RotateBadgeButton() {
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("Issue a new badge QR? Printed badges with the old code stop working.")) start(async () => setState(await rotateBadge()));
        }}
        className="min-h-11 border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
      >
        {pending ? "Rotating…" : "Lost my badge: rotate QR"}
      </button>
      <Ok text={state?.ok} />
      <FormError message={state?.error} />
    </div>
  );
}
