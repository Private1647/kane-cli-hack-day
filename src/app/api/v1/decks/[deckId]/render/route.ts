import { envelopeResponse } from "@/server/core";
import { demoGenerate } from "@/server/deck";
import { authorizeProject, pathId, readMutation } from "@/server/story";

// POST /api/v1/decks/{deckId}/render   demo_generate
//   body: { format: "pdf" | "pptx" | "mp4", version? }
// Honest status: no server renderer is deployed, so PDF is "browser print"
// (with the print URL) and PPTX / MP4 are "unavailable". Idempotent per
// (format, version). Never blocks submission.

export async function POST(req: Request, ctx: RouteContext<"/api/v1/decks/[deckId]/render">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).deckId), { req, write: true });
    const { data, receipt } = await demoGenerate(access, await readMutation(req));
    return {
      status: data.errorCode === "browser_print" ? "needs_action" : "partial",
      message: data.note,
      data: { job: data, receipt },
      actions: data.url ? [{ id: "open_print", label: "Open the print view and Save as PDF", requires_human_confirmation: false, href: data.url }] : [],
      links: [{ label: "HTML deck", url: `/ship/${access.project.slug}/deck` }],
      warnings: data.errorCode === "browser_print" ? [] : [data.note],
      fallbackText: `${data.note} Job R-${data.id}.`,
    };
  });
}
