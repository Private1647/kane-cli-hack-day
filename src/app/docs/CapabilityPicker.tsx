"use client";

import { useState } from "react";
import { Label, inputCls } from "@/components/forms/fields";

export type Capability = { id: string; label: string; needs: string; proves: string; doc: string; workflow: readonly string[] };

/** Pick what your Kane CLI version and plan allow; see what it needs and an example workflow. */
export default function CapabilityPicker({ capabilities }: { capabilities: readonly Capability[] }) {
  const [id, setId] = useState(capabilities[0]?.id ?? "");
  const c = capabilities.find((x) => x.id === id) ?? capabilities[0];
  if (!c) return null;
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Label htmlFor="cap">Version or plan feature</Label>
        <select id="cap" value={id} onChange={(e) => setId(e.target.value)} className={`${inputCls} min-h-11`}>
          {capabilities.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <dl className="grid gap-3 font-plex text-sm sm:grid-cols-[10rem_minmax(0,1fr)]" aria-live="polite">
        <dt className="text-lightgray">Needs</dt>
        <dd className="text-bright">{c.needs}</dd>
        <dt className="text-lightgray">Proves</dt>
        <dd className="text-bright">{c.proves}</dd>
        <dt className="text-lightgray">Example workflow</dt>
        <dd>
          <pre className="overflow-x-auto border border-hairline bg-surface p-3 font-mono text-xs text-bright">{c.workflow.join("\n")}</pre>
        </dd>
        <dt className="text-lightgray">Docs</dt>
        <dd>
          <a href={c.doc} target="_blank" rel="noopener noreferrer" className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
            Official reference ↗
          </a>
        </dd>
      </dl>
      <p className="font-plex text-xs text-lightgray">
        Check what you have: <code className="text-bright">kane-cli --version</code> and <code className="text-bright">kane-cli whoami</code>, or run{" "}
        <code className="text-bright">kanehack doctor</code>.
      </p>
    </div>
  );
}
