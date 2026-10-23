import type { ReactNode } from "react";
import StatusPill from "@/components/ui/StatusPill";
import type { TeamState } from "@/server/teams";

// Server-safe display bits shared by /team, /match and the idea tab.

/** A neutral state label: hairline box, pixel caps. For lifecycle states that aren't pass/fail. */
export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center border border-hairline px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] whitespace-nowrap text-lightgray ${className}`}>
      {children}
    </span>
  );
}

const TEAM_STATE_WORD: Record<TeamState, string> = {
  recruiting: "Recruiting",
  formed: "Formed",
  active: "Building",
  roster_locked: "Roster locked",
  submitted: "Submitted",
  withdrawn: "Withdrawn",
};

/** Team lifecycle in words. Locked is amber (a deadline acted); the rest are neutral. */
export function StateLine({ state, locked }: { state: TeamState; locked: boolean }) {
  if (state === "roster_locked" || (locked && state !== "submitted" && state !== "withdrawn")) return <StatusPill tone="pending">Roster locked</StatusPill>;
  return <Tag>{TEAM_STATE_WORD[state]}</Tag>;
}

/** A Doto number with a label. null renders "—", never 0. */
export function Stat({ value, label, denominator }: { value: number | null; label: string; denominator?: number | null }) {
  return (
    <div className="border border-hairline p-4">
      <p className="font-dots text-4xl leading-none font-black text-bright">
        {value ?? "—"}
        {denominator != null && value != null && <span className="text-lightgray">/{denominator}</span>}
      </p>
      <p className="mt-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</p>
    </div>
  );
}

export function Panel({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="border-t border-dashed border-hairline pt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-bright">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
