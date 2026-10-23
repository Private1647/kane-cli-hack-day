import { envelopeResponse } from "@/server/core";
import { deckGet, deckUpdate } from "@/server/deck";
import { authorizeProject, pathId, readMutation } from "@/server/story";

// The deck id is the project id: one deck per project, many versions.
// GET  /api/v1/decks/{deckId}/versions?version=N   deck_get (scene model, theme, exports)
// POST /api/v1/decks/{deckId}/versions             deck_update: new version
//   body: { deck: { slides, theme }, expected_version, reason?, idempotency_key? }

export async function GET(req: Request, ctx: RouteContext<"/api/v1/decks/[deckId]/versions">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).deckId), { req });
    const v = Number(new URL(req.url).searchParams.get("version"));
    const data = await deckGet(access, Number.isSafeInteger(v) && v > 0 ? v : null);
    return {
      message: data.version ? `Deck version ${data.version} (${data.status}).` : "No deck saved yet; the default is generated from the story.",
      data,
      links: [{ label: "Deck editor", url: `/studio/${access.project.slug}/deck` }, ...(data.published ? [{ label: "Public deck", url: data.published.url }] : [])],
      fallbackText: `Deck for ${access.project.slug}: v${data.version} (${data.status}). PDF: ${data.exports.pdf}. PPTX: unavailable.`,
    };
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/decks/[deckId]/versions">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).deckId), { req, write: true });
    const { data, receipt } = await deckUpdate(access, await readMutation(req));
    return {
      message: `Saved deck version ${data.version}.`,
      data: { version: data.version, slides: data.deck.slides.length, receipt },
      links: [{ label: "Deck editor", url: `/studio/${access.project.slug}/deck` }],
      fallbackText: `Saved deck v${data.version} (receipt ${receipt.id}). Publish it from /studio/${access.project.slug}/deck.`,
    };
  });
}
