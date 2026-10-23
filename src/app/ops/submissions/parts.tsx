"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import { FormError, Label, inputCls } from "@/components/forms/fields";
import StatusPill from "@/components/ui/StatusPill";
import { lockAction, manualReceiptAction, moderateAction, renameAction, withdrawAction } from "./actions";

// /ops/submissions client islands: the filterable table with per-team
// moderation, and the manual (offline) receipt intake form.

export type OpsRow = {
  teamSlug: string;
  teamName: string;
  projectSlug: string | null;
  projectName: string | null;
  projectType: string | null;
  showcase: string | null;
  status: string | null;
  receipt: string | null;
  source: string | null;
  finalizedAt: string | null;
  receivedAt: string | null;
  commit: string | null;
  preflightOk: boolean | null;
};

const small = "min-h-11 border border-hairline px-3 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-50";

function StatusCell({ r }: { r: OpsRow }) {
  if (!r.status) return <span className="text-lightgray">No draft</span>;
  if (r.status === "finalized" || r.status === "locked") return <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-bright">✓ {r.status}</span>;
  if (r.status === "withdrawn") return <StatusPill tone="danger">Withdrawn</StatusPill>;
  return <StatusPill tone="pending">{r.preflightOk ? "Preflighted" : r.status}</StatusPill>;
}

