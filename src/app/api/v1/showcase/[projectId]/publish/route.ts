import { envelopeResponse } from "@/server/core";
import { authorizeProject, pathId, readMutation, showcasePublish } from "@/server/story";

// POST /api/v1/showcase/{projectId}/publish   showcase_publish
//   body: { story_version, confirm_phrase: "<project slug>", idempotency_key? }
// Needs explicit human approval: an agent must ask its human to confirm, then
// send the slug as confirm_phrase. The server re-runs the claim review and the
// per-person consent check, then writes an immutable published version.

export async function POST(req: Request, ctx: RouteContext<"/api/v1/showcase/[projectId]/publish">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).projectId), { req, write: true });
    const body = await readMutation(req);
    const { data, receipt } = await showcasePublish(access, body);
    return {
      message: `Published Ship Page version ${data.version}.`,
      data: { ...data, receipt },
      links: [{ label: "Ship Page", url: `/ship/${access.project.slug}` }],
      fallbackText: `Published /ship/${access.project.slug} as version ${data.version} (receipt ${receipt.id}). Credited: ${data.consent.credited.map((c) => c.name).join(", ") || "nobody by name"}.`,
    };
  });
}
