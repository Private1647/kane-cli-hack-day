import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Section";
import StatusPill from "@/components/ui/StatusPill";
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
    if (e instanceof AppError && (e.code === "UNAUTHENTICATED" || e.code === "FORBIDDEN")) return <SignIn slug={slug} forbidden={e.code === "FORBIDDEN"} />;
    throw e;
  }
  const published = await getLatestPublished(ctx.project.id, "ship_page");
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
                  <span className="border border-hairline px-2 py-1 font-pixel text-[10px] tracking-[0.2em] text-bright uppercase">Public · v{published.version}</span>
                  <Link href={`/ship/${slug}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-lime hover:underline">
                    /ship/{slug} →
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

function SignIn({ slug, forbidden }: { slug: string; forbidden: boolean }) {
  return (
    <section className="py-20">
      <div className="container-page max-w-lg space-y-5">
        <Eyebrow>Ship studio</Eyebrow>
        <h1 className="font-display text-3xl text-bright">{forbidden ? "This studio belongs to another team" : "Sign in to your team first"}</h1>
        <p className="font-plex text-sm text-lightgray">
          {forbidden
            ? "Only members of this team can open its studio. The published Ship Page, if there is one, is public."
            : "The studio is team-only. Open your team hub, enter the team password and pick your name, then come back."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!forbidden && (
            <Link href={`/t/${slug}`} className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
              Open team hub →
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
