import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Poll } from "@/app/help/parts";
import { PriorityTag, TicketStatus, fmtAge, fmtTime } from "@/app/help/views";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import PageHeader from "@/components/ui/PageHeader";
import { getEvent } from "@/lib/event";
import { getStaff, hasRole, type Staff } from "@/server/auth";
import { helpMetrics, listHelpQueue, slackHealth, type HelpMetric, type HelpTicketStaffView } from "@/server/help";
import { AdminLogin } from "../parts";
import { claimTicket, moveTicket } from "./actions";
import { OpsAction, PaperCsvImport, PaperTicketForm, QueueAlert } from "./parts";

export const metadata: Metadata = { title: "Help queue", robots: { index: false } };

// The mentor queue: everything waiting, claimed or in progress, oldest and
// most urgent first. Refreshes every 10s; claim is atomic server-side, so two
// mentors racing for one ticket get one claim and one "already claimed by X".

export default function OpsHelpPage({ searchParams }: PageProps<"/ops/help">) {
  return (
    <main>
      <PageHeader eyebrow="Ops / Help" dim="Mentor queue," bright="Oldest first." />
      <section className="py-10 sm:py-14">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading queue…</p>}>
            <QueueView searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

const WAITING_WARN_SEC = 10 * 60;
const label = "font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray";

async function QueueView({ searchParams }: { searchParams: PageProps<"/ops/help">["searchParams"] }) {
  const staff = await getStaff();
  if (!staff) return <AdminLogin next="/ops/help" />;
  if (!hasRole(staff, "mentor", "organizer")) return <p className="font-plex text-sm text-lightgray">The help queue is for mentors and organizers.</p>;

  const mine = (await searchParams).mine === "1";
  const [queue, metrics, slack, ev] = await Promise.all([listHelpQueue(staff, { mine }), helpMetrics().catch(() => []), slackHealth(), getEvent()]);
  // Paper slips are written in the event's zone: today's date there, and the zone's abbreviation.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ev.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ev.now);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: ev.timezone, timeZoneName: "short" }).formatToParts(ev.now).find((p) => p.type === "timeZoneName")?.value ?? ev.timezone;
  const waiting = queue.open.filter((t) => ["new", "triaged", "escalated"].includes(t.status));
  const claimed = queue.open.filter((t) => t.status === "claimed");
  const working = queue.open.filter((t) => t.status === "in_progress");
  const newestId = Math.max(0, ...waiting.map((t) => t.id));

  return (
    <div className="space-y-10">
      <Poll seconds={10} />

      {!slack.configured ? (
        <DegradedServiceAlert state="degraded" system="Slack">
          Not configured (SLACK_WEBHOOK_URL). This page is the only alert: keep it open with sound on.
        </DegradedServiceAlert>
      ) : slack.status === "degraded" || slack.status === "down" ? (
        <DegradedServiceAlert state={slack.status === "down" ? "down" : "degraded"} system="Slack">
          Help pings aren&apos;t reaching Slack{slack.pending ? ` (${slack.pending} queued for retry)` : ""}. Every ticket is still here; keep this page open.
        </DegradedServiceAlert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <QueueAlert waiting={waiting.length} newestId={newestId} />
        <div className="flex flex-wrap items-center gap-4">
          <nav aria-label="Filter" className="flex gap-1 font-plex text-xs">
            <FilterLink href="/ops/help" active={!mine}>
              All
            </FilterLink>
            {staff.id !== null && (
              <FilterLink href="/ops/help?mine=1" active={mine}>
                Mine
              </FilterLink>
            )}
          </nav>
          <FreshnessStamp asOf={queue.server_time} source="help queue" />
        </div>
      </div>

      <Metrics metrics={metrics} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Column title="Waiting" count={waiting.length} empty="Nobody waiting.">
          {waiting.map((t) => (
            <Card key={t.id} t={t} staff={staff} />
          ))}
        </Column>
        <Column title="Claimed" count={claimed.length} empty="Nothing claimed.">
          {claimed.map((t) => (
            <Card key={t.id} t={t} staff={staff} />
          ))}
        </Column>
        <Column title="In progress" count={working.length} empty="Nothing in progress.">
          {working.map((t) => (
            <Card key={t.id} t={t} staff={staff} />
          ))}
        </Column>
      </div>

      <section aria-label="Recently finished">
        <p className={label}>Recently finished</p>
        <ul className="mt-3 border-t border-dashed border-hairline">
          {queue.recent_done.length === 0 && <li className="border-b border-dashed border-hairline py-3 font-plex text-sm text-lightgray">None yet.</li>}
          {queue.recent_done.map((t) => (
            <li key={t.id} className="border-b border-dashed border-hairline">
              <Link href={`/ops/help/${t.code}`} className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-2 font-plex text-sm hover:text-lime">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-bright">{t.code}</span> <span className="text-lightgray">· {t.category_label} · {t.summary}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-lightgray">
                  {t.mentor_full ?? "—"} · {fmtTime(t.resolved_at)}
                  <TicketStatus status={t.status} label={t.status_label} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Paper tickets" className="space-y-4">
        <p className={label}>Paper tickets</p>
        <p className="max-w-2xl font-plex text-sm text-lightgray">
          When the site or Wi-Fi was down, mentors used numbered paper slips. Type each one in with the time written on it, or import the mentor-queue CSV. Re-entering the same slip is safe.
        </p>
        <details className="border border-hairline bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-plex text-sm text-bright">Add one paper ticket</summary>
          <div className="border-t border-hairline p-4">
            <PaperTicketForm today={today} zone={zone} />
          </div>
        </details>
        <details className="border border-hairline bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-plex text-sm text-bright">Import mentor-queue CSV</summary>
          <div className="border-t border-hairline p-4">
            <PaperCsvImport />
          </div>
        </details>
      </section>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border px-3 ${active ? "border-lime text-lime" : "border-hairline text-lightgray hover:text-bright"}`}
    >
      {children}
    </Link>
  );
}

function Metrics({ metrics }: { metrics: HelpMetric[] }) {
  const by = Object.fromEntries(metrics.map((m) => [m.name, m]));
  const dur = (m?: HelpMetric) => (m && m.value !== null ? fmtAge(m.value) : "—");
  return (
    <dl className="grid grid-cols-3 gap-4 border-y border-dashed border-hairline py-4">
      <Stat k="Open" v={by.help_open?.value?.toString() ?? "—"} note={by.help_open ? `of ${by.help_open.denominator} total` : undefined} />
      <Stat k="Median to claim" v={dur(by.help_median_claim_seconds)} note={by.help_median_claim_seconds ? `n=${by.help_median_claim_seconds.sample_n}` : undefined} />
      <Stat k="Median to resolve" v={dur(by.help_median_resolution_seconds)} note={by.help_median_resolution_seconds ? `n=${by.help_median_resolution_seconds.sample_n}` : undefined} />
    </dl>
  );
}

function Stat({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className={label}>{k}</dt>
      <dd className="mt-1 font-dots text-2xl text-bright sm:text-3xl">{v}</dd>
      {note && <dd className="font-plex text-xs text-lightgray">{note}</dd>}
    </div>
  );
}

function Column({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h2 className="flex items-baseline justify-between border-b border-hairline pb-2">
        <span className={label}>{title}</span>
        <span className="font-dots text-xl text-bright">{count}</span>
      </h2>
      <div className="mt-3 space-y-3">{count === 0 ? <p className="font-plex text-sm text-lightgray">{empty}</p> : children}</div>
    </section>
  );
}

function Card({ t, staff }: { t: HelpTicketStaffView; staff: Staff }) {
  const claimable = ["new", "triaged", "escalated"].includes(t.status);
  const mineOrOrganizer = (staff.id !== null && t.assigned_mentor_id === staff.id) || hasRole(staff, "organizer");
  const waitingLong = claimable && t.age_seconds > WAITING_WARN_SEC;
  return (
    <article className={`border bg-surface p-4 ${t.priority === "urgent" ? "border-warning" : "border-hairline"}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/ops/help/${t.code}`} className="font-dots text-xl text-bright hover:text-lime">
          {t.code}
        </Link>
        <span className="flex items-center gap-2">
          <PriorityTag priority={t.priority} />
          <span className={`font-plex text-xs ${waitingLong ? "text-warning" : "text-lightgray"}`}>
            {waitingLong && "! "}
            {fmtAge(t.age_seconds)}
          </span>
        </span>
      </header>
      <p className="mt-1 font-plex text-xs text-lightgray">
        {t.category_label} · {t.table_label ? `table ${t.table_label}` : "no table"}
        {t.team ? ` · ${t.team.name}` : ""}
        {t.opener_full ? ` · ${t.opener_full}` : ""}
        {t.source !== "web" ? ` · via ${t.source}` : ""}
      </p>
      <p className="mt-2 font-plex text-sm text-bright">{t.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TicketStatus status={t.status} label={t.status_label} />
        {t.mentor_full && <span className="font-plex text-xs text-lightgray">{t.mentor_full}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {claimable && <OpsAction action={claimTicket.bind(null, t.code)} label="Claim" pending="Claiming…" primary />}
        {t.status === "claimed" && mineOrOrganizer && <OpsAction action={moveTicket.bind(null, t.code, "start")} label="Start" />}
        {["claimed", "in_progress"].includes(t.status) && mineOrOrganizer && <OpsAction action={moveTicket.bind(null, t.code, "resolve")} label="Resolve" />}
        <Link href={`/ops/help/${t.code}`} className="inline-flex min-h-11 items-center px-2 font-plex text-xs text-lightgray hover:text-lime">
          Details →
        </Link>
      </div>
    </article>
  );
}
