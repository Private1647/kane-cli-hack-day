"use client";

import { useActionState } from "react";
import { ConfirmByTyping, FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import { awardAction, demoQueueAction, lockAction, reopenAction, type OpsJudgingState } from "./actions";

function Result({ state }: { state: OpsJudgingState }) {
  return (
    <>
      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="font-plex text-sm text-bright">
          {state.ok}
        </p>
      )}
    </>
  );
}

export function LockForm({ phrase, drafts }: { phrase: string; drafts: number }) {
  const [state, action] = useActionState<OpsJudgingState, FormData>(lockAction, null);
  return (
    <form action={action} className="max-w-md space-y-3">
      <p className="font-plex text-sm text-lightgray">
        Locking ends all scoring. Committed scores are already frozen
        {drafts > 0 ? `; ${drafts} uncommitted draft${drafts === 1 ? "" : "s"} will be left out of the results` : ""}. Awards can be recorded only after the lock.
      </p>
      <ConfirmByTyping phrase={phrase}>
        {(matched) => (
          <button
            type="submit"
            disabled={!matched}
            className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:cursor-not-allowed disabled:opacity-40"
          >
            Lock judging
          </button>
        )}
      </ConfirmByTyping>
      <Result state={state} />
    </form>
  );
}

export function ReopenForm() {
  const [state, action] = useActionState<OpsJudgingState, FormData>(reopenAction, null);
  return (
    <form action={action} className="max-w-md space-y-3">
      <Label htmlFor="reopen-reason" hint="audited">
        Reason to reopen
      </Label>
      <input id="reopen-reason" name="reason" required maxLength={500} className={inputCls} />
      <SubmitButton pending="Reopening…" className="min-h-11">
        Reopen judging
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function DemoQueueForm({ options, suggested, slots }: { options: { id: number; label: string }[]; suggested: number[]; slots: number }) {
  const [state, action] = useActionState<OpsJudgingState, FormData>(demoQueueAction, null);
  return (
    <form action={action} className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: slots }, (_, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-6 font-dots text-2xl leading-none font-black text-bright">{i + 1}</span>
            <select name="slot" aria-label={`Demo slot ${i + 1}`} defaultValue={suggested[i] ?? ""} className={`${inputCls} min-h-11`}>
              <option value="">— empty —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
      <SubmitButton pending="Confirming…" className="min-h-11">
        Confirm demo queue
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function AwardForm({ awards, options }: { awards: string[]; options: { id: number; label: string }[] }) {
  const [state, action] = useActionState<OpsJudgingState, FormData>(awardAction, null);
  return (
    <form action={action} className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <Label htmlFor="award-name">Award</Label>
        <select id="award-name" name="award" className={`${inputCls} min-h-11`}>
          {awards.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="award-team">Team</Label>
        <select id="award-team" name="submission_id" className={`${inputCls} min-h-11`}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pending="Saving…" className="min-h-11">
        Record award
      </SubmitButton>
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
    </form>
  );
}
