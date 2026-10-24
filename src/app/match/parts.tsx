"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton, inputCls } from "@/components/forms/fields";
import { ActionNote, dangerBtn, smallBtn } from "../team/ui";
import Link from "next/link";
import TagInput from "@/components/forms/TagInput";
import { INTEREST_SUGGESTIONS, SKILL_SUGGESTIONS } from "@/data/profile-tags";
import { inviteToTeamAction, requestIntroAction, respondIntroAction, updateMatchProfileAction, withdrawIntroAction, type MatchFormState } from "./actions";

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
      {state?.ok && joinedOf(state.data)?.joined && <p role="status" className="basis-full font-plex text-xs text-lime">{joinedOf(state.data)?.joined} joined your team.</p>}
      {state?.ok && joinedOf(state.data)?.joinedTeam && (
        <p role="status" className="basis-full font-plex text-sm text-lime">
          You joined {joinedOf(state.data)?.joinedTeam}.{" "}
          <Link href="/activate" className="text-bright underline underline-offset-4 hover:text-lime">
            Next: activate →
          </Link>
        </p>
      )}
      <ActionNote state={state?.ok ? null : state} />
    </div>
  );
}

const joinedOf = (d: unknown) => (d && typeof d === "object" ? (d as { joined: string | null; joinedTeam: string | null }) : null);

/** On /team: invite one person from the pool to your team, with an optional note. */
export function InviteToTeam({ memberId, teamName }: { memberId: number; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<MatchFormState, FormData>(inviteToTeamAction.bind(null, memberId), null);
  if (state?.ok) return <p role="status" className="font-plex text-sm text-lime">Invited. They’ll see it on their matchmaking page.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={smallBtn}>
        Invite to {teamName} →
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2">
      <label className="sr-only" htmlFor={`inv-${memberId}`}>
        Note
      </label>
      <textarea id={`inv-${memberId}`} name="message" maxLength={280} rows={2} className={inputCls} placeholder="Optional note: what you're building and why they'd fit (no emails or phone numbers please)" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending="Sending…" className="min-h-11">
          Send invite
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={smallBtn}>
          Cancel
        </button>
      </div>
      <ActionNote state={state} />
    </form>
  );
}

/** Your skills and interests, editable from the pool: more of them means better matches. */
export function MatchProfileForm({ skills, interests }: { skills: string[]; interests: string[] }) {
  const [state, action] = useActionState<MatchFormState, FormData>(updateMatchProfileAction, null);
  return (
    <form key={skills.join() + "|" + interests.join()} action={action} className="space-y-4">
      <div>
        <label htmlFor="mp-skills" className="mb-2 block font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
          Your skills
        </label>
        <TagInput id="mp-skills" name="skills" defaultValue={skills.join(", ")} options={SKILL_SUGGESTIONS} placeholder="Add a skill: ty… → typescript" />
      </div>
      <div>
        <label htmlFor="mp-interests" className="mb-2 block font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
          Your interests
        </label>
        <TagInput id="mp-interests" name="interests" defaultValue={interests.join(", ")} options={INTEREST_SUGGESTIONS} placeholder="Add an interest" />
      </div>
      <SubmitButton pending="Saving…" className="min-h-11">
        Save
      </SubmitButton>
      {state?.ok && <p role="status" className="font-plex text-sm text-lime">Saved. Teams and people now see these.</p>}
      <ActionNote state={state?.ok ? null : state} />
    </form>
  );
}
