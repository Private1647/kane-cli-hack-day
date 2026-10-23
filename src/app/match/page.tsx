import type { Metadata } from "next";
import { Suspense } from "react";
import { inputCls } from "@/components/forms/fields";
import Button from "@/components/ui/Button";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import PageHeader from "@/components/ui/PageHeader";
import QR from "@/components/ui/QR";
import StatusPill from "@/components/ui/StatusPill";
import { isEnabled } from "@/lib/flags";
import { getMember, memberActor } from "@/server/auth";
import { siteUrl } from "@/server/core";
import { AVAILABILITY, WORK_ROLES, getProfile, listIntros, matchAggregates, suggestions, type PersonCard, type TeamCard } from "@/server/match";
import { Panel, Stat, Tag } from "../team/blocks";
import { IntroButtons, ProfileForm, RequestIntro } from "./parts";

export const metadata: Metadata = { title: "Matchmaker" };

// Team Finder (T-MATCH-01..04): opt in, see ranked people and open teams with
// a reason for each, ask for an intro. Handles appear only after acceptance,
// and only here; email and phone never do.

export default function MatchPage({ searchParams }: PageProps<"/match">) {
  return (
    <main>
      <PageHeader
        eyebrow="Matchmaker"
        dim="Find a fit,"
        bright="Not a clone."
        intro="Opt in, list what you're good at and what you want to learn. Suggestions favour people who cover what your team doesn't. Nothing is assigned: you ask, they answer."
      />
      <Suspense fallback={<p className="container-page py-16 font-plex text-sm text-lightgray">Loading matches…</p>}>
        <Match searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Match({ searchParams }: Pick<PageProps<"/match">, "searchParams">) {
  const [on, member, agg] = await Promise.all([isEnabled("match"), getMember(), matchAggregates().catch(() => null)]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const counts = (
    <section className="border-b border-dashed border-hairline py-8">
      <div className="container-page flex flex-wrap items-end justify-between gap-6">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-xl">
          <Stat value={agg?.looking ?? null} label="Looking" />
          <Stat value={agg?.open_seats ?? null} label="Open seats" />
          <Stat value={agg?.recruiting_teams ?? null} label="Recruiting teams" />
        </div>
        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <p className="font-plex text-xs text-lightgray">Opted-in counts only.</p>
            <FreshnessStamp asOf={agg?.as_of ?? null} now={agg?.as_of ?? undefined} source="matchmaker" />
          </div>
          <QR value={siteUrl("/match")} label="QR code: open the matchmaker" caption="kaneclihack.sh/match" size={96} className="no-print" />
        </div>
      </div>
    </section>
  );

  if (!on) {
    return (
      <>
        {counts}
        <div className="container-page py-10">
          <DegradedServiceAlert state="degraded" system="Matchmaker" manualRoute="/help" manualLabel="Ask at the help desk">
            The matchmaker is switched off right now. Invite codes and team pages still work; staff keep a paper list of people looking for a team.
          </DegradedServiceAlert>
        </div>
      </>
    );
  }

  if (!member) {
    return (
      <>
        {counts}
        <section className="py-12">
          <div className="container-page max-w-xl space-y-4 font-plex text-sm text-lightgray">
            <p>Sign in to opt in and see suggestions.</p>
            <Button href="/team" className="min-h-11">
              Sign-in options →
            </Button>
          </div>
        </section>
      </>
    );
  }

  const who = { member, actor: memberActor(member) };
  const [profile, result, intros] = await Promise.all([
    getProfile(member.id),
    suggestions(who, { skill: one("skill"), role: one("role"), availability: one("availability"), show: one("show") || "all" }).catch(() => null),
    listIntros(member.id),
  ]);

  return (
    <>
      {counts}
      <section className="py-10 sm:py-14">
        <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-8">
            <form method="get" action="/match" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" aria-label="Filter suggestions">
              <FilterField label="Skill">
                <input name="skill" defaultValue={one("skill")} placeholder="e.g. ci" className={inputCls} />
              </FilterField>
              <FilterField label="Role">
                <select name="role" defaultValue={one("role")} className={`${inputCls} min-h-11`}>
                  <option value="">Any</option>
                  {WORK_ROLES.filter((r) => r !== "any").map((r) => (
                    <option key={r} value={r}>
                      {r.replace("-", " / ")}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Available">
                <select name="availability" defaultValue={one("availability")} className={`${inputCls} min-h-11`}>
                  <option value="">Any</option>
                  {AVAILABILITY.map((a) => (
                    <option key={a} value={a}>
                      {a.replace("-", " ")}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Show">
                <select name="show" defaultValue={one("show") || "all"} className={`${inputCls} min-h-11`}>
                  <option value="all">People and teams</option>
                  <option value="people">People</option>
                  <option value="teams">Teams</option>
                </select>
              </FilterField>
              <button type="submit" className="inline-flex min-h-11 items-center justify-center bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
                Filter
              </button>
            </form>

            {!result ? (
              <DegradedServiceAlert state="degraded" system="Suggestions" manualRoute="/help">
                Couldn&apos;t load suggestions. Your profile and requests are safe; try again in a minute.
              </DegradedServiceAlert>
            ) : (
              <>
                {!profile.discoverable && (
                  <p className="border-l-2 border-lime pl-3 font-plex text-sm text-bright">
                    You&apos;re not discoverable yet. Turn it on in your profile so teams can find you too.
                  </p>
                )}
                {result.teams.length > 0 && (
                  <Panel title="Teams with open seats" aside={<span className="font-plex text-xs text-lightgray">{result.teams.length}</span>}>
                    <ul className="grid gap-4 sm:grid-cols-2">
                      {result.teams.map((t) => (
                        <TeamMatchCard key={t.team_id} t={t} canAsk={!result.myTeam} />
                      ))}
                    </ul>
                  </Panel>
                )}
                {result.people.length > 0 && (
                  <Panel title="People looking" aside={<span className="font-plex text-xs text-lightgray">{result.people.length}</span>}>
                    <ul className="grid gap-4 sm:grid-cols-2">
                      {result.people.map((p) => (
                        <PersonMatchCard key={p.member_id} p={p} />
                      ))}
                    </ul>
                  </Panel>
                )}
                {result.teams.length === 0 && result.people.length === 0 && (
                  <p className="font-plex text-sm text-lightgray">No opted-in matches for these filters yet. Check back as people arrive, or widen the filters.</p>
                )}
              </>
            )}
          </div>

          <aside className="space-y-10">
            <Panel title="Intro requests">
              {intros.length === 0 ? (
                <p className="font-plex text-sm text-lightgray">None yet.</p>
              ) : (
                <ul className="border-t border-dashed border-hairline">
                  {intros.map((i) => (
                    <li key={i.id} className="space-y-2 border-b border-dashed border-hairline py-3 font-plex text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-bright">
                          {i.direction === "incoming" ? "From " : "To "}
                          {i.other}
                          {i.via_team && <span className="text-xs text-lightgray"> · for {i.via_team}</span>}
                        </span>
                        <IntroPill status={i.status} />
                      </div>
                      {i.message && <p className="text-xs text-lightgray">“{i.message}”</p>}
                      {i.contact && (
                        <div className="border border-hairline p-3 text-xs text-lightgray">
                          <p className="font-pixel text-[10px] uppercase tracking-[0.2em]">Contact · in-app only</p>
                          <p className="mt-1 text-bright">
                            {i.contact.name}
                            {i.contact.team ? ` · ${i.contact.team}` : ""}
                            {i.contact.table ? ` · table ${i.contact.table}` : ""}
                          </p>
                          <p className="mt-1">
                            {[i.contact.github && `GitHub @${i.contact.github}`, i.contact.x && `X @${i.contact.x.replace(/^@/, "")}`, i.contact.linkedin && "LinkedIn on file"].filter(Boolean).join(" · ") ||
                              "No handles shared. Find them in the room."}
                          </p>
                          {i.contact.linkedin && /^(https:\/\/)?(www\.)?linkedin\.com\//i.test(i.contact.linkedin) && (
                            <a href={i.contact.linkedin.startsWith("https://") ? i.contact.linkedin : `https://${i.contact.linkedin}`} className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-lime" rel="noreferrer" target="_blank">
                              LinkedIn →
                            </a>
                          )}
                        </div>
                      )}
                      {i.status === "proposed" && <IntroButtons introId={i.id} incoming={i.direction === "incoming"} />}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Your profile">
              <ProfileForm
                roles={WORK_ROLES}
                availability={AVAILABILITY}
                defaults={{
                  discoverable: profile.discoverable,
                  skills: profile.skills.join(", "),
                  interests: profile.interests.join(", "),
                  preferred_work: profile.preferred_work ?? "",
                  availability: profile.availability ?? "",
                  learning_goals: profile.learning_goals ?? "",
                  bio: profile.bio ?? "",
                }}
              />
            </Panel>
          </aside>
        </div>
      </section>
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</span>
      {children}
    </label>
  );
}

function IntroPill({ status }: { status: string }) {
  if (status === "proposed") return <StatusPill tone="pending">Waiting</StatusPill>;
  if (status === "accepted") return <Tag className="border-bright text-bright">Accepted</Tag>;
  return <Tag>{status}</Tag>;
}

function Tags({ items, highlight = [] }: { items: string[]; highlight?: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <li key={s} className={`border px-2 py-0.5 font-plex text-[11px] ${highlight.includes(s) ? "border-bright text-bright" : "border-hairline text-lightgray"}`}>
          {s}
        </li>
      ))}
    </ul>
  );
}

function TeamMatchCard({ t, canAsk }: { t: TeamCard; canAsk: boolean }) {
  return (
    <li className="brackets flex flex-col gap-3 border border-hairline p-5">
      <div className="flex items-center justify-between gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
        <span>Team · {t.track}</span>
        <span>
          {t.open_seats} open {t.open_seats === 1 ? "seat" : "seats"}
        </span>
      </div>
      <p className="font-display text-xl text-bright">{t.name}</p>
      {t.summary_public && <p className="font-plex text-sm text-lightgray">{t.summary_public}</p>}
      {t.seeking_skills.length > 0 && (
        <div className="space-y-1">
          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Looking for</p>
          <Tags items={t.seeking_skills} />
        </div>
      )}
      <p className="font-plex text-xs text-bright">{t.explanation}</p>
      <div className="mt-auto pt-2">
        {t.intro ? <IntroPill status={t.intro} /> : canAsk ? <RequestIntro target={{ team: t.team_id }} label="Ask to join" /> : <p className="font-plex text-xs text-lightgray">You&apos;re on a team already.</p>}
      </div>
    </li>
  );
}

function PersonMatchCard({ p }: { p: PersonCard }) {
  return (
    <li className="flex flex-col gap-3 border border-hairline p-5">
      <div className="flex items-center justify-between gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
        <span>Solo · available</span>
        <span>{p.preferred_work ? p.preferred_work.replace("-", " / ") : ""}</span>
      </div>
      <p className="font-display text-xl text-bright">{p.name}</p>
      {p.bio && <p className="font-plex text-sm text-lightgray">{p.bio}</p>}
      <Tags items={p.skills} />
      {p.learning_goals && <p className="font-plex text-xs text-lightgray">Wants to learn: {p.learning_goals}</p>}
      <p className="font-plex text-xs text-bright">{p.explanation}</p>
      <div className="mt-auto pt-2">{p.intro ? <IntroPill status={p.intro} /> : <RequestIntro target={{ member: p.member_id }} />}</div>
    </li>
  );
}
