import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { formatEventTime, getEvent } from "@/lib/event";
import { getMember } from "@/server/auth";
import { matchAggregates } from "@/server/match";
import { currentTeamOf, getTeamInfo } from "@/server/teams";
import { Stat, StateLine } from "./blocks";

export const metadata: Metadata = { title: "Your team" };

// The personal view (T-TEAM-01): a person exists with or without a team. With
// a team it points at the hub; without one it offers the three ways in.

export default function TeamHome() {
  return (
    <main>
      <PageHeader
        eyebrow="Team"
        dim="You first,"
        bright="Then your team."
        intro="Your registration is yours, with or without a team. Start one, join with an invite code, or find people in the matchmaker."
      />
      <Suspense fallback={<p className="container-page py-16 font-plex text-sm text-lightgray">Loading…</p>}>
        <Personal />
      </Suspense>
    </main>
  );
}

async function Personal() {
  const [member, event] = await Promise.all([getMember(), getEvent()]);
  if (!member) return <SignedOut />;

  const cur = await currentTeamOf(member.id);
  const team = cur ? await getTeamInfo({ id: cur.team_id }) : null;
  const agg = await matchAggregates().catch(() => null);
  const lockPassed = event.now >= event.teamLockAt;

  return (
    <section className="py-12 sm:py-16">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-8">
          <div className="brackets border border-hairline p-5">
            <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Signed in as</p>
            <p className="mt-2 font-display text-2xl text-bright">{member.display_name ?? member.name}</p>
            <p className="mt-1 font-plex text-xs text-lightgray">
              Badge code <span className="text-bright">{member.public_code ?? "—"}</span>
              {member.checked_in_at ? " · checked in" : " · not checked in yet"}
            </p>
          </div>

          {team ? (
            <div className="border border-hairline p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Your team</p>
                <StateLine state={team.state} locked={team.locked} />
              </div>
              <p className="mt-3 font-display text-3xl text-bright">{team.name}</p>
              <p className="mt-1 font-plex text-sm text-lightgray">
                {team.member_count}/{team.cap} · {team.track}
                {team.table_label ? ` · table ${team.table_label}` : ""}
                {cur?.role === "captain" ? " · you're captain" : ""}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button href={`/t/${team.slug}`} className="min-h-11">
                  Open team hub →
                </Button>
                <Button href={`/team/${team.slug}/manage`} variant="secondary" className="min-h-11">
                  Roster & invites
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="font-plex text-sm text-lightgray">
                No team yet. {lockPassed ? `The team lock passed at ${formatEventTime(event.teamLockAt, event)}; you can still ship solo, and an organizer can add you to a team.` : `Teams lock at ${formatEventTime(event.teamLockAt, event)}.`}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Way href="/team/new" title="Start a team" body={lockPassed ? "Ship solo (the roster is already locked)." : "You'll be captain. Invite people with one-time codes."} />
                <Way href="/team/join" title="Join with a code" body="A teammate gives you a one-time invite code." />
                <Way href="/match" title="Find teammates" body="Opt in, list your skills, get ranked suggestions." />
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Matchmaker right now</p>
          <div className="grid grid-cols-2 gap-4">
            <Stat value={agg?.looking ?? null} label="Looking for a team" />
            <Stat value={agg?.open_seats ?? null} label="Open seats" />
          </div>
          <p className="font-plex text-xs text-lightgray">Opted-in counts only. Names and contact details are never shown here.</p>
        </aside>
      </div>
    </section>
  );
}

function Way({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="group block min-h-11 border border-hairline p-4 transition-colors hover:border-lime">
      <p className="font-display text-lg text-bright group-hover:text-lime">{title} →</p>
      <p className="mt-2 font-plex text-xs leading-relaxed text-lightgray">{body}</p>
    </Link>
  );
}

function SignedOut() {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page max-w-xl space-y-5 font-plex text-sm text-lightgray">
        <p>Sign in first. Registered with a team? Use your team name and password. Signed up on your own or walked in? Use the sign-in on your passport from the check-in desk.</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/login" className="min-h-11">
            Team sign in →
          </Button>
          <Button href="/passport" variant="secondary" className="min-h-11">
            Passport
          </Button>
        </div>
      </div>
    </section>
  );
}
