"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import type { ActionResult } from "@/server/core";
import type { PaperImportRow, PaperResult } from "@/server/help";
import { addPaper, importPaperCsv } from "./actions";

// Client bits of the mentor queue: one generic action form (claim, resolve,
// escalate…) that shows the server's answer inline (e.g. 409 "already claimed
// by Ann"), the new-ticket sound alert, and the paper-ticket entry forms.

type Act = (prev: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown> | null>;

/**
 * A server action behind one button, with optional fields. `primary` is the
 * lime action button (Claim); others are hairline.
 */
export function OpsAction({
  action,
  label,
  pending = "Working…",
  primary = false,
  children,
  className = "",
}: {
  action: Act;
  label: string;
  pending?: string;
  primary?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [state, run] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={run} className={`space-y-2 ${className}`}>
      {children}
      <SubmitButton
        pending={pending}
        className={`min-h-11 ${primary ? "bg-lime! hover:bg-bright!" : "border border-hairline bg-transparent! text-bright! hover:border-lime hover:text-lime!"}`}
      >
        {label}
      </SubmitButton>
      {state && !state.ok && <FormError message={state.error.message} />}
    </form>
  );
}

const subscribeNoop = () => () => {};

/**
 * Beeps (opt-in) and updates the tab title when the number of unclaimed
 * tickets goes up between polls. Off by default; browsers need a click
 * before they allow sound, which the toggle provides.
 */
export function QueueAlert({ waiting, newestId }: { waiting: number; newestId: number }) {
  const stored = useSyncExternalStore(
    subscribeNoop,
    () => {
      try {
        return localStorage.getItem("ops-help-sound") === "on";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [sound, setSound] = useState<boolean | null>(null);
  const on = sound ?? stored;
  const last = useRef<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    document.title = waiting > 0 ? `(${waiting}) Help queue · Ops` : "Help queue · Ops";
    const prev = last.current;
    last.current = newestId;
    if (prev === null || newestId <= prev) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 4000);
    if (on) beep(ctx);
    return () => clearTimeout(t);
  }, [newestId, waiting, on]);

  const toggle = () => {
    const next = !on;
    setSound(next);
    try {
      localStorage.setItem("ops-help-sound", next ? "on" : "off");
    } catch {}
    if (next) beep(ctx); // the click unlocks audio and confirms it works
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className={`inline-flex min-h-11 items-center border px-3 font-plex text-xs transition-colors ${on ? "border-lime text-lime" : "border-hairline text-lightgray hover:text-bright"}`}
      >
        Sound alert: {on ? "on" : "off"}
      </button>
      <p role="status" aria-live="polite" className={`font-plex text-xs ${flash ? "text-warning" : "text-lightgray"}`}>
        {flash ? "! New ticket in the queue" : `${waiting} waiting for a mentor`}
      </p>
    </div>
  );
}

function beep(ctx: { current: AudioContext | null }) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx.current ??= new Ctor();
    const ac = ctx.current;
    void ac.resume();
    // Two short tones; quiet enough for a mentor table.
    [0, 0.18].forEach((at, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ac.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + 0.15);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + at);
      o.stop(ac.currentTime + at + 0.16);
    });
  } catch {}
}

const CATEGORY_OPTS: [string, string][] = [
  ["kane_cli", "Kane CLI"],
  ["test_manager", "Test Manager"],
  ["auth", "Auth"],
  ["ci_cloud", "CI / Cloud"],
  ["mobile", "Mobile"],
  ["idea", "Idea"],
  ["github", "GitHub"],
  ["other", "Other"],
];

