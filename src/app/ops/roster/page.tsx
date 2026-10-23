import type { Metadata } from "next";
import Link from "next/link";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import StatusPill, { type PillTone } from "@/components/ui/StatusPill";
import { listRoster, listUnmatchedMembers, rosterStats, type RosterFilter } from "@/server/roster";
import ActionForm from "../_kit/ActionForm";
import { OpsPage, SectionLabel, StaffGate, Stats, SubNav, fmtTime } from "../_kit/shell";
import { reconcileAction } from "./actions";
import { ROSTER_TABS } from "./tabs";

export const metadata: Metadata = { title: "Roster", robots: { index: false } };

const FILTERS: { id: RosterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admitted", label: "Admitted" },
  { id: "checked_in", label: "Checked in" },
  { id: "not_checked_in", label: "Not here yet" },
  { id: "walk_in", label: "Walk-ins" },
  { id: "not_admitted", label: "Not admitted" },
  { id: "needs_reconciliation", label: "Needs reconciliation" },
  { id: "unlinked", label: "No registration" },
];

const ADMISSION: Record<string, { tone: PillTone; label: string }> = {
  admitted: { tone: "accent", label: "Admitted" },
  not_admitted: { tone: "unverified", label: "Not admitted" },
  needs_reconciliation: { tone: "pending", label: "Reconcile" },
  revoked: { tone: "danger", label: "Revoked" },
};

