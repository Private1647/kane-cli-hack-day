"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError, Label, SubmitButton, inputCls } from "@/components/forms/fields";
import type { CreatedTicket, Diagnosis } from "@/server/help";
import { diagnose, openTicket, reopenTicket, replyTicket } from "./actions";

// Client bits of the participant help desk: the ticket form (with the
// optional "check the docs first" step), replies, reopen and polling.

// Kept in sync with HELP_CATEGORIES / HELP_PRIORITIES in src/server/help.ts
// (that module is server-only, so the labels are repeated here).
const CATEGORIES: [string, string][] = [
  ["kane_cli", "Kane CLI"],
  ["test_manager", "Test Manager"],
  ["auth", "Auth / sign-in"],
  ["ci_cloud", "CI / Cloud"],
  ["mobile", "Mobile"],
  ["idea", "Idea"],
  ["github", "GitHub"],
  ["other", "Other"],
];
const PRIORITIES: [string, string, string][] = [
  ["low", "Low", "Whenever someone is free"],
  ["normal", "Normal", "Blocked on one thing"],
  ["high", "High", "Blocked on everything"],
  ["urgent", "Urgent", "Blocked and a deadline is close"],
];

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Re-render the server page every `seconds` while the tab is visible. */
export function Poll({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function TicketForm({ defaultTable }: { defaultTable?: string | null }) {
  const [state, action] = useActionState(openTicket, null);
  const [diag, runDiagnose, diagnosing] = useActionState(diagnose, null);
  const key = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState("kane_cli");

  // A new ticket gets a fresh idempotency key; a retry after an error reuses it.
  useEffect(() => {
    if (state?.ok) {
      key.current = null;
      form.current?.reset();
    }
  }, [state]);

  const submit = (fd: FormData) => {
    key.current ??= newKey();
    fd.set("idempotency_key", key.current);
    action(fd);
  };

  const created = state?.ok ? state.data : null;

  return (
    <div className="space-y-6">
      {created && <Created t={created} />}
      <form ref={form} action={submit} className="space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="h-category">Category</Label>
            <select id="h-category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} min-h-11`}>
              {CATEGORIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="h-table" hint="So a mentor can find you">
              Table
            </Label>
            <input id="h-table" name="table_label" defaultValue={defaultTable ?? ""} maxLength={40} placeholder="e.g. 14" className={`${inputCls} min-h-11`} />
          </div>
        </div>

        <div>
          <Label htmlFor="h-summary" hint="One sentence">
            What&apos;s wrong?
          </Label>
          <input
            id="h-summary"
            name="summary"
            required
            minLength={8}
            maxLength={200}
            placeholder="kane-cli login opens the browser but the terminal never finishes"
            className={`${inputCls} min-h-11`}
          />
        </div>

        <fieldset>
          <legend className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Priority</legend>
          <div className="grid gap-2 sm:grid-cols-4">
            {PRIORITIES.map(([v, l, d]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-start gap-2 border border-hairline px-3 py-2 has-[:checked]:border-lime has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime">
                <input type="radio" name="priority" value={v} defaultChecked={v === "normal"} className="mt-1 accent-lime" />
                <span className="font-plex text-sm text-bright">
                  {l}
                  <span className="block text-xs text-lightgray">{d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="h-tried">What have you tried?</Label>
          <textarea id="h-tried" name="tried" rows={3} maxLength={1000} className={inputCls} placeholder="Re-ran login, restarted the terminal…" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="h-run" hint="Optional">
              Kane run ID
            </Label>
            <input id="h-run" name="safe_run_id" maxLength={120} className={`${inputCls} min-h-11`} placeholder="Just the ID, never logs" />
          </div>
          <div>
            <Label htmlFor="h-details" hint="Optional">
              Anything else
            </Label>
            <textarea id="h-details" name="details" rows={1} maxLength={2000} className={inputCls} />
          </div>
        </div>

        <p className="font-plex text-xs text-lightgray">
          No passwords, API keys, customer data or full logs. Anything that looks like a key is removed before a mentor sees it.
        </p>

        {state && !state.ok && <FormError message={state.error.message} />}

        <div className="flex flex-wrap gap-3">
          <SubmitButton pending="Opening…" className="min-h-11">
            Open ticket →
          </SubmitButton>
          <button
            type="submit"
            formAction={runDiagnose}
            formNoValidate
            disabled={diagnosing}
            className="inline-flex min-h-11 items-center border border-hairline px-4 py-2.5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-60"
          >
            {diagnosing ? "Checking the docs…" : "Check the docs first"}
          </button>
        </div>
      </form>

      {diag && !diag.ok && <FormError message={diag.error.message} />}
      {diag?.ok && <Suggestions d={diag.data} />}
    </div>
  );
}

function Created({ t }: { t: CreatedTicket }) {
  return (
    <div role="status" className="border border-hairline border-l-2 border-l-warning bg-surface p-4 font-plex text-sm">
      <p className="text-bright">
        Ticket <span className="font-dots text-lg text-bright">{t.ticket.code}</span> is in the mentor queue{t.replayed ? " (already opened; same ticket)" : ""}.
      </p>
      <p className="mt-1 text-lightgray">
        Opened {new Date(t.receipt.server_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} by the server clock. Nobody has claimed it yet; this page updates when someone does.
      </p>
      {t.warnings.map((w) => (
        <p key={w} className="mt-2 text-warning">
          ! {w}
        </p>
      ))}
      <Link href={t.ticket.url} className="mt-3 inline-flex min-h-11 items-center text-lime underline underline-offset-4 hover:text-bright">
        Follow {t.ticket.code} →
      </Link>
    </div>
  );
}

function Suggestions({ d }: { d: Diagnosis }) {
  return (
    <section aria-label="Suggestions from the docs" className="border border-hairline bg-surface p-4">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
        {d.generator === "llm" ? "Advisory draft · ranked by AI from our docs map" : "Rule-based draft · matched from our docs map"}
      </p>
      <ul className="mt-3 space-y-4">
        {d.suggestions.map((s) => (
          <li key={s.id} className="border-t border-dashed border-hairline pt-3 first:border-0 first:pt-0">
            <p className="font-display text-base text-bright">{s.title}</p>
            {s.tip && <p className="mt-1 font-plex text-sm text-bright">{s.tip}</p>}
            <ul className="mt-2 list-disc space-y-1 pl-5 font-plex text-sm text-lightgray">
              {s.steps.map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-plex text-xs">
              {s.links.map((l) =>
                l.url.startsWith("/") ? (
                  <Link key={l.url} href={l.url} className="inline-flex min-h-11 items-center text-bright underline underline-offset-4 hover:text-lime">
                    {l.label} →
                  </Link>
                ) : (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-bright underline underline-offset-4 hover:text-lime">
                    {l.label} ↗
                  </a>
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-plex text-xs text-lightgray">Still stuck? Open the ticket above; these suggestions are never a substitute for a mentor.</p>
    </section>
  );
}

export function ReplyForm({ code }: { code: string }) {
  const [state, action] = useActionState(replyTicket.bind(null, code), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3">
      <Label htmlFor="h-reply">Reply to the mentor</Label>
      <textarea id="h-reply" name="body" required rows={3} maxLength={2000} className={inputCls} placeholder="Add what changed, or say you've moved tables" />
      {state && !state.ok && <FormError message={state.error.message} />}
      {state?.ok && state.data.warnings.map((w) => <p key={w} className="font-plex text-sm text-warning">! {w}</p>)}
      <SubmitButton pending="Sending…" className="min-h-11">
        Send reply
      </SubmitButton>
    </form>
  );
}

export function ReopenForm({ code }: { code: string }) {
  const [state, action] = useActionState(reopenTicket.bind(null, code), null);
  return (
    <form action={action} className="space-y-3">
      <Label htmlFor="h-reopen" hint="Optional">
        Still stuck? Say why
      </Label>
      <input id="h-reopen" name="reason" maxLength={500} className={`${inputCls} min-h-11`} />
      {state && !state.ok && <FormError message={state.error.message} />}
      <SubmitButton pending="Reopening…" className="min-h-11">
        Reopen {code}
      </SubmitButton>
    </form>
  );
}