export function SubmissionsTable({ rows }: { rows: OpsRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "final" && !(r.status === "finalized" || r.status === "locked")) return false;
      if (filter === "open" && (r.status === "finalized" || r.status === "locked")) return false;
      if (filter === "manual" && r.source !== "manual_offline") return false;
      if (filter === "hidden" && r.showcase !== "hidden_by_moderation") return false;
      return !n || r.teamName.toLowerCase().includes(n) || (r.projectName ?? "").toLowerCase().includes(n) || (r.receipt ?? "").toLowerCase().includes(n);
    });
  }, [rows, q, filter]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team, project or S-code" aria-label="Search" className={inputCls} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter" className={inputCls}>
          <option value="all">All teams</option>
          <option value="final">Finalized / locked</option>
          <option value="open">Not finalized</option>
          <option value="manual">Manual receipts</option>
          <option value="hidden">Hidden showcases</option>
        </select>
      </div>
      <p className="font-plex text-xs text-lightgray">
        Showing {shown.length} of {rows.length}
      </p>
      <div className="overflow-x-auto border border-hairline">
        <table className="w-full min-w-[900px] text-left font-plex text-sm">
          <thead className="border-b border-hairline bg-surface font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
            <tr>
              <th className="px-3 py-3 font-normal">Team / project</th>
              <th className="px-3 py-3 font-normal">Status</th>
              <th className="px-3 py-3 font-normal">Receipt</th>
              <th className="px-3 py-3 font-normal">Finalized (server)</th>
              <th className="px-3 py-3 font-normal">Commit</th>
              <th className="px-3 py-3 font-normal">Showcase</th>
              <th className="px-3 py-3 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <FragmentRow key={r.teamSlug} r={r} open={open === r.teamSlug} toggle={() => setOpen(open === r.teamSlug ? null : r.teamSlug)} />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-lightgray">
                  No teams match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ r, open, toggle }: { r: OpsRow; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr className="border-b border-dashed border-hairline align-top">
        <td className="px-3 py-3">
          <Link href={`/ops/t/${r.teamSlug}`} className="text-bright hover:text-lime">
            {r.teamName}
          </Link>
          <span className="block text-xs text-lightgray">
            {r.projectName ?? "—"}
            {r.projectType ? ` · ${r.projectType}` : ""}
          </span>
        </td>
        <td className="px-3 py-3">
          <StatusCell r={r} />
          {r.source === "manual_offline" && <span className="mt-1 block text-xs text-warning">manual backup</span>}
        </td>
        <td className="px-3 py-3">
          {r.receipt ? (
            <Link href={`/submit/receipt/${r.receipt}`} className="font-mono text-bright hover:text-lime">
              {r.receipt}
            </Link>
          ) : (
            <span className="text-lightgray">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-lightgray">
          {r.finalizedAt ?? "—"}
          {r.receivedAt && <span className="block text-xs">received {r.receivedAt}</span>}
        </td>
        <td className="px-3 py-3 font-mono text-xs text-lightgray">{r.commit ? r.commit.slice(0, 10) : "—"}</td>
        <td className="px-3 py-3">
          {r.projectSlug ? (
            <Link href={`/ship/${r.projectSlug}`} className="text-bright hover:text-lime">
              {r.showcase === "hidden_by_moderation" ? <StatusPill tone="danger">Hidden</StatusPill> : (r.showcase ?? "draft")}
            </Link>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-3 text-right">
          <button type="button" onClick={toggle} aria-expanded={open} className={small}>
            {open ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-hairline bg-surface">
          <td colSpan={7} className="px-3 py-4">
            <div className="grid gap-6 md:grid-cols-3">
              {r.projectSlug && <Moderate slug={r.projectSlug} hidden={r.showcase === "hidden_by_moderation"} />}
              {r.projectSlug && <Rename slug={r.projectSlug} />}
              {r.status && r.status !== "withdrawn" && <Withdraw teamSlug={r.teamSlug} receipt={r.receipt} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Moderate({ slug, hidden }: { slug: string; hidden: boolean }) {
  const [state, action, pending] = useActionState(moderateAction, null);
  return (
    <form action={action} className="space-y-2">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{hidden ? "Restore showcase" : "Hide showcase"}</p>
      <input type="hidden" name="slug" value={slug} />
      {!hidden && <input type="hidden" name="hide" value="on" />}
      <input name="reason" required maxLength={300} placeholder="Reason (kept in the audit log)" aria-label="Reason" className={inputCls} />
      <button type="submit" disabled={pending} className={small}>
        {hidden ? "Restore" : "Hide by moderation"}
      </button>
      {state && !state.ok && <FormError message={state.error.message} />}
      {state?.ok && <p className="font-plex text-xs text-lightgray">Now: {state.data}</p>}
    </form>
  );
}

function Rename({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(renameAction, null);
  return (
    <form action={action} className="space-y-2">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Rename /ship slug</p>
      <input type="hidden" name="slug" value={slug} />
      <input name="new_slug" required pattern="[a-z0-9-]{1,64}" defaultValue={slug} aria-label="New slug" className={inputCls} />
      <button type="submit" disabled={pending} className={small}>
        Rename (old link redirects)
      </button>
      {state && !state.ok && <FormError message={state.error.message} />}
      {state?.ok && <p className="font-plex text-xs text-lightgray">Now /ship/{state.data}</p>}
    </form>
  );
}

function Withdraw({ teamSlug, receipt }: { teamSlug: string; receipt: string | null }) {
  const [state, action, pending] = useActionState(withdrawAction, null);
  return (
    <form action={action} className="space-y-2">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Withdraw {receipt ?? "draft"}</p>
      <input type="hidden" name="team_slug" value={teamSlug} />
      <input name="reason" required maxLength={300} placeholder="Reason (kept in the audit log)" aria-label="Reason" className={inputCls} />
      <button type="submit" disabled={pending} className={`${small} hover:border-danger hover:text-danger`}>
        Withdraw (history is kept)
      </button>
      {state && !state.ok && <FormError message={state.error.message} />}
    </form>
  );
}

export function LockAll({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(lockAction, null);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={disabled || pending} className={small}>
        Mark every finalized submission locked
      </button>
      {disabled && <p className="font-plex text-xs text-lightgray">Available after the submission deadline (server time).</p>}
      {state && !state.ok && <FormError message={state.error.message} />}
      {state?.ok && <p className="font-plex text-xs text-lightgray">{state.data} locked.</p>}
    </form>
  );
}

export function ManualReceiptForm({ teams, types, nowLocal, officer }: { teams: { slug: string; name: string }[]; types: { value: string; label: string }[]; nowLocal: string; officer: string }) {
  const [state, action, pending] = useActionState(manualReceiptAction, null);
  const [key] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m-${Math.random().toString(36).slice(2)}`));
  const issues = state && !state.ok ? ((state.error.details?.issues as { path: string; message: string }[] | undefined) ?? []) : [];

  if (state?.ok) {
    return (
      <div className="brackets border border-hairline bg-surface p-5 font-plex text-sm">
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Manual receipt recorded</p>
        <p className="mt-2 font-dots text-5xl font-black text-bright">{state.data.receipt_code}</p>
        <p className="mt-2 text-lightgray">Recorded {new Date(state.data.recorded_at).toLocaleString()} (server time). Write this code on the paper copy.</p>
        {state.data.received_after_lock && <p className="mt-2 text-warning">Received after the official lock: escalate to the event director under the published policy.</p>}
        <div className="mt-4 flex gap-3">
          <Link href={`/submit/receipt/${state.data.receipt_code}`} className="inline-flex min-h-11 items-center bg-bright px-4 text-ink hover:bg-lime">
            Open receipt →
          </Link>
          <button type="button" onClick={() => window.location.reload()} className={small}>
            Record another
          </button>
        </div>
      </div>
    );
  }

  const f = (name: string, label: string, el: ReactNode, hint?: string) => (
    <div>
      <Label htmlFor={`mr-${name}`} hint={hint}>
        {label}
      </Label>
      {el}
      {issues.find((i) => i.path === name) && <p className="mt-1 font-plex text-xs text-danger">{issues.find((i) => i.path === name)!.message}</p>}
    </div>
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="idempotency_key" value={key} />
      <p className="font-plex text-xs text-lightgray">
        Officer: <span className="text-bright">{officer}</span> (you). Use only during a verified outage or an organizer-approved exception. The record time is the server&apos;s now; never backdate.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {f(
          "team_slug",
          "Team",
          <select id="mr-team_slug" name="team_slug" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Pick a team
            </option>
            {teams.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>,
        )}
        {f("received_at_local", "Actually received at", <input id="mr-received_at_local" name="received_at_local" type="datetime-local" required defaultValue={nowLocal} className={inputCls} />, "Event time zone")}
        {f("project_name", "Project name", <input id="mr-project_name" name="project_name" required maxLength={80} className={inputCls} />)}
        {f(
          "project_type",
          "Project type",
          <select id="mr-project_type" name="project_type" className={inputCls} defaultValue="other">
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>,
        )}
        {f("repo_url", "Repository URL / approved equivalent", <input id="mr-repo_url" name="repo_url" required maxLength={500} className={inputCls} />)}
        {f("demo_url", "Live / demo URL", <input id="mr-demo_url" name="demo_url" maxLength={500} className={inputCls} />)}
        {f("commit_sha", "Exact commit SHA", <input id="mr-commit_sha" name="commit_sha" maxLength={40} spellCheck={false} className={`${inputCls} font-mono`} />, "40 hex")}
        {f("artifact_hash", "…or archive SHA-256", <input id="mr-artifact_hash" name="artifact_hash" maxLength={64} spellCheck={false} className={`${inputCls} font-mono`} />, "64 hex")}
      </div>
      {f("harness", "Harness description / Kane components", <textarea id="mr-harness" name="harness" required rows={3} maxLength={1500} className={inputCls} />)}
      {f("evidence_refs", "Evidence IDs, run URLs, artifact hashes (no secrets)", <textarea id="mr-evidence_refs" name="evidence_refs" rows={2} maxLength={2000} className={inputCls} />)}
      {f("caveats", "Known caveats / unmet validation claims", <textarea id="mr-caveats" name="caveats" rows={2} maxLength={1500} className={inputCls} />)}
      <div className="grid gap-5 sm:grid-cols-3">
        {f("submitter", "Submitted by (participant)", <input id="mr-submitter" name="submitter" required maxLength={120} className={inputCls} />)}
        {f("witness", "Independent witness", <input id="mr-witness" name="witness" required maxLength={120} className={inputCls} />)}
        {f("incident_ref", "Incident / reference ID", <input id="mr-incident_ref" name="incident_ref" required maxLength={60} placeholder="INC-001" className={inputCls} />)}
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 font-plex text-sm text-bright">
        <input type="checkbox" name="participant_confirmed" required className="mt-1 h-4 w-4 accent-[var(--lime)]" />
        The participant read back and confirmed the frozen contents.
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record manual receipt"}
      </button>
      {state && !state.ok && <FormError message={state.error.message} />}
    </form>
  );
}
