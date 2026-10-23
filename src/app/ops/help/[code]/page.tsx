import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Poll } from "@/app/help/parts";
import { PriorityTag, TicketStatus, fmtAge, fmtTime } from "@/app/help/views";
import { inputCls } from "@/components/forms/fields";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import { Eyebrow } from "@/components/ui/Section";
import { getStaff, hasRole } from "@/server/auth";
import { AppError, serverNow } from "@/server/core";
import { getHelpTicketForStaff, OPEN_STATUSES, type HelpTicketStaffView } from "@/server/help";
import { REDACTION_LABEL } from "@/server/help-rules";
import { AdminLogin } from "../../parts";
import { claimTicket, duplicateTicket, moveTicket, reopenTicketAsStaff, staffReply, triageTicket } from "../actions";
import { CategorySelect, OpsAction, PrioritySelect } from "../parts";

export const metadata: Metadata = { title: "Help ticket", robots: { index: false } };

// One ticket, staff side: every message including staff-only notes, and every
// lifecycle action. The server re-checks state, so stale buttons fail safely
// with a message instead of overwriting someone else's claim.

export default function OpsTicketPage({ params }: PageProps<"/ops/help/[code]">) {
  return (
    <main>
      <section className="py-10 sm:py-14">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading ticket…</p>}>
            <TicketView params={params} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function TicketView({ params }: { params: PageProps<"/ops/help/[code]">["params"] }) {
  const { code } = await params;
  const staff = await getStaff();
  if (!staff) return <AdminLogin next={`/ops/help/${code}`} />;
  if (!hasRole(staff, "mentor", "organizer")) return <p className="font-plex text-sm text-lightgray">The help queue is for mentors and organizers.</p>;

  let t: HelpTicketStaffView;
  try {
    t = await getHelpTicketForStaff(code, staff);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") return <p className="font-plex text-sm text-lightgray">{e.userMessage}</p>;
    throw e;
  }
  const now = await serverNow();
  const open = OPEN_STATUSES.includes(t.status);
  const claimable = ["new", "triaged", "escalated"].includes(t.status);
  const owner = (staff.id !== null && t.assigned_mentor_id === staff.id) || hasRole(staff, "organizer");

  return (
    <div className="space-y-10">
      {open && <Poll seconds={10} />}
      <div>
        <Eyebrow>
          <Link href="/ops/help" className="hover:text-bright">
            ← Help queue
          </Link>
        </Eyebrow>
        <h1 className="mt-4 font-dots text-[2.5rem] leading-[0.95] font-black text-bright sm:text-[3.5rem]">{t.code}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <TicketStatus status={t.status} label={t.status_label} />
          <PriorityTag priority={t.priority} />
          {open && <span className="font-plex text-xs text-lightgray">waiting {fmtAge(t.age_seconds)}</span>}
          <FreshnessStamp asOf={now} />
        </div>
        <p className="mt-6 max-w-3xl font-display text-2xl text-bright">{t.summary}</p>
        {t.redacted.length > 0 && (
          <p role="note" className="mt-4 max-w-3xl border border-hairline border-l-2 border-l-warning bg-surface p-3 font-plex text-sm text-lightgray">
            <span className="text-bright">Redacted for privacy:</span> {t.redacted.map((k) => REDACTION_LABEL[k]).join(", ")}. The participant still sees their own text; ask them to show it at the table if you need it.
          </p>
        )}
      </div>

      <dl className="grid max-w-4xl grid-cols-2 gap-x-6 gap-y-4 border-y border-dashed border-hairline py-6 font-plex text-sm sm:grid-cols-4">
        <Fact k="Category" v={t.category_label} />
        <Fact k="Table" v={t.table_label ?? "—"} />
        <Fact k="Team" v={t.team ? <Link href={`/ops/t/${t.team.slug}`} className="underline underline-offset-4 hover:text-lime">{t.team.name}</Link> : "No team"} />
        <Fact k="Participant" v={t.opener_full ? `${t.opener_full}${t.opener_code ? ` · ${t.opener_code}` : ""}` : "—"} />
        <Fact k={t.source === "paper" ? "Asked (slip)" : "Opened"} v={fmtTime(t.opened_at)} />
        {t.source === "paper" && <Fact k="Entered" v={`${fmtTime(t.created_at)}${t.entered_by ? ` by ${t.entered_by}` : ""}`} />}
        <Fact k="Claimed" v={t.claimed_at ? `${fmtTime(t.claimed_at)}${t.mentor_full ? ` · ${t.mentor_full}` : ""}` : "—"} />
        <Fact k="Resolved" v={fmtTime(t.resolved_at)} />
        <Fact k="Source" v={t.source} />
        {t.safe_run_id && <Fact k="Kane run" v={t.safe_run_id} />}
        {t.duplicate_of && <Fact k="Duplicate of" v={<Link href={`/ops/help/${t.duplicate_of}`} className="underline underline-offset-4 hover:text-lime">{t.duplicate_of}</Link>} />}
      </dl>

      {(t.tried || t.details) && (
        <div className="max-w-3xl space-y-3 font-plex text-sm text-lightgray">
          {t.tried && (
            <p>
              <span className="text-bright">Tried: </span>
              {t.tried}
            </p>
          )}
          {t.details && <p className="whitespace-pre-wrap">{t.details}</p>}
        </div>
      )}

      <section aria-label="Actions" className="space-y-6">
        <Eyebrow>Actions</Eyebrow>
        <div className="flex flex-wrap items-start gap-3">
          {claimable && <OpsAction action={claimTicket.bind(null, t.code)} label="Claim" pending="Claiming…" primary />}
          {t.status === "claimed" && owner && <OpsAction action={moveTicket.bind(null, t.code, "start")} label="Start" />}
          {["claimed", "in_progress"].includes(t.status) && owner && (
            <OpsAction action={moveTicket.bind(null, t.code, "release")} label="Release to queue">
              <input name="reason" aria-label="Why release (optional)" placeholder="Why (optional)" maxLength={500} className={`${inputCls} min-h-11`} />
            </OpsAction>
          )}
        </div>

        {open && (
          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Resolve">
              <OpsAction action={moveTicket.bind(null, t.code, "resolve")} label="Mark resolved">
                <input name="reason" aria-label="Resolution / next action" placeholder="Resolution or next action (participant sees this)" maxLength={500} className={`${inputCls} min-h-11`} />
              </OpsAction>
            </Panel>
            {t.status !== "escalated" && (
              <Panel title="Escalate">
                <OpsAction action={moveTicket.bind(null, t.code, "escalate")} label="Escalate">
                  <input name="reason" required aria-label="Why escalate" placeholder="Why it needs someone senior" maxLength={500} className={`${inputCls} min-h-11`} />
                </OpsAction>
              </Panel>
            )}
            <Panel title="Duplicate">
              <OpsAction action={duplicateTicket.bind(null, t.code)} label="Mark duplicate">
                <input name="of" required aria-label="Original ticket code" placeholder="Original, e.g. H-0007" maxLength={40} className={`${inputCls} min-h-11 uppercase`} />
              </OpsAction>
            </Panel>
            <Panel title="Triage">
              <OpsAction action={triageTicket.bind(null, t.code)} label="Save triage">
                <div className="grid gap-2 sm:grid-cols-3">
                  <PrioritySelect id="t-priority" includeBlank />
                  <CategorySelect id="t-category" includeBlank />
                  <input name="table_label" aria-label="Table" placeholder="Table" maxLength={40} className={`${inputCls} min-h-11`} />
                </div>
              </OpsAction>
            </Panel>
            {hasRole(staff, "organizer") && (
              <Panel title="Close without resolving">
                <OpsAction action={moveTicket.bind(null, t.code, "close")} label="Close">
                  <input name="reason" aria-label="Why close" placeholder="Why (e.g. participant left)" maxLength={500} className={`${inputCls} min-h-11`} />
                </OpsAction>
              </Panel>
            )}
          </div>
        )}

        {!open && (
          <Panel title="Reopen">
            <OpsAction action={reopenTicketAsStaff.bind(null, t.code)} label="Reopen">
              <input name="reason" aria-label="Why reopen" placeholder="Why (optional)" maxLength={500} className={`${inputCls} min-h-11`} />
            </OpsAction>
          </Panel>
        )}
      </section>

      <section aria-label="Messages" className="max-w-3xl">
        <Eyebrow>Messages</Eyebrow>
        <ol className="mt-4 border-t border-dashed border-hairline">
          {t.messages.length === 0 && <li className="border-b border-dashed border-hairline py-3 font-plex text-sm text-lightgray">No messages yet.</li>}
          {t.messages.map((m) => (
            <li key={m.id} className={`border-b border-dashed border-hairline py-3 font-plex text-sm ${m.visibility === "staff_only" ? "border-l-2 border-l-warning pl-3" : ""}`}>
              <p className="text-xs text-lightgray">
                <span className="text-bright">{m.author}</span> · {m.author_type} · {fmtTime(m.created_at)}
                {m.visibility === "staff_only" && <span className="ml-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-warning">Staff only</span>}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-bright">{m.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <OpsAction action={staffReply.bind(null, t.code)} label="Send" pending="Sending…">
            <label htmlFor="s-reply" className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
              Reply or note
            </label>
            <textarea id="s-reply" name="body" required rows={3} maxLength={2000} className={inputCls} />
            <label className="flex min-h-11 items-center gap-2 font-plex text-sm text-lightgray">
              <input type="checkbox" name="staff_only" className="accent-lime" /> Staff-only note (participant won&apos;t see it)
            </label>
          </OpsAction>
        </div>
      </section>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{k}</dt>
      <dd className="mt-1 break-words text-bright">{v}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-hairline bg-surface p-4">
      <p className="mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{title}</p>
      {children}
    </div>
  );
}
