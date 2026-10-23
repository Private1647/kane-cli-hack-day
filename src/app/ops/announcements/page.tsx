import type { Metadata } from "next";
import Link from "next/link";
import StatusPill from "@/components/ui/StatusPill";
import { ANNOUNCEMENT_VISIBILITY, announcementTemplates, listAnnouncements } from "@/server/ops";
import { OpsPage, Panel, SectionLabel, StaffGate, fmtTime } from "../_kit/shell";
import { Composer, Retract } from "./parts";

export const metadata: Metadata = { title: "Announcements", robots: { index: false } };

// Announcements go to the TV (/live), the hub feed, or both. They are
// notifications rows with kind 'announcement' and a visibility.

export default function AnnouncementsPage() {
  return (
    <OpsPage eyebrow="Announcements" dim="One message," bright="Every screen." intro="Preapproved wording from the staff kit, with the real deadline filled in. Schedule ahead or publish now.">
      <StaffGate roles={["organizer"]} next="/ops/announcements">
        {async () => {
          const [templates, rows] = await Promise.all([announcementTemplates(), listAnnouncements()]);
          const upcoming = rows.filter((r) => !r.sent).reverse();
          const sent = rows.filter((r) => r.sent);
          return (
            <div className="space-y-12">
              <Panel title="Compose">
                <Composer templates={templates} visibility={ANNOUNCEMENT_VISIBILITY} />
              </Panel>
              <List title={`Scheduled · ${upcoming.length}`} rows={upcoming} empty="Nothing scheduled." />
              <List title={`Published · ${sent.length}`} rows={sent} empty="No announcements yet." />
              <p className="font-plex text-xs text-lightgray">
                Team-specific reminders still live under{" "}
                <Link href="/ops/nudges" className="underline underline-offset-4 hover:text-lime">
                  Nudges
                </Link>
                .
              </p>
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}

function List({ title, rows, empty }: { title: string; rows: Awaited<ReturnType<typeof listAnnouncements>>; empty: string }) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <ul className="border-t border-dashed border-hairline">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-hairline py-4">
            <div className="min-w-0 flex-1 font-plex text-sm">
              <p className="text-bright">{a.title}</p>
              {a.body && <p className="mt-1 text-xs leading-relaxed text-lightgray">{a.body}</p>}
              {a.href && <p className="mt-1 text-xs break-all text-lightgray">→ {a.href}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-lightgray">
                {a.sent ? <StatusPill tone="unverified">Live</StatusPill> : <StatusPill tone="pending">Scheduled</StatusPill>}
                <span>{ANNOUNCEMENT_VISIBILITY[a.visibility] ?? a.visibility}</span>
                <span>· {fmtTime(a.send_at)}</span>
                <span>· {a.published_by_name ?? "admin"}</span>
              </p>
            </div>
            <Retract id={a.id} />
          </li>
        ))}
        {rows.length === 0 && <li className="border-b border-dashed border-hairline py-4 font-plex text-sm text-lightgray">{empty}</li>}
      </ul>
    </section>
  );
}
