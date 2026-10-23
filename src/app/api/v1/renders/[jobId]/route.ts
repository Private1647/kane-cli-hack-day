import { envelopeResponse } from "@/server/core";
import { getRenderJob } from "@/server/deck";
import { authorizeProject, pathId } from "@/server/story";

// GET /api/v1/renders/{jobId}: a render job's status, for the team that owns it.

export async function GET(req: Request, ctx: RouteContext<"/api/v1/renders/[jobId]">) {
  return envelopeResponse(async () => {
    const job = await getRenderJob(pathId((await ctx.params).jobId), (projectId) => authorizeProject(projectId, { req }));
    return {
      status: job.status === "succeeded" ? "ok" : job.errorCode === "browser_print" ? "needs_action" : "partial",
      message: job.note,
      data: job,
      fallbackText: `Render R-${job.id} (${job.kind}): ${job.status}. ${job.note}`,
    };
  });
}
