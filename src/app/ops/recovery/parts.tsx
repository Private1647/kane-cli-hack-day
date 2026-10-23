"use client";

import { useState } from "react";
import { Label, inputCls } from "@/components/forms/fields";
import StatusPill from "@/components/ui/StatusPill";
import ActionForm, { SelectField, TextArea, TextField } from "../_kit/ActionForm";
import { closeIncidentAction, ledgerAction, manualReceiptAction, openIncidentAction, paperTicketAction } from "./actions";

// Recovery desk forms. Every time field is the time written on paper, in the
// event's time zone; the server records its own entry time as well.

const SUBSYSTEM_LABELS: Record<string, string> = {
  checkin: "Check-in",
  help: "Help desk",
  submission: "Submission",
  database: "Database",
  blob: "Blob storage",
  slack: "Slack",
  github: "GitHub",
  luma: "Luma",
  kane: "Kane / TestMu",
  renderer: "Renderer",
  x: "X",
  live_tv: "Live TV",
  wifi: "Venue Wi-Fi",
  other: "Other",
};

export function OpenIncident({ subsystems }: { subsystems: readonly string[] }) {
  return (
    <ActionForm action={openIncidentAction} submit="Open incident" pending="Opening…" variant="danger">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="inc-sub" name="subsystem" label="Subsystem" options={subsystems.map((s) => ({ value: s, label: SUBSYSTEM_LABELS[s] ?? s }))} />
        <SelectField
          id="inc-sev"
          name="severity"
          label="Severity"
          defaultValue="sev2"
          options={[
            { value: "sev1", label: "SEV-0 · check-in, help or submission down" },
            { value: "sev2", label: "SEV-1 · Kane / auth / grid degraded" },
            { value: "sev3", label: "SEV-2 · photo / social / video / showcase" },
          ]}
        />
      </div>
      <TextArea id="inc-desc" name="description" label="What's happening" hint="start time, symptoms, who's on it" required maxLength={500} />
    </ActionForm>
  );
}

export function CloseIncident({ id, code }: { id: number; code: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
        Close {code}…
      </button>
    );
  return (
    <ActionForm action={closeIncidentAction} submit={`Close ${code}`} pending="Closing…" variant="secondary" className="w-full">
      <input type="hidden" name="id" value={id} />
      <TextField id={`rb-${id}`} name="recovery_basis" label="What restored service" hint="required · audited" required maxLength={500} />
    </ActionForm>
  );
}

const CATEGORIES = [
  ["kane_cli", "Kane CLI"],
  ["test_manager", "Test Manager"],
  ["auth", "Auth"],
  ["ci_cloud", "CI / Cloud"],
  ["mobile", "Mobile"],
  ["idea", "Idea"],
  ["github", "GitHub"],
  ["other", "Other"],
] as const;

export function PaperTicket() {
  return (
    <ActionForm action={paperTicketAction} submit="Add paper ticket" pending="Adding…">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField id="pt-code" name="code" label="Paper ticket id" hint="pre-printed, e.g. H-P012" maxLength={16} />
        <TextField id="pt-at" name="opened_at" type="datetime-local" label="Opened at (paper time)" hint="optional" />
        <TextField id="pt-p" name="participant" label="Participant P-code" hint="optional" maxLength={12} />
        <TextField id="pt-team" name="team" label="Team (slug or name)" hint="optional" maxLength={80} />
        <TextField id="pt-table" name="table" label="Table" hint="optional" maxLength={40} />
        <SelectField id="pt-cat" name="category" label="Category" options={CATEGORIES.map(([value, label]) => ({ value, label }))} />
        <SelectField
          id="pt-pri"
          name="priority"
          label="Priority"
          defaultValue="normal"
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent (blocked on deadline)" },
          ]}
        />
      </div>
      <TextField id="pt-sum" name="summary" label="Problem in one sentence" required maxLength={300} />
      <TextArea id="pt-tried" name="tried" label="What has been tried" hint="no secrets, no logs" maxLength={500} rows={2} />
    </ActionForm>
  );
}

