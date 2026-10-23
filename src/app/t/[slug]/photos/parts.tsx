"use client";

import { useActionState, useState, useTransition } from "react";
import { FormError, SubmitButton, inputCls } from "@/components/forms/fields";
import PhotoInput, { type PhotoValue } from "@/components/forms/PhotoInput";
import { saveConsent, saveProfile, saveSelfie, saveTeamPhoto, type FormState } from "../actions";

// Editors on the Photos tab for signed-in members. Each photo saves as soon as
// it finishes uploading; handles save with the form.

const initial = (pathname: string | null): PhotoValue => (pathname ? { pathname, preview: `/photos/${pathname}` } : null);

export function TeamPhotoEditor({ slug, pathname, solo }: { slug: string; pathname: string | null; solo: boolean }) {
  return <SavedPhoto kind="group" label={solo ? "Your photo" : "Team photo"} pathname={pathname} save={(p) => saveTeamPhoto(slug, p)} />;
}

export function SelfieEditor({ slug, pathname }: { slug: string; pathname: string | null }) {
  return <SavedPhoto kind="selfie" label="Your selfie" pathname={pathname} save={(p) => saveSelfie(slug, p)} />;
}

function SavedPhoto({ kind, label, pathname, save }: { kind: "group" | "selfie"; label: string; pathname: string | null; save: (p: string | null) => Promise<void> }) {
  const [value, setValue] = useState<PhotoValue>(initial(pathname));
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <PhotoInput
        kind={kind}
        label={label}
        value={value}
        onChange={(v) => {
          const before = value;
          setValue(v);
          setError("");
          start(async () => {
            try {
              await save(v?.pathname ?? null);
            } catch {
              setValue(before);
              setError("Couldn't save. Try again.");
            }
          });
        }}
      />
      <p className="font-plex text-xs text-lightgray">{pending ? "Saving…" : error ? <span className="text-red-300">{error}</span> : value ? "Saved." : ""}</p>
    </div>
  );
}

export function ProfileForm({ slug, linkedin, x }: { slug: string; linkedin: string | null; x: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile.bind(null, slug), null);
  const [li, setLi] = useState(linkedin ?? "");
  const [xh, setXh] = useState(x ? `@${x}` : "");
  return (
    <form action={action} className="space-y-3">
      <input name="linkedin" value={li} onChange={(e) => setLi(e.target.value)} aria-label="LinkedIn profile" placeholder="linkedin.com/in/your-name" className={inputCls} />
      <input name="x" value={xh} onChange={(e) => setXh(e.target.value)} aria-label="X handle" placeholder="@handle" className={inputCls} />
      <FormError message={state?.error} />
      <div className="flex items-center gap-3">
        <SubmitButton pending="Saving…">Save handles</SubmitButton>
        {state?.ok && <span className="font-plex text-xs text-lime">Saved.</span>}
      </div>
    </form>
  );
}

/** One person's own yes/no. null until they answer; either answer can be changed later. */
export function ConsentChoice({ slug, consent, solo, prompt = false }: { slug: string; consent: boolean | null; solo: boolean; prompt?: boolean }) {
  const [value, setValue] = useState(consent);
  const [pending, start] = useTransition();
  const pick = (next: boolean) => {
    const before = value;
    setValue(next);
    start(async () => {
      try {
        await saveConsent(slug, next);
      } catch {
        setValue(before);
      }
    });
  };
  const choice = (v: boolean, label: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => pick(v)}
      aria-pressed={value === v}
      className={`px-4 py-2.5 font-plex text-sm transition-colors disabled:opacity-60 ${
        value === v ? (v ? "bg-lime text-ink" : "bg-bright text-ink") : "border border-hairline text-bright hover:border-lime hover:text-lime"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className={`border p-5 ${value === null ? "border-lime bg-lime-deep" : "border-hairline"}`}>
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">{prompt ? "One question for you" : "Your photo consent"}</p>
      <p className="mt-2 font-plex text-sm text-bright">Can we use photos of you from the day?</p>
      <p className="mt-2 font-plex text-xs leading-relaxed text-lightgray">
        If yes, we match your face against your selfie{solo ? "" : " and the team photo"} to find your shots, send them to this page, and TestMu AI may share
        them on LinkedIn and X tagging you. Face data is used only for this event and deleted afterwards. If no, we never match your face, name or tag you
        {solo ? "" : ", and the team photo isn't used for matching"}. This is your answer only{solo ? "" : "; each teammate answers for themselves"}.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {choice(true, "Yes, include me")}
        {choice(false, "No thanks")}
        <span className="font-plex text-xs text-lightgray">{pending ? "Saving…" : value === null ? "Not answered yet" : "You can change this anytime."}</span>
      </div>
    </div>
  );
}
