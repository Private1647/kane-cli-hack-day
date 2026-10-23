import type { Metadata } from "next";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import StatusPill from "@/components/ui/StatusPill";
import { serverNow } from "@/server/core";
import { INTEGRATIONS, listIntegrations, type IntegrationRow } from "@/server/ops";
import { outboxSummary } from "@/server/outbox";
import ActionForm, { ReasonField } from "../_kit/ActionForm";
import { OpsPage, Panel, SectionLabel, StaffGate, Stats, fmtTime } from "../_kit/shell";
import { drainAction, probeAction, requeueAction } from "./actions";
import { SystemControls } from "./parts";

export const metadata: Metadata = { title: "Integrations", robots: { index: false } };

// Integration health (T-OPS-04, DEPLOYMENT §9 "/ops/integrations/health").
// A system is VERIFIED only when a check succeeded in the last 15 minutes;
// an "ok" we haven't re-checked shows as unverified, never as green.

const FRESH_MS = 15 * 60_000;

function Status({ row, now }: { row: IntegrationRow; now: Date }) {
  if (row.paused) return <StatusPill tone="pending">Paused</StatusPill>;
  if (row.status === "down") return <StatusPill tone="danger">Down</StatusPill>;
  if (row.status === "degraded") return <StatusPill tone="pending">Degraded</StatusPill>;
  if (row.status === "ok" && row.last_success_at && now.getTime() - new Date(row.last_success_at).getTime() < FRESH_MS) {
    return <StatusPill tone="verified">Verified OK</StatusPill>;
  }
  if (row.status === "ok") return <StatusPill tone="unverified">OK · not rechecked</StatusPill>;
  return <StatusPill tone="unverified">Unknown</StatusPill>;
}

export default function IntegrationsPage() {
  return (
    <OpsPage eyebrow="Integrations" dim="What's up," bright="What's down." intro="Health of every outside dependency, what it affects, and the manual route when it fails. Paused systems are skipped by callers; Tier-0 never depends on any of them.">
      <StaffGate roles={["organizer"]} next="/ops/integrations">
        {async () => {
          const [rows, outbox, now] = await Promise.all([listIntegrations(), outboxSummary(), serverNow()]);
          const problems = rows.filter((r) => r.paused || r.status === "down" || r.status === "degraded");
          return (
            <div className="space-y-12">
              {problems.map((p) => (
                <DegradedServiceAlert key={p.system} state={p.status === "down" ? "down" : "degraded"} system={INTEGRATIONS[p.system]?.label ?? p.system} manualRoute="/ops/recovery" manualLabel="Recovery">
                  {p.paused ? "Paused by staff. " : ""}
                  {p.detail ?? ""} Fallback: {INTEGRATIONS[p.system]?.manual ?? "manual route"}.
                </DegradedServiceAlert>
              ))}

              <div className="flex flex-wrap items-start gap-4">
                <ActionForm action={probeAction} submit="Run checks now" pending="Checking…" />
                <FreshnessStamp asOf={now} source="server clock" />
              </div>

              <section>
                <SectionLabel aside="cron re-checks every 5 minutes">Systems</SectionLabel>
                <ul className="border-t border-dashed border-hairline">
                  {rows.map((r) => {
                    const meta = INTEGRATIONS[r.system];
                    return (
                      <li key={r.system} className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-hairline py-4">
                        <div className="min-w-0 flex-1 font-plex text-sm">
                          <p className="flex flex-wrap items-center gap-3">
                            <span className="text-bright">{meta?.label ?? r.system}</span>
                            <Status row={r} now={now} />
                          </p>
                          {r.detail && <p className="mt-1 text-xs text-lightgray">{r.detail}</p>}
                          <p className="mt-1 text-xs text-lightgray">
                            Last OK {fmtTime(r.last_success_at)} · last error {fmtTime(r.last_error_at)}
                            {r.last_error_code ? ` (${r.last_error_code})` : ""}
                          </p>
                          {meta && (
                            <p className="mt-1 text-xs text-lightgray">
                              Affects: {meta.affects}. If it fails: {meta.manual}.
                            </p>
                          )}
                        </div>
                        {meta && <SystemControls system={r.system} label={meta.label} paused={r.paused} />}
                      </li>
                    );
                  })}
                  {rows.length === 0 && <li className="py-4 font-plex text-sm text-lightgray">No integration rows. Run migration 005.</li>}
                </ul>
              </section>

              <section>
                <SectionLabel aside="Slack and other side effects queue here">Outbox</SectionLabel>
                <div className="space-y-6">
                  <Stats
                    cols="sm:grid-cols-4"
                    items={[
                      { label: "Queued", value: outbox.pending },
                      { label: "Retrying", value: outbox.retrying },
                      { label: "Gave up", value: outbox.dead },
                      { label: "Sent 24h", value: outbox.delivered_24h },
                    ]}
                  />
                  <p className="font-plex text-xs text-lightgray">Oldest queued: {outbox.oldest ? fmtTime(outbox.oldest) : "—"}</p>
                  {outbox.recent.length > 0 && (
                    <ul className="border-t border-dashed border-hairline font-plex text-xs">
                      {outbox.recent.map((o) => (
                        <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-dashed border-hairline py-2">
                          <span className="text-bright">
                            #{o.id} {o.kind}
                          </span>
                          <span className="text-lightgray">
                            {o.retries} tries · {o.last_error ?? "waiting"} · next {fmtTime(o.available_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="grid gap-6 md:grid-cols-2">
                    <Panel title="Deliver now">
                      <ActionForm action={drainAction} submit="Drain outbox" pending="Delivering…" variant="secondary" />
                    </Panel>
                    <Panel title="Retry failed events">
                      <ActionForm action={requeueAction} submit="Requeue" pending="Requeueing…" variant="secondary">
                        <input type="hidden" name="only_dead" value="false" />
                        <ReasonField id="rq-reason" placeholder="e.g. Slack webhook rotated" />
                      </ActionForm>
                    </Panel>
                  </div>
                </div>
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
