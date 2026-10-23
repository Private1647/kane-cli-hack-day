import Link from "next/link";
import StatusPill from "@/components/ui/StatusPill";
import type { Mission } from "@/server/passport";

// One next best action, derived on the server from participant_state
// (T-PASS-02). Copy and actions come from a fixed table in
// src/server/passport.ts missionFor(): schema-driven, never generated.

export default function NextMissionCard({ mission }: { mission: Mission }) {
  return (
    <section aria-labelledby="mission-title" data-participant-state={mission.state} className="brackets border border-hairline bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{mission.eyebrow}</p>
        {mission.tone === "pending" && <StatusPill tone="pending">Waiting</StatusPill>}
        {mission.tone === "verified" && <StatusPill tone="verified">Verified · receipt on file</StatusPill>}
        {mission.tone === "accent" && <StatusPill tone="accent">Next</StatusPill>}
      </div>
      <h2 id="mission-title" className="mt-3 font-display text-2xl font-semibold text-bright sm:text-3xl">
        {mission.title}
      </h2>
      <p className="mt-2 max-w-xl font-plex text-sm leading-relaxed text-lightgray">{mission.body}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={mission.action.href} className="inline-flex min-h-11 items-center gap-2 bg-lime px-5 font-plex text-sm text-ink transition-colors hover:bg-bright">
          {mission.action.label} <span aria-hidden="true">→</span>
        </Link>
        {mission.secondary?.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
