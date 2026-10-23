import type { Metadata } from "next";
import Link from "next/link";
import { SHIP_TEMPLATES, ShipTemplate, isShipTemplate } from "@/components/ship-templates";
import { previewStory } from "@/server/story";
import Studio, { type StudioCtx } from "../shell";
import UseTemplate from "./UseTemplate";

export const metadata: Metadata = { title: "Template & preview · Ship studio", robots: { index: false } };

// Template picker (T-SHIP-09) and showcase_preview: the latest saved story
// rendered exactly as it would publish, in any of the six templates.

export default function PreviewPage({ params, searchParams }: PageProps<"/studio/[slug]/preview">) {
  return (
    <Studio params={params} tab="preview">
      {(ctx) => <PreviewTab ctx={ctx} searchParams={searchParams} />}
    </Studio>
  );
}

async function PreviewTab({ ctx, searchParams }: { ctx: StudioCtx; searchParams: PageProps<"/studio/[slug]/preview">["searchParams"] }) {
  const sp = await searchParams;
  const p = await previewStory(ctx);
  const asked = typeof sp.template === "string" ? sp.template : null;
  const shown = isShipTemplate(asked) ? asked : p.template;
  const meta = SHIP_TEMPLATES.find((t) => t.id === shown)!;

  return (
    <>
      <section className="container-page py-10">
        <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">Templates · same story, different layout</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SHIP_TEMPLATES.map((t) => {
            const active = t.id === shown;
            return (
              <li key={t.id}>
                <Link
                  href={`/studio/${ctx.slug}/preview?template=${t.id}`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`brackets block h-full border p-4 transition-colors ${active ? "border-lime" : "border-hairline hover:border-bright"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={`font-display text-lg ${active ? "text-lime" : "text-bright"}`}>{t.name}</span>
                    {t.id === p.template && <span className="font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">Current</span>}
                  </span>
                  <span className="mt-2 block font-plex text-xs text-lightgray">{t.blurb}</span>
                  <span className="mt-2 block font-plex text-xs text-bright">Best for: {t.bestFor}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6">{ctx.canWrite && <UseTemplate slug={ctx.slug} template={shown} current={shown === p.template} name={meta.name} />}</div>
        {p.version === 0 && <p className="mt-4 font-plex text-sm text-warning">! Nothing saved yet: this preview uses a first draft built from your registration.</p>}
        {p.review.publishBlockers.length > 0 && (
          <p className="mt-4 font-plex text-sm text-lightgray">
            {p.review.publishBlockers.length} thing{p.review.publishBlockers.length === 1 ? "" : "s"} to fix before publishing.{" "}
            <Link href={`/studio/${ctx.slug}#publish`} className="text-bright underline underline-offset-4 hover:text-lime">
              See the publish checklist →
            </Link>
          </p>
        )}
      </section>
      <div className="border-y border-dashed border-hairline bg-surface/40">
        <ShipTemplate name={shown} story={p.story} />
      </div>
    </>
  );
}