export function CategorySelect({ name = "category", id, defaultValue, includeBlank }: { name?: string; id: string; defaultValue?: string; includeBlank?: boolean }) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? (includeBlank ? "" : "kane_cli")} className={`${inputCls} min-h-11`}>
      {includeBlank && <option value="">Keep</option>}
      {CATEGORY_OPTS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function PrioritySelect({ id, defaultValue, includeBlank }: { id: string; defaultValue?: string; includeBlank?: boolean }) {
  return (
    <select id={id} name="priority" defaultValue={defaultValue ?? (includeBlank ? "" : "normal")} className={`${inputCls} min-h-11`}>
      {includeBlank && <option value="">Keep</option>}
      <option value="low">Low</option>
      <option value="normal">Normal</option>
      <option value="high">High</option>
      <option value="urgent">Urgent</option>
    </select>
  );
}

/** Type in one paper slip (fallback/04_MENTOR_TICKET.md). */
export function PaperTicketForm() {
  const [state, run] = useActionState(addPaper, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const r: PaperResult | null = state?.ok ? state.data : null;
  return (
    <form ref={form} action={run} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="p-code" label="Slip number" hint="Printed H-number">
          <input id="p-code" name="code" required placeholder="H-9012" className={`${inputCls} min-h-11 uppercase`} />
        </Field>
        <Field id="p-opened" label="Opened at" hint="Time on the slip">
          <input id="p-opened" name="opened_at" required placeholder="13:05 or 1:05 PM" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-status" label="Status on slip">
          <select id="p-status" name="status" defaultValue="new" className={`${inputCls} min-h-11`}>
            <option value="new">Open</option>
            <option value="claimed">Claimed</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </Field>
        <Field id="p-team" label="Team" hint="Slug or name">
          <input id="p-team" name="team" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-participant" label="Participant" hint="P-code">
          <input id="p-participant" name="participant" placeholder="P-1042" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-table" label="Table">
          <input id="p-table" name="table_label" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-category" label="Category">
          <CategorySelect id="p-category" />
        </Field>
        <Field id="p-priority" label="Priority">
          <PrioritySelect id="p-priority" />
        </Field>
        <Field id="p-run" label="Safe run ID" hint="Optional">
          <input id="p-run" name="safe_run_id" className={`${inputCls} min-h-11`} />
        </Field>
      </div>
      <Field id="p-summary" label="Problem in one sentence">
        <input id="p-summary" name="summary" required maxLength={200} className={`${inputCls} min-h-11`} />
      </Field>
      <Field id="p-tried" label="What was tried" hint="Optional">
        <input id="p-tried" name="tried" maxLength={1000} className={`${inputCls} min-h-11`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="p-claimed-by" label="Claimed by" hint="Optional">
          <input id="p-claimed-by" name="claimed_by" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-claimed-at" label="Claimed at" hint="Optional">
          <input id="p-claimed-at" name="claimed_at" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-resolved-at" label="Resolved at" hint="Optional">
          <input id="p-resolved-at" name="resolved_at" className={`${inputCls} min-h-11`} />
        </Field>
        <Field id="p-initials" label="Staff initials" hint="Optional">
          <input id="p-initials" name="staff_initials" maxLength={12} className={`${inputCls} min-h-11`} />
        </Field>
      </div>
      <Field id="p-resolution" label="Resolution / next action" hint="Optional">
        <input id="p-resolution" name="resolution" maxLength={500} className={`${inputCls} min-h-11`} />
      </Field>
      <p className="font-plex text-xs text-lightgray">Times are read in the event&apos;s time zone. The entry time is recorded separately; nothing is backdated.</p>
      {state && !state.ok && <FormError message={state.error.message} />}
      {r && (
        <p role="status" className="font-plex text-sm text-bright">
          {r.status === "created" ? `${r.code} added to the queue.` : `${r.code} was already entered; nothing changed.`}
        </p>
      )}
      <SubmitButton pending="Adding…" className="min-h-11">
        Add paper ticket
      </SubmitButton>
    </form>
  );
}

/** Import a mentor-queue-template.csv (one file, or pasted). */
export function PaperCsvImport() {
  const [state, run] = useActionState(importPaperCsv, null);
  const rows: PaperImportRow[] = state?.ok ? state.data.rows : [];
  return (
    <form action={run} className="space-y-4">
      <Field id="csv-file" label="CSV file" hint="mentor-queue-template.csv">
        <input id="csv-file" name="file" type="file" accept=".csv,text/csv" className="block min-h-11 font-plex text-sm text-lightgray file:mr-3 file:border file:border-hairline file:bg-surface file:px-3 file:py-2 file:text-bright" />
      </Field>
      <Field id="csv-text" label="Or paste rows" hint="Header row first">
        <textarea id="csv-text" name="csv" rows={4} className={`${inputCls} font-plex text-xs`} placeholder="manual_ticket_id,opened_at,team_id,participant_id,table,category,priority,summary,claimed_by,claimed_at,resolved_at,status,staff_initials" />
      </Field>
      {state && !state.ok && <FormError message={state.error.message} />}
      {state?.ok && (
        <div role="status" className="font-plex text-sm">
          <p className="text-bright">
            {state.data.created} added · {state.data.skipped} already entered · {state.data.failed} need attention
          </p>
          {rows.some((x) => !x.ok) && (
            <ul className="mt-2 space-y-1 text-xs text-danger">
              {rows
                .filter((x) => !x.ok)
                .map((x) => (
                  <li key={x.line}>
                    ✕ Line {x.line} ({x.code}): {x.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <SubmitButton pending="Importing…" className="min-h-11">
        Import CSV
      </SubmitButton>
    </form>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children}
    </div>
  );
}
