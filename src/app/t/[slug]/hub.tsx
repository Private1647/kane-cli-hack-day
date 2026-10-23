import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import Mentions from "@/components/home/Mentions";
import { Eyebrow } from "@/components/ui/Section";
import type { HubTab } from "@/lib/hub";
import { getTeamSession, isAdmin } from "@/lib/session";
import { getMembers, getTeamBySlug, type Member, type Team } from "@/lib/teams";
import { CopyLink, JoinForm, PickMember, SessionButtons } from "./parts";
import Bell from "./Bell";
import TabNav from "./TabNav";

// The shell every hub tab renders in. It gates on the team cookie (password,
// then "who are you?") and only then renders the tab, so nothing behind it
// reaches a signed-out visitor. Admins can open any hub read-only.

export type HubContext = {
  team: Team;
  members: Member[];
  /** The signed-in member; null when an admin is looking. */
  me: Member | null;
};

type Params = PageProps<"/t/[slug]">["params"];

export default function Hub({
  params,
  searchParams,
  tab,
  children,
  publicView,
}: {
  params: Params;
  searchParams?: PageProps<"/t/[slug]">["searchParams"];
  tab: HubTab;
  children: (ctx: HubContext) => ReactNode;
  /** When set, signed-out visitors see this instead of the password gate. */
  publicView?: (team: Team) => ReactNode;
}) {
  return (
    <main>
      <Suspense fallback={<p className="container-page py-24 font-plex text-sm text-lightgray">Loading team…</p>}>
        <Gated params={params} searchParams={searchParams} tab={tab} render={children} publicView={publicView} />
      </Suspense>
    </main>
  );
}

async function Gated({
  params,
  searchParams,
  tab,
  render,
  publicView,
}: {
  params: Params;
  searchParams?: PageProps<"/t/[slug]">["searchParams"];
  tab: HubTab;
  render: (ctx: HubContext) => ReactNode;
  publicView?: (team: Team) => ReactNode;
}) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const [session, admin, members] = await Promise.all([getTeamSession(), isAdmin(), getMembers(team.id)]);
  const unlocked = session?.teamId === team.id;
  const me = (unlocked && members.find((m) => m.id === session.memberId)) || null;
  const welcome = (await searchParams)?.welcome === "1";

  if (!me && !admin && publicView) {
    return (
      <>
        <HubHeader team={team} />
        {publicView(team)}
      </>
    );
  }

  // Step 1: the team password. Step 2: who are you? Admins skip both.
  if (!me && !admin) {
    return (
      <>
        <HubHeader team={team} />
        <section className="py-16 sm:py-20">
          <div className="container-page max-w-md space-y-6">
            {unlocked ? (
              <>
                <GateTitle title="Who are you?" body="Pick your name so the team knows who logged what." />
                {welcome && <WelcomeNote slug={slug} />}
                <PickMember slug={slug} members={members.map((m) => ({ id: m.id, name: m.name }))} />
              </>
            ) : (
              <>
                <GateTitle title="Enter your team password" body="Ask a teammate for the password set at registration." />
                <JoinForm slug={slug} />
              </>
            )}
          </div>
        </section>
      </>
    );
  }

  // Tabs render on the server only; nothing here is passed to the client wholesale.
  const ctx: HubContext = { team, members, me };
  return (
    <>
      <HubHeader team={team} slug={slug} me={me} showSession={tab !== ""} />
      {render(ctx)}
      <Mentions />
    </>
  );
}

function HubHeader({ team, slug, me, showSession }: { team: Team; slug?: string; me?: Member | null; showSession?: boolean }) {
  return (
    <header className="border-b border-dashed border-hairline pt-12 sm:pt-16">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <Eyebrow>
              {team.is_solo ? "Solo" : "Team"} hub · {team.track}
            </Eyebrow>
            <h1 className="mt-3 font-dots text-[2.25rem] leading-[0.95] font-black break-words text-bright sm:text-[3rem]">{team.name}</h1>
            <p className="mt-3 max-w-2xl font-plex text-sm text-lightgray">{team.idea}</p>
          </div>
          <div className="flex items-start gap-4">
          {showSession && (
            <div className="font-plex text-xs text-lightgray">
              {me ? (
                <>
                  Signed in as <span className="text-lime">{me.name}</span>
                  <SessionButtons slug={slug!} compact />
                </>
              ) : (
                <span className="border border-lime px-2 py-1 font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">Viewing as admin</span>
              )}
            </div>
          )}
          {me && slug && <Bell slug={slug} />}
          </div>
        </div>
        {slug && (
          <Suspense fallback={<div className="mt-8 h-11" />}>
            <TabNav slug={slug} />
          </Suspense>
        )}
        {!slug && <div className="pb-10" />}
      </div>
    </header>
  );
}

function GateTitle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-display text-3xl text-bright">{title}</h2>
      <p className="mt-2 font-plex text-sm text-lightgray">{body}</p>
    </div>
  );
}

function WelcomeNote({ slug }: { slug: string }) {
  return (
    <div className="border border-lime bg-lime-deep p-4 font-plex text-sm text-bright">
      <p className="text-lime">You’re registered.</p>
      <p className="mt-1 text-lightgray">Share this link and the password with your team:</p>
      <div className="mt-3">
        <CopyLink path={`/t/${slug}`} />
      </div>
    </div>
  );
}
