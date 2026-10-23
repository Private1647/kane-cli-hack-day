"use client";

import type { ReactNode } from "react";
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
