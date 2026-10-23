import type { Metadata } from "next";
import { inputCls } from "@/components/forms/fields";
import StatusPill from "@/components/ui/StatusPill";
import { codexInventory, listActivation, type ActivationFilter, type ActivationRow } from "@/server/event-activation";
import { OpsPage, Panel, SectionLabel, StaffGate, Stats, fmtTime } from "../_kit/shell";
import { CodeImport, RevealButton, RowActions } from "./parts";

export const metadata: Metadata = { title: "Activation", robots: { index: false } };

// Organizer view of the /activate checklist: the OpenAI Codex credit code
// pool (upload, inventory, revoke, reassign, export) and every participant's
// progress (TestMu AI sign-up tick, plan claim, Codex code). Codes are masked
// here; revealing one is audited.

const FILTERS: { id: ActivationFilter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "not_started", label: "Not started" },
  { id: "stuck_plan", label: "Stuck on plan" },
  { id: "missing_code", label: "Missing code" },
  { id: "done", label: "Done" },
];

export default function OpsActivationPage({ searchParams }: PageProps<"/ops/activation">) {
  return (
    <OpsPage eyebrow="Activation" dim="TestMu AI plan," bright="Codex credits." intro="Upload the OpenAI Codex credit codes, watch the pool, and see who is stuck on which activation step.">
      <StaffGate roles={["organizer"]} next="/ops/activation">
        {async () => {
          const sp = await searchParams;
          const q = typeof sp.q === "string" ? sp.q : "";
          const filter = (FILTERS.find((f) => f.id === sp.filter)?.id ?? "all") as ActivationFilter;
          const [inv, rows] = await Promise.all([codexInventory(), listActivation({ q, filter })]);
          return (
            <div className="space-y-12">
              <Stats
                cols="sm:grid-cols-4"
                items={[
                  { label: "Codes total", value: inv.total },
                  { label: "Available", value: inv.available, hint: inv.available === 0 ? "Pool empty: participants see “out of codes”" : undefined },
                  { label: "Assigned", value: inv.assigned },
                  { label: "Revoked", value: inv.revoked },
                ]}
              />

              <Panel title="Upload Codex credit codes">
                <CodeImport />
                <p className="mt-6 font-plex text-xs text-lightgray">
                  Accepted: a CSV whose header has a <span className="text-bright">code</span> column (other columns such as amount, expiry or notes are kept with each code), or plain text with one code per line. Codes are 4–128 letters, digits, “-”, “_” or “.”. Duplicates (in the file or already uploaded) are skipped.
                </p>
              </Panel>

              <section>
                <SectionLabel
                  aside={
                    <a href="/ops/activation/export" className="underline underline-offset-4 hover:text-lime">
                      Export CSV (full codes, audited)
                    </a>
                  }
                >
                  Participants · {rows.length}
                </SectionLabel>
                <form method="get" action="/ops/activation" className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-2 block font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Search name, email, team or code suffix</span>
                    <input name="q" defaultValue={q} className={`${inputCls} min-h-11`} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Show</span>
                    <select name="filter" defaultValue={filter} className={`${inputCls} min-h-11`}>
                      {FILTERS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="min-h-11 bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
                    Filter
                  </button>
                </form>
                {rows.length === 0 ? (
                  <p className="font-plex text-sm text-lightgray">Nobody matches.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[56rem] border-collapse font-plex text-sm">
                      <thead>
                        <tr className="border-b border-hairline text-left font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                          <th className="py-2 pr-3 font-normal">Participant</th>
                          <th className="py-2 pr-3 font-normal">TestMu AI sign-up</th>
                          <th className="py-2 pr-3 font-normal">Plan</th>
                          <th className="py-2 pr-3 font-normal">Codex code</th>
                          <th className="py-2 font-normal">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <Row key={r.member_id} r={r} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}

function Row({ r }: { r: ActivationRow }) {
  return (
    <tr className="border-b border-dashed border-hairline align-top" data-member={r.member_id}>
      <td className="py-3 pr-3">
        <span className="text-bright">{r.name}</span>
        <span className="block text-xs text-lightgray">
          {r.email_hint}
          {r.public_code ? ` · ${r.public_code}` : ""}
        </span>
        <span className="block text-xs text-lightgray">{r.team_name ?? "No team"}</span>
      </td>
      <td className="py-3 pr-3">{r.testmu_signup ? <StatusPill tone="neutral">Ticked</StatusPill> : <span className="text-xs text-lightgray">—</span>}</td>
      <td className="py-3 pr-3">
        {r.plan_status === "claimed" ? (
          <StatusPill tone="neutral">Claimed</StatusPill>
        ) : r.plan_status === "not_registered" ? (
          <StatusPill tone="pending">Not registered</StatusPill>
        ) : r.plan_status === "error" ? (
          <StatusPill tone="danger">Error</StatusPill>
        ) : r.plan_status === "pending" ? (
          <StatusPill tone="pending">In progress</StatusPill>
        ) : (
          <span className="text-xs text-lightgray">—</span>
        )}
        {r.plan_error && <span className="mt-1 block max-w-xs text-xs break-words text-lightgray">{r.plan_error}</span>}
      </td>
      <td className="py-3 pr-3">
        {r.code_id ? (
          <div className="space-y-1">
            <span className="font-mono text-bright">{r.code_masked}</span>
            <span className="block text-xs text-lightgray">
              {fmtTime(r.code_assigned_at)} · {r.codex_done ? "done ticked" : "not ticked yet"}
            </span>
            <RevealButton codeId={r.code_id} />
          </div>
        ) : (
          <span className="text-xs text-lightgray">—</span>
        )}
      </td>
      <td className="py-3">
        <RowActions memberId={r.member_id} codeId={r.code_id} />
      </td>
    </tr>
  );
}
