import { METRICS, type MetricName } from "./definitions";

// "What does this number mean?" for one metric (T-LIVE-08): numerator,
// denominator, source and trust gate from METRIC_DEFINITIONS.md. Uses the
// native popover API, so it needs no client JS, closes on Escape / outside
// click and is keyboard-reachable. `id` must be unique on the page.

export default function MetricDefinitionPopover({ name, id }: { name: MetricName; id: string }) {
  const def = METRICS[name];
  const popId = `metric-def-${id}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={popId}
        aria-label={`How "${def.label}" is counted`}
        className="-m-3 inline-flex h-11 w-11 shrink-0 items-center justify-center font-plex text-sm text-lightgray hover:text-bright"
      >
        <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-hairline text-[11px]">
          i
        </span>
      </button>
      <div
        id={popId}
        popover="auto"
        className="m-auto w-[min(92vw,30rem)] border border-hairline bg-surface p-5 text-left text-bright backdrop:bg-ink/70"
      >
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">How it&rsquo;s counted</p>
        <h3 className="mt-2 font-display text-2xl font-medium">{def.label}</h3>
        <dl className="mt-4 space-y-3 font-plex text-sm">
          {(
            [
              ["Counts", def.numerator],
              ["Per / out of", def.denominator],
              ["Source", def.source],
              ["Trust gate", def.trustGate],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 border-t border-hairline pt-3">
              <dt className="text-lightgray">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 font-plex text-xs text-lightgray">
          A dash (—) means unknown, never zero. Signals are never added into one score or compared across projects.
        </p>
        <button
          type="button"
          popoverTarget={popId}
          popoverTargetAction="hide"
          className="mt-4 inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm hover:border-bright"
        >
          Close
        </button>
      </div>
    </>
  );
}
