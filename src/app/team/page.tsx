import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/Account";
import FlowProgress from "@/components/FlowProgress";
import Button from "@/components/ui/Button";
import GreetingHeader from "@/components/ui/GreetingHeader";
import { formatEventTime, getEvent } from "@/lib/event";
import { query } from "@/lib/db";
import { getPersonalMember } from "@/server/auth";
import { avatarSrc } from "@/server/avatar";
import { flowState, listPool } from "@/server/flow";
import { currentTeamOf, getRoster, getTeamInfo, listOpenInvites, previewInvite } from "@/server/teams";
import { listIntros } from "@/server/match";
import { joinPoolAction } from "../match/actions";
import { IntroButtons, InviteToTeam } from "../match/parts";
import { Panel, StateLine } from "./blocks";
import { CreateTeamForm, InviteForm, JoinByCodeForm, LeaveTeamForm, RevokeInviteButton, SettingsForm } from "./parts";

export const metadata: Metadata = { title: "Your team" };

// Team registration in the event-day flow: create a team (you're captain, up
// to 4) or join one with an invite code. No team password: the hub opens for
// anyone on the team who is signed in as themselves. Once on a team → /activate.

export default function TeamHome({ searchParams }: PageProps<"/team">) {
  return (
    <main>
      <Suspense fallback={<FlowProgress stage={null} viewing="team" />}>
        <Progress />
      </Suspense>
      <GreetingHeader greet={(n) => ({ dim: `Hi ${n},`, bright: "Your team." })} eyebrow="Team" dim="Create one," bright="Or join one." intro="Teams are up to 4 people. Start a team and invite people with one-time codes, or use the code a teammate gave you." />
      <Suspense fallback={<p className="container-page py-16 font-plex text-sm text-lightgray">Loading…</p>}>
        <Personal searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Progress() {
  const m = await getPersonalMember();
  return <FlowProgress stage={m ? (await flowState(m.id)).stage : null} viewing="team" />;
}

async function Personal({ searchParams }: Pick<PageProps<"/team">, "searchParams">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : "";
  const member = await getPersonalMember();
  if (!member) return <SignedOut code={code} />;

  const [cur, event] = await Promise.all([currentTeamOf(member.id), getEvent()]);
  if (!cur) {
    const preview = code ? await previewInvite(code, member) : null;
    const previewRoster = preview?.forYou ? await getRoster(preview.team.id) : [];
    const [pool] = await query<{ looking: boolean | null }>("select looking_for_team as looking from members where id = $1", [member.id]);
    const lockPassed = event.now >= event.teamLockAt;
    return (
      <section className="py-12 sm:py-16">
        <div className="container-page space-y-10">
          <p className="max-w-2xl font-plex text-sm text-lightgray">
            {lockPassed
              ? `The team lock passed at ${formatEventTime(event.teamLockAt, event)}. You can still start a solo team; an organizer can add people.`
              : `Rosters lock at ${formatEventTime(event.teamLockAt, event)}.`}
          </p>
          <div className="grid gap-12 lg:grid-cols-2">
            <Panel title="Create a team" id="create">
              <CreateTeamForm idempotencyKey={randomUUID()} />
            </Panel>
            <Panel title="Join with an invite code" id="join">
              {code && !preview && <p className="mb-4 border-l-2 border-warning pl-3 font-plex text-sm text-warning">That code has expired, was used, or was revoked. Ask your teammate for a new one.</p>}
              {preview?.forYou && (
                <div className="brackets mb-5 border border-lime p-4" data-invite-team={preview.team.slug}>
                  <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">You’re invited to</p>
                  <p className="mt-2 font-display text-2xl text-bright">{preview.team.name}</p>
                  <p className="mt-1 font-plex text-sm text-lightgray">
                    {preview.team.member_count} of {preview.team.cap} on the team
                  </p>
                  <ul className="mt-3 border-t border-dashed border-hairline">
                    {previewRoster.map((r) => (
                      <li key={r.member_id} className="flex items-center gap-3 border-b border-dashed border-hairline py-2 font-plex text-sm text-bright">
                        <Avatar name={r.name} src={null} size={24} />
                        {r.name}
                        {r.role === "captain" && <span className="text-xs text-lightgray">captain</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <JoinByCodeForm code={code} idempotencyKey={randomUUID()} teamName={preview?.forYou ? preview.team.name : null} />
            </Panel>
          </div>
          {pool?.looking !== true && (
            <form action={joinPoolAction} className="flex flex-wrap items-center gap-4 border-t border-dashed border-hairline pt-6">
              <p className="font-plex text-sm text-lightgray">Rather be matched with people?</p>
              <button type="submit" className="inline-flex min-h-11 items-center border border-hairline px-4 py-2 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime">
                Join the matchmaking pool →
              </button>
            </form>
          )}
          {pool?.looking === true && (
            <p className="border-t border-dashed border-hairline pt-6 font-plex text-sm text-lightgray">
              You’re in the matchmaking pool.{" "}
              <Link href="/match" className="text-bright underline underline-offset-4 hover:text-lime">
                See people and open seats →
              </Link>
            </p>
          )}
        </div>
      </section>
    );
  }

  const [team, roster, invites, intros, photos, pool] = await Promise.all([
    getTeamInfo({ id: cur.team_id }),
    getRoster(cur.team_id),
    listOpenInvites(cur.team_id),
    listIntros(member.id),
    query<{ member_id: number; captured_at: Date }>(
      `select s.member_id, s.captured_at from selfies s join team_memberships tm on tm.member_id = s.member_id and tm.team_id = $1 and tm.left_at is null
        where s.deleted_at is null and exists (select 1 from member_consent_current c where c.member_id = s.member_id and c.category = 'selfie_storage' and c.granted)`,
      [cur.team_id],
    ),
    listPool(member.id),
  ]);
  if (!team) return null;
  // People in the pool, best skill match with what the team wants first.
  const wanted = new Set(team.seeking_skills.map((s) => s.toLowerCase()));
  const overlap = (p: (typeof pool)[number]) => p.skills.filter((s) => wanted.has(s.toLowerCase())).length;
  const people = [...pool].sort((a, b) => overlap(b) - overlap(a));
  const seatsOpen = !team.locked && team.member_count < team.cap;
  const photo = new Map(photos.map((p) => [p.member_id, p.captured_at]));
  const captain = team.captain_id === member.id;
  const created = sp.created === "1";
  const joined = sp.joined === "1";
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-10">
          {(joined || created) && (
            <div role="status" className="border-l-2 border-lime bg-lime-deep p-4 font-plex text-base text-bright">
              {joined ? (
                <>
                  Welcome to <span className="text-lime">{team.name}</span>! You’re in: {team.member_count} of {team.cap} on the team.
                </>
              ) : (
                <>
                  <span className="text-lime">{team.name}</span> is created. You’re the captain.
                </>
              )}
            </div>
          )}
          <div className="brackets border border-hairline p-5" data-team-slug={team.slug}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Your team</p>
              <StateLine state={team.state} locked={team.locked} />
            </div>
            <p className="mt-3 font-display text-3xl text-bright">{team.name}</p>
            <p className="mt-1 font-plex text-sm text-lightgray">
              {team.member_count}/{team.cap} · {team.track}
              {team.table_label ? ` · table ${team.table_label}` : ""}
              {captain ? " · you're captain" : ""}
            </p>
            <ul className="mt-5 border-t border-dashed border-hairline">
              {roster.map((r) => (
                <li key={r.member_id} className="flex items-center gap-3 border-b border-dashed border-hairline py-2.5 font-plex text-sm">
                  <Avatar name={r.name} src={photo.has(r.member_id) ? avatarSrc(r.member_id, photo.get(r.member_id)) : null} size={28} />
                  <span className={r.member_id === member.id ? "text-lime" : "text-bright"}>{r.name}</span>
                  {r.role === "captain" && <span className="text-xs text-lightgray">captain</span>}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/activate" className="min-h-11">
                Next: activate →
              </Button>
              <Button href={`/t/${team.slug}`} variant="secondary" className="min-h-11">
                Team hub
              </Button>
            </div>
          </div>

          {seatsOpen && (
            <Panel title={`People looking for a team${people.length ? ` · ${people.length}` : ""}`} id="people">
              <p className="mb-4 font-plex text-sm text-lightgray">
                {team.cap - team.member_count} open {team.cap - team.member_count === 1 ? "seat" : "seats"}. Invite someone and they can accept from their matchmaking page; they join straight away.
                {wanted.size > 0 ? " People with the skills you need are listed first." : ""}
              </p>
              {people.length === 0 ? (
                <p className="font-plex text-sm text-lightgray">Nobody is in the matchmaking pool right now. Check back soon, or share an invite code below.</p>
              ) : (
                <ul className="border-t border-dashed border-hairline">
                  {people.map((p) => (
                    <li key={p.member_id} className="flex flex-wrap items-start gap-3 border-b border-dashed border-hairline py-3">
                      <Avatar name={p.name} src={p.photo ? avatarSrc(p.member_id, p.photo) : null} size={36} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-plex text-base text-bright">{p.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.skills.map((s) => (
                            <span key={s} className={`border px-2 py-0.5 font-plex text-xs ${wanted.has(s.toLowerCase()) ? "border-lime text-lime" : "border-hairline text-lightgray"}`}>
                              {s}
                            </span>
                          ))}
                        </div>
                        {p.interests.length > 0 && <p className="font-plex text-xs text-lightgray">Into {p.interests.join(", ")}</p>}
                        {p.intro === "proposed" ? (
                          <p className="font-plex text-sm text-lightgray">Invited · waiting for an answer</p>
                        ) : p.intro === "declined" ? (
                          <p className="font-plex text-sm text-lightgray">Declined</p>
                        ) : (
                          <InviteToTeam memberId={p.member_id} teamName={team.name} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {seatsOpen && (
            <Panel title={created ? "Team created. Invite your teammates" : "Invite a teammate"}>
              <p className="mb-4 font-plex text-sm text-lightgray">Already know who you’re teaming up with? Create a code and send it to them. Each code works for one person: they open the link, or type the code on their Team page after building their profile.</p>
              <InviteForm slug={team.slug} />
              {invites.length > 0 && (
                <ul className="mt-6 border-t border-dashed border-hairline">
                  {invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-hairline py-2.5 font-plex text-xs text-lightgray">
                      <span>
                        Open invite{i.for_member ? ` for ${i.for_member}` : ""} · by {i.created_by_name ?? "—"} · expires {i.expires_at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <RevokeInviteButton slug={team.slug} inviteId={i.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <aside className="space-y-10">
          {joinRequests(intros).length > 0 && (
            <Panel title="Asking to join">
              <ul className="border-t border-dashed border-hairline">
                {joinRequests(intros).map((i) => (
                  <li key={i.id} className="space-y-2 border-b border-dashed border-hairline py-3 font-plex text-sm">
                    <p className="text-bright">{i.other}</p>
                    {i.message && <p className="text-xs text-lightgray">“{i.message}”</p>}
                    <IntroButtons introId={i.id} incoming />
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-plex text-xs text-lightgray">Accept and they join your team straight away (if a seat is free).</p>
            </Panel>
          )}
          {captain && (
            <Panel title="Open seats">
              <SettingsForm
                slug={team.slug}
                locked={team.locked}
                defaults={{ recruiting_open: team.recruiting_open, summary_public: team.summary_public ?? "", table_label: team.table_label ?? "", repo_url: team.repo_url ?? "", seeking_skills: team.seeking_skills.join(", ") }}
              />
            </Panel>
          )}
          {!team.locked && (
            <Panel title="Leave the team">
              <LeaveTeamForm teamName={team.name} />
            </Panel>
          )}
        </aside>
      </div>
    </section>
  );
}

const joinRequests = (intros: Awaited<ReturnType<typeof listIntros>>) => intros.filter((i) => i.direction === "incoming" && i.status === "proposed" && i.via_team);

function SignedOut({ code }: { code: string }) {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page max-w-xl space-y-5 font-plex text-sm text-lightgray">
        <p>Build your profile first (two minutes), then come back here to create or join a team.{code ? " Your invite code is kept in the link." : ""}</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/register" className="min-h-11">
            Start here →
          </Button>
          <Button href={`/passport/login?next=${encodeURIComponent(code ? `/team?code=${code}` : "/team")}`} variant="secondary" className="min-h-11">
            Sign in
          </Button>
        </div>
      </div>
    </section>
  );
}