export function ManualReceipt({ lockLabel, defaultOfficer }: { lockLabel: string; defaultOfficer: string }) {
  return (
    <ActionForm action={manualReceiptAction} submit="Record manual receipt" pending="Recording…" confirm="Record this backup receipt? It is frozen once saved.">
      {(state) => (
        <>
          <p className="font-plex text-sm text-warning">
            ! Use only during a verified submission outage or an organizer-approved exception. Official lock: {lockLabel}. Never backdate.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField id="mr-code" name="code" label="Paper receipt id" hint="e.g. S-P004 · blank = new" maxLength={16} defaultValue={state?.ok ? "" : state?.values?.code} />
            <TextField id="mr-team" name="team" label="Team slug" required maxLength={80} defaultValue={state?.ok ? "" : state?.values?.team} />
            <TextField id="mr-at" name="received_at" type="datetime-local" label="Received at (actual)" required defaultValue={state?.ok ? "" : state?.values?.received_at} />
            <TextField id="mr-sub" name="submitter" label="Submitted by (P-code)" hint="optional" maxLength={12} defaultValue={state?.ok ? "" : state?.values?.submitter} />
            <TextField id="mr-name" name="project_name" label="Project name" required maxLength={120} defaultValue={state?.ok ? "" : state?.values?.project_name} />
            <TextField id="mr-repo" name="repo_url" label="Repository URL" hint="https://" maxLength={500} defaultValue={state?.ok ? "" : state?.values?.repo_url} />
            <TextField id="mr-sha" name="commit_sha" label="Exact commit SHA" hint="40 hex" maxLength={40} defaultValue={state?.ok ? "" : state?.values?.commit_sha} />
            <TextField id="mr-hash" name="artifact_hash" label="…or archive SHA-256" hint="64 hex" maxLength={64} defaultValue={state?.ok ? "" : state?.values?.artifact_hash} />
            <TextField id="mr-live" name="live_url" label="Live / demo URL" hint="optional" maxLength={500} defaultValue={state?.ok ? "" : state?.values?.live_url} />
          </div>
          <TextArea id="mr-harness" name="harness" label="Harness / Kane components" maxLength={1000} rows={2} defaultValue={state?.ok ? "" : state?.values?.harness} />
          <TextArea id="mr-ev" name="evidence" label="Evidence ids, run URLs, artifact hashes" hint="no secrets" maxLength={1000} rows={2} defaultValue={state?.ok ? "" : state?.values?.evidence} />
          <TextArea id="mr-cav" name="caveats" label="Known caveats / unmet validation claims" maxLength={1000} rows={2} defaultValue={state?.ok ? "" : state?.values?.caveats} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField id="mr-off" name="officer" label="Submission officer" required maxLength={80} defaultValue={state?.values?.officer ?? defaultOfficer} />
            <TextField id="mr-wit" name="witness" label="Independent witness" required maxLength={80} defaultValue={state?.values?.witness} />
            <TextField id="mr-inc" name="incident" label="Incident id" hint="e.g. INC-002" maxLength={20} defaultValue={state?.values?.incident} />
          </div>
          <label className="flex min-h-11 items-start gap-3 font-plex text-sm text-bright">
            <input type="checkbox" name="confirmed" required className="mt-1 h-5 w-5 accent-[var(--lime)]" />
            <span>The participant confirmed the frozen contents above.</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}

export function LedgerUpload({ kinds }: { kinds: { id: string; label: string; file: string }[] }) {
  const [csv, setCsv] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <ActionForm
      action={ledgerAction}
      submit="Upload ledger"
      pending="Importing…"
      confirm="Import this paper ledger as manual_offline records?"
      render={(s) => {
        const r = s.data as { lines: { line: number; ok: boolean; id?: string; message: string }[]; sha256: string };
        return (
          <div className="space-y-2 font-plex text-sm">
            <p className="text-bright">{s.message}</p>
            <p className="text-xs break-all text-lightgray">Batch sha256 {r.sha256}</p>
            <ul className="max-h-72 overflow-y-auto border-t border-dashed border-hairline text-xs">
              {r.lines.map((l) => (
                <li key={l.line} className="flex flex-wrap items-center gap-2 border-b border-dashed border-hairline py-1.5">
                  <span className="w-14 text-lightgray">line {l.line}</span>
                  {l.ok ? <StatusPill tone="unverified">Recorded</StatusPill> : <StatusPill tone="pending">Review</StatusPill>}
                  {l.id && <span className="text-bright">{l.id}</span>}
                  <span className="text-lightgray">{l.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="lg-kind" name="kind" label="Ledger" options={kinds.map((k) => ({ value: k.id, label: `${k.label} (${k.file})` }))} />
        <div>
          <Label htmlFor="lg-file">CSV file</Label>
          <input
            id="lg-file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              setErr(null);
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 950_000) return setErr("File is over ~1 MB; split it.");
              setCsv(await f.text());
            }}
            className={`${inputCls} min-h-11 file:mr-3 file:border-0 file:bg-bright file:px-3 file:py-1.5 file:font-plex file:text-ink`}
          />
          {err && <p className="mt-2 font-plex text-sm text-danger">✕ {err}</p>}
        </div>
      </div>
      <input type="hidden" name="csv" value={csv} />
    </ActionForm>
  );
}
