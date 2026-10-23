import Link from "next/link";
import type { ReactNode } from "react";
import StatusPill, { type PillTone } from "@/components/ui/StatusPill";
import { event } from "@/data/hackday";

// Shared bits for the judge console: sign-in prompt, labels, timestamps and
// the one mapping from evidence state to a status pill (PLAN §3: teal only
// for evidence-backed success, grey for detections and unbacked claims).

export const label = "font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray";

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: event.timezone, timeZoneName: "short" });
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: event.timezone });
export const when = (d: Date | string | null | undefined) => (d ? `${day.format(new Date(d))} · ${clock.format(new Date(d))}` : "—");

/** Signed-out or wrong-role view. Staff sign in at /ops/login. */
export function StaffGate({ role, next, signedIn = false }: { role: string; next: string; signedIn?: boolean }) {
  return (
    <div className="max-w-md space-y-4">
      <p className="font-plex text-sm text-lightgray">
        {signedIn ? `This page is for the ${role} role. Ask an organizer if you should have it.` : `Staff only: sign in with the ${role} account an organizer gave you.`}
      </p>
      {!signedIn && (
        <Link
          href={`/ops/login?next=${encodeURIComponent(next)}`}
          className="inline-flex min-h-11 items-center bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime"
        >
          Staff sign in →
        </Link>
      )}
    </div>
  );
}

/** A Kane run's state. Passed counts as VERIFIED only with a verified source, a terminal event and exit 0. */
export function runPill(r: { status: string; source_verified: boolean; has_terminal_event: boolean; exit_code: number | null; verification_state: string }): { tone: PillTone; text: string } {
  if (r.status === "passed") {
    return r.source_verified && r.has_terminal_event && r.exit_code === 0 && r.verification_state === "verified"
      ? { tone: "verified", text: "Verified · passed" }
      : { tone: "unverified", text: "Passed · unverified" };
  }
  if (r.status === "running") return { tone: "pending", text: "Running" };
  if (r.status === "cancelled") return { tone: "unverified", text: "Cancelled" };
  // failed / blocked / errored: a detection, not a confirmed bug.
  return { tone: "suspected", text: `Suspected · ${r.status}` };
}

export function milestonePill(confidence: string): { tone: PillTone; text: string } {
  if (confidence === "verified") return { tone: "verified", text: "Verified" };
  if (confidence === "inferred") return { tone: "suspected", text: "Inferred" };
  return { tone: "unverified", text: "Participant reported" };
}

export function defectPill(status: string): { tone: PillTone; text: string } {
  if (status === "confirmed") return { tone: "danger", text: "Confirmed bug" };
  if (status === "reverified") return { tone: "verified", text: "Verified · fixed" };
  if (status === "fixed") return { tone: "unverified", text: "Fixed · unverified" };
  if (status === "not_a_bug") return { tone: "unverified", text: "Not a bug" };
  return { tone: "suspected", text: "Suspected" };
}

export function Pill({ p }: { p: { tone: PillTone; text: string } }) {
  return <StatusPill tone={p.tone}>{p.text}</StatusPill>;
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="brackets border border-hairline bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={label}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Small hairline tag for neutral states (draft, committed, not started). */
export function Tag({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 font-plex text-[11px] ${strong ? "border-bright text-bright" : "border-hairline text-lightgray"}`}>{children}</span>
  );
}
