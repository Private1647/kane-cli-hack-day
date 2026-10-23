import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import { Eyebrow } from "@/components/ui/Section";
import { getViewer, hasRole } from "@/server/auth";
import { AppError, serverNow } from "@/server/core";
import { getHelpTicket, OPEN_STATUSES, type HelpTicketView } from "@/server/help";
import { Poll, ReopenForm, ReplyForm } from "../parts";
import { PriorityTag, TicketStatus, fmtTime } from "../views";

export const metadata: Metadata = { title: "Help ticket", robots: { index: false } };

// One ticket's status for the person who opened it (or their team): who has
// it, every public reply, and a reply box. Refreshes every 10s while open.
export default function TicketPage({ params }: PageProps<"/help/[code]">) {
  return (
    <main>
      <Suspense fallback={<p className="container-page py-24 font-plex text-sm text-lightgray">Loading ticket…</p>}>
        <TicketView params={params} />
      </Suspense>
    </main>
  );
}

async function TicketView({ params }: { params: PageProps<"/help/[code]">["params"] }) {
  const { code } = await params;
  const { member, staff } = await getViewer();
  if (!member && !staff) {
    return (
      <Shell code={code.toUpperCase()}>
        <p className="font-plex text-sm text-lightgray">Sign in to see this ticket.</p>
        <Link href="/login?next=help" className="mt-4 inline-flex min-h-11 items-center bg-bright px-4 py-2.5 font-plex text-sm text-ink hover:bg-lime">
          Sign in →
        </Link>
      </Shell>
    );
  }

  let t: HelpTicketView;
  try {
    t = await getHelpTicket(code, { member, staff });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") {
      return (
        <Shell code={code.toUpperCase()}>
          <p className="font-plex text-sm text-lightgray">{e.userMessage}</p>
          <Link href="/help" className="mt-4 inline-flex min-h-11 items-center text-lime underline underline-offset-4">
            Back to help →
          </Link>
        </Shell>
      );
    }
    throw e;
  }

  const now = await serverNow();
  const open = OPEN_STATUSES.includes(t.status);
  const isStaff = hasRole(staff, "mentor", "organizer");
  const back = t.team ? `/t/${t.team.slug}/help` : "/help";

  return (
    <Shell code={t.code} back={back}>
      {open && <Poll seconds={10} />}
      <div className="flex flex-wrap items-center gap-3">
        <TicketStatus status={t.status} label={t.status_label} />
        <PriorityTag priority={t.priority} />
        <FreshnessStamp asOf={now} />
      </div>

      <p className="mt-6 max-w-3xl font-display text-2xl text-bright">{t.summary}</p>
      <p className="mt-3 font-plex text-sm text-lightgray" aria-live="polite">
        {headline(t)}
      </p>

      <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-hairline pt-6 font-plex text-sm sm:grid-cols-4">
        <Fact k="Category" v={t.category_label} />
        <Fact k="Table" v={t.table_label ?? "—"} />
        <Fact k={t.source === "paper" ? "Asked (slip)" : "Opened"} v={fmtTime(t.opened_at)} />
        <Fact k="Claimed" v={fmtTime(t.claimed_at)} />
        {t.team && <Fact k="Team" v={t.team.name} />}
        {t.safe_run_id && <Fact k="Kane run" v={t.safe_run_id} />}
        {t.resolved_at && <Fact k="Resolved" v={fmtTime(t.resolved_at)} />}
        {t.duplicate_of && <Fact k="Merged into" v={<Link href={`/help/${t.duplicate_of}`} className="text-lime underline underline-offset-4">{t.duplicate_of}</Link>} />}
      </dl>

      {(t.tried || t.details) && (
        <div className="mt-6 max-w-3xl space-y-3 font-plex text-sm text-lightgray">
          {t.tried && (
            <p>
              <span className="text-bright">Tried: </span>
              {t.tried}
            </p>
          )}
          {t.details && <p className="whitespace-pre-wrap">{t.details}</p>}
        </div>
      )}

      <section aria-label="Updates" className="mt-10 max-w-3xl">
        <Eyebrow>Updates</Eyebrow>
        <ol className="mt-4 border-t border-dashed border-hairline">
          {t.messages.length === 0 && <li className="border-b border-dashed border-hairline py-3 font-plex text-sm text-lightgray">No replies yet.</li>}
          {t.messages.map((m) => (
            <li key={m.id} className="border-b border-dashed border-hairline py-3 font-plex text-sm">
              <p className="text-xs text-lightgray">
                <span className={m.author_type === "system" ? "font-pixel text-[10px] uppercase tracking-[0.2em]" : "text-bright"}>{m.author}</span> · {fmtTime(m.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-bright">{m.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {member && (
        <div className="mt-10 grid max-w-3xl gap-10 sm:grid-cols-2">
          <ReplyForm code={t.code} />
          {!open && t.status !== "duplicate" && <ReopenForm code={t.code} />}
        </div>
      )}
      {isStaff && (
        <Link href={`/ops/help/${t.code}`} className="mt-10 inline-flex min-h-11 items-center text-lime underline underline-offset-4 hover:text-bright">
          Open in the mentor queue →
        </Link>
      )}
    </Shell>
  );
}

function headline(t: HelpTicketView) {
  switch (t.status) {
    case "new":
    case "triaged":
      return "Waiting for a mentor. Stay at your table; this page updates by itself.";
    case "claimed":
      return `${t.mentor ?? "A mentor"} has it and is on the way.`;
    case "in_progress":
      return `${t.mentor ?? "A mentor"} is working on it with you.`;
    case "escalated":
      return "Escalated to a senior mentor or organizer. Stay at your table.";
    case "resolved":
      return "Marked resolved. Still stuck? Reopen it below.";
    case "closed":
      return "Closed. Open a new ticket if something else comes up.";
    case "duplicate":
      return `Merged into ${t.duplicate_of}; follow that ticket.`;
  }
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{k}</dt>
      <dd className="mt-1 break-words text-bright">{v}</dd>
    </div>
  );
}

function Shell({ code, back = "/help", children }: { code: string; back?: string; children: React.ReactNode }) {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page">
        <Eyebrow>
          <Link href={back} className="hover:text-bright">
            Help
          </Link>{" "}
          / Ticket
        </Eyebrow>
        <h1 className="mt-4 mb-6 font-dots text-[2.5rem] leading-[0.95] font-black text-bright sm:text-[3.5rem]">{code}</h1>
        {children}
      </div>
    </section>
  );
}
