import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Button from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Section";
import StatusPill from "@/components/ui/StatusPill";
import { formatEventTime, getEvent } from "@/lib/event";
import { getMember, getStaff, hasRole } from "@/server/auth";
import { getRoster, getTeamInfo, listOpenInvites } from "@/server/teams";
import { Panel, StateLine } from "../../blocks";
import { AdvanceStateButton, InviteForm, LeaveTeamForm, OverrideForm, RevokeInviteButton, RosterButtons, SettingsForm } from "../../parts";

export const metadata: Metadata = { title: "Roster & invites" };

// Roster, invites and captain controls (T-TEAM-03..05), plus the audited
// organizer override once the roster is locked. Every button re-checks role
// and lock on the server; this page only decides what to show.

export default function ManagePage({ params, searchParams }: PageProps<"/team/[slug]/manage">) {
  return (
    <main>
      <Suspense fallback={<p className="container-page py-24 font-plex text-sm text-lightgray">Loading team…</p>}>
        <Manage params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Manage({ params, searchParams }: PageProps<"/team/[slug]/manage">) {
  const { slug } = await params;
  const created = (await searchParams).created === "1";
  const [team, member, staff, event] = await Promise.all([getTeamInfo({ slug }), getMember(), getStaff(), getEvent()]);
  if (!team) notFound();

  const roster = await getRoster(team.id);
  const me = member ? roster.find((r) => r.member_id === member.id) : undefined;
  const organizer = hasRole(staff, "organizer");
  if (!me && !organizer) {
    return (
      <Header team={team}>
        <div className="container-page max-w-xl space-y-4 py-12 font-plex text-sm text-lightgray">
          <p>Only members of {team.name} (and organizers) can see the roster controls.</p>
          <Button href={`/t/${slug}`} className="min-h-11">
            Team hub →
          </Button>
        </div>
      </Header>
    );
  }

  const captain = me?.role === "captain";
  const invites = me ? await listOpenInvites(team.id) : [];
  const seatsLeft = Math.max(0, team.cap - team.member_count);

  return (
    <Header team={team}>
      <section className="py-10 sm:py-14">
        <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-10">
            {created && (
              <div role="status" className="brackets border border-lime bg-lime-deep p-4 font-plex text-sm text-bright">
                <p className="text-lime">Team created.</p>
                <p className="mt-1 text-lightgray">
                  Your showcase address <span className="text-bright">/ship/{team.project_slug ?? team.slug}</span> is reserved. Invite teammates below, then write your idea.
                </p>
              </div>
            )}

            <Panel
              title="Roster"
              aside={
                <span className="font-plex text-xs text-lightgray">
                  {team.member_count}/{team.cap} · {seatsLeft} open
                </span>
              }
            >
              <ul className="border-t border-dashed border-hairline">
                {roster.map((r) => (
                  <li key={r.member_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-hairline py-3">
                    <div className="min-w-0 font-plex text-sm">
                      <span className={r.member_id === member?.id ? "text-lime" : "text-bright"}>{r.name}</span>
                      <span className="ml-2 text-xs text-lightgray">
                        {r.public_code ?? ""}
                        {r.role === "captain" ? " · captain" : ""}
                        {r.member_id === member?.id ? " · you" : ""}
                      </span>
                    </div>
                    {captain && r.member_id !== member?.id && !team.locked && <RosterButtons slug={slug} memberId={r.member_id} name={r.name} />}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-plex text-xs text-lightgray">
                {team.locked
                  ? "The roster is locked. Changes now go through an organizer and are logged with a reason."
                  : `Roster locks automatically at ${formatEventTime(team.team_lock_at, event)}.`}
              </p>
            </Panel>

            {me && !team.locked && (
              <Panel title="Invites" aside={<span className="font-plex text-xs text-lightgray">One use each</span>}>
                {seatsLeft > 0 ? <InviteForm slug={slug} /> : <StatusPill tone="pending">Team full</StatusPill>}
                {invites.length > 0 && (
                  <ul className="mt-6 border-t border-dashed border-hairline">
                    {invites.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-hairline py-2.5 font-plex text-xs text-lightgray">
                        <span>
                          Invite #{i.id} by {i.created_by_name ?? "—"}
                          {i.for_member ? ` · only for ${i.for_member}` : ""} · expires {formatEventTime(i.expires_at, event)}
                        </span>
                        <RevokeInviteButton slug={slug} inviteId={i.id} />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 font-plex text-xs text-lightgray">Codes are stored hashed and shown once. If one leaks, revoke it and make another.</p>
              </Panel>
            )}

            {captain && (
              <Panel title="Captain controls">
                <SettingsForm
                  slug={slug}
                  locked={team.locked}
                  defaults={{
                    recruiting_open: team.recruiting_open,
                    summary_public: team.summary_public ?? "",
                    table_label: team.table_label ?? "",
                    repo_url: team.repo_url ?? "",
                    seeking_skills: team.seeking_skills.join(", "),
                  }}
                />
                <p className="mt-4 font-plex text-xs text-lightgray">Captains manage the team, never anyone&apos;s privacy choices: each person sets their own consent in their passport.</p>
              </Panel>
            )}

            {organizer && (
              <Panel title="Organizer override" aside={<StatusPill tone="pending">Audited</StatusPill>}>
                <p className="mb-4 font-plex text-xs text-lightgray">For changes after the lock or anything a captain can&apos;t do. Each one writes an audit event with your name and the reason.</p>
                <OverrideForm slug={slug} members={roster.map((r) => ({ id: r.member_id, name: r.name }))} />
              </Panel>
            )}
          </div>

          <aside className="space-y-8 lg:sticky lg:top-28 lg:self-start">
            <div className="border border-hairline p-5 font-plex text-sm text-lightgray">
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Lifecycle</p>
              <ol className="mt-3 space-y-1.5">
                {(["recruiting", "formed", "active", "roster_locked", "submitted"] as const).map((s) => (
                  <li key={s} className={s === team.state ? "text-lime" : ""}>
                    {s === team.state ? "→ " : "· "}
                    {s.replace("_", " ")}
                  </li>
                ))}
              </ol>
              {captain && !team.locked && team.state === "recruiting" && (
                <div className="mt-4">
                  <AdvanceStateButton slug={slug} to="formed" label="We're formed" />
                </div>
              )}
              {captain && !team.locked && (team.state === "recruiting" || team.state === "formed") && (
                <div className="mt-3">
                  <AdvanceStateButton slug={slug} to="active" label="Start building" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Button href={`/t/${slug}`} className="min-h-11">
                Team hub →
              </Button>
              <Button href={`/t/${slug}/idea`} variant="secondary" className="min-h-11">
                Idea lab
              </Button>
              <Button href="/match" variant="secondary" className="min-h-11">
                Matchmaker
              </Button>
            </div>
            {me && !team.locked && (
              <div className="border border-hairline p-5">
                <p className="mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Leave team</p>
                {captain && team.member_count > 1 ? (
                  <p className="font-plex text-xs text-lightgray">Make someone else captain first, then you can leave.</p>
                ) : (
                  <LeaveTeamForm teamName={team.name} />
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
    </Header>
  );
}

function Header({ team, children }: { team: { name: string; slug: string; track: string; state: import("@/server/teams").TeamState; locked: boolean; table_label: string | null }; children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-dashed border-hairline pt-12 pb-8 sm:pt-16">
        <div className="container-page">
          <Eyebrow>
            <Link href="/team" className="hover:text-bright">
              Team
            </Link>{" "}
            / roster & invites
          </Eyebrow>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-dots text-[2.25rem] leading-[0.95] font-black break-words text-bright sm:text-[3rem]">{team.name}</h1>
            <StateLine state={team.state} locked={team.locked} />
          </div>
          <p className="mt-2 font-plex text-sm text-lightgray">
            {team.track}
            {team.table_label ? ` · table ${team.table_label}` : ""}
          </p>
        </div>
      </header>
      {children}
    </>
  );
}
