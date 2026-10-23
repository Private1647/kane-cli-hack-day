import { envelopeResponse } from "@/server/core";
import { authorizeProject, pathId, showcasePreview } from "@/server/story";

// GET /api/v1/showcase/{projectId}   showcase_preview: draft preview URL,
// publish blockers, consent gaps and claims that aren't verified.

export async function GET(req: Request, ctx: RouteContext<"/api/v1/showcase/[projectId]">) {
  return envelopeResponse(async () => {
    const access = await authorizeProject(pathId((await ctx.params).projectId), { req });
    const p = await showcasePreview(access);
    const ready = p.publish_blockers.length === 0 && p.consent_missing.length === 0 && p.story_version > 0;
    return {
      status: ready ? "ok" : "needs_action",
      message: ready ? "Ready to publish once your team approves." : "Not ready to publish yet.",
      data: p,
      warnings: p.warnings,
      actions: ready
        ? [{ id: "showcase_publish", label: `Publish story v${p.story_version}`, requires_human_confirmation: true, href: `/studio/${p.slug}#publish`, tool: "showcase_publish" }]
        : [{ id: "edit_story", label: "Fix the story in the studio", requires_human_confirmation: false, href: `/studio/${p.slug}` }],
      links: [{ label: "Preview", url: p.preview_url }, ...(p.public_url ? [{ label: "Public page", url: p.public_url }] : [])],
      fallbackText: ready
        ? `Story v${p.story_version} is ready. Publishing needs a team member's confirmation.`
        : `Blockers: ${[...p.publish_blockers, ...p.consent_missing].join(" ") || "save a story first."}`,
    };
  });
}
