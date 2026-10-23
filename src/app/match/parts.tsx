"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton, inputCls } from "@/components/forms/fields";
import { ActionNote, dangerBtn, smallBtn } from "../team/ui";
import { requestIntroAction, respondIntroAction, withdrawIntroAction, type MatchFormState } from "./actions";

export function RequestIntro({ target, label = "Request intro", kind = "intro" }: { target: { member?: number; team?: number }; label?: string; kind?: "intro" | "collaborate" }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MatchFormState, FormData>(requestIntroAction, null);
  if (state?.ok) return <ActionNote state={state} ok="Request sent. You'll see their answer here." />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={smallBtn}>
        {label} →
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2">
      {target.member && <input type="hidden" name="target_member_id" value={target.member} />}
      {target.team && <input type="hidden" name="target_team_id" value={target.team} />}
      <input type="hidden" name="kind" value={kind} />
      <label className="sr-only" htmlFor={`msg-${target.member ?? target.team}`}>
        Message
      </label>
      <textarea
        id={`msg-${target.member ?? target.team}`}
        name="message"
        maxLength={280}
        rows={2}
        className={inputCls}
        placeholder="Hi! I do CI and Kane suites; want to pair on a release gate? (no emails or phone numbers please)"
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending="Sending…" className="min-h-11">
          Send request
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={smallBtn}>
          Cancel
        </button>
      </div>
      <ActionNote state={state} />
    </form>
  );
}

function Pending({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "…" : children}
    </button>
  );
}

export function IntroButtons({ introId, incoming }: { introId: number; incoming: boolean }) {
  const [state, setState] = useState<MatchFormState>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {incoming ? (
        <>
          <form action={async () => setState(await respondIntroAction(introId, true))}>
            <Pending className={smallBtn}>Accept</Pending>
          </form>
          <form action={async () => setState(await respondIntroAction(introId, false))}>
            <Pending className={dangerBtn}>Decline</Pending>
          </form>
        </>
      ) : (
        <form action={async () => setState(await withdrawIntroAction(introId))}>
          <Pending className={smallBtn}>Withdraw</Pending>
        </form>
      )}
      {state?.ok && typeof state.data === "string" && <p role="status" className="basis-full font-plex text-xs text-lime">{state.data} joined your team.</p>}
      <ActionNote state={state?.ok ? null : state} />
    </div>
  );
}
