import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import DeckPresenter from "@/components/deck/DeckPresenter";
import DeckSlide from "@/components/deck/DeckSlide";
import { isEnabled } from "@/lib/flags";
import { siteUrl } from "@/server/core";
import { getPublishedDeck, shipQrSvg } from "@/server/deck";
import { getPublishedStory } from "@/server/story";

// /ship/[slug]/deck: the public HTML deck (T-DECK-02). Only a published,
// immutable deck version shows here, rendered with the published Ship Page
// story (so its claims and credits are the approved ones). ?print=1 lays every
// slide on its own 16:9 page for Save as PDF.

export async function generateMetadata({ params }: PageProps<"/ship/[slug]/deck">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedStory(slug).catch(() => null);
  if (!page) return { title: "Deck", robots: { index: false } };
  return {
    title: `${page.story.name} · deck`,
    description: page.story.pitch || `The ${page.story.name} deck from Kane CLI Hack Day.`,
    alternates: { canonical: siteUrl(`/ship/${slug}/deck`) },
    openGraph: { title: `${page.story.name} | Shipped with Kane`, description: page.story.pitch, url: siteUrl(`/ship/${slug}/deck`) },
  };
}

export default function DeckPage({ params, searchParams }: PageProps<"/ship/[slug]/deck">) {
  return (
    <main className="pb-16">
      <style>{`@media print { @page { size: 13.333in 7.5in; margin: 0; } }`}</style>
      <Suspense fallback={<p className="container-page py-24 font-plex text-sm text-lightgray">Loading deck…</p>}>
        <Deck params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Deck({ params, searchParams }: Pick<PageProps<"/ship/[slug]/deck">, "params" | "searchParams">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!(await isEnabled("ship_pages"))) notFound();
  const pub = await getPublishedDeck(slug);
  if (!pub) notFound();
  const qrSvg = pub.deck.theme.show_qr ? await shipQrSvg(slug) : null;
  const printMode = sp.print === "1";
  const total = pub.deck.slides.length;

  return (
    <>
      <header className="no-print container-page flex flex-wrap items-end justify-between gap-4 pt-10">
        <div>
          <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">
            <Link href={`/ship/${slug}`} className="hover:text-bright">
              Ship Page
            </Link>{" "}
            / Deck
          </p>
          <h1 className="mt-2 font-display text-3xl text-bright sm:text-4xl">{pub.story.name}</h1>
        </div>
        <a href={`/ship/${slug}/deck/offline`} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
          Download offline HTML
        </a>
      </header>
      <DeckPresenter
        printMode={printMode}
        label={`Published deck v${pub.deckVersion} · ${new Date(pub.publishedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" })}`}
        titles={pub.deck.slides.map((s) => s.headline)}
        notes={pub.deck.slides.map((s) => s.notes)}
        slides={pub.deck.slides.map((s, i) => (
          <DeckSlide key={s.id} slide={s} story={pub.story} theme={pub.deck.theme} index={i} total={total} qrSvg={qrSvg} />
        ))}
      />
    </>
  );
}
