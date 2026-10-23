import type { Metadata } from "next";
import { isEnabled } from "@/lib/flags";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import { getCustomHtml, getEditableDeck, listDeckVersions, listRenderJobs, sandboxDoc, shipQrSvg } from "@/server/deck";
import { getLatestPublished } from "@/server/story";
import { Panel } from "../fields";
import Studio, { type StudioCtx } from "../shell";
import CustomHtml from "./CustomHtml";
import DeckEditor from "./DeckEditor";

export const metadata: Metadata = { title: "Deck · Ship studio", robots: { index: false } };

// /studio/[slug]/deck: the HTML deck editor (T-DECK-01..08).

export default function DeckPage({ params }: PageProps<"/studio/[slug]/deck">) {
  return (
    <Studio params={params} tab="deck">
      {(ctx) => <DeckTab ctx={ctx} />}
    </Studio>
  );
}

async function DeckTab({ ctx }: { ctx: StudioCtx }) {
  const [editable, versions, published, page, renders, custom, qrSvg, enabled] = await Promise.all([
    getEditableDeck(ctx),
    listDeckVersions(ctx.project.id),
    getLatestPublished(ctx.project.id, "deck"),
    getLatestPublished(ctx.project.id, "ship_page"),
    listRenderJobs(ctx.project.id, ctx.slug),
    getCustomHtml(ctx.project.id),
    shipQrSvg(ctx.slug),
    isEnabled("deck"),
  ]);
  const publishedDeck = published ? versions.find((v) => v.status === "published") : null;

  return (
    <>
      {!enabled && (
        <div className="container-page pt-6">
          <DegradedServiceAlert state="degraded" system="Deck studio" manualRoute={`/studio/${ctx.slug}/deck/export?starter=1`} manualLabel="Download the offline deck starter">
            Saving is switched off right now. Present from the offline starter, or make five slides in any editor and export a PDF. No penalty.
          </DegradedServiceAlert>
        </div>
      )}
      <DeckEditor
        slug={ctx.slug}
        initialDeck={editable.deck}
        defaultDeck={editable.defaultDeck}
        initialVersion={editable.current?.version ?? 0}
        story={editable.story}
        qrSvg={qrSvg}
        versions={versions.map((v) => ({ version: v.version, status: v.status, createdAt: v.createdAt, deck: v.deck }))}
        published={published ? { version: published.version, deckVersion: publishedDeck?.version ?? null } : null}
        renders={renders.map((r) => ({ id: r.id, kind: r.kind, status: r.status, note: r.note, url: r.url, sourceVersion: r.sourceVersion }))}
        canWrite={ctx.canWrite && enabled}
        shipPublished={!!page}
      />
      <div className="container-page pb-40">
        <Panel
          eyebrow="Advanced · level 3"
          title="Custom HTML deck (sandboxed preview)"
          intro="Bring your own HTML/CSS. It only ever runs in a sandboxed frame here, with no access to your account, cookies or the event API. Your public deck keeps the default design."
        >
          <CustomHtml slug={ctx.slug} initial={custom?.html ?? ""} srcDoc={custom ? sandboxDoc(custom.html) : ""} canWrite={ctx.canWrite} />
        </Panel>
        <Panel eyebrow="If the editor fails" title="Fallback">
          <p className="max-w-2xl font-plex text-sm text-lightgray">
            Download the{" "}
            <a href={`/studio/${ctx.slug}/deck/export?starter=1`} className="text-bright underline underline-offset-4 hover:text-lime">
              offline deck starter
            </a>{" "}
            (one HTML file, works with no network: edit text, export JSON, print to PDF), or make five slides in any editor and export a PDF: what you created, see it working, harness, proof, what improved. Submission is accepted even when media rendering fails.
          </p>
        </Panel>
      </div>
    </>
  );
}
