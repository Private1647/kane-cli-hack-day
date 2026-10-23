"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import HumanCameraCheckpoint from "@/components/camera/HumanCameraCheckpoint";
import { choiceAction, profileAction, skipPhotoAction, type ChoiceState, type ProfileState } from "./actions";

// The three /register steps. The server decides which one shows.

export type ProfileDefaults = { name: string; email: string; skills: string; interests: string; github: string; x: string };

export function ProfileStep({ defaults, signedIn, hasPassword }: { defaults: ProfileDefaults; signedIn: boolean; hasPassword: boolean }) {
  const [state, action] = useActionState<ProfileState, FormData>(profileAction, null);
  const v = { ...defaults, ...(state?.values ?? {}) };
  // Remount after each answer so the fields show what was typed (React resets forms after an action).
  const formKey = JSON.stringify(state?.values ?? defaults) + (state?.needsProof ? ":proof" : "");
  return (
    <form key={formKey} action={action} className="space-y-6" data-step="profile">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="r-name">Your name</Label>
          <input id="r-name" name="name" required minLength={2} maxLength={60} autoComplete="name" defaultValue={v.name} className={inputCls} />
        </div>
        <div>
          <Label htmlFor="r-email" hint="The one you used on Luma">
            Email
          </Label>
          <input id="r-email" name="email" type="email" required autoComplete="email" defaultValue={v.email} className={inputCls} />
        </div>
      </div>
      <div>
        <Label htmlFor="r-skills" hint="Comma separated">
          Skills
        </Label>
        <input id="r-skills" name="skills" defaultValue={v.skills} placeholder="react, python, playwright, design" className={inputCls} />
      </div>
      <div>
        <Label htmlFor="r-interests" hint="Comma separated">
          Interests
        </Label>
        <input id="r-interests" name="interests" defaultValue={v.interests} placeholder="agents, testing, voice, dev tools" className={inputCls} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="r-gh" hint="Optional">
            GitHub
          </Label>
          <input id="r-gh" name="github" defaultValue={v.github} placeholder="your-username" autoComplete="off" className={inputCls} />
        </div>
        <div>
          <Label htmlFor="r-x" hint="Optional">
            X
          </Label>
          <input id="r-x" name="x" defaultValue={v.x} placeholder="@handle" autoComplete="off" className={inputCls} />
        </div>
      </div>
      <div>
        <Label htmlFor="r-pw" hint={hasPassword ? "Optional · leave blank to keep yours" : "8+ characters"}>
          {hasPassword ? "New password" : "Choose a password"}
        </Label>
        <input id="r-pw" name="password" type="password" minLength={8} required={!hasPassword && !state?.needsProof} autoComplete="new-password" className={inputCls} />
        <p className="mt-2 font-plex text-xs text-lightgray">So you can sign back in on another device with your email and this password.</p>
      </div>

      {state?.needsProof && !signedIn && <ProofFields />}

      <FormError message={state?.error} />
      <SubmitButton pending="Saving…" className="min-h-11">
        {signedIn ? "Save and continue →" : state?.needsProof ? "Confirm it’s me →" : "Create my profile →"}
      </SubmitButton>
    </form>
  );
}

/** An email that already has an account: prove it's yours, never take it over silently. */
function ProofFields() {
  const [mode, setMode] = useState<"password" | "code">("password");
  return (
    <div className="space-y-4 border border-warning bg-warning-deep p-4" role="group" aria-labelledby="proof-title">
      <p id="proof-title" className="font-plex text-sm text-warning">
        <span aria-hidden="true">◷ </span>
        That email already has an account. Confirm it’s yours to continue.
      </p>
      {mode === "password" ? (
        <div>
          <Label htmlFor="r-proof-pw">Its password</Label>
          <input id="r-proof-pw" name="proof_password" type="password" autoComplete="current-password" required className={inputCls} />
        </div>
      ) : (
        <div>
          <Label htmlFor="r-proof-code" hint="From the check-in desk">
            One-time code
          </Label>
          <input id="r-proof-code" name="proof_code" autoComplete="one-time-code" placeholder="XXXX-XXXX" required className={`${inputCls} uppercase tracking-[0.2em]`} />
        </div>
      )}
      <button type="button" onClick={() => setMode(mode === "password" ? "code" : "password")} className="min-h-11 font-plex text-xs text-bright underline underline-offset-4 hover:text-lime">
        {mode === "password" ? "No password? Use a one-time code from the desk" : "Use the password instead"}
      </button>
    </div>
  );
}

