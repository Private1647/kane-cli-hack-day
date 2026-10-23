import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Section";
import StatusPill from "@/components/ui/StatusPill";
import { query } from "@/lib/db";
import { getTeamSession } from "@/lib/session";
import { AppError } from "@/server/core";
import { authorizeStudio, getLatestPublished, type ProjectAccess } from "@/server/story";

// The frame every /studio/[slug] page renders in: team-scoped (member cookie
// or team cookie; organizer/admin staff read-only), a studio tab row, and a
// clear way in for signed-out visitors. Nothing behind it reaches anyone else.

export const STUDIO_TABS = [
  { id: "", label: "Story" },
  { id: "preview", label: "Template & preview" },
  { id: "deck", label: "Deck" },
  { id: "video", label: "Video" },
  { id: "gtm", label: "GTM kit" },
] as const;
export type StudioTab = (typeof STUDIO_TABS)[number]["id"];

export type StudioCtx = ProjectAccess & { team: { id: number; slug: string; name: string }; slug: string };

export const studioPath = (slug: string, tab: StudioTab = "") => (tab ? `/studio/${slug}/${tab}` : `/studio/${slug}`);

export default function Studio({ params, tab, children }: { params: Promise<{ slug: string }>; tab: StudioTab; children: (ctx: StudioCtx) => ReactNode }) {
  return (
    <main>
      <Suspense fallback={<p className="container-page py-24 font-plex text-sm text-lightgray">Loading studio…</p>}>
        <Gated params={params} tab={tab} render={children} />
      </Suspense>
    </main>
  );
}

async function Gated({ params, tab, render }: { params: Promise<{ slug: string }>; tab: StudioTab; render: (ctx: StudioCtx) => ReactNode }) {
  const { slug } = await params;
  let ctx: StudioCtx;
  try {
    ctx = { ...(await authorizeStudio(slug)), slug };
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <SignIn slug={slug} tab={tab} state="forbidden" />;
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") return <SignIn slug={slug} tab={tab} state={(await unlockedWithoutName(slug)) ? "pick_name" : "signed_out"} />;
    throw e;
  }
  const published = await getLatestPublished(ctx.project.id, "ship_page");
  const SHOWCASE_LABEL = { public: "Public", unlisted: "Unlisted", draft: "Off (team only)", hidden_by_moderation: "Hidden by organizers" } as const;
  return (
    <>
      <header className="border-b border-dashed border-hairline pt-12 sm:pt-16">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <Eyebrow>
                <Link href={`/t/${slug}`} className="hover:text-bright">
                  {ctx.team.name}
                </Link>{" "}
                / Ship studio
              </Eyebrow>
              <h1 className="mt-3 font-dots text-[2.25rem] leading-[0.95] font-black break-words text-bright sm:text-[3rem]">{ctx.project.name}</h1>
              <p className="mt-3 max-w-2xl font-plex text-sm text-lightgray">
                One reviewed story powers your Ship Page, deck, video and launch copy. Nothing is public until your team approves it.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 font-plex text-xs text-lightgray sm:items-end">
              {published ? (
                <>
                  {/* Visibility comes from projects.showcase_state, not from "an asset exists". */}
                  <span className="border border-hairline px-2 py-1 font-pixel text-[10px] tracking-[0.2em] text-bright uppercase">
                    {SHOWCASE_LABEL[ctx.project.showcase_state]} · v{published.version}
                  </span>
                  <Link href={`/ship/${ctx.project.slug}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-lime hover:underline">
                    /ship/{ctx.project.slug} →
                  </Link>
                </>
              ) : (
                <StatusPill tone="pending">Not published</StatusPill>
              )}
              {!ctx.canWrite && <span className="border border-lime px-2 py-1 font-pixel text-[10px] tracking-[0.2em] text-lime uppercase">Viewing as staff · read-only</span>}
            </div>
          </div>
          <nav aria-label="Studio" className="mt-8 -mb-px overflow-x-auto">
            <ul className="flex min-w-max gap-1">
              {STUDIO_TABS.map((t) => (
                <li key={t.id}>
                  <Link
                    href={studioPath(slug, t.id)}
                    aria-current={tab === t.id ? "page" : undefined}
                    className={`flex min-h-11 items-center border-b-2 px-3 font-plex text-sm transition-colors ${tab === t.id ? "border-lime text-lime" : "border-transparent text-lightgray hover:text-bright"}`}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/t/${slug}`} className="flex min-h-11 items-center border-b-2 border-transparent px-3 font-plex text-sm text-lightgray hover:text-bright">
                  ← Team hub
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      {render(ctx)}
    </>
  );
}

/** The team password was entered for this team, but nobody has picked their name in the hub yet. */
async function unlockedWithoutName(slug: string) {
  const s = await getTeamSession();
  if (!s || s.memberId) return false;
  const [t] = await query<{ id: number }>("select id from teams where slug = $1", [slug]);
  return t?.id === s.teamId;
}

const GATE = {
  forbidden: {
    title: "This studio belongs to another team",
    body: "Only members of this team can open its studio. The published Ship Page, if there is one, is public.",
    cta: null,
  },
  pick_name: {
    title: "Pick your name first",
    body: "You're signed in to the team, but the studio needs to know which teammate you are. In the team hub, choose your name under “Who are you?”, then come back.",
    cta: "Pick your name →",
  },
  signed_out: {
    title: "Sign in to your team first",
    body: "The studio is team-only. Sign in with your email and the password you chose at registration (or a one-time code from the desk) to come straight back here.",
    cta: "Open team hub →",
  },
} as const;

function SignIn({ slug, tab, state }: { slug: string; tab: StudioTab; state: keyof typeof GATE }) {
  const g = GATE[state];
  return (
    <section className="py-20">
      <div className="container-page max-w-lg space-y-5">
        <Eyebrow>Ship studio</Eyebrow>
        <h1 className="font-display text-3xl text-bright">{g.title}</h1>
        <p className="font-plex text-sm text-lightgray">{g.body}</p>
        <div className="flex flex-wrap gap-2">
          {state === "signed_out" && (
            <Link
              href={`/passport/login?next=${encodeURIComponent(studioPath(slug, tab))}`}
              className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime"
            >
              Sign in with your email →
            </Link>
          )}
          {g.cta && (
            <Link
              href={`/t/${slug}`}
              className={
                state === "signed_out"
                  ? "inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime"
                  : "inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime"
              }
            >
              {g.cta}
            </Link>
          )}
          <Link href={`/ship/${slug}`} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
            Public Ship Page
          </Link>
        </div>
      </div>
    </section>
  );
}
