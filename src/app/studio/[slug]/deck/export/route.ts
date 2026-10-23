import { defaultDeck } from "@/components/deck/model";
import { toAppError } from "@/server/core";
import { getDeckVersion, offlineDeckResponse } from "@/server/deck";
import { authorizeStudio, previewStory } from "@/server/story";

// Team-only offline downloads (T-DECK-06):
//   ?v=N        that saved deck version as a single self-contained HTML file
//   ?starter=1  the default five-slide deck from the current story (the
//               re-skinned blueprint ui/deck.html starter: edit, JSON export, print)

export async function GET(request: Request, ctx: RouteContext<"/studio/[slug]/deck/export">) {
  const { slug } = await ctx.params;
  try {
    const access = await authorizeStudio(slug);
    const url = new URL(request.url);
    const preview = await previewStory(access);
    if (url.searchParams.get("starter")) {
      return offlineDeckResponse({ story: preview.story, deck: defaultDeck(preview.story), slug, label: "Offline starter · draft", filename: `${slug}-deck-starter.html` });
    }
    const v = Number(url.searchParams.get("v"));
    const dv = await getDeckVersion(access.project.id, Number.isSafeInteger(v) && v > 0 ? v : null);
    if (!dv) return new Response("No saved deck yet.", { status: 404 });
    return offlineDeckResponse({ story: preview.story, deck: dv.deck, slug, label: `Deck v${dv.version} · ${dv.status}`, filename: `${slug}-deck-v${dv.version}.html` });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.userMessage, { status: err.status });
  }
}
