"use client";

import { useActionState, useState } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import { removeNudge, seedReminders, sendNudge, type NudgeState, type SeedState } from "../actions";

export function SeedReminders() {
  const [state, action] = useActionState<SeedState, FormData>(seedReminders, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton pending="Seeding…">Seed schedule reminders</SubmitButton>
      {state?.added !== undefined && (
        <p role="status" className="font-plex text-xs text-lime">
          {state.added === 0 ? "Nothing new: every deadline already has a reminder." : `Added ${state.added} reminder${state.added === 1 ? "" : "s"}.`}
        </p>
      )}
      <FormError message={state?.error} />
    </form>
  );
}

type When = "now" | "at" | "in";

export function NudgeForm({ teams }: { teams: { id: number; name: string }[] }) {
  const [state, action] = useActionState<NudgeState, FormData>(sendNudge, null);
  const v = state?.values;
  const [when, setWhen] = useState<When>("now");

  return (
    <form action={action} className="max-w-2xl space-y-5">
      <div>
        <Label htmlFor="nudge-title" hint="≤ 80">
          Title
        </Label>
        <input id="nudge-title" name="title" required maxLength={80} defaultValue={v?.title} className={inputCls} />
      </div>
      <div>
        <Label htmlFor="nudge-body" hint="≤ 300">
          Body
        </Label>
        <textarea id="nudge-body" name="body" rows={3} maxLength={300} defaultValue={v?.body} className={inputCls} />
      </div>
      <div>
        <Label htmlFor="nudge-href" hint="optional · /path or https://">
          Link
        </Label>
        <input id="nudge-href" name="href" maxLength={500} placeholder="/t/submit#final" defaultValue={v?.href} className={inputCls} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="nudge-audience">Audience</Label>
          <select id="nudge-audience" name="audience" defaultValue={v?.audience ?? "all"} className={inputCls}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="nudge-when">When</Label>
          <select id="nudge-when" name="when" value={when} onChange={(e) => setWhen(e.target.value as When)} className={inputCls}>
            <option value="now">Now</option>
            <option value="at">At a time on event day</option>
            <option value="in">Minutes from now</option>
          </select>
        </div>
      </div>
      {when === "at" && (
        <div className="max-w-xs">
          <Label htmlFor="nudge-at" hint="event time zone">
            Time
          </Label>
          <input id="nudge-at" name="at" type="time" required defaultValue={v?.at} className={inputCls} />
        </div>
      )}
      {when === "in" && (
        <div className="max-w-xs">
          <Label htmlFor="nudge-minutes">Minutes</Label>
          <input id="nudge-minutes" name="minutes" type="number" min={1} max={10080} step={1} required defaultValue={v?.minutes} className={inputCls} />
        </div>
      )}
      <FormError message={state?.error} />
      <div className="flex items-center gap-3">
        <SubmitButton pending="Saving…">{when === "now" ? "Send nudge →" : "Schedule nudge →"}</SubmitButton>
        {state?.ok && (
          <p role="status" className="font-plex text-xs text-lime">
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

export function DeleteNudge({ id }: { id: number }) {
  // An in-page confirm step (not window.confirm), so it is visible and can't be skipped silently.
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="font-plex text-xs text-lightgray hover:text-red-300">
        Delete
      </button>
    );
  }
  return (
    <form action={removeNudge.bind(null, id)} role="alertdialog" aria-label="Delete this notification?" className="flex items-center gap-3 font-plex text-xs">
      <span className="text-warning">Delete this notification?</span>
      <button type="submit" autoFocus className="text-danger hover:underline">
        Yes, delete
      </button>
      <button type="button" onClick={() => setAsking(false)} className="text-lightgray hover:text-bright">
        Cancel
      </button>
    </form>
  );
}
