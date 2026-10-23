import type { Metadata } from "next";
import Link from "next/link";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import StatusPill from "@/components/ui/StatusPill";
import { formatEventTime, getEvent } from "@/lib/event";
import { hasRole } from "@/server/auth";
import { LEDGERS, SEVERITY_LABEL, SUBSYSTEMS, listIncidents, reconciliationView, type ReconRow } from "@/server/recovery";
import { OpsPage, Panel, SectionLabel, StaffGate, fmtTime } from "../_kit/shell";
import { PaperTicketForm } from "../help/parts";
import { CloseIncident, LedgerUpload, ManualReceipt, OpenIncident } from "./parts";

export const metadata: Metadata = { title: "Recovery", robots: { index: false } };

// /ops/recovery (T-OPS-05, SPEC §12): the backup operations route. Tier-0
// (check-in, help, submission) keeps working here when automation fails, and
// everything taken on paper comes back in through the ledgers below.

const JUMPS = [
  ["incidents", "Incidents"],
  ["checkin", "Manual check-in"],
  ["help", "Paper help"],
  ["receipt", "Manual receipt"],
  ["ledgers", "CSV ledgers"],
  ["reconcile", "Reconciliation"],
  ["kit", "Print kit"],
] as const;

/** "2026-10-23T00:15" in the event zone: the form the paper time was written in. */
const wallTime = (d: Date | string, tz: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d)).replace(" ", "T");

const RECON_TONE: Record<ReconRow["state"], { tone: "pending" | "unverified" | "danger"; label: string }> = {
  needs_review: { tone: "pending", label: "Needs review" },
  recorded: { tone: "unverified", label: "Manual · unverified" },
  conflict: { tone: "danger", label: "Exception" },
};

