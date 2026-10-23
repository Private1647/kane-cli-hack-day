"use client";

import { useActionState, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import PhotoInput, { type PhotoValue } from "@/components/forms/PhotoInput";
import { checkName, register, type RegisterState } from "./actions";

// Registration in short steps: the team, you (the captain), your teammates,
// the team photo, and a password. Every step stays mounted (inactive ones are
// hidden) and the fields the server reads are hidden inputs kept in sync with
// state, so one form posts everything and nothing is lost between steps.
//
// Consent is personal: the captain answers for themselves here; teammates are
// asked when they open the team page.

type Person = { name: string; email: string; linkedin: string; x: string; photo: PhotoValue; extras: boolean };
const blank = (): Person => ({ name: "", email: "", linkedin: "", x: "", photo: null, extras: false });

type StepId = "team" | "you" | "teammates" | "photo" | "finish";
const LABELS: Record<StepId, string> = { team: "Team", you: "You", teammates: "Teammates", photo: "Photo", finish: "Finish" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// What people type after the fixed "linkedin.com/in/" and "@" prefixes. Full URLs are accepted too.
const LINKEDIN_SLUG = /^[\w\-%.]+\/?$/;
const LINKEDIN_URL = /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/(in|company)\/[\w\-%.]+\/?$/i;
const XHANDLE = /^((https?:\/\/)?(www\.)?(x|twitter)\.com\/)?@?\w{1,15}\/?$/i;

/** The value the server gets: a bare LinkedIn slug becomes in/<slug>, which it normalises to a full URL. */
const linkedinValue = (v: string) => {
  const t = v.trim();
  return !t || LINKEDIN_URL.test(t) ? t : `in/${t.replace(/\/$/, "")}`;
};

export default function RegisterForm({ tracks, maxMembers }: { tracks: string[]; maxMembers: number }) {
  const [state, action] = useActionState<RegisterState, FormData>(register, null);
  const [mode, setMode] = useState<"team" | "solo">("team");
  const solo = mode === "solo";
  const steps: StepId[] = solo ? ["team", "you", "photo", "finish"] : ["team", "you", "teammates", "photo", "finish"];

  const [at, setAt] = useState<StepId>("team");
  const [reached, setReached] = useState<Set<StepId>>(new Set(["team"]));
  const [stepError, setStepError] = useState("");
  const top = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [track, setTrack] = useState("");
  const [idea, setIdea] = useState("");
  const [me, setMe] = useState<Person>(blank());
  const [mates, setMates] = useState<Person[]>([blank()]);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [teamPhoto, setTeamPhoto] = useState<PhotoValue>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nameCheck, setNameCheck] = useState<{ slug: string; taken: boolean } | null>(null);

  // Debounced availability check for the slug.
  useEffect(() => {
    if (!name.trim()) return;
    let live = true;
    const t = setTimeout(() => {
      checkName(name).then((r) => live && setNameCheck(r));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name]);

  // Teammate rows left completely empty are ignored rather than flagged.
  const filledMates = solo ? [] : mates.filter((m) => m.name.trim() || m.email.trim());
  const everyone = [me, ...filledMates];
  const updateMate = (i: number, patch: Partial<Person>) => setMates((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  function personProblem(p: Person, who: string) {
    if (!p.name.trim()) return `${who} needs a name.`;
    if (!EMAIL.test(p.email.trim())) return `Enter a valid email for ${p.name.trim() || who}.`;
    const li = p.linkedin.trim();
    if (li && !LINKEDIN_URL.test(li) && !LINKEDIN_SLUG.test(li)) return "That LinkedIn doesn't look right. Paste your profile URL or just the part after /in/.";
    if (p.x.trim() && !XHANDLE.test(p.x.trim())) return "That X handle doesn't look right. Use letters, numbers and _ (up to 15).";
    return "";
  }

  /** The first problem on a step, mirroring the server's checks; "" when the step is fine. */
  function problem(s: StepId): string {
    if (s === "team") {
      if (name.trim().length < 2) return `Give your ${solo ? "project" : "team"} a name (2 to 40 characters).`;
      if (nameCheck?.taken && nameCheck.slug) return "That name is taken. Try another.";
      if (!track) return "Pick a track.";
      if (idea.trim().length < 5) return "Give a one-line idea (at least 5 characters).";
    }
    if (s === "you") {
      const p = personProblem(me, "You");
      if (p) return p.replace("You needs", "You need");
      if (consent === null) return "Answer the photo question: yes or no are both fine.";
    }
    if (s === "teammates") {
      for (const [i, m] of filledMates.entries()) {
        const p = personProblem(m, `Teammate ${i + 1}`);
        if (p) return p;
      }
      const names = everyone.map((m) => m.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) return "Everyone needs a different name so each person can pick theirs.";
      const emails = everyone.map((m) => m.email.trim().toLowerCase());
      if (new Set(emails).size !== emails.length) return "Each person needs their own email.";
      if (everyone.length > maxMembers) return `Teams can have up to ${maxMembers} people.`;
    }
    if (s === "finish") {
      if (password.length < 4) return "Team password needs at least 4 characters.";
      if (password !== confirm) return "Passwords don't match.";
    }
    return "";
  }

  const index = steps.indexOf(at);

  function go(to: StepId) {
    const target = steps.indexOf(to);
    // Moving forward checks every step on the way; moving back is always fine.
    for (let i = index; i < target; i++) {
      const p = problem(steps[i]);
      if (p) {
        setAt(steps[i]);
        setStepError(p);
        return;
      }
    }
    setStepError("");
    setAt(to);
    setReached((r) => new Set([...r, ...steps.slice(0, target + 1)]));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const next = () => go(steps[index + 1]);
  const back = () => go(steps[index - 1]);

  // Enter moves to the next step instead of submitting half a form.
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && at !== "finish" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      next();
    }
  }

  const nextLabel =
    at === "teammates" && !filledMates.length ? "Skip, I'll add them later →" : at === "photo" && !teamPhoto ? "Skip for now →" : "Next →";

  return (
    <div ref={top} className="scroll-mt-28">
      <Stepper steps={steps} at={at} reached={reached} onPick={go} />

      <form
        action={action}
        noValidate
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          const bad = steps.find((s) => problem(s));
          if (bad) {
            e.preventDefault();
            setAt(bad);
            setStepError(problem(bad));
          }
        }}
        className="mt-10"
      >
        {/* What the server reads. Visible inputs below have no name. */}
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="track" value={track} />
        <input type="hidden" name="idea" value={idea} />
        <input type="hidden" name="teamPhoto" value={teamPhoto?.pathname ?? ""} />
        {consent && <input type="hidden" name="consentSocial" value="on" />}
        {everyone.map((p, i) => (
          <span key={i} hidden>
            <input type="hidden" name="memberName" value={p.name} />
            <input type="hidden" name="memberEmail" value={p.email} />
            <input type="hidden" name="memberPhoto" value={p.photo?.pathname ?? ""} />
            <input type="hidden" name="memberLinkedin" value={linkedinValue(p.linkedin)} />
            <input type="hidden" name="memberX" value={p.x.trim()} />
          </span>
        ))}

        {/* Team */}
        <Panel active={at === "team"} title="Let's set up your page" hint="Takes about two minutes. You get a page at your own URL where your team logs progress.">
          <div className="grid grid-cols-2 gap-3">
            {(["team", "solo"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`brackets border p-4 text-left transition-colors ${mode === m ? "border-lime bg-lime-deep" : "border-hairline hover:border-lightgray"}`}
              >
                <span className={`block font-plex text-sm ${mode === m ? "text-lime" : "text-bright"}`}>{m === "team" ? "We're a team" : "I'm solo"}</span>
                <span className="mt-1 block font-plex text-xs text-lightgray">{m === "team" ? `2 to ${maxMembers} people, one page` : "Just you, same prizes"}</span>
              </button>
            ))}
          </div>

          <div>
            <Label htmlFor="name">{solo ? "Project or handle name" : "Team name"}</Label>
            <input
              id="name"
              maxLength={40}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!e.target.value.trim()) setNameCheck(null);
              }}
              placeholder="Byte Me"
              className={inputCls}
              autoComplete="off"
              autoFocus
            />
            <p className={`mt-2 min-h-4 font-plex text-xs ${nameCheck?.taken ? "text-red-300" : "text-lightgray"}`}>
              {nameCheck?.slug && (
                <>
                  {nameCheck.taken ? "Taken. " : "Your page: "}
                  <span className={nameCheck.taken ? "" : "text-lime"}>/t/{nameCheck.slug}</span>
                </>
              )}
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Track</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Track">
              {tracks.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={track === t}
                  onClick={() => setTrack(t)}
                  className={`border px-3 py-2 font-plex text-sm transition-colors ${track === t ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lightgray"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <Label htmlFor="idea" hint={`${idea.length}/200`}>
              One-line idea
            </Label>
            <input id="idea" maxLength={200} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A voice agent that books and Kane-tests itself" className={inputCls} />
            <p className="mt-2 font-plex text-xs text-lightgray">Rough is fine. You can change direction until idea lock at noon.</p>
          </div>
        </Panel>

        {/* You */}
        <Panel active={at === "you"} title="Now you" hint={solo ? undefined : "You're the captain. You'll add your teammates next."}>
          <PhotoInput kind="selfie" variant="avatar" label="your selfie" value={me.photo} onChange={(photo) => setMe((p) => ({ ...p, photo }))} hint="Optional. Helps us find you in photos." />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="me-name">Full name</Label>
              <input id="me-name" maxLength={40} value={me.name} onChange={(e) => setMe((p) => ({ ...p, name: e.target.value }))} placeholder="Ada Lovelace" autoComplete="name" className={inputCls} />
            </div>
            <div>
              <Label htmlFor="me-email">Email</Label>
              <input
                id="me-email"
                type="email"
                value={me.email}
                onChange={(e) => setMe((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputCls}
              />
            </div>
          </div>
          <p className="-mt-3 font-plex text-xs text-lightgray">Use the email you registered with at testmuai.com. OpenAI credits and KaneAI Pro are matched by it.</p>

          <Socials person={me} onChange={(patch) => setMe((p) => ({ ...p, ...patch }))} idPrefix="me" />

          <fieldset>
            <legend className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Photos from the day</legend>
            <p className="mb-3 max-w-xl font-plex text-sm text-bright">Can we use photos of you?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice on={consent === true} onClick={() => setConsent(true)} title="Yes, include me">
                We match your face to find your shots, send them to your page, and TestMu AI may post them on LinkedIn and X tagging you.
              </Choice>
              <Choice on={consent === false} onClick={() => setConsent(false)} title="No thanks">
                We never match your face, and won&apos;t name or tag you in posts.
              </Choice>
            </div>
            <p className="mt-3 font-plex text-xs text-lightgray">
              This is your answer only{solo ? "" : "; each teammate gets asked when they open the team page"}. Face data is used only for this event and deleted
              afterwards. You can change your answer anytime.
            </p>
          </fieldset>
        </Panel>

        {/* Teammates */}
        {!solo && (
          <Panel active={at === "teammates"} title="Who else is on the team?" hint="Just names and emails. Everyone adds their own selfie, handles and photo consent when they open the team page.">
            <ol className="space-y-2">
              {mates.map((m, i) => (
                <li key={i} className="border border-hairline bg-surface">
                  <div className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 p-2 pl-3 sm:grid-cols-[1.5rem_1fr_1.3fr_auto]">
                    <span className="font-pixel text-[10px] text-lightgray">{String(i + 2).padStart(2, "0")}</span>
                    <input
                      aria-label={`Teammate ${i + 1} name`}
                      maxLength={40}
                      value={m.name}
                      onChange={(e) => updateMate(i, { name: e.target.value })}
                      placeholder="Name"
                      className={`${inputCls} border-transparent bg-transparent focus:border-lime`}
                    />
                    <input
                      type="email"
                      aria-label={`Teammate ${i + 1} email`}
                      value={m.email}
                      onChange={(e) => updateMate(i, { email: e.target.value })}
                      placeholder="their@email.com"
                      className={`${inputCls} col-span-2 col-start-2 border-transparent bg-transparent focus:border-lime sm:col-span-1 sm:col-start-auto`}
                    />
                    <button
                      type="button"
                      onClick={() => setMates((ms) => (ms.length > 1 ? ms.filter((_, j) => j !== i) : [blank()]))}
                      aria-label={`Remove teammate ${i + 1}`}
                      className="col-start-3 row-start-1 grid h-9 w-9 place-items-center text-lightgray transition-colors hover:text-red-300 sm:col-start-4"
                    >
                      ×
                    </button>
                  </div>
                  {m.extras ? (
                    <div className="space-y-4 border-t border-dashed border-hairline p-4">
                      <PhotoInput
                        kind="selfie"
                        variant="avatar"
                        label={`${m.name || "teammate"}'s selfie`}
                        value={m.photo}
                        onChange={(photo) => updateMate(i, { photo })}
                        hint="Only with their OK. Their photo is used once they say yes on the team page."
                      />
                      <Socials person={m} onChange={(patch) => updateMate(i, patch)} idPrefix={`mate-${i}`} />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateMate(i, { extras: true })}
                      className="w-full border-t border-dashed border-hairline px-4 py-2 text-left font-plex text-xs text-lightgray transition-colors hover:text-lime"
                    >
                      + Add their photo and socials (optional)
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {mates.length + 1 < maxMembers && (
              <button
                type="button"
                onClick={() => setMates((ms) => [...ms, blank()])}
                className="w-full border border-dashed border-hairline px-4 py-3 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime"
              >
                + Add another teammate · {mates.length + 1}/{maxMembers}
              </button>
            )}
          </Panel>
        )}

        {/* Photo */}
        <Panel
          active={at === "photo"}
          title={solo ? "A photo of you" : "A photo of the team"}
          hint={
            solo
              ? "Photographers shoot all day. A clear photo is how we find your shots and send them to your page."
              : "Photographers shoot all day. One clear photo of everyone together helps us find your shots. It's only used for matching once everyone in it has said yes."
          }
        >
          <PhotoInput kind="group" label={`${name || "Team"} photo`} value={teamPhoto} onChange={setTeamPhoto} hint={solo ? undefined : "Not together yet? Skip it and add it from your team page."} />
          <ul className="grid gap-2 font-plex text-xs text-lightgray sm:grid-cols-3">
            <li className="border-l border-hairline pl-3">Everyone in frame, faces visible</li>
            <li className="border-l border-hairline pl-3">Light in front of you, not behind</li>
            <li className="border-l border-hairline pl-3">No sunglasses or hats</li>
          </ul>
        </Panel>

        {/* Finish */}
        <Panel active={at === "finish"} title="Last thing: a password" hint={`A simple shared password. ${solo ? "You use" : "Your teammates use"} it to open your page.`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              name="password"
              aria-label="Team password"
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={inputCls}
              autoComplete="new-password"
            />
            <input
              type="password"
              name="confirm"
              aria-label="Confirm team password"
              minLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              className={inputCls}
              autoComplete="new-password"
            />
          </div>

          <div className="border-t border-dashed border-hairline pt-6">
            <p className="mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Check it over</p>
            <dl className="divide-y divide-dashed divide-hairline border-y border-dashed border-hairline font-plex text-sm">
              <Summary label={solo ? "Project" : "Team"} onEdit={() => go("team")}>
                <span className="text-bright">{name.trim() || "—"}</span>
                <span className="text-lightgray"> · {track || "no track"}</span>
                {idea.trim() && <span className="mt-1 block text-xs text-lightgray">{idea.trim()}</span>}
              </Summary>
              <Summary label="You" onEdit={() => go("you")}>
                <span className="text-bright">{me.name.trim() || "—"}</span>
                <span className="mt-1 block text-xs text-lightgray">
                  {me.photo ? "Selfie added" : "No selfie"} · photos {consent ? "yes" : consent === false ? "no" : "not answered"}
                </span>
              </Summary>
              {!solo && (
                <Summary label="People" onEdit={() => go("teammates")}>
                  <span className={filledMates.length ? "text-bright" : "text-lightgray"}>
                    {filledMates.map((m) => m.name.trim()).join(", ") || "No teammates yet, add them later"}
                  </span>
                </Summary>
              )}
              <Summary label="Photo" onEdit={() => go("photo")}>
                <span className={teamPhoto ? "text-bright" : "text-lightgray"}>{teamPhoto ? "Added" : "Skipped, add it later"}</span>
              </Summary>
            </dl>
          </div>
        </Panel>

        {/* Navigation */}
        <div className="mt-8 space-y-4">
          <FormError message={stepError || state?.error} />
          <div className="flex items-center justify-between gap-4 border-t border-dashed border-hairline pt-6">
            {index > 0 ? (
              <button type="button" onClick={back} className="font-plex text-sm text-lightgray transition-colors hover:text-bright">
                ← Back
              </button>
            ) : (
              <span />
            )}
            {at === "finish" ? (
              <SubmitButton pending="Registering…">Register {solo ? "solo" : "team"} →</SubmitButton>
            ) : (
              <button type="button" onClick={next} className="inline-flex items-center gap-2 bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
                {nextLabel}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function Socials({ person, onChange, idPrefix }: { person: Person; onChange: (patch: Partial<Person>) => void; idPrefix: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-li`} hint="optional">
          LinkedIn
        </Label>
        <Prefixed prefix="linkedin.com/in/">
          <input
            id={`${idPrefix}-li`}
            value={person.linkedin}
            onChange={(e) => onChange({ linkedin: e.target.value })}
            placeholder="your-name"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2.5 pr-3 font-plex text-sm text-bright outline-none placeholder:text-lightgray/60"
          />
        </Prefixed>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-x`} hint="optional">
          X / Twitter
        </Label>
        <Prefixed prefix="@">
          <input
            id={`${idPrefix}-x`}
            value={person.x}
            onChange={(e) => onChange({ x: e.target.value.replace(/^@/, "") })}
            placeholder="handle"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2.5 pr-3 font-plex text-sm text-bright outline-none placeholder:text-lightgray/60"
          />
        </Prefixed>
      </div>
    </div>
  );
}

function Prefixed({ prefix, children }: { prefix: string; children: ReactNode }) {
  return (
    <div className="flex items-center border border-hairline bg-surface transition-colors focus-within:border-lime">
      <span className="select-none pl-3 font-plex text-sm text-lightgray">{prefix}</span>
      {children}
    </div>
  );
}

function Choice({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex flex-col justify-start border p-4 text-left transition-colors ${on ? "border-lime bg-lime-deep" : "border-hairline hover:border-lightgray"}`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className={`grid h-4 w-4 place-items-center rounded-full border ${on ? "border-lime" : "border-lightgray"}`}>
          {on && <span className="h-2 w-2 rounded-full bg-lime" />}
        </span>
        <span className={`font-plex text-sm ${on ? "text-lime" : "text-bright"}`}>{title}</span>
      </span>
      <span className="mt-2 block font-plex text-xs leading-relaxed text-lightgray">{children}</span>
    </button>
  );
}

function Stepper({ steps, at, reached, onPick }: { steps: StepId[]; at: StepId; reached: Set<StepId>; onPick: (s: StepId) => void }) {
  return (
    <nav aria-label="Registration steps">
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const state = s === at ? "now" : reached.has(s) ? "done" : "todo";
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!reached.has(s)}
                onClick={() => onPick(s)}
                aria-current={s === at ? "step" : undefined}
                className="group block w-full text-left disabled:cursor-default"
              >
                <span className={`block h-0.5 transition-colors ${state === "todo" ? "bg-hairline" : "bg-lime"}`} />
                <span className="mt-3 flex items-baseline gap-2">
                  <span className={`font-pixel text-[10px] tracking-[0.2em] ${state === "todo" ? "text-hairline" : "text-lime"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span
                    className={`hidden font-plex text-xs sm:inline sm:text-sm ${state === "now" ? "text-bright" : state === "done" ? "text-lightgray group-hover:text-bright" : "text-hairline"}`}
                  >
                    {LABELS[s]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 font-plex text-xs text-lightgray sm:hidden">
        Step {steps.indexOf(at) + 1} of {steps.length} · <span className="text-bright">{LABELS[at]}</span>
      </p>
    </nav>
  );
}

function Panel({ active, title, hint, children }: { active: boolean; title: string; hint?: string; children: ReactNode }) {
  return (
    <section hidden={!active} className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-2xl text-bright sm:text-3xl">{title}</h2>
        {hint && <p className="mt-2 max-w-xl font-plex text-sm text-lightgray">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Summary({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <dt className="w-16 shrink-0 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
      <button type="button" onClick={onEdit} className="font-plex text-xs text-lightgray underline decoration-hairline underline-offset-4 hover:text-lime">
        Edit
      </button>
    </div>
  );
}
