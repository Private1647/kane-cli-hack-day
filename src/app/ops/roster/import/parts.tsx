"use client";

import { useActionState, useState } from "react";
import { Label, inputCls } from "@/components/forms/fields";
import StatusPill from "@/components/ui/StatusPill";
import type { RosterDiff } from "@/server/roster";
import ActionForm, { Result } from "../../_kit/ActionForm";
import type { OpsState } from "../../_kit/state";
import { commitImportAction, previewImportAction } from "../actions";

// Upload → preview diff → commit. The file is read in the browser and sent as
// text; the server hashes it, and the commit only applies if the hash still
// matches the preview staff looked at.

const MAX = 950_000;

export function ImportFlow() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [version, setVersion] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [preview, previewAction, previewing] = useActionState<OpsState, FormData>(previewImportAction, null);
  const diff = preview?.ok ? (preview.data as RosterDiff) : null;

  return (
    <div className="space-y-8">
      <form action={previewAction} className="space-y-4">
        <div>
          <Label htmlFor="roster-file" hint="Luma guest export or roster-import-template.csv">
            CSV file
          </Label>
          <input
            id="roster-file"
            type="file"
            accept=".csv,text/csv"
            className={`${inputCls} min-h-11 file:mr-3 file:border-0 file:bg-bright file:px-3 file:py-1.5 file:font-plex file:text-ink`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setReadError(null);
              if (!f) return;
              if (f.size > MAX) {
                setReadError("That file is over ~1 MB. Split it or remove unused columns.");
                return;
              }
              setCsv(await f.text());
              setFileName(f.name);
            }}
          />
          {readError && (
            <p role="alert" className="mt-2 font-plex text-sm text-danger">
              ✕ {readError}
            </p>
          )}
        </div>
        <div className="max-w-md">
          <Label htmlFor="roster-version" hint="optional · e.g. luma-2026-10-24-0900">
            Source version
          </Label>
          <input id="roster-version" name="source_version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={120} className={`${inputCls} min-h-11`} />
        </div>
        <input type="hidden" name="csv" value={csv} />
        <input type="hidden" name="file_name" value={fileName} />
        <button type="submit" disabled={!csv || previewing} className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime disabled:opacity-50">
          {previewing ? "Reading…" : "Preview changes"}
        </button>
        {preview && !preview.ok && <Result state={preview} />}
      </form>

      {diff && preview && (
        <div className="space-y-6">
          <p role="status" className="font-plex text-sm text-bright">
            {preview.message}
          </p>
          <p className="font-plex text-xs break-all text-lightgray">
            Version <span className="text-bright">{diff.sourceVersion}</span> · format {diff.format.replace("_", " ")} · sha256 {diff.hash}
          </p>
          {diff.warnings.length > 0 && (
            <ul className="space-y-1 border-l-2 border-warning pl-3 font-plex text-xs text-warning">
              {diff.warnings.slice(0, 20).map((w) => (
                <li key={w}>! {w}</li>
              ))}
            </ul>
          )}
          <DiffTable title="New" tone="accent" rows={diff.added.map((r) => [r.lumaGuestId, r.name, r.approval, r.emailHint ?? "—"])} />
          <DiffTable
            title="Changed"
            tone="pending"
            rows={diff.changed.map((r) => [r.lumaGuestId, r.name, r.changes?.map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; ") ?? "", r.note ?? ""])}
          />
          <DiffTable title="Not in this file" tone="unverified" rows={diff.removed.map((r) => [r.lumaGuestId, r.name, r.approval, r.note ?? ""])} />
          <DiffTable title="Rejected rows" tone="danger" rows={diff.rejected.map((r) => [`line ${r.line}`, r.guest ?? "", r.reason, ""])} />

          <ActionForm
            action={commitImportAction}
            submit={`Import ${diff.added.length + diff.changed.length} changes`}
            pending="Importing…"
            confirm={`Apply ${diff.added.length} new and ${diff.changed.length} changed roster rows?`}
          >
            <input type="hidden" name="csv" value={csv} />
            <input type="hidden" name="expected_hash" value={diff.hash} />
            <input type="hidden" name="source_version" value={version} />
            <input type="hidden" name="file_name" value={fileName} />
            {diff.removed.length > 0 && (
              <label className="flex min-h-11 items-start gap-3 font-plex text-sm text-bright">
                <input type="checkbox" name="mark_missing" className="mt-1 h-5 w-5 accent-[var(--lime)]" />
                <span>
                  Mark the {diff.removed.length} guests missing from this file as not admitted
                  <span className="block text-xs text-lightgray">Anyone already checked in is flagged NEEDS_RECONCILIATION instead.</span>
                </span>
              </label>
            )}
          </ActionForm>
        </div>
      )}
    </div>
  );
}

function DiffTable({ title, tone, rows }: { title: string; tone: "accent" | "pending" | "unverified" | "danger"; rows: string[][] }) {
  if (!rows.length) return null;
  return (
    <details className="border border-hairline" open={rows.length <= 25}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-3 px-3 font-plex text-sm text-bright">
        <StatusPill tone={tone}>
          {title} · {rows.length}
        </StatusPill>
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left font-plex text-xs">
          <tbody>
            {rows.slice(0, 500).map((r, i) => (
              <tr key={i} className="border-t border-dashed border-hairline align-top">
                {r.map((c, j) => (
                  <td key={j} className={`px-3 py-2 ${j === 1 ? "text-bright" : "text-lightgray"}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 500 && <p className="px-3 py-2 font-plex text-xs text-lightgray">…and {rows.length - 500} more</p>}
      </div>
    </details>
  );
}