export function PhotoStep({ hasPhoto, avatar }: { hasPhoto: boolean; avatar: string | null }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  return (
    <div className="space-y-6" data-step="photo">
      {hasPhoto && avatar && (
        <div className="flex items-center gap-4 border border-hairline p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, cookie-gated image */}
          <img src={avatar} alt="Your current photo" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
          <p className="font-plex text-sm text-lightgray">This is your current photo. Take a new one below, or keep it.</p>
        </div>
      )}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 font-plex text-sm text-bright">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--lime)]" />
        <span>
          Store my photo as my profile picture
          <span className="mt-1 block text-xs text-lightgray">
            Kept privately for the event and shown to you, your teammates, staff, and (if you join matchmaking) other people looking for a team. Deleted after the event, or when you switch it off on your profile.
          </span>
        </span>
      </label>
      {consent ? (
        <HumanCameraCheckpoint uploadUrl="/api/v1/profile/photo" fields={{ consent: "1" }} onDone={() => router.refresh()} />
      ) : (
        <p className="border border-dashed border-hairline p-4 text-center font-plex text-sm text-lightgray">Tick the box to open the camera. You press the shutter yourself; nothing is recorded before that.</p>
      )}
      <form action={skipPhotoAction} className="flex flex-wrap items-center gap-4 border-t border-dashed border-hairline pt-4">
        <button type="submit" className="inline-flex min-h-11 items-center justify-center border border-hairline px-4 py-2.5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime">
          {hasPhoto ? "Keep this photo →" : "Skip the photo →"}
        </button>
        <p className="font-plex text-xs text-lightgray">Your initials show instead. You can add a photo later from your profile.</p>
      </form>
    </div>
  );
}

export function ChoiceStep() {
  const [state, action] = useActionState<ChoiceState, FormData>(choiceAction, null);
  return (
    <form action={action} className="space-y-6" data-step="choice">
      <fieldset className="space-y-3">
        <legend className="mb-4 font-display text-2xl text-bright">Are you looking to form a team?</legend>
        <Choice value="yes" title="Yes, match me" body="You join the matchmaking pool. People and teams with open seats see your name, photo, skills and interests (never your email). An organizer can also put a team together for you." />
        <Choice value="no" title="No, I have a team (or I’m going solo)" body="Create your team, or join one with an invite code from a teammate. Teams are up to 4 people." />
      </fieldset>
      <FormError message={state?.error} />
      <SubmitButton pending="Saving…" className="min-h-11">
        Continue →
      </SubmitButton>
      <p className="font-plex text-xs text-lightgray">
        Changed your mind later? Switch any time from <Link href="/team" className="underline underline-offset-4 hover:text-lime">your team page</Link>.
      </p>
    </form>
  );
}

function Choice({ value, title, body }: { value: string; title: string; body: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 border border-hairline p-4 transition-colors has-[:checked]:border-lime has-[:checked]:bg-lime-deep">
      <input type="radio" name="looking" value={value} required className="mt-1 h-5 w-5 accent-[var(--lime)]" />
      <span>
        <span className="block font-plex text-sm text-bright">{title}</span>
        <span className="mt-1 block font-plex text-xs leading-relaxed text-lightgray">{body}</span>
      </span>
    </label>
  );
}
