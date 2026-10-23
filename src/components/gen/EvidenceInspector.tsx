import StatusPill from "@/components/ui/StatusPill";

// The evidence tree for a project (T-KANE-08): every stored file with its
// sha256, which run it backs, and its review state. Files are private: the
// links go through /api/v1/kane/evidence/{id}, which re-checks who is asking.
// Quarantined files are listed (so the team knows why) but never linked.

export type EvidenceView = {
  id: number;
  kind: string;
  sha256: string;
  size_bytes: number | null;
  visibility: string;
  source_run_id: number | null;
  verified_at: string | null;
  redaction_state: "unreviewed" | "clean" | "redacted" | "quarantined";
  quarantine_reason: string | null;
  original_name: string | null;
  uploaded_at: string;
};

const size = (n: number | null) => (n === null ? "—" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function statePill(e: EvidenceView) {
  if (e.redaction_state === "quarantined") return <StatusPill tone="danger">Quarantined</StatusPill>;
  if (e.verified_at) return <StatusPill tone="verified">Verified · hash matches run</StatusPill>;
  return <StatusPill tone="unverified">Unverified upload</StatusPill>;
}

export default function EvidenceInspector({ evidence, emptyHint }: { evidence: EvidenceView[]; emptyHint?: string }) {
  if (!evidence.length) {
    return <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">{emptyHint ?? "No evidence uploaded yet."}</p>;
  }
  return (
    <ul className="divide-y divide-hairline border border-hairline" aria-label="Evidence files">
      {evidence.map((e) => (
        <li key={e.id} id={`evidence-${e.id}`} className="scroll-mt-24 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                EV-{e.id} · {e.kind} · {size(e.size_bytes)} · {e.visibility}
              </p>
              <p className="mt-1 font-plex text-sm break-all text-bright">{e.original_name ?? `evidence-${e.id}`}</p>
            </div>
            {statePill(e)}
          </div>
          <p className="mt-2 font-plex text-[11px] break-all text-lightgray">
            sha256 <code>{e.sha256}</code>
          </p>
          {e.quarantine_reason && <p className="mt-2 font-plex text-xs text-danger">Why: {e.quarantine_reason}. Organizers can review it; it won’t count as proof.</p>}
          <div className="mt-2 flex flex-wrap gap-4 font-plex text-xs">
            {e.source_run_id && (
              <a href={`#run-${e.source_run_id}`} className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                Backs run KR-{e.source_run_id}
              </a>
            )}
            {e.redaction_state !== "quarantined" && (
              <a href={`/api/v1/kane/evidence/${e.id}`} className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                Open file (private)
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
