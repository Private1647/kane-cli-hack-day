"use client";

import { useActionState, useState } from "react";
import { ConfirmByTyping, Label, inputCls } from "@/components/forms/fields";
import { Result, TextArea, TextField } from "../_kit/ActionForm";
import type { OpsState } from "../_kit/state";
import { overrideAction } from "./actions";

const TARGET_HINT: Record<string, string> = {
  admit_guest: "P-code, roster id or Luma guest id",
  revoke_admission: "P-code, roster id or Luma guest id",
  undo_checkin: "P-code, roster id or Luma guest id",
  deadline_exception: "team slug",
  note: "id of the record (receipt code, ticket code…)",
};

export function OverrideForm({ kinds }: { kinds: Record<string, string> }) {
  const [state, action, pending] = useActionState<OpsState, FormData>(overrideAction, null);
  const [kind, setKind] = useState("admit_guest");
  const r = state?.ok ? (state.data as { digest: string; signature: string | null } | undefined) : undefined;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ov-kind">Override</Label>
          <select id="ov-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputCls} min-h-11`}>
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <TextField id="ov-target" name="target" label="Target" hint={TARGET_HINT[kind]} required maxLength={120} />
      </div>
      {kind === "note" && <TextField id="ov-rtype" name="resource_type" label="Record type" hint="e.g. submission, help_ticket" maxLength={40} />}
      <TextArea id="ov-reason" name="reason" label="Reason" hint="required · signed" required maxLength={500} rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="ov-witness" name="witness" label="Witness (a second person)" required maxLength={80} />
        <TextField id="ov-inc" name="incident_ref" label="Incident id" hint="optional, e.g. INC-002" maxLength={20} />
      </div>
      <ConfirmByTyping phrase="override">
        {(matched) => (
          <button
            type="submit"
            disabled={!matched || pending}
            className="inline-flex min-h-11 items-center border border-danger px-4 font-plex text-sm text-danger transition-colors hover:bg-danger-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Signing…" : "Apply signed override"}
          </button>
        )}
      </ConfirmByTyping>
      <Result state={state} />
      {r && (
        <p className="font-plex text-xs break-all text-lightgray">
          sha256 {r.digest}
          <br />
          signature {r.signature ?? "none (set RECEIPT_SIGNING_KEY)"}
        </p>
      )}
    </form>
  );
}
