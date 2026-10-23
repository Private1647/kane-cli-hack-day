"use client";

import { Toggle } from "@/components/forms/fields";
import ActionForm, { ReasonField } from "../_kit/ActionForm";
import { flagsAction, issueCodeAction, staffActiveAction } from "./actions";

// Client bits of /ops/settings that need state: the flag switches, the
// one-time code reveal and the staff activate/deactivate form.

export function FlagsForm({ flags }: { flags: { id: string; label: string; on: boolean }[] }) {
  return (
    <ActionForm action={flagsAction} submit="Save flags" pending="Saving…">
      <div className="grid gap-x-8 sm:grid-cols-2">
        {flags.map((f) => (
          <Toggle key={f.id} name={`flag_${f.id}`} label={f.id.replace("_", " ")} description={f.label} defaultChecked={f.on} />
        ))}
      </div>
      <p className="font-plex text-xs text-lightgray">Check-in, help and submission are never behind a flag.</p>
      <ReasonField id="flags-reason" />
    </ActionForm>
  );
}

export function IssueCode({ id, name }: { id: number; name: string }) {
  return (
    <ActionForm
      action={issueCodeAction}
      submit="Issue code"
      pending="Issuing…"
      variant="secondary"
      confirm={`Issue a new one-time code for ${name}? Any earlier unused code stops working.`}
      render={(s) => (
        <div className="space-y-1 border-l-2 border-lime pl-3 font-plex text-sm">
          <p className="font-dots text-3xl font-black tracking-wider text-bright">{(s.data as { code: string }).code}</p>
          <p className="text-xs text-lightgray">{s.message}</p>
        </div>
      )}
    >
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}

export function StaffActive({ id, active, name }: { id: number; active: boolean; name: string }) {
  return (
    <ActionForm action={staffActiveAction} submit={active ? "Deactivate" : "Reactivate"} pending="Saving…" variant={active ? "danger" : "secondary"} confirm={active ? `Deactivate ${name}? Their session ends on the next request.` : undefined}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <ReasonField id={`staff-reason-${id}`} placeholder={active ? "e.g. left the event, lost phone" : "e.g. back on shift"} />
    </ActionForm>
  );
}