export default function RosterPage({ searchParams }: PageProps<"/ops/roster">) {
  return (
    <OpsPage eyebrow="Roster" dim="Approved guests," bright="Reconciled." intro="The admissions roster: Luma imports plus walk-ins. Registrations on this site are matched to it by email hash; anyone without a match needs a human.">
      <StaffGate roles={["organizer"]} next="/ops/roster">
        {async () => {
          const sp = await searchParams;
          const filter = (FILTERS.find((f) => f.id === sp.filter)?.id ?? "all") as RosterFilter;
          const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
          const [stats, rows, unmatched] = await Promise.all([rosterStats(), listRoster({ filter, q, limit: 500 }), listUnmatchedMembers(200)]);
          return (
            <div className="space-y-12">
              <SubNav items={ROSTER_TABS} current="/ops/roster" />
              <div className="space-y-3">
                <Stats
                  items={[
                    { label: "On roster", value: stats.guests },
                    { label: "Admitted", value: stats.admitted },
                    { label: "Checked in", value: stats.checkedIn },
                    { label: "Walk-ins", value: stats.walkIns },
                    { label: "Reconcile", value: stats.needsReconciliation, href: "/ops/roster?filter=needs_reconciliation" },
                    { label: "No roster match", value: stats.unmatchedMembers, hint: `of ${stats.members} registered`, href: "#unmatched" },
                  ]}
                />
                <p className="flex flex-wrap items-center gap-3 font-plex text-xs text-lightgray">
                  <FreshnessStamp asOf={stats.asOf} />
                  {stats.lastImport ? (
                    <span>
                      Last import RI-{stats.lastImport.id} · {stats.lastImport.source_version} · {fmtTime(stats.lastImport.created_at)} · {stats.lastImport.imported_by_name ?? "admin"}
                    </span>
                  ) : (
                    <span>
                      No Luma roster imported yet.{" "}
                      <Link href="/ops/roster/import" className="text-bright underline underline-offset-4 hover:text-lime">
                        Import one
                      </Link>
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                <ActionForm action={reconcileAction} submit="Reconcile registrations now" pending="Reconciling…" variant="secondary" />
                <a href="/ops/roster/export" className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
                  Export signed CSV
                </a>
              </div>

              <section>
                <SectionLabel aside={`${rows.length}${rows.length === 500 ? "+" : ""} shown`}>Guests</SectionLabel>
                <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
                  <label htmlFor="roster-q" className="sr-only">
                    Search roster
                  </label>
                  <input id="roster-q" name="q" defaultValue={q} placeholder="Name, Luma id or P-code" className="min-h-11 w-full border border-hairline bg-surface px-3 font-plex text-sm text-bright outline-none focus:border-lime sm:max-w-sm" />
                  <input type="hidden" name="filter" value={filter} />
                  <button type="submit" className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
                    Search
                  </button>
                </form>
                <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
                  {FILTERS.map((f) => (
                    <Link
                      key={f.id}
                      href={`/ops/roster?filter=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                      aria-current={f.id === filter ? "true" : undefined}
                      className={`inline-flex min-h-11 items-center border px-3 font-plex text-xs ${f.id === filter ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
                    >
                      {f.label}
                    </Link>
                  ))}
                </nav>
                <div className="overflow-x-auto border border-hairline">
                  <table className="w-full min-w-[820px] text-left font-plex text-sm">
                    <thead className="border-b border-hairline bg-surface font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                      <tr>
                        <th className="px-3 py-3 font-normal">Name</th>
                        <th className="px-3 py-3 font-normal">Source</th>
                        <th className="px-3 py-3 font-normal">Luma</th>
                        <th className="px-3 py-3 font-normal">Admission</th>
                        <th className="px-3 py-3 font-normal">Checked in</th>
                        <th className="px-3 py-3 font-normal">Member</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const a = ADMISSION[r.admission_status];
                        return (
                          <tr key={r.id} className="border-b border-dashed border-hairline align-top last:border-0">
                            <td className="px-3 py-3">
                              <span className="text-bright">{r.name}</span>
                              <span className="block text-xs text-lightgray">
                                {r.email_hint ?? "no email"}
                                {r.luma_guest_id ? ` · ${r.luma_guest_id}` : ""}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-lightgray">{r.source.replace("_", " ")}</td>
                            <td className="px-3 py-3 text-lightgray">{r.approval_status.replace("_", " ")}</td>
                            <td className="px-3 py-3">
                              <StatusPill tone={a.tone}>{a.label}</StatusPill>
                              {r.staff_reference && <span className="mt-1 block text-xs text-lightgray">{r.staff_reference}</span>}
                            </td>
                            <td className="px-3 py-3 text-lightgray">
                              {r.checked_in_at ? (
                                <>
                                  {fmtTime(r.checked_in_at)}
                                  <span className="block text-xs">{r.checked_in_by_name ?? (r.source === "luma_csv" ? "Luma" : "—")}</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-3 text-lightgray">
                              {r.public_code ? (
                                <Link href={`/ops/checkin?q=${encodeURIComponent(r.public_code)}`} className="text-bright hover:text-lime">
                                  {r.public_code}
                                </Link>
                              ) : (
                                "not registered"
                              )}
                              {r.team_name && <span className="block text-xs">{r.team_name}</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-lightgray">
                            No guests match.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <SectionLabel id="unmatched" aside="NEEDS_RECONCILIATION">
                  Registered, not on the roster · {unmatched.length}
                </SectionLabel>
                <p className="mb-4 max-w-2xl font-plex text-sm text-lightgray">
                  These people registered on the site but their email isn&apos;t on the Luma roster. They can&apos;t activate until a human decides: admit them at the desk (as a
                  walk-in) or leave them out. Usually it&apos;s a different email on Luma.
                </p>
                {unmatched.length === 0 ? (
                  <p className="font-plex text-sm text-lightgray">Everyone who registered matches the roster.</p>
                ) : (
                  <ul className="grid gap-x-6 border-t border-dashed border-hairline sm:grid-cols-2">
                    {unmatched.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 border-b border-dashed border-hairline py-2 font-plex text-sm">
                        <span className="min-w-0">
                          <span className="text-bright">{m.name}</span>
                          <span className="block text-xs text-lightgray">
                            {m.public_code ?? "—"} · {m.team_name ?? "no team"}
                          </span>
                        </span>
                        {m.public_code && (
                          <Link href={`/ops/checkin?q=${encodeURIComponent(m.public_code)}`} className="inline-flex min-h-11 shrink-0 items-center font-plex text-xs text-lightgray hover:text-lime">
                            Resolve at desk →
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
