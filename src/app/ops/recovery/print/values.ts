import "server-only";
import { event as copy } from "@/data/hackday";
import { formatEventTime, getEvent } from "@/lib/event";
import { siteUrl } from "@/server/core";
import { getEventValues } from "@/server/ops";
import { rosterStats } from "@/server/roster";
import type { DocValues } from "./docs";

// Real event values for paper: deadlines from hack_events (server clock),
// contacts and Wi-Fi from /ops/settings, the last roster version from the DB.

const dayFmt = (tz: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });

export async function printValues(): Promise<DocValues & { generatedAt: Date; fallback: boolean }> {
  const [ev, values, stats] = await Promise.all([getEvent(), getEventValues(), rosterStats().catch(() => null)]);
  const t = (d: Date) => `${dayFmt(ev.timezone).format(d)}, ${formatEventTime(d, ev)}`;
  const site = siteUrl("/").replace(/\/$/, "").replace(/^https?:\/\//, "");
  return {
    eventName: ev.name || copy.name,
    eventSlug: ev.slug,
    site,
    date: dayFmt(ev.timezone).format(ev.startsAt),
    timezone: ev.timezone,
    lock: t(ev.submissionLocksAt),
    teamLock: formatEventTime(ev.teamLockAt, ev),
    ideaLock: formatEventTime(ev.ideaLockAt, ev),
    demos: formatEventTime(ev.demosStartAt, ev),
    venue: values.venue,
    wifi: values.wifi_network ? `${values.wifi_network}${values.wifi_password ? ` / ${values.wifi_password}` : ""}` : "",
    helpContact: values.help_contact,
    supportChannel: values.support_channel,
    incidentCommander: values.incident_commander,
    incidentBackup: values.incident_backup,
    admissionLead: values.admission_lead,
    photographerLead: values.photographer_lead,
    mentorDispatcher: values.mentor_dispatcher,
    kaneInfra: values.kane_infra,
    submissionOfficer: values.submission_officer,
    witness: values.witness,
    rosterVersion: stats?.lastImport ? `${stats.lastImport.source_version} (RI-${stats.lastImport.id}, sha256 ${stats.lastImport.source_hash.slice(0, 12)}…)` : "",
    policyVersion: "2026-10",
    privacyRules: values.privacy_rules,
    generatedAt: ev.now,
    fallback: ev.fallback,
  };
}
