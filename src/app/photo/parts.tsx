import StatusPill from "@/components/ui/StatusPill";
import { STATUS_LABEL, type PersonInPhoto, type PhotoStatus } from "@/server/photos";
import type { Checks } from "@/server/social";

// Shared, server-safe bits for the photographer studio and the media queue.
// Colours follow PLAN §3: amber = held / waiting on a human, red = declined,
// grey = suggestion or unknown, teal only for a consent on record.

export const label = "font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray";

export function PhotoStatusPill({ status, held }: { status: PhotoStatus; held?: boolean }) {
  if (status === "rejected") return <StatusPill tone="danger">Rejected</StatusPill>;
  if (held || status === "identity_review") return <StatusPill tone="pending">{held ? "Held" : STATUS_LABEL[status]}</StatusPill>;
  if (status === "published") return <span className="inline-flex items-center border border-bright px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] text-bright">Published</span>;
  return <span className="inline-flex items-center border border-hairline px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] text-lightgray">{STATUS_LABEL[status]}</span>;
}

export function ConsentPill({ p }: { p: Pick<PersonInPhoto, "publication"> }) {
  if (p.publication === true) return <StatusPill tone="verified">Consent on record</StatusPill>;
  if (p.publication === false) return <StatusPill tone="danger">Declined</StatusPill>;
  return <StatusPill tone="pending">Unknown · hold</StatusPill>;
}

export function MatchPill({ p }: { p: Pick<PersonInPhoto, "confirmed_at" | "match_basis"> }) {
  if (!p.confirmed_at) return <StatusPill tone="suspected">Suggested match</StatusPill>;
  return (
    <span className="inline-flex items-center border border-hairline px-2 py-0.5 font-plex text-[11px] text-bright">
      {p.match_basis === "qr_badge" ? "Badge scan" : p.match_basis === "manual_confirmation" ? "Confirmed by staff" : "Match confirmed by staff"}
    </span>
  );
}

const CHECK_NAMES: Record<keyof Checks, string> = { consent: "Consent", claims: "Claims", rights: "Image rights", duplicate: "Duplicates", length: "Length" };

export function ChecksList({ checks }: { checks: Checks | null }) {
  if (!checks || !Object.keys(checks).length) return <p className="font-plex text-xs text-lightgray">Checks not run.</p>;
  return (
    <ul className="space-y-1">
      {(Object.keys(CHECK_NAMES) as (keyof Checks)[]).map((k) => {
        const c = checks[k];
        if (!c) return null;
        return (
          <li key={k} className="flex flex-wrap items-baseline gap-2 font-plex text-xs">
            <span className={c.ok ? "text-bright" : "text-warning"}>
              <span aria-hidden="true">{c.ok ? "✓ " : "! "}</span>
              {CHECK_NAMES[k]} {c.ok ? "ok" : "hold"}
            </span>
            <span className="text-lightgray">{c.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Photographer studio sign-in prompt (staff log in at /ops/login). */
export { StaffGate } from "@/app/judge/parts";
