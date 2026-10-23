import type { Metadata } from "next";
import Link from "next/link";
import { OVERRIDE_KINDS, listOverrides } from "@/server/ops";
import { OpsPage, Panel, SectionLabel, StaffGate, fmtTime } from "../_kit/shell";
import { OverrideForm } from "./parts";

export const metadata: Metadata = { title: "Override", robots: { index: false } };

// Signed manual override (T-OPS-08, SPEC §1 "Superadmin"). Appends a
// compensating event with reason, witness and an HMAC; never rewrites history
// and never touches a finalized submission.

export default function OverridePage() {
  return (
    <OpsPage
      eyebrow="Override"
      dim="Exceptions," bright="Signed and witnessed."
      intro="For the rare call a human has to make: admit or revoke a guest, undo a mistaken check-in, record a deadline exception. A second person must witness it. Finalized submissions can't be changed here or anywhere."
    >
      <StaffGate roles={["organizer"]} next="/ops/override">
        {async () => {
          const rows = await listOverrides();
          return (
            <div className="space-y-12">
              <Panel title="New override">
                <OverrideForm kinds={OVERRIDE_KINDS} />
              </Panel>
              <section>
                <SectionLabel aside={<Link href="/ops/audit?action=override" className="underline underline-offset-4 hover:text-lime">In the audit log</Link>}>
                  Recent overrides
                </SectionLabel>
                <ul className="border-t border-dashed border-hairline">
                  {rows.map((r) => {
                    const p = r.payload as { witness?: string; target?: string; incident_ref?: string | null; digest?: string; signature?: string | null };
                    return (
                      <li key={r.id} className="border-b border-dashed border-hairline py-3 font-plex text-sm">
                        <p className="flex flex-wrap justify-between gap-2">
                          <span className="text-bright">
                            {r.action.replace("override.", "")} · {p.target ?? r.resource_id}
                          </span>
                          <span className="text-xs text-lightgray">{fmtTime(r.created_at)}</span>
                        </p>
                        <p className="mt-1 text-xs text-lightgray">
                          By {r.actor_label ?? "—"} · witness {p.witness ?? "—"}
                          {p.incident_ref ? ` · ${p.incident_ref}` : ""} · “{r.reason}”
                        </p>
                        <p className="mt-1 text-[11px] break-all text-lightgray">
                          sha256 {p.digest ?? "—"} · {p.signature ? "signed" : "unsigned"}
                        </p>
                      </li>
                    );
                  })}
                  {rows.length === 0 && <li className="py-4 font-plex text-sm text-lightgray">No overrides yet.</li>}
                </ul>
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
