import type { ReactNode } from "react";

// A banner for when something we depend on is slow or down. Says what still
// works and where the manual route is; never hides the page behind it.
//   delayed / stale / degraded → amber (waiting)   offline / down → red (confirmed outage)

export type DegradedState = "delayed" | "stale" | "degraded" | "offline" | "down";

const LABEL: Record<DegradedState, string> = {
  delayed: "Delayed",
  stale: "Stale",
  degraded: "Degraded",
  offline: "Offline",
  down: "Down",
};

export default function DegradedServiceAlert({
  state,
  system,
  children,
  manualRoute,
  manualLabel = "Use the manual route",
  className = "",
}: {
  state: DegradedState;
  /** e.g. "Live metrics", "Slack", "Renderer". */
  system?: string;
  /** What still works / what to do. Plain words. */
  children?: ReactNode;
  manualRoute?: string;
  manualLabel?: string;
  className?: string;
}) {
  const red = state === "offline" || state === "down";
  const tone = red ? "border-danger bg-danger-deep text-danger" : "border-warning bg-warning-deep text-warning";
  return (
    <div role={red ? "alert" : "status"} className={`flex flex-wrap items-start gap-x-4 gap-y-2 border-l-2 px-4 py-3 ${tone} ${className}`}>
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em]">
        <span aria-hidden="true">{red ? "✕ " : "! "}</span>
        {system ? `${system}: ` : ""}
        {LABEL[state]}
      </p>
      {children && <div className="min-w-0 flex-1 font-plex text-sm text-bright">{children}</div>}
      {manualRoute && (
        <a href={manualRoute} className="inline-flex min-h-11 items-center font-plex text-sm underline underline-offset-4 hover:text-bright">
          {manualLabel} →
        </a>
      )}
    </div>
  );
}
