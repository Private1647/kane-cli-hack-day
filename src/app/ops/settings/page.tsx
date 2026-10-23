import type { Metadata } from "next";
import StatusPill from "@/components/ui/StatusPill";
import { formatEventTime, getEvent, PHASES } from "@/lib/event";
import { FLAGS, getFlags } from "@/lib/flags";
import { isRegistrationOpen } from "@/lib/teams";
import { STAFF_ROLES } from "@/server/auth";
import { DEADLINE_FIELDS, EVENT_VALUE_FIELDS, PUBLIC_STATUSES, getDeadlineInputs, getEventValues, listStaff, type DeadlineKey, type EventValueKey } from "@/server/ops";
import ActionForm, { ReasonField, SelectField, TextArea, TextField } from "../_kit/ActionForm";
import { OpsPage, Panel, SectionLabel, StaffGate, fmtTime } from "../_kit/shell";
import { deadlinesAction, eventValuesAction, freezeAction, phaseAction, revokeTokensAction, saveStaffAction, statusAction } from "./actions";
import { FlagsForm, IssueCode, StaffActive } from "./parts";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

// Event policy in one place (T-OPS-02): official deadlines, phase override,
// status and registration, feature flags, staff roles and codes, the values
// printed on paper, and the deploy freeze. Every save needs a reason.

const JUMPS = [
  ["deadlines", "Deadlines"],
  ["phase", "Phase"],
  ["status", "Status"],
  ["flags", "Flags"],
  ["staff", "Staff & roles"],
  ["values", "Event values"],
  ["freeze", "Deploy freeze"],
] as const;

