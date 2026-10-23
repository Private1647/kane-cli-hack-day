import { isEnabled } from "@/lib/flags";
import { getPublishedDeck, offlineDeckResponse } from "@/server/deck";

// The published deck as one self-contained HTML file (T-DECK-06): no network
// needed to present, print to PDF, or export deck.json. Public, like the deck.

export async function GET(_req: Request, ctx: RouteContext<"/ship/[slug]/deck/offline">) {
  const { slug } = await ctx.params;
  if (!(await isEnabled("ship_pages"))) return new Response("Not found", { status: 404 });
  const pub = await getPublishedDeck(slug);
  if (!pub) return new Response("Not found", { status: 404 });
  return offlineDeckResponse({ story: pub.story, deck: pub.deck, slug, label: `Published deck v${pub.deckVersion}`, filename: `${slug}-deck-v${pub.deckVersion}.html` });
}
