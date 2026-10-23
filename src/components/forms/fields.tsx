"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Shared bits for the team and admin forms, styled like the rest of the site:
// hairline boxes on ink, lime on focus, pixel-font labels.

export const inputCls =
  "w-full border border-hairline bg-surface px-3 py-2.5 font-plex text-sm text-bright placeholder:text-lightgray/60 outline-none transition-colors focus:border-lime disabled:opacity-50";

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-baseline justify-between gap-3">
      <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{children}</span>
      {hint && <span className="font-plex text-xs text-lightgray">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children, pending: pendingLabel, className = "" }: { children: ReactNode; pending?: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-2 border-red-400 pl-3 font-plex text-sm text-red-300">
      {message}
    </p>
  );
}

/**
 * A labelled on/off switch with a one-line description, for consent and
 * settings. A real checkbox underneath, so it posts `name=on` in a form and
 * works with the keyboard. Each consent category gets its own Toggle:
 * never bundle consents into one switch.
 */
export function Toggle({
  name,
  label,
  description,
  defaultChecked = false,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  label: ReactNode;
  description?: ReactNode;
  defaultChecked?: boolean;
  /** Controlled mode; omit for a plain form field. */
  checked?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  return (
    <label htmlFor={id} className={`flex min-h-11 cursor-pointer items-start gap-4 py-2 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={on}
        disabled={disabled}
        aria-describedby={description ? `${id}-d` : undefined}
        onChange={(e) => {
          setOwn(e.target.checked);
          onChange?.(e.target.checked);
        }}
      />
      <span
        aria-hidden="true"
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lime ${
          on ? "border-lime bg-lime-deep" : "border-hairline bg-surface-2"
        }`}
      >
        <span className={`absolute top-0.5 h-[18px] w-[18px] transition-[left] motion-reduce:transition-none ${on ? "left-[22px] bg-lime" : "left-0.5 bg-lightgray"}`} />
      </span>
      <span className="min-w-0">
        <span className="block font-plex text-sm text-bright">
          {label} <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{on ? "On" : "Off"}</span>
        </span>
        {description && (
          <span id={`${id}-d`} className="mt-1 block font-plex text-xs leading-relaxed text-lightgray">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Type-to-confirm for irreversible actions (finalize a submission, publish a
 * showcase, lock scores). Posts `name` with what was typed so the server can
 * re-check it; `children(matched)` renders the submit button, enabled only
 * once the phrase matches (case-insensitive, trimmed).
 */
export function ConfirmByTyping({
  phrase,
  name = "confirm_phrase",
  label,
  children,
}: {
  phrase: string;
  name?: string;
  label?: ReactNode;
  children: (matched: boolean) => ReactNode;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const matched = typed.trim().toLowerCase() === phrase.trim().toLowerCase();
  return (
    <div className="space-y-3">
      <Label htmlFor={id}>
        {label ?? (
          <>
            Type <span className="text-bright normal-case">{phrase}</span> to confirm
          </>
        )}
      </Label>
      <input
        id={id}
        name={name}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={typed.length > 0 && !matched}
        className={inputCls}
      />
      {children(matched)}
    </div>
  );
}
