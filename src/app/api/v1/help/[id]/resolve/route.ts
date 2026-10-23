import { envelopeResponse } from "@/server/core";
import { requireHelpStaffFromRequest, transitionHelpTicket } from "@/server/help";
import { readMutation } from "../../request";

// POST /api/v1/help/{id}/resolve: mark a ticket resolved, with an optional
// resolution note ({ payload: { reason } }) the participant will see.

export async function POST(req: Request, ctx: RouteContext<"/api/v1/help/[id]/resolve">) {
  return envelopeResponse(async () => {
    const { id } = await ctx.params;
    const staff = await requireHelpStaffFromRequest(req);
    const body = await readMutation(req);
    const r = await transitionHelpTicket(id, staff, "resolve", { reason: typeof body.reason === "string" ? body.reason : (body.resolution as string | undefined) });
    return {
      message: `${r.code} resolved.`,
      data: { id: r.id, status: r.status, receipt: { id: r.id, server_time: r.server_time } },
      links: [{ label: `Open ${r.code}`, url: `/ops/help/${r.code}` }],
      fallbackText: `Resolved ${r.code} at ${r.server_time}.`,
    };
  });
}
