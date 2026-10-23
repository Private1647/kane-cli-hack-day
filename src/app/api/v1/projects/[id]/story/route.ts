import { envelopeResponse } from "@/server/core";
import { authorizeProject, getProofSources, getStory, pathId, readMutation, reviewStory, saveStory } from "@/server/story";

// GET /api/v1/projects/{id}/story  latest story version + its claim review
// PUT /api/v1/projects/{id}/story  save a new version
//   body: { content: <project-story.schema.json>, expected_version, idempotency_key? }
//   409 CONFLICT if someone saved since expected_version; 400 if a claim is forged.
// Auth: Bearer token (CLI/MCP) or the team's browser session.

export async function GET(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/story">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).id), { req });
    const sv = await getStory(access.project.id);
    const review = sv ? reviewStory(sv.content, await getProofSources(access.project.id)) : null;
    return {
      message: sv ? `Story version ${sv.version}.` : "No story saved yet.",
      status: sv ? "ok" : "needs_action",
      data: { project_id: access.project.id, version: sv?.version ?? 0, story: sv?.content ?? null, review },
      links: [{ label: "Studio", url: `/studio/${access.project.slug}` }],
      fallbackText: sv
        ? `Story v${sv.version} for ${access.project.slug}. ${review!.publishBlockers.length} publish blocker(s). Edit at /studio/${access.project.slug}.`
        : `No story yet. Start one at /studio/${access.project.slug}.`,
    };
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/story">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).id), { req, write: true });
    const { data, receipt } = await saveStory(access, await readMutation(req));
    return {
      message: `Saved story version ${data.version}.`,
      status: data.review.publishBlockers.length ? "needs_action" : "ok",
      data: { version: data.version, review: data.review, receipt },
      warnings: data.review.warnings,
      actions: [{ id: "showcase_preview", label: "Preview the Ship Page", requires_human_confirmation: false, href: `/studio/${access.project.slug}/preview`, tool: "showcase_preview" }],
      fallbackText: `Saved story v${data.version} (receipt ${receipt.id}). ${data.review.publishBlockers.length ? `Before publishing: ${data.review.publishBlockers.join(" ")}` : "Ready to publish after team approval."}`,
    };
  });
}
