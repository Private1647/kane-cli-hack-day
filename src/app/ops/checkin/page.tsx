import type { Metadata } from "next";
import Link from "next/link";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import { hasRole } from "@/server/auth";
import { rosterStats, searchCheckin } from "@/server/roster";
import { OpsPage, Panel, SectionLabel, StaffGate, Stats, fmtTime } from "../_kit/shell";
import { HitRow, SearchBox, WalkInForm, type Hit } from "./parts";

export const metadata: Metadata = { title: "Check-in", robots: { index: false } };

// The staff check-in desk (T-ROS-03). Phone first: one search box, big tap
// targets, a camera QR scan, and the walk-in form below. Works the same for
// mentors and organizers; only organizers can admit someone not approved.

export default function CheckinPage({ searchParams }: PageProps<"/ops/checkin">) {
  return (
    <OpsPage eyebrow="Check-in" dim="Who's here," bright="Checked in." intro="Search by name, P-code, Luma guest id or exact email. Scan a badge QR. Walk-ins get a roster row and a P-code on the spot.">
      <StaffGate roles={["organizer", "mentor"]} next="/ops/checkin">
        {async (staff) => {
          const sp = await searchParams;
          const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
          const [stats, hits] = await Promise.all([rosterStats(), q ? searchCheckin(q) : Promise.resolve([])]);
          const rows: Hit[] = hits.map((h) => ({
            ...h,
            checkedInAt: h.checkedInAt ? new Date(h.checkedInAt).toISOString() : null,
            checkedInLabel: h.checkedInAt ? fmtTime(h.checkedInAt).replace(/^\w+ \d+, /, "") : null,
          }));
          return (
            <div className="space-y-12">
              <div className="space-y-3">
                <Stats
                  cols="sm:grid-cols-4"
                  items={[
                    { label: "Checked in", value: stats.guests ? stats.checkedIn : null, hint: stats.admitted ? `of ${stats.admitted} admitted` : "no roster yet" },
                    { label: "Walk-ins", value: stats.guests ? stats.walkIns : null },
                    { label: "Not admitted", value: stats.guests ? stats.notAdmitted : null },
                    { label: "No roster match", value: stats.unmatchedMembers, hint: "registered on site", href: hasRole(staff, "organizer") ? "/ops/roster?filter=unlinked#unmatched" : undefined },
                  ]}
                />
                <FreshnessStamp asOf={stats.asOf} source={stats.lastImport ? `roster ${stats.lastImport.source_version}` : "no roster imported"} />
              </div>

              <section aria-labelledby="find">
                <SectionLabel id="find">Find a person</SectionLabel>
                <SearchBox q={q} />
                {q && (
                  <div className="mt-6">
                    <p className="font-plex text-xs text-lightgray" role="status">
                      {rows.length === 0 ? `No one matches “${q}”. Check the spelling, try the P-code, or admit them as a walk-in below.` : `${rows.length} match${rows.length === 1 ? "" : "es"} for “${q}”`}
                    </p>
                    <ul className="mt-2 border-t border-dashed border-hairline">
                      {rows.map((h) => (
                        <HitRow key={h.key} hit={h} canOverride={hasRole(staff, "organizer")} />
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section aria-labelledby="walkin">
                <SectionLabel id="walkin" aside="creates roster source walk_in + a member">
                  Walk-in
                </SectionLabel>
                <Panel>
                  <p className="mb-4 max-w-2xl font-plex text-sm text-lightgray">
                    Not on Luma? Check ID per the venue policy, then admit them here. If their email is already on the roster (waitlist, pending) that row is
                    admitted instead of creating a duplicate. They get a P-code badge; team registration comes next and is separate.
                  </p>
                  <WalkInForm />
                </Panel>
              </section>

              <section aria-labelledby="offline" className="no-print">
                <SectionLabel id="offline">If the network drops</SectionLabel>
                <ul className="space-y-2 font-plex text-sm text-lightgray">
                  <li>
                    Keep a{" "}
                    <Link href="/ops/roster/print" className="text-bright underline underline-offset-4 hover:text-lime">
                      printed signed roster
                    </Link>{" "}
                    and the{" "}
                    <a href="/ops/roster/export" className="text-bright underline underline-offset-4 hover:text-lime">
                      CSV export
                    </a>{" "}
                    on the desk laptop.
                  </li>
                  <li>
                    Use pre-numbered{" "}
                    <Link href="/ops/recovery/print/stock" className="text-bright underline underline-offset-4 hover:text-lime">
                      P-OFF paper slips
                    </Link>{" "}
                    and enter them later through{" "}
                    <Link href="/ops/recovery" className="text-bright underline underline-offset-4 hover:text-lime">
                      Recovery
                    </Link>
                    .
                  </li>
                  <li>Mark anyone you can&apos;t confirm as NEEDS_RECONCILIATION on paper. Never create an approval you can&apos;t see.</li>
                </ul>
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
