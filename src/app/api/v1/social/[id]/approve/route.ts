import { AppError, envelopeResponse } from "@/server/core";
import { requireRole } from "@/server/auth";
import { approveDraft } from "@/server/social";

// POST /api/v1/social/{id}/approve  {explicit_confirmation: true}
// Organizer only. Checks (consent, claims, rights, duplicates, length) are re-run and must all pass.

export async function POST(request: Request, ctx: RouteContext<"/api/v1/social/[id]/approve">) {
  return envelopeResponse(async () => {
    const staff = await requireRole("organizer");
    const body = (await request.json().catch(() => ({}))) as { explicit_confirmation?: boolean };
    if (body.explicit_confirmation !== true) throw new AppError("VALIDATION_FAILED", { userMessage: "Approval needs explicit_confirmation: true from a human." });
    const { receipt } = await approveDraft(staff, { draft_id: (await ctx.params).id });
    return { message: "Approved. Publish it to X, or copy it and post by hand.", data: { receipt } };
  });
}
