"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FormError, Label, SubmitButton, Toggle, inputCls } from "@/components/forms/fields";
import CopyField from "@/components/ui/CopyField";
import {
  advanceStateAction,
  createInviteAction,
  createTeamAction,
  joinTeamAction,
  leaveTeamAction,
  overrideAction,
  removeMemberAction,
  revokeInviteAction,
  transferCaptainAction,
  updateSettingsAction,
  type InviteFormState,
  type TeamFormState,
} from "./actions";
import { ActionNote, dangerBtn, smallBtn } from "./ui";

export function CreateTeamForm({ tracks, idempotencyKey }: { tracks: string[]; idempotencyKey: string }) {
  const [state, action] = useActionState<TeamFormState, FormData>(createTeamAction, null);
  const [solo, setSolo] = useState(false);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <div>
        <Label htmlFor="team-name" hint="Becomes your page address">
          Team name
        </Label>
        <input id="team-name" name="name" required maxLength={60} autoComplete="off" className={inputCls} placeholder="Release Gate Crew" />
      </div>
      <div>
        <Label htmlFor="team-track">Track</Label>
        <select id="team-track" name="track" required defaultValue="" className={`${inputCls} min-h-11`}>
          <option value="" disabled>
            Pick a track
          </option>
          {tracks.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="border-y border-dashed border-hairline py-2">
        <Toggle name="solo" label="Going solo" description="You can still accept an invite-holder later; a teammate joining turns this into a team." checked={solo} onChange={setSolo} />
        <Toggle
          name="recruiting_open"
          label="Recruiting"
          description="List the team in the matchmaker with its open seats. Only the team name, track and public summary are shown."
          disabled={solo}
        />
      </div>
      <div>
        <Label htmlFor="team-summary" hint="Optional · public">
          Public summary
        </Label>
        <textarea id="team-summary" name="summary_public" maxLength={280} rows={3} className={inputCls} placeholder="What you're building and who you're looking for. Shown to other participants. Keep the details of your idea private." />
      </div>
      <div>
        <Label htmlFor="team-password" hint="Optional · 8+ characters">
          Shared-device password
        </Label>
        <input id="team-password" name="password" type="password" autoComplete="new-password" minLength={8} className={inputCls} />
        <p className="mt-2 font-plex text-xs text-lightgray">Lets teammates open the hub on a shared laptop with the team name and this password. Invites work without it.</p>
      </div>
      <ActionNote state={state} />
      <SubmitButton pending="Creating…" className="min-h-11">
        Create team →
      </SubmitButton>
    </form>
  );
}

export function ConfirmJoinForm({ code, teamName, idempotencyKey, switching }: { code: string; teamName: string; idempotencyKey: string; switching: string | null }) {
  const [state, action] = useActionState<TeamFormState, FormData>(joinTeamAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <label className="flex min-h-11 cursor-pointer items-start gap-3 font-plex text-sm text-bright">
        <input type="checkbox" name="confirm" required className="mt-1 h-5 w-5 accent-[var(--lime)]" />
        <span>
          Yes, I want to join <span className="text-lime">{teamName}</span>
          {switching && <span className="block text-xs text-lightgray">This moves you out of {switching}.</span>}
        </span>
      </label>
      <ActionNote state={state} />
      <SubmitButton pending="Joining…" className="min-h-11">
        Join team →
      </SubmitButton>
    </form>
  );
}

export function InviteForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<InviteFormState, FormData>(createInviteAction.bind(null, slug), null);
  const invite = state?.ok ? state.data : null;
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <Label htmlFor="inv-hours">Expires after</Label>
          <select id="inv-hours" name="hours" defaultValue="24" className={`${inputCls} min-h-11`}>
            <option value="2">2 hours</option>
            <option value="8">8 hours</option>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
          </select>
        </div>
        <div>
          <Label htmlFor="inv-for" hint="Optional">
            Only for P-code
          </Label>
          <input id="inv-for" name="for_code" placeholder="P-1234" autoComplete="off" className={inputCls} />
        </div>
        <SubmitButton pending="Creating…" className="min-h-11">
          New invite
        </SubmitButton>
      </form>
      {state && !state.ok && <ActionNote state={state} />}
      {invite && <InviteReveal code={invite.code} path={invite.joinPath} expiresAt={invite.expiresAt} />}
    </div>
  );
}

function InviteReveal({ code, path, expiresAt }: { code: string; path: string; expiresAt: string }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="brackets border border-lime bg-lime-deep p-4" role="status">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">Invite code · shown once</p>
      <p className="mt-2 font-dots text-4xl leading-none font-black text-bright">{code}</p>
      <p className="mt-2 font-plex text-xs text-lightgray">
        One use. Expires {new Date(expiresAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. Send it privately; whoever uses it joins your team.
      </p>
      <CopyField value={`${origin}${path}`} className="mt-3" />
    </div>
  );
}

export function RevokeInviteButton({ slug, inviteId }: { slug: string; inviteId: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async () => {
        const r = await revokeInviteAction(slug, inviteId);
        setError(r.ok ? null : r.error.message);
      }}
    >
      <PendingButton className={smallBtn}>Revoke</PendingButton>
      <FormError message={error} />
    </form>
  );
}

function PendingButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "…" : children}
    </button>
  );
}

