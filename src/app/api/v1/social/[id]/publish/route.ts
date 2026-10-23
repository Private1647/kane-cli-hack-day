import { envelopeResponse } from "@/server/core";
import { requireRole } from "@/server/auth";
import { publishDraft } from "@/server/social";

// POST /api/v1/social/{id}/publish  {explicit_confirmation: true}  (Idempotency-Key header recommended)
// Organizer only; needs the social_publish flag and X_API_* env. Idempotent
// per draft: a repeat returns the same remote_post_id.

export async function POST(request: Request, ctx: RouteContext<"/api/v1/social/[id]/publish">) {
  return envelopeResponse(async () => {
    const staff = await requireRole("organizer");
    const body = (await request.json().catch(() => ({}))) as { explicit_confirmation?: boolean };
    const { data, receipt } = await publishDraft(staff, {
      draft_id: (await ctx.params).id,
      explicit_confirmation: body.explicit_confirmation === true,
      idempotency_key: request.headers.get("idempotency-key") ?? undefined,
    });
    return {
      message: data.replayed ? "Already posted; here is the original post." : "Posted from the official account.",
      data: { ...data, receipt },
      links: data.url ? [{ label: "Post on X", url: data.url }] : [],
    };
  });
}
