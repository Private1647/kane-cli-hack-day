import StatusPill from "@/components/ui/StatusPill";
import { displayValue, METRICS, type MetricName, type MetricValue } from "./definitions";
import MetricDefinitionPopover from "./MetricDefinitionPopover";

// One live number with its provenance (T-LIVE-08). Unknown → "—" (never 0).
// Teal ✓ VERIFIED only for evidence-backed counts; detections get a grey
// SUSPECTED pill; plain operational counts get no pill. `held` marks a value
// we're still showing from before an outage.

const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : null);

/** A short, honest split under the number (e.g. outcomes of Kane executions). */
export function breakdownLine(v: MetricValue | undefined | null): string | null {
  if (!v || v.value == null || v.withheld) return null;
  const b = v.breakdown ?? {};
  switch (v.name) {
    case "kane_executions":
      return [b.passed != null && `${n(b.passed)} passed`, b.failed != null && `${n(b.failed)} failed`, b.errored_or_blocked != null && `${n(b.errored_or_blocked)} errored/blocked`]
        .filter(Boolean)
        .join(" · ");
    case "participants_checked_in":
      return b.walk_ins ? `${n(b.walk_ins)} walk-ins` : null;
    case "test_members_executed":
      return b.unique_definitions != null ? `${n(b.unique_definitions)} unique tests` : null;
    case "bugs_detected":
      return b.infra_or_auth_set_aside ? `${n(b.infra_or_auth_set_aside)} infra/auth set aside` : null;
    case "help_open":
      return b.waiting != null ? `${n(b.waiting)} waiting · ${n(b.with_mentor) ?? 0} with a mentor` : null;
    case "builds_validated":
      return v.sample_n ? `across ${n(v.sample_n)} projects` : null;
    default:
      return METRICS[v.name].median && v.sample_n ? `N = ${n(v.sample_n)}` : null;
  }
}

export default function VerifiedMetric({
  name,
  value,
  held = false,
  idSuffix = "",
  size = "strip",
  className = "",
}: {
  name: MetricName;
  value: MetricValue | undefined | null;
  held?: boolean;
  idSuffix?: string;
  size?: "strip" | "large" | "compact";
  className?: string;
}) {
  const def = METRICS[name];
  const shown = displayValue(value);
  const denom = shown != null && value?.denominator != null ? value.denominator : null;
  const split = breakdownLine(value);
  const numCls =
    size === "large" ? "text-[clamp(3rem,7vw,8rem)]" : size === "compact" ? "text-[clamp(1.75rem,3vw,2.5rem)]" : "text-[clamp(2.25rem,3.4vw,4.25rem)]";
  return (
    <div className={`brackets flex min-w-0 flex-col gap-2 border border-hairline bg-surface p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-pixel text-[10px] uppercase leading-relaxed tracking-[0.2em] text-lightgray">{def.label}</p>
        <MetricDefinitionPopover name={name} id={`${name}${idSuffix}`} />
      </div>
      <p className={`font-dots font-black leading-none ${shown == null ? "text-lightgray" : "text-bright"} ${numCls}`}>
        {shown ?? "—"}
        {denom != null && <span className="ml-2 align-baseline font-plex text-sm font-normal text-lightgray">of {denom.toLocaleString("en-US")}</span>}
      </p>
      <p className="font-plex text-xs leading-snug text-lightgray">
        {value?.withheld ? "Withheld: demo data never shows on production" : shown == null ? "No data yet" : def.footnote}
        {split && <span className="block text-bright/80">{split}</span>}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {shown != null && def.trust === "verified" && <StatusPill tone="verified">Verified</StatusPill>}
        {shown != null && def.trust === "suspected" && <StatusPill tone="suspected">Suspected</StatusPill>}
        {held && shown != null && (
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-warning">
            <span aria-hidden="true">◷ </span>Held · last known
          </span>
        )}
        {value?.is_demo && !value.withheld && (
          <span className="border border-dashed border-warning px-1.5 font-pixel text-[10px] uppercase tracking-[0.2em] text-warning">Demo</span>
        )}
      </div>
    </div>
  );
}
