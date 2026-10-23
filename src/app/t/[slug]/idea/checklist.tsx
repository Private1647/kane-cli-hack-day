import StatusPill from "@/components/ui/StatusPill";
import { CRITERIA, type Assessment, type Verdict } from "@/server/ideas";

// IdeaChecklist (T-IDEA-03): ✓ / ! / ✗ per criterion with the quoted
// evidence, the verdict, exactly three changes and the Kane path. Advisory
// only: it never uses the teal VERIFIED treatment, which means evidence.
// Renders on the server and in print; no hooks.

const MARK = {
  met: { glyph: "✓", word: "Covered", cls: "border-bright text-bright" },
  partial: { glyph: "!", word: "Partly", cls: "border-warning text-warning" },
  missing: { glyph: "✗", word: "Missing", cls: "border-dashed border-lightgray text-lightgray" },
} as const;

export function VerdictPill({ verdict }: { verdict: Verdict | "draft" }) {
  if (verdict === "qualifies")
    return (
      <span className="inline-flex items-center gap-1.5 border border-bright px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] text-bright">
        <span aria-hidden="true">→</span>Qualifies · advisory
      </span>
    );
  if (verdict === "needs_work") return <StatusPill tone="pending">Needs work</StatusPill>;
  if (verdict === "ineligible") return <StatusPill tone="suspected">Ineligible as written</StatusPill>;
  return <StatusPill tone="unverified">Not checked yet</StatusPill>;
}

export function AdvisoryBanner() {
  return (
    <p className="border border-dashed border-lightgray px-3 py-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
      Advisory — not an official score. Judges score separately against the published rubric.
    </p>
  );
}

export default function IdeaChecklist({ assessment, stale = false, print = false }: { assessment: Assessment; stale?: boolean; print?: boolean }) {
  return (
    <div className="space-y-5">
      <AdvisoryBanner />
      <div className="flex flex-wrap items-center gap-3">
        <VerdictPill verdict={assessment.verdict} />
        <span className="font-plex text-xs text-lightgray">
          {assessment.generator === "llm" ? `Advisory draft · ${assessment.model ?? "AI"}` : "Rule-based check"}
          {stale && " · your idea changed since this check"}
        </span>
      </div>
      {assessment.warning && <p className="font-plex text-xs text-warning">{assessment.warning}</p>}
      <p className="font-plex text-sm text-bright">{assessment.summary}</p>

      <ol className={`grid gap-2 ${print ? "" : "sm:grid-cols-2"}`}>
        {CRITERIA.map((c, n) => {
          const r = assessment.criteria.find((x) => x.id === c.id);
          const m = MARK[r?.status ?? "missing"];
          return (
            <li key={c.id} className="print-avoid-break flex gap-3 border border-hairline p-3">
              <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center border font-plex text-sm ${m.cls}`}>
                {m.glyph}
              </span>
              <div className="min-w-0">
                <p className="font-plex text-sm text-bright">
                  {n + 1}. {c.label} <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-lightgray">{m.word}</span>
                </p>
                <p className="mt-1 font-plex text-xs break-words text-lightgray">{r?.evidence ?? "Not assessed"}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="print-avoid-break">
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Three changes</p>
        <ol className="space-y-2">
          {assessment.changes.map((c, i) => (
            <li key={i} className="flex gap-3 font-plex text-sm text-bright">
              <span className="font-dots text-lg leading-none text-lime">{i + 1}</span>
              <span>{c}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="print-avoid-break">
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Recommended Kane path</p>
        <ol className="space-y-2 border-l border-hairline pl-4">
          {assessment.kane_path.map((p) => (
            <li key={p.capability} className="font-plex text-sm">
              <span className="text-bright">{p.label}</span>
              <span className="block text-xs text-lightgray">{p.why}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
