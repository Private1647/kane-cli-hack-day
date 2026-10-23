import type { Metadata } from "next";
import Link from "next/link";
import { listRosterImports } from "@/server/roster";
import { OpsPage, Panel, SectionLabel, StaffGate, SubNav, fmtTime } from "../../_kit/shell";
import { ROSTER_TABS } from "../tabs";
import { ImportFlow } from "./parts";

export const metadata: Metadata = { title: "Roster import", robots: { index: false } };

export default function RosterImportPage() {
  return (
    <OpsPage
      eyebrow="Roster / Import"
      dim="Luma CSV in," bright="Diff first."
      intro="Upload the Luma guest export (or the fallback roster template). You'll see exactly what changes before anything is written. Emails are hashed for matching; only a masked hint is kept."
    >
      <StaffGate roles={["organizer"]} next="/ops/roster/import">
        {async () => {
          const imports = await listRosterImports(10);
          return (
            <div className="space-y-12">
              <SubNav items={ROSTER_TABS} current="/ops/roster/import" />
              <Panel title="Upload">
                <ImportFlow />
              </Panel>
              <section>
                <SectionLabel aside={<a href="/print/roster-import-template.csv" className="underline underline-offset-4 hover:text-lime">roster-import-template.csv</a>}>
                  Accepted columns
                </SectionLabel>
                <ul className="space-y-2 font-plex text-sm text-lightgray">
                  <li>
                    <span className="text-bright">Template:</span> event_id, luma_guest_id, approval_status, display_name, checked_in_at, source_version, staff_reference
                    (add an <span className="text-bright">email</span> column to match registrations automatically).
                  </li>
                  <li>
                    <span className="text-bright">Luma export:</span> api_id, name (or first_name + last_name), email, approval_status, checked_in_at. Other columns are ignored.
                  </li>
                  <li>
                    approval_status: approved → admitted. pending_approval, waitlist, invited, declined → not admitted (an organizer can still admit at the desk, with a reason).
                  </li>
                </ul>
              </section>
              <section>
                <SectionLabel>Recent imports</SectionLabel>
                {imports.length === 0 ? (
                  <p className="font-plex text-sm text-lightgray">No roster imported yet.</p>
                ) : (
                  <ul className="border-t border-dashed border-hairline">
                    {imports.map((i) => (
                      <li key={i.id} className="flex flex-wrap justify-between gap-3 border-b border-dashed border-hairline py-3 font-plex text-sm">
                        <span className="min-w-0">
                          <span className="text-bright">RI-{i.id}</span> · {i.source_version}
                          <span className="block text-xs break-all text-lightgray">
                            {i.file_name ?? "—"} · sha256 {i.source_hash.slice(0, 16)}…
                          </span>
                        </span>
                        <span className="text-xs text-lightgray">
                          +{i.added} · ~{i.changed} · −{i.removed} · ={i.unchanged} · ✕{i.rejected}
                          <span className="block">
                            {fmtTime(i.created_at)} · {i.imported_by_name ?? "admin"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 font-plex text-xs text-lightgray">
                  Luma webhooks (if enabled) update single guests live; see{" "}
                  <Link href="/ops/integrations" className="underline underline-offset-4 hover:text-lime">
                    Integrations
                  </Link>
                  .
                </p>
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