export default function RecoveryPage() {
  return (
    <OpsPage
      eyebrow="Recovery"
      dim="When things break," bright="Tier-0 survives."
      intro="Check-in, help and submission keep working from this page and from paper. Nothing taken by hand is backdated or turned into a verified result; it is reconciled later by its paper id."
    >
      <StaffGate roles={["organizer", "mentor"]} next="/ops/recovery">
        {async (staff) => {
          const organizer = hasRole(staff, "organizer");
          const [ev, incidents, recon] = await Promise.all([getEvent(), organizer ? listIncidents() : Promise.resolve([]), organizer ? reconciliationView() : Promise.resolve({ rows: [], partial: [] })]);
          const open = incidents.filter((i) => !i.closed_at);
          const lockLabel = `${formatEventTime(ev.submissionLocksAt, ev)} (${fmtTime(ev.submissionLocksAt, ev.timezone)})`;
          // Same slip form as /ops/help: date + 24-hour time in the event zone, late reason, replay-safe.
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: ev.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ev.now);
          const zone = new Intl.DateTimeFormat("en-US", { timeZone: ev.timezone, timeZoneName: "short" }).formatToParts(ev.now).find((p) => p.type === "timeZoneName")?.value ?? ev.timezone;
          return (
            <div className="space-y-14">
              {open.map((i) => (
                <DegradedServiceAlert key={i.id} state={i.severity === "sev1" ? "down" : "degraded"} system={`${i.code} · ${i.subsystem}`}>
                  {SEVERITY_LABEL[i.severity]}: {i.description}
                </DegradedServiceAlert>
              ))}
              <nav aria-label="Recovery sections" className="flex flex-wrap gap-2">
                {JUMPS.filter(([id]) => organizer || id === "help" || id === "kit" || id === "checkin").map(([id, label]) => (
                  <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
                    {label}
                  </a>
                ))}
              </nav>

              {organizer && (
                <section>
                  <SectionLabel id="incidents" aside={`${open.length} open`}>
                    Incidents
                  </SectionLabel>
                  <div className="grid gap-8 lg:grid-cols-2">
                    <Panel title="Open an incident">
                      <OpenIncident subsystems={SUBSYSTEMS} />
                    </Panel>
                    <ul className="border-t border-dashed border-hairline">
                      {incidents.map((i) => (
                        <li key={i.id} className="space-y-2 border-b border-dashed border-hairline py-3 font-plex text-sm">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="text-bright">{i.code}</span>
                            {i.closed_at ? <StatusPill tone="unverified">Closed</StatusPill> : <StatusPill tone={i.severity === "sev1" ? "danger" : "pending"}>{SEVERITY_LABEL[i.severity]}</StatusPill>}
                            <span className="text-xs text-lightgray">{i.subsystem}</span>
                          </p>
                          <p className="text-lightgray">{i.description}</p>
                          <p className="text-xs text-lightgray">
                            Opened {fmtTime(i.created_at)} by {i.opened_by_name ?? "admin"}
                            {i.closed_at && ` · closed ${fmtTime(i.closed_at)} by ${i.closed_by_name ?? "admin"}: ${i.recovery_basis ?? ""}`}
                          </p>
                          {!i.closed_at && <CloseIncident id={i.id} code={i.code} />}
                        </li>
                      ))}
                      {incidents.length === 0 && <li className="py-3 font-plex text-sm text-lightgray">No incidents recorded.</li>}
                    </ul>
                  </div>
                </section>
              )}

              <section>
                <SectionLabel id="checkin">Manual check-in</SectionLabel>
                <p className="max-w-2xl font-plex text-sm text-lightgray">
                  Online: the{" "}
                  <Link href="/ops/checkin" className="text-bright underline underline-offset-4 hover:text-lime">
                    check-in desk
                  </Link>{" "}
                  (search, QR, walk-ins) works on any phone. Offline: tick the{" "}
                  <Link href="/ops/roster/print" className="text-bright underline underline-offset-4 hover:text-lime">
                    printed signed roster
                  </Link>{" "}
                  and hand out{" "}
                  <Link href="/ops/recovery/print/stock" className="text-bright underline underline-offset-4 hover:text-lime">
                    P-OFF slips
                  </Link>{" "}
                  to anyone not on it, marked NEEDS_RECONCILIATION. When the network is back, admit them at the desk as walk-ins with the slip number in the note.
                </p>
                <p className="mt-3 max-w-2xl font-plex text-sm text-lightgray">
                  Approved guests checked in on paper go back in through the <span className="text-bright">check-in ledger</span> under{" "}
                  <a href="#ledgers" className="text-bright underline underline-offset-4 hover:text-lime">
                    CSV ledgers
                  </a>
                  : one row per signed slip with the attendee&apos;s Luma guest id or P-code, the time on the slip and why it was entered late. The slip time is kept as the
                  check-in time beside the entry time, and the same slip id never checks anyone in twice.
                </p>
              </section>

              <section>
                <SectionLabel id="help" aside="fallback/04 · mentor-queue-template.csv">
                  Paper help ticket
                </SectionLabel>
                <Panel>
                  <PaperTicketForm today={today} zone={zone} />
                </Panel>
              </section>

              {organizer && (
                <>
                  <section>
                    <SectionLabel id="receipt" aside="fallback/05 · officer + witness">
                      Manual submission receipt
                    </SectionLabel>
                    <Panel>
                      <ManualReceipt lockLabel={lockLabel} defaultOfficer={staff.name} />
                    </Panel>
                  </section>

                  <section>
                    <SectionLabel id="ledgers" aside="source manual_offline · original timestamps kept">
                      Batch upload paper ledgers
                    </SectionLabel>
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                      <Panel>
                        <LedgerUpload kinds={Object.entries(LEDGERS).filter(([id]) => id !== "roster_import").map(([id, l]) => ({ id, label: l.label, file: l.file }))} />
                      </Panel>
                      <div>
                        <p className="mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">CSV templates (work offline too)</p>
                        <ul className="space-y-1 font-plex text-sm">
                          {Object.values(LEDGERS).map((l) => (
                            <li key={l.file}>
                              <a href={`/print/${l.file}`} download className="inline-flex min-h-11 items-center text-bright underline underline-offset-4 hover:text-lime">
                                {l.file}
                              </a>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 font-plex text-xs text-lightgray">
                          The check-in ledger checks in admitted roster guests only; it never admits anyone. Roster CSVs go through{" "}
                          <Link href="/ops/roster/import" className="underline underline-offset-4 hover:text-lime">
                            Roster → Import
                          </Link>{" "}
                          (diff preview). Team and activity ledgers are recorded for review only: team changes need every member&apos;s consent.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <SectionLabel id="reconcile" aside={<a href="/ops/recovery/reconciliation" className="underline underline-offset-4 hover:text-lime">Download as CSV</a>}>
                      Reconciliation · {recon.rows.length}
                    </SectionLabel>
                    {recon.partial.length > 0 && (
                      <DegradedServiceAlert state="degraded" system="Reconciliation">
                        Couldn&apos;t read: {recon.partial.join(", ")} (migration not applied yet?).
                      </DegradedServiceAlert>
                    )}
                    <div className="overflow-x-auto border border-hairline">
                      <table className="w-full min-w-[760px] text-left font-plex text-sm">
                        <thead className="border-b border-hairline bg-surface font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                          <tr>
                            <th className="px-3 py-3 font-normal">Ref</th>
                            <th className="px-3 py-3 font-normal">Record</th>
                            <th className="px-3 py-3 font-normal">Paper time</th>
                            <th className="px-3 py-3 font-normal">Entered</th>
                            <th className="px-3 py-3 font-normal">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recon.rows.map((r) => (
                            <tr key={`${r.kind}-${r.ref}`} className="border-b border-dashed border-hairline align-top last:border-0">
                              <td className="px-3 py-3 text-bright">
                                {r.ref}
                                <span className="block text-xs text-lightgray">{r.kind}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-bright">{r.title}</span>
                                <span className="block text-xs text-lightgray">{r.detail}</span>
                                {r.links && (
                                  <span className="mt-1 flex flex-wrap gap-x-3 text-xs">
                                    {r.links.map((l) => (
                                      <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-bright underline underline-offset-4 hover:text-lime">
                                        {l.label} →
                                      </Link>
                                    ))}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-lightgray">
                                {r.at ? (
                                  <time dateTime={new Date(r.at).toISOString()}>
                                    {fmtTime(r.at)}
                                    <span className="block text-xs">{wallTime(r.at, ev.timezone)}</span>
                                  </time>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-3 text-lightgray">{fmtTime(r.entered_at)}</td>
                              <td className="px-3 py-3">
                                <StatusPill tone={RECON_TONE[r.state].tone}>{RECON_TONE[r.state].label}</StatusPill>
                              </td>
                            </tr>
                          ))}
                          {recon.rows.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-3 py-8 text-center text-lightgray">
                                Nothing taken by hand. Good.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              <section>
                <SectionLabel id="kit">Print kit</SectionLabel>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["/ops/recovery/print", "All 11 fallback documents", "Failure matrix, runbook, forms, receipts, quickstart, announcements, offline ledger"],
                    ["/ops/recovery/print/signage", "QR signage posters", "Activation, help desk, team finder, live TV"],
                    ["/ops/recovery/print/stock", "Pre-numbered paper stock", "P-OFF badges, H- tickets, S- receipts"],
                    ["/ops/roster/print", "Signed roster", "Alphabetical tick list with P-codes"],
                    ["/print/brief.html", "Static event brief", "Works with the backend down"],
                    ["/print/tv-fallback.html", "Static TV fallback", "STALE banner + deadline for the screen"],
                  ].map(([href, title, sub]) => (
                    <li key={href}>
                      <a href={href} className="brackets block min-h-11 border border-hairline bg-surface p-4 transition-colors hover:border-lime">
                        <span className="block font-plex text-sm text-bright">{title} →</span>
                        <span className="mt-1 block font-plex text-xs text-lightgray">{sub}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
