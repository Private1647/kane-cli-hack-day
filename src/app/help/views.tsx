import Link from "next/link";
import StatusPill from "@/components/ui/StatusPill";
import { event, onGroundHelp } from "@/data/hackday";
import { listTicketsFor, type HelpStatus, type HelpTicketView } from "@/server/help";
import { TicketForm } from "./parts";

// Server-rendered help views shared by the hub tab, /help and /help/[code].
// Status is always in words; colour only backs it up (PLAN §3):
//   open / triaged / claimed / in progress / escalated → amber (waiting on a human)
//   resolved / closed / duplicate                      → grey outline (done, nothing to verify)

const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone });

export const fmtTime = (iso: string | null) => (iso ? time.format(new Date(iso)) : "—");

/** "4m", "1h 12m": how long someone has been waiting. */
export function fmtAge(seconds: number) {
  const m = Math.max(0, Math.floor(seconds / 60));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function TicketStatus({ status, label }: { status: HelpStatus; label: string }) {
  if (["resolved", "closed", "duplicate"].includes(status)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] whitespace-nowrap text-lightgray">
        <span aria-hidden="true" className="font-plex">
          ■
        </span>
        {label}
      </span>
    );
  }
  return <StatusPill tone="pending">{label}</StatusPill>;
}

export function PriorityTag({ priority }: { priority: string }) {
  if (priority === "normal") return null;
  const cls = priority === "urgent" || priority === "high" ? "text-warning" : "text-lightgray";
  return <span className={`font-pixel text-[10px] uppercase tracking-[0.2em] ${cls}`}>{priority}</span>;
}

/** The ticket form plus the member's (and their team's) tickets. */
export async function HelpDesk({
  memberId,
  teamId,
  defaultTable,
  canCreate,
}: {
  memberId: number | null;
  teamId: number | null;
  defaultTable?: string | null;
  /** False when an organizer is looking at a hub read-only. */
  canCreate: boolean;
}) {
  const tickets = await listTicketsFor({ memberId, teamId });
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <h2 className="font-display text-2xl text-bright">Ask a mentor</h2>
        <p className="mt-2 mb-6 max-w-xl font-plex text-sm text-lightgray">
          Opens a numbered ticket in the mentor queue. A mentor claims it and walks to your table. If this page won&apos;t load, grab a paper ticket at the help desk.
        </p>
        {canCreate ? <TicketForm defaultTable={defaultTable} /> : <p className="font-plex text-sm text-lightgray">Viewing as staff: tickets are opened by participants.</p>}
      </div>
      <div className="min-w-0">
        <h2 className="font-display text-2xl text-bright">{teamId ? "Your team's tickets" : "Your tickets"}</h2>
        <TicketList tickets={tickets} />
        <p className="mt-6 font-plex text-xs text-lightgray">On-ground help: {onGroundHelp}</p>
      </div>
    </div>
  );
}

export function TicketList({ tickets }: { tickets: HelpTicketView[] }) {
  if (tickets.length === 0) return <p className="mt-4 border-t border-dashed border-hairline pt-4 font-plex text-sm text-lightgray">No tickets yet.</p>;
  return (
    <ul className="mt-4 border-t border-dashed border-hairline">
      {tickets.map((t) => (
        <li key={t.id} className="border-b border-dashed border-hairline">
          <Link href={t.url} className="group flex min-h-11 flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
            <span className="min-w-0 flex-1">
              <span className="font-dots text-lg text-bright group-hover:text-lime">{t.code}</span>
              <span className="ml-2 font-plex text-xs text-lightgray">
                {t.category_label} · {fmtTime(t.opened_at)}
                {t.opener ? ` · ${t.opener}` : ""}
              </span>
              <span className="mt-1 block truncate font-plex text-sm text-lightgray">{t.summary}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <TicketStatus status={t.status} label={t.status_label} />
              {t.mentor && <span className="font-plex text-xs text-lightgray">{t.mentor}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
