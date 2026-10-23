"use client";

import { useActionState, useState, useTransition } from "react";
import { ConfirmByTyping, FormError, Toggle } from "@/components/forms/fields";
import { creditConsentAction, finalizeAction, preflightAction, showcaseStateAction } from "./actions";

// Small client islands for the submit tab: preflight, finalize, the team's
// showcase mode and each person's own credit consent.

const btn =
  "inline-flex min-h-11 items-center justify-center px-4 font-plex text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function PreflightButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(preflightAction.bind(null, slug), null);
  return (
    <form action={action} className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-plex text-xs text-lightgray">
        <input type="checkbox" name="check_github" defaultChecked className="h-4 w-4 accent-[var(--lime)]" />
        Also ask GitHub whether the commit exists (public repos)
      </label>
      <button type="submit" disabled={pending} className={`${btn} border border-hairline text-bright hover:border-lime hover:text-lime`}>
        {pending ? "Checking…" : "Run preflight"}
      </button>
      {state && !state.ok && <FormError message={state.error.message} />}
      {state?.ok && (
        <p role="status" className="font-plex text-xs text-lightgray">
          Checked {state.data.github ? `· GitHub: ${state.data.github}` : ""}. Save first if you changed fields.
        </p>
      )}
    </form>
  );
}

export function FinalizePanel({ slug, teamName, ready, missing }: { slug: string; teamName: string; ready: boolean; missing: string[] }) {
  const [state, action, pending] = useActionState(finalizeAction.bind(null, slug), null);
  // One key per page view: a double click or a retry replays the same receipt.
  const [key] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Math.random().toString(36).slice(2)}-${Date.now()}`));
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotency_key" value={key} />
      {!ready && (
        <p className="border-l-2 border-warning pl-3 font-plex text-xs text-warning">
          Save your draft and fill the required items first: {missing.join(", ")}.
        </p>
      )}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 font-plex text-sm text-bright">
        <input type="checkbox" name="confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--lime)]" />
        <span>
          We checked the saved draft. Freeze it as our official submission. It can&apos;t be edited after this.
        </span>
      </label>
      <Toggle
        name="publish_showcase"
        defaultChecked
        label="List our showcase publicly"
        description="Your page at /ship goes public with the gallery. Off keeps it private to your team; you can change this later."
      />
      <ConfirmByTyping phrase={teamName} label={<>Type your team name, <span className="normal-case text-bright">{teamName}</span>, to finalize</>}>
        {(matched) => (
          <button type="submit" disabled={!matched || !confirmed || !ready || pending} className={`${btn} w-full bg-bright text-ink hover:bg-lime`}>
            {pending ? "Finalizing…" : "Finalize submission"}
          </button>
        )}
      </ConfirmByTyping>
      {state && !state.ok && <FormError message={`${state.error.message} ${state.error.next_action}`} />}
    </form>
  );
}

const MODES = [
  { value: "public", label: "Public", note: "Anyone, and listed in the /ship gallery." },
  { value: "unlisted", label: "Unlisted", note: "Anyone with the link; not in the gallery." },
  { value: "draft", label: "Off", note: "Only your team and organizers." },
] as const;

export function ShowcaseMode({ slug, current, moderated }: { slug: string; current: string; moderated: boolean }) {
  const [state, action, pending] = useActionState(showcaseStateAction.bind(null, slug), null);
  if (moderated) {
    return <p className="font-plex text-sm text-warning">Organizers have hidden this page. Ask at the help desk to restore it.</p>;
  }
  return (
    <form action={action} className="space-y-2">
      <div role="group" aria-label="Showcase visibility" className="inline-flex flex-wrap border border-hairline bg-surface-2">
        {MODES.map((m) => {
          const on = current === m.value;
          return (
            <button
              key={m.value}
              type="submit"
              name="state"
              value={m.value}
              aria-pressed={on}
              disabled={pending}
              title={m.note}
              className={`min-h-11 px-4 font-plex text-sm transition-colors ${on ? "bg-lime-deep text-lime outline outline-1 -outline-offset-1 outline-lime" : "text-lightgray hover:text-bright"}`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="font-plex text-xs text-lightgray">{MODES.find((m) => m.value === current)?.note}</p>
      {state && !state.ok && <FormError message={state.error.message} />}
    </form>
  );
}

export function CreditChoice({ slug, consent }: { slug: string; consent: boolean | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const choose = (granted: boolean) =>
    start(async () => {
      const res = await creditConsentAction(slug, granted);
      setError(res.ok ? "" : res.error.message);
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          aria-pressed={consent === true}
          onClick={() => choose(true)}
          className={`${btn} border ${consent === true ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
        >
          Yes, name me
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={consent === false}
          onClick={() => choose(false)}
          className={`${btn} border ${consent === false ? "border-bright text-bright" : "border-hairline text-lightgray hover:text-bright"}`}
        >
          No, leave me off
        </button>
      </div>
      {error && <FormError message={error} />}
    </div>
  );
}