export function SettingsForm({
  slug,
  defaults,
  locked,
}: {
  slug: string;
  defaults: { recruiting_open: boolean; summary_public: string; table_label: string; repo_url: string; seeking_skills: string };
  locked: boolean;
}) {
  const [state, action] = useActionState<TeamFormState, FormData>(updateSettingsAction.bind(null, slug), null);
  return (
    <form action={action} className="space-y-5">
      <Toggle
        name="recruiting_open"
        label="Recruiting"
        defaultChecked={defaults.recruiting_open && !locked}
        disabled={locked}
        description={locked ? "The roster is locked, so the team is no longer listed." : "List the team in the matchmaker with its open seats."}
      />
      <div>
        <Label htmlFor="s-seeking" hint="Comma separated">
          Skills you&apos;re looking for
        </Label>
        <input id="s-seeking" name="seeking_skills" defaultValue={defaults.seeking_skills} className={inputCls} placeholder="ci, playwright, mobile" />
      </div>
      <div>
        <Label htmlFor="s-summary" hint="Public">
          Public summary
        </Label>
        <textarea id="s-summary" name="summary_public" defaultValue={defaults.summary_public} maxLength={280} rows={3} className={inputCls} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="s-table">Table</Label>
          <input id="s-table" name="table_label" defaultValue={defaults.table_label} maxLength={24} className={inputCls} placeholder="B4" />
        </div>
        <div>
          <Label htmlFor="s-repo" hint="https://">
            Repository
          </Label>
          <input id="s-repo" name="repo_url" type="url" defaultValue={defaults.repo_url} className={inputCls} placeholder="https://github.com/you/project" />
        </div>
      </div>
      <ActionNote state={state} ok="Team settings saved." />
      <SubmitButton pending="Saving…" className="min-h-11">
        Save settings
      </SubmitButton>
    </form>
  );
}

export function RosterButtons({ slug, memberId, name }: { slug: string; memberId: number; name: string }) {
  const [rm, rmAction] = useActionState<TeamFormState, FormData>(removeMemberAction.bind(null, slug, memberId), null);
  const [cap, capAction] = useActionState<TeamFormState, FormData>(transferCaptainAction.bind(null, slug, memberId), null);
  // An in-page confirm step rather than window.confirm(), so it can't be skipped silently.
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={capAction}>
        <PendingButton className={smallBtn}>Make captain</PendingButton>
      </form>
      {asking ? (
        <form action={rmAction} role="alertdialog" aria-label={`Remove ${name}?`} className="flex flex-wrap items-center gap-2">
          <span className="font-plex text-xs text-warning">Remove {name} from the team?</span>
          <PendingButton className={dangerBtn}>Yes, remove</PendingButton>
          <button type="button" onClick={() => setAsking(false)} className={smallBtn}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={dangerBtn}>
          Remove
        </button>
      )}
      <div className="basis-full">
        <ActionNote state={rm?.ok ? null : rm} />
        <ActionNote state={cap?.ok ? null : cap} />
      </div>
    </div>
  );
}

export function AdvanceStateButton({ slug, to, label }: { slug: string; to: "formed" | "active"; label: string }) {
  const [state, action] = useActionState<TeamFormState, FormData>(advanceStateAction.bind(null, slug, to), null);
  return (
    <form action={action} className="space-y-2">
      <PendingButton className={smallBtn}>{label}</PendingButton>
      <ActionNote state={state} ok="Team state updated." />
    </form>
  );
}

export function LeaveTeamForm({ teamName }: { teamName: string }) {
  const [state, action] = useActionState<TeamFormState, FormData>(leaveTeamAction, null);
  return (
    <form action={action} className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 font-plex text-sm text-bright">
        <input type="checkbox" name="confirm" required className="mt-1 h-5 w-5 accent-[var(--lime)]" />
        <span>I want to leave {teamName}. My personal registration stays.</span>
      </label>
      <ActionNote state={state} />
      <PendingButton className={dangerBtn}>Leave team</PendingButton>
    </form>
  );
}

const OVERRIDES = [
  { id: "add_member", label: "Add a participant (by P-code)" },
  { id: "remove_member", label: "Remove a member" },
  { id: "set_captain", label: "Change captain" },
  { id: "reopen_roster", label: "Reopen the roster" },
  { id: "lock_roster", label: "Lock the roster now" },
  { id: "set_max_size", label: "Change team size" },
] as const;

export function OverrideForm({ slug, members }: { slug: string; members: { id: number; name: string }[] }) {
  const [state, action] = useActionState<TeamFormState, FormData>(overrideAction.bind(null, slug), null);
  const [kind, setKind] = useState<(typeof OVERRIDES)[number]["id"]>("add_member");
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="ov-action">Change</Label>
        <select id="ov-action" name="action" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${inputCls} min-h-11`}>
          {OVERRIDES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {kind === "add_member" && (
        <div>
          <Label htmlFor="ov-code">Participant P-code</Label>
          <input id="ov-code" name="member_code" required placeholder="P-1234" className={inputCls} />
        </div>
      )}
      {(kind === "remove_member" || kind === "set_captain") && (
        <div>
          <Label htmlFor="ov-member">Member</Label>
          <select id="ov-member" name="member_id" required defaultValue="" className={`${inputCls} min-h-11`}>
            <option value="" disabled>
              Pick a member
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === "set_max_size" && (
        <div>
          <Label htmlFor="ov-size">Team size (1–4)</Label>
          <input id="ov-size" name="max_size" type="number" min={1} max={4} required className={inputCls} />
        </div>
      )}
      <div>
        <Label htmlFor="ov-reason" hint="Required · goes in the audit log">
          Reason
        </Label>
        <textarea id="ov-reason" name="reason" required minLength={10} maxLength={500} rows={2} className={inputCls} placeholder="e.g. Walk-in admitted at 11:20, captain asked at the desk" />
      </div>
      <ActionNote state={state} ok="Override applied and audited." />
      <SubmitButton pending="Applying…" className="min-h-11">
        Apply override
      </SubmitButton>
    </form>
  );
}
