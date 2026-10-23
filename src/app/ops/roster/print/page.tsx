import type { Metadata } from "next";
import { event } from "@/data/hackday";
import { exportRoster } from "@/server/roster";
import PrintButton from "../../_kit/PrintButton";
import { PrintPage, StaffGate, SubNav, fmtTime } from "../../_kit/shell";
import { ROSTER_TABS } from "../tabs";

export const metadata: Metadata = { title: "Printable roster", robots: { index: false } };

// The paper copy of the roster for an offline desk (T-FB-03): alphabetical,
// a tick box per person, P-codes, no emails. The footer carries the sha256 and
// signature of the matching CSV export so the two can be compared later.

export default function RosterPrintPage() {
  return (
    <PrintPage title="Printable roster">
      <StaffGate roles={["organizer"]} next="/ops/roster/print">
        {async (staff) => {
          const { rows, digest, signature, exportedAt } = await exportRoster(staff);
          const admitted = rows.filter((r) => r.admission_status === "admitted");
          const other = rows.filter((r) => r.admission_status !== "admitted");
          return (
            <div className="space-y-6">
              <div className="no-print space-y-4">
                <SubNav items={ROSTER_TABS} current="/ops/roster/print" />
                <PrintButton label="Print roster" />
              </div>
              <div className="print-paper border border-hairline p-4 sm:p-6">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3">
                  <h2 className="font-display text-xl font-bold text-bright">
                    {event.name} · offline roster
                  </h2>
                  <p className="font-plex text-xs text-lightgray">
                    Exported {fmtTime(exportedAt)} by {staff.name} · {rows.length} rows
                  </p>
                </header>
                <RosterTable title={`Admitted · ${admitted.length}`} rows={admitted} />
                {other.length > 0 && <RosterTable title={`Not admitted / reconcile · ${other.length} (organizer decides)`} rows={other} />}
                <footer className="mt-6 border-t border-hairline pt-3 font-plex text-[10px] leading-relaxed break-all text-lightgray">
                  CSV sha256 {digest}
                  <br />
                  Signature {signature ?? "unsigned (RECEIPT_SIGNING_KEY not set)"}
                  <br />
                  Offline rule: tick only admitted rows. Anyone else gets a P-OFF slip marked NEEDS_RECONCILIATION. Never create an approval you can&apos;t see.
                </footer>
              </div>
            </div>
          );
        }}
      </StaffGate>
    </PrintPage>
  );
}

function RosterTable({ title, rows }: { title: string; rows: Awaited<ReturnType<typeof exportRoster>>["rows"] }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left font-plex text-xs">
          <thead className="border-b border-hairline text-lightgray">
            <tr>
              <th className="w-8 py-1 font-normal">✓</th>
              <th className="py-1 font-normal">Name</th>
              <th className="py-1 font-normal">P-code</th>
              <th className="py-1 font-normal">Team</th>
              <th className="py-1 font-normal">Source</th>
              <th className="py-1 font-normal">In</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="print-avoid-break border-b border-dashed border-hairline">
                <td className="py-1.5">
                  <span aria-hidden="true" className="inline-block h-3.5 w-3.5 border border-bright" />
                </td>
                <td className="py-1.5 text-bright">{r.name}</td>
                <td className="py-1.5">{r.public_code ?? "—"}</td>
                <td className="py-1.5">{r.team_name ?? ""}</td>
                <td className="py-1.5">
                  {r.source.replace("_", " ")}
                  {r.admission_status !== "admitted" ? ` · ${r.admission_status.replace("_", " ")}` : ""}
                </td>
                <td className="py-1.5">{r.checked_in_at ? fmtTime(r.checked_in_at).replace(/^\w+ \d+, /, "") : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
