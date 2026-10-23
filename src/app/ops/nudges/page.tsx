import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { event } from "@/data/hackday";
import { isAdmin } from "@/lib/session";
import { AdminLogin } from "../parts";
import { listNudges, listTeamOptions, type NudgeRow } from "../queries";
import { DeleteNudge, NudgeForm, SeedReminders } from "./parts";

export const metadata: Metadata = { title: "Admin · Nudges", robots: { index: false } };

export default function NudgesPage() {
  return (
    <main>
      <PageHeader eyebrow="Admin" dim="Nudge every team," bright="On time." />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <NudgesView />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: event.timezone, timeZoneName: "short" });

const label = "mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray";

async function NudgesView() {
  if (!(await isAdmin())) return <AdminLogin />;

  const [nudges, teams] = await Promise.all([listNudges(), listTeamOptions()]);
  // listNudges is newest first; upcoming reads better soonest first.
  const upcoming = nudges.filter((n) => !n.sent).reverse();
  const sent = nudges.filter((n) => n.sent);

  return (
    <div className="space-y-12">
      <Link href="/ops" className="font-plex text-xs text-lightgray hover:text-lime">
        ← All teams
      </Link>

      <div>
        <p className={label}>Schedule reminders</p>
        <p className="mb-4 max-w-2xl font-plex text-sm text-lightgray">
          Queues a reminder to every team 15 minutes before each deadline in the schedule. Safe to run again: existing ones are skipped.
        </p>
        <SeedReminders />
      </div>

      <div>
        <p className={label}>Send or schedule a nudge</p>
        <NudgeForm teams={teams} />
      </div>

      <NudgeList title={`Upcoming · ${upcoming.length}`} rows={upcoming} empty="Nothing scheduled." />
      <NudgeList title={`Sent · ${sent.length}`} rows={sent} empty="Nothing sent yet." />
    </div>
  );
}

function NudgeList({ title, rows, empty }: { title: string; rows: NudgeRow[]; empty: string }) {
  return (
    <div>
      <p className={label}>{title}</p>
      <ul className="border-t border-dashed border-hairline">
        {rows.map((n) => (
          <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-hairline py-3 font-plex text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-bright">{n.title}</p>
              {n.body && <p className="mt-1 text-xs text-lightgray">{n.body}</p>}
              {n.href && <p className="mt-1 break-all text-xs text-lightgray">→ {n.href}</p>}
            </div>
            <div className="flex shrink-0 items-start gap-4 text-xs">
              <span className="text-lightgray">
                <span className={n.sent ? "" : "text-lime"}>{when.format(n.send_at)}</span>
                <span className="block">
                  {n.team_name ?? "All teams"} · {n.kind}
                </span>
              </span>
              <DeleteNudge id={n.id} />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="border-b border-dashed border-hairline py-3 font-plex text-sm text-lightgray">{empty}</li>}
      </ul>
    </div>
  );
}
