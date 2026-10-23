"use client";

import { useActionState, useState } from "react";
import { Label, inputCls } from "@/components/forms/fields";
import ActionForm, { ReasonField, Result } from "../_kit/ActionForm";
import type { OpsState } from "../_kit/state";
import { importCodesAction, previewCodesAction, reassignCodeAction, revealCodeAction, revokeCodeAction } from "./actions";

// Upload → preview counts → import. The file is read in the browser and sent
// as text; the server parses, dedupes (in the file and against the pool) and
// only then inserts.

const MAX = 1_900_000;

type Counts = { total: number; fresh: number; duplicates: number; duplicatesInFile: number; duplicatesInDb: number; invalid: { line: number; value: string }[] };

export function CodeImport() {
  const [text, setText] = useState("");
  const [batch, setBatch] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [preview, previewAction, previewing] = useActionState<OpsState, FormData>(previewCodesAction, null);
  const counts = preview?.ok ? (preview.data as Counts) : null;
  return (
    <div className="space-y-6">
      <form action={previewAction} className="space-y-4">
        <div>
          <Label htmlFor="cdx-file" hint="CSV with a code column, or one code per line">
            File
          </Label>
          <input
            id="cdx-file"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className={`${inputCls} min-h-11 file:mr-3 file:border-0 file:bg-bright file:px-3 file:py-1.5 file:font-plex file:text-ink`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setReadError(null);
              if (!f) return;
              if (f.size > MAX) return setReadError("That file is over ~2 MB. Split it.");
              setText(await f.text());
            }}
          />
          {readError && (
            <p role="alert" className="mt-2 font-plex text-sm text-danger">
              ✕ {readError}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="cdx-text" hint="or paste">
            Codes
          </Label>
          <textarea id="cdx-text" name="codes" rows={6} value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} font-mono`} placeholder={"code,amount,expires\nABCD-1234-EFGH,250,2026-12-31"} />
        </div>
        <button type="submit" disabled={previewing || !text.trim()} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-50">
          {previewing ? "Checking…" : "Preview"}
        </button>
        {preview && !preview.ok && <Result state={preview} />}
      </form>

      {counts && (
        <div className="space-y-4 border-t border-dashed border-hairline pt-4" role="status">
          <p className="font-plex text-sm text-bright">
            <span className="text-lime">{counts.fresh} new</span> · {counts.duplicates} duplicates ({counts.duplicatesInFile} in the file, {counts.duplicatesInDb} already in the pool) · {counts.invalid.length} invalid
          </p>
          {counts.invalid.length > 0 && (
            <ul className="max-h-40 overflow-y-auto font-plex text-xs text-lightgray">
              {counts.invalid.map((i) => (
                <li key={i.line}>
                  line {i.line}: “{i.value}”
                </li>
              ))}
            </ul>
          )}
          {counts.fresh > 0 && (
            <ActionForm action={importCodesAction} submit={`Import ${counts.fresh} codes`} pending="Importing…" confirm={`Add ${counts.fresh} new codes to the pool?`}>
              <input type="hidden" name="codes" value={text} />
              <div className="max-w-md">
                <Label htmlFor="cdx-batch" hint="optional · e.g. openai-2026-10-24">
                  Batch label
                </Label>
                <input id="cdx-batch" name="batch" value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={80} className={`${inputCls} min-h-11`} />
              </div>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}

export function RevealButton({ codeId }: { codeId: number }) {
  return (
    <ActionForm action={revealCodeAction} submit="Reveal" variant="secondary" pending="…" render={(s) => <span className="font-mono text-sm break-all text-bright">{(s.data as { code: string }).code}</span>}>
      <input type="hidden" name="code_id" value={codeId} />
    </ActionForm>
  );
}

export function RowActions({ memberId, codeId }: { memberId: number; codeId: number | null }) {
  const [open, setOpen] = useState<"revoke" | "reassign" | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {codeId && (
          <button type="button" onClick={() => setOpen(open === "revoke" ? null : "revoke")} className="min-h-11 border border-hairline px-3 font-plex text-xs text-bright hover:border-danger hover:text-danger">
            Revoke
          </button>
        )}
        <button type="button" onClick={() => setOpen(open === "reassign" ? null : "reassign")} className="min-h-11 border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
          {codeId ? "New code" : "Assign code"}
        </button>
      </div>
      {open === "revoke" && codeId && (
        <ActionForm action={revokeCodeAction} submit="Revoke code" variant="danger" confirm="Revoke this code? It is never handed out again.">
          <input type="hidden" name="code_id" value={codeId} />
          <ReasonField id={`rv-${codeId}`} placeholder="e.g. Code reported as already redeemed" />
        </ActionForm>
      )}
      {open === "reassign" && (
        <ActionForm action={reassignCodeAction} submit={codeId ? "Revoke and assign a new code" : "Assign a code"} confirm={codeId ? "Revoke their current code and assign the next one?" : undefined}>
          <input type="hidden" name="member_id" value={memberId} />
          <ReasonField id={`ra-${memberId}`} placeholder="e.g. Participant's code didn't work" />
        </ActionForm>
      )}
    </div>
  );
}
