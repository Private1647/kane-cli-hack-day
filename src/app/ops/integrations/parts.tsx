"use client";

import { useState } from "react";
import ActionForm, { ReasonField, SelectField, TextField } from "../_kit/ActionForm";
import { markAction, pauseAction } from "./actions";

// Per-system controls, folded away until needed so the list stays scannable on a phone.

export function SystemControls({ system, label, paused }: { system: string; label: string; paused: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
        Pause · mark status…
      </button>
    );
  }
  return (
    <div className="grid w-full gap-6 border-t border-dashed border-hairline pt-4 md:grid-cols-2">
      <ActionForm action={pauseAction} submit={paused ? `Resume ${label}` : `Pause ${label}`} pending="Saving…" variant={paused ? "secondary" : "danger"}>
        <input type="hidden" name="system" value={system} />
        <input type="hidden" name="paused" value={paused ? "false" : "true"} />
        <ReasonField id={`pz-${system}`} placeholder={paused ? "e.g. vendor confirmed fix" : "e.g. Slack rate-limited, stop retries"} />
      </ActionForm>
      <ActionForm action={markAction} submit="Mark status" pending="Saving…" variant="secondary">
        <input type="hidden" name="system" value={system} />
        <SelectField
          id={`mk-${system}`}
          name="status"
          label="Status"
          defaultValue="degraded"
          options={[
            { value: "ok", label: "OK" },
            { value: "degraded", label: "Degraded" },
            { value: "down", label: "Down" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
        <TextField id={`mkd-${system}`} name="detail" label="What we know" hint="required · shown to staff" required maxLength={300} placeholder="e.g. X API returning 503 since 14:10" />
      </ActionForm>
    </div>
  );
}
