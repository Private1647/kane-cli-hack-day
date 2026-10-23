"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Label, SubmitButton, Toggle, inputCls } from "@/components/forms/fields";
import { ActionNote, dangerBtn, smallBtn } from "../team/ui";
import { requestIntroAction, respondIntroAction, saveProfileAction, withdrawIntroAction, type MatchFormState } from "./actions";

export function ProfileForm({
  defaults,
  roles,
  availability,
}: {
  defaults: { discoverable: boolean; skills: string; interests: string; preferred_work: string; availability: string; learning_goals: string; bio: string };
  roles: readonly string[];
  availability: readonly string[];
}) {
  const [state, action] = useActionState<MatchFormState, FormData>(saveProfileAction, null);
  return (
    <form action={action} className="space-y-5">
      <Toggle
        name="discoverable"
        label="Discoverable"
        defaultChecked={defaults.discoverable}
        description="Show my profile to other participants looking for teammates. Your email and phone are never shown; handles only after you accept an intro."
      />
      <div>
        <Label htmlFor="p-skills" hint="Comma separated">
          Strengths
        </Label>
        <input id="p-skills" name="skills" defaultValue={defaults.skills} className={inputCls} placeholder="react, ci, playwright, prompt design" />
      </div>
      <div>
        <Label htmlFor="p-interests" hint="Comma separated">
          Interests
        </Label>
        <input id="p-interests" name="interests" defaultValue={defaults.interests} className={inputCls} placeholder="agents, release gates, mobile" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-role">Preferred work</Label>
          <select key={defaults.preferred_work} id="p-role" name="preferred_work" defaultValue={defaults.preferred_work} className={`${inputCls} min-h-11`}>
            <option value="">No preference</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.replace("-", " / ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="p-avail">Availability</Label>
          <select key={defaults.availability} id="p-avail" name="availability" defaultValue={defaults.availability} className={`${inputCls} min-h-11`}>
            <option value="">Not set</option>
            {availability.map((a) => (
              <option key={a} value={a}>
                {a.replace("-", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="p-learn" hint="Optional">
          Want to learn
        </Label>
        <input id="p-learn" name="learning_goals" defaultValue={defaults.learning_goals} maxLength={280} className={inputCls} placeholder="Kane assurance suites, mobile emulators" />
      </div>
      <div>
        <Label htmlFor="p-bio" hint="Optional · public to opted-in people">
          One line about you
        </Label>
        <textarea id="p-bio" name="bio" defaultValue={defaults.bio} maxLength={280} rows={2} className={inputCls} />
      </div>
      <ActionNote state={state} ok="Profile saved." />
      <SubmitButton pending="Saving…" className="min-h-11">
        Save profile
      </SubmitButton>
    </form>
  );
}

/** "Request intro": a short optional note, then the server records a proposal. */
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
      <ActionNote state={state?.ok ? null : state} />
    </div>
  );
}