export default function SettingsPage() {
  return (
    <OpsPage eyebrow="Settings" dim="Event policy," bright="Signed and audited." intro="The server clock reads these deadlines. Changes take a reason and land in the audit log with before/after hashes.">
      <StaffGate roles={["organizer"]} next="/ops/settings">
        {async (me) => {
          const [ev, deadlines, flags, regOpen, staff, values] = await Promise.all([getEvent(), getDeadlineInputs(), getFlags(), isRegistrationOpen(), listStaff(), getEventValues()]);
          return (
            <div className="space-y-14">
              <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
                {JUMPS.map(([id, label]) => (
                  <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
                    {label}
                  </a>
                ))}
              </nav>

              <section>
                <SectionLabel id="deadlines" aside={`times in ${deadlines.timezone}`}>
                  Deadlines
                </SectionLabel>
                <Panel>
                  <p className="mb-4 font-plex text-sm text-lightgray">
                    Server time now: <span className="text-bright">{formatEventTime(ev.now, ev)}</span>. Submission locks at{" "}
                    <span className="text-bright">{formatEventTime(ev.submissionLocksAt, ev)}</span> ({fmtTime(ev.submissionLocksAt, ev.timezone)}).
                  </p>
                  <ActionForm action={deadlinesAction} submit="Save deadlines" pending="Saving…" confirm="Change the official deadlines? Countdowns and locks move immediately.">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {(Object.keys(DEADLINE_FIELDS) as DeadlineKey[]).map((k) => (
                        <TextField key={k} id={`dl-${k}`} name={k} type="datetime-local" label={DEADLINE_FIELDS[k]} required defaultValue={deadlines[k]} />
                      ))}
                    </div>
                    <ReasonField id="dl-reason" placeholder="e.g. venue asked us to end 30 min earlier" />
                  </ActionForm>
                </Panel>
              </section>

              <section>
                <SectionLabel id="phase">Phase</SectionLabel>
                <Panel>
                  <p className="mb-4 flex flex-wrap items-center gap-2 font-plex text-sm text-lightgray">
                    Now <StatusPill tone="accent">{ev.phase}</StatusPill>
                    {ev.phaseSource === "override" ? <StatusPill tone="pending">Forced by organizer</StatusPill> : <span>from the schedule</span>}
                  </p>
                  <ActionForm action={phaseAction} submit="Set phase" pending="Saving…">
                    <SelectField
                      id="phase-sel"
                      name="phase"
                      label="Phase on TV and hub"
                      defaultValue={ev.phaseOverride ?? "schedule"}
                      options={[{ value: "schedule", label: "Follow the schedule" }, ...PHASES.map((p) => ({ value: p, label: `Force ${p.toUpperCase()}` }))]}
                    />
                    <ReasonField id="phase-reason" />
                  </ActionForm>
                </Panel>
              </section>

              <section>
                <SectionLabel id="status">Status and registration</SectionLabel>
                <Panel>
                  <ActionForm action={statusAction} submit="Save status" pending="Saving…">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField id="pub-status" name="public_status" label="Public event status" defaultValue={ev.publicStatus} options={PUBLIC_STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") }))} />
                      <SelectField
                        id="reg"
                        name="registration"
                        label="Team registration"
                        defaultValue={regOpen ? "open" : "closed"}
                        options={[
                          { value: "open", label: "Open" },
                          { value: "closed", label: "Closed" },
                        ]}
                      />
                    </div>
                    <ReasonField id="status-reason" />
                  </ActionForm>
                </Panel>
              </section>

              <section>
                <SectionLabel id="flags" aside="kill switches (DEPLOYMENT §8)">
                  Feature flags
                </SectionLabel>
                <Panel>
                  <FlagsForm flags={Object.entries(FLAGS).map(([id, label]) => ({ id, label, on: flags[id as keyof typeof flags] }))} />
                </Panel>
              </section>

              <section>
                <SectionLabel id="staff" aside={`${staff.filter((s) => s.active).length} active`}>
                  Staff and roles
                </SectionLabel>
                <div className="space-y-6">
                  <Panel title="Add or change a staff account">
                    <ActionForm action={saveStaffAction} submit="Save staff" pending="Saving…">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <TextField id="st-email" name="email" type="email" inputMode="email" label="Email" required />
                        <TextField id="st-name" name="name" label="Name" required maxLength={120} />
                        <SelectField id="st-role" name="role" label="Role" defaultValue="mentor" options={STAFF_ROLES.filter((r) => r !== "admin" || me.role === "admin").map((r) => ({ value: r, label: r }))} />
                      </div>
                    </ActionForm>
                  </Panel>
                  <ul className="border-t border-dashed border-hairline">
                    {staff.map((s) => (
                      <li key={s.id} className="grid gap-4 border-b border-dashed border-hairline py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                        <div className="min-w-0 font-plex text-sm">
                          <p className="text-bright">
                            {s.name} <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{s.role}</span>
                          </p>
                          <p className="text-xs break-all text-lightgray">{s.email}</p>
                          <p className="mt-1 text-xs text-lightgray">
                            {s.active ? <StatusPill tone="neutral">Active</StatusPill> : <StatusPill tone="unverified">Inactive</StatusPill>} · last sign-in {fmtTime(s.last_login_at)}
                          </p>
                        </div>
                        <div>{s.active && <IssueCode id={s.id} name={s.name} />}</div>
                        <div>{s.id !== me.id && <StaffActive id={s.id} active={s.active} name={s.name} />}</div>
                      </li>
                    ))}
                    {staff.length === 0 && <li className="py-4 font-plex text-sm text-lightgray">No staff accounts yet. You&apos;re signed in with the admin password.</li>}
                  </ul>
                  <Panel title="Revoke a participant's CLI / MCP tokens">
                    <ActionForm action={revokeTokensAction} submit="Revoke tokens" pending="Revoking…" variant="danger" confirm="Revoke every CLI/MCP token for this participant?">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField id="rv-code" name="public_code" label="P-code" required placeholder="P-1042" maxLength={10} />
                        <ReasonField id="rv-reason" placeholder="e.g. token pasted in a public channel" />
                      </div>
                    </ActionForm>
                  </Panel>
                </div>
              </section>

              <section>
                <SectionLabel id="values" aside="printed on the kit, posters and runbook">
                  Event values
                </SectionLabel>
                <Panel>
                  <ActionForm action={eventValuesAction} submit="Save event values" pending="Saving…">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(Object.keys(EVENT_VALUE_FIELDS) as EventValueKey[])
                        .filter((k) => k !== "privacy_rules" && k !== "brand_notes")
                        .map((k) => (
                          <TextField key={k} id={`ev-${k}`} name={k} label={EVENT_VALUE_FIELDS[k]} defaultValue={values[k]} maxLength={300} />
                        ))}
                    </div>
                    <TextArea id="ev-privacy" name="privacy_rules" label={EVENT_VALUE_FIELDS.privacy_rules} defaultValue={values.privacy_rules} rows={3} />
                    <TextArea id="ev-brand" name="brand_notes" label={EVENT_VALUE_FIELDS.brand_notes} defaultValue={values.brand_notes} rows={2} />
                    <ReasonField id="ev-reason" />
                  </ActionForm>
                </Panel>
              </section>

              <section>
                <SectionLabel id="freeze">Deploy freeze</SectionLabel>
                <Panel>
                  <p className="mb-4 flex flex-wrap items-center gap-2 font-plex text-sm text-lightgray">
                    {values.deploy_freeze ? <StatusPill tone="pending">Freeze on</StatusPill> : <StatusPill tone="unverified">No freeze</StatusPill>}
                    {values.deploy_freeze_reason && <span>{values.deploy_freeze_reason}</span>}
                  </p>
                  <p className="mb-4 max-w-2xl font-plex text-sm text-lightgray">
                    Turn this on before the submission window. It shows a banner across /ops so nobody ships nonessential changes. If a deploy goes bad, use Vercel&apos;s
                    Instant Rollback to the last good production deployment; data in Postgres is unaffected.
                  </p>
                  <ActionForm action={freezeAction} submit={values.deploy_freeze ? "Lift freeze" : "Freeze deploys"} pending="Saving…" variant={values.deploy_freeze ? "secondary" : "primary"}>
                    <input type="hidden" name="freeze" value={values.deploy_freeze ? "off" : "on"} />
                    <ReasonField id="fz-reason" placeholder={values.deploy_freeze ? "e.g. demos over" : "e.g. submission window opens 17:00"} />
                  </ActionForm>
                </Panel>
              </section>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
