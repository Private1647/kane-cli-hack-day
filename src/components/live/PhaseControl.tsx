"use client";

import { useActionState, useId } from "react";
import { FormError, inputCls, Label, SubmitButton } from "@/components/forms/fields";
import { overridePhase } from "@/app/live/actions";

// Ops TV control: pin /live to a phase, or hand it back to the schedule.
// Audited server-side; shows the receipt so the organizer knows it took.

const OPTIONS = ["auto", "arrival", "build", "verify", "submit", "showtime", "recap"] as const;

export default function PhaseControl({ current, source }: { current: string; source: "schedule" | "override" }) {
  const [state, action] = useActionState(overridePhase, null);
  const id = useId();
  const key = useId();
  return (
    <form action={action} className="space-y-3 border border-hairline bg-surface p-4">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
        Phase · now {current} ({source === "override" ? "pinned by an organizer" : "from the schedule"})
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-phase`}>Set phase</Label>
          <select id={`${id}-phase`} name="phase" defaultValue={source === "override" ? current : "auto"} className={`${inputCls} min-h-11`}>
            {OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o === "auto" ? "Auto (follow the schedule)" : o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-reason`}>Reason (audited)</Label>
          <input id={`${id}-reason`} name="reason" maxLength={200} placeholder="e.g. demos started early" className={`${inputCls} min-h-11`} />
        </div>
      </div>
      <input type="hidden" name="idempotency_key" value={`phase-${key}-${state?.ok ? (state.receipt?.server_time ?? "") : ""}`} />
      <SubmitButton className="min-h-11">Apply</SubmitButton>
      {state?.ok === false && <FormError message={`${state.error.message} ${state.error.next_action}`} />}
      {state?.ok && (
        <p role="status" className="font-plex text-xs text-lightgray">
          Applied · receipt {state.receipt?.id} at {state.receipt?.server_time}. The TV updates within a few seconds.
        </p>
      )}
    </form>
  );
}
