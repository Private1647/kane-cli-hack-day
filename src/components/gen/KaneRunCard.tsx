import StatusPill, { type PillTone } from "@/components/ui/StatusPill";
import FreshnessStamp from "@/components/ui/FreshnessStamp";

// One Kane run (T-KANE-08, ui_type `kane_run`). What a judge or teammate
// needs to trust or doubt it: id, outcome, exit code, commit, how it was
// reported, why it is or isn't source-verified, and per-test results.
// A failing run reads as a DETECTION (grey, dashed), never as a confirmed bug;
// only a source-verified pass gets the teal ✓ VERIFIED.

export type KaneRunView = {
  id: number;
  status: "running" | "passed" | "failed" | "blocked" | "errored" | "cancelled";
  exit_code: number | null;
  has_terminal_event: boolean;
  source: string;
  upstream_execution_id: string;
  commit_sha: string | null;
  objective: string | null;
  verification_state: "reported" | "verified" | "manual_unverified";
  source_verified: boolean;
  trust_reasons: string[];
  summary: Record<string, unknown>;
  received_at: string;
  report_url: string | null;
  member_name?: string | null;
  evidence_id?: number | null;
  members: { id: string; name: string | null; status: string; duration_ms: number | null }[];
};

export function runPill(r: Pick<KaneRunView, "status" | "source_verified" | "verification_state">): { tone: PillTone; label: string } {
  if (r.status === "running") return { tone: "pending", label: "Running" };
  if (r.verification_state === "manual_unverified") return { tone: "unverified", label: `Manual · unverified · ${r.status}` };
  if (r.status === "passed") return r.source_verified ? { tone: "verified", label: "Verified pass" } : { tone: "unverified", label: "Reported pass · unverified" };
  if (r.status === "failed") return { tone: "suspected", label: "Failed run · detection" };
  if (r.status === "blocked") return { tone: "unverified", label: "Didn't run (exit 2)" };
  if (r.status === "cancelled") return { tone: "unverified", label: "Cancelled" };
  return { tone: "unverified", label: "No result" };
}

const MEMBER_TONE: Record<string, PillTone> = { passed: "unverified", failed: "suspected", blocked: "unverified", skipped: "unverified", errored: "unverified" };

const fmtDuration = (s: unknown) => (typeof s === "number" && Number.isFinite(s) ? (s >= 60 ? `${Math.round(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`) : null);

export default function KaneRunCard({ run, now, compact = false }: { run: KaneRunView; now?: string; compact?: boolean }) {
  const pill = runPill(run);
  const sum = run.summary ?? {};
  const oneLiner = typeof sum.one_liner === "string" ? sum.one_liner : typeof sum.reason === "string" ? sum.reason : null;
  const totals = sum.totals && typeof sum.totals === "object" ? (sum.totals as Record<string, number>) : null;
  const duration = fmtDuration(sum.duration_s);
  const family = typeof sum.family === "string" && sum.family !== "unknown" ? sum.family : null;
  return (
    <article id={`run-${run.id}`} className="scroll-mt-24 border border-hairline bg-surface p-4 sm:p-5" aria-labelledby={`run-${run.id}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
            KR-{run.id}
            {family ? ` · ${family}` : ""} · {run.source.replace("_", " ")}
          </p>
          <h3 id={`run-${run.id}-title`} className="mt-1 font-display text-lg leading-snug break-words text-bright">
            {run.objective ?? oneLiner ?? run.upstream_execution_id}
          </h3>
        </div>
        <StatusPill tone={pill.tone} size="md">
          {pill.label}
        </StatusPill>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-plex text-xs sm:grid-cols-4">
        <div>
          <dt className="text-lightgray">Exit code</dt>
          <dd className="font-dots text-base text-bright">{run.exit_code ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-lightgray">Completion event</dt>
          <dd className="text-bright">{run.has_terminal_event ? "Received" : "Missing"}</dd>
        </div>
        <div>
          <dt className="text-lightgray">Commit</dt>
          <dd className="text-bright">{run.commit_sha ? <code title={run.commit_sha}>{run.commit_sha.slice(0, 7)}</code> : "—"}</dd>
        </div>
        <div>
          <dt className="text-lightgray">Duration</dt>
          <dd className="text-bright">{duration ?? "—"}</dd>
        </div>
      </dl>

      {totals && (
        <p className="mt-3 font-plex text-xs text-lightgray">
          Suite: {totals.tests ?? "—"} tests · {totals.passed ?? "—"} passed · {totals.failed ?? "—"} failed{totals.broken ? ` · ${totals.broken} broken` : ""}
        </p>
      )}
      {oneLiner && run.objective && <p className="mt-3 font-plex text-sm text-lightgray">{oneLiner}</p>}

      {!compact && run.members.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[20rem] font-plex text-xs">
            <caption className="sr-only">Per-test results for KR-{run.id}</caption>
            <thead>
              <tr className="text-left text-lightgray">
                <th className="py-1 pr-3 font-normal">Test</th>
                <th className="py-1 pr-3 font-normal">Result</th>
                <th className="py-1 font-normal">Time</th>
              </tr>
            </thead>
            <tbody>
              {run.members.map((m) => (
                <tr key={m.id} className="border-t border-hairline">
                  <td className="py-1.5 pr-3 break-all text-bright">{m.name ?? m.id}</td>
                  <td className="py-1.5 pr-3">
                    <StatusPill tone={MEMBER_TONE[m.status] ?? "unverified"}>{m.status === "failed" ? "Failed · detection" : m.status}</StatusPill>
                  </td>
                  <td className="py-1.5 text-lightgray">{m.duration_ms !== null ? `${(m.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!compact && (
        <details className="mt-4 font-plex text-xs">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-lightgray hover:text-bright">Why {run.source_verified ? "it is" : "it isn’t"} source-verified</summary>
          <ul className="mt-1 list-inside list-disc space-y-1 text-lightgray">
            {run.trust_reasons.length ? run.trust_reasons.map((t) => <li key={t}>{t}</li>) : <li>No trust details were recorded for this run.</li>}
          </ul>
        </details>
      )}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-hairline pt-3">
        <FreshnessStamp asOf={run.received_at} now={now} staleAfterSec={24 * 3600} source={run.member_name ? `reported by ${run.member_name.split(" ")[0]}` : undefined} />
        <div className="flex flex-wrap gap-4 font-plex text-xs">
          {run.evidence_id ? (
            <a href={`#evidence-${run.evidence_id}`} className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
              Evidence EV-{run.evidence_id}
            </a>
          ) : (
            <span className="inline-flex min-h-11 items-center text-lightgray">No evidence attached</span>
          )}
          {run.report_url && (
            <a href={run.report_url} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
              Kane report ↗
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
