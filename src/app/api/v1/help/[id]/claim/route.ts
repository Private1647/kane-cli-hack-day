import { envelopeResponse } from "@/server/core";
import { claimHelpTicket, requireHelpStaffFromRequest } from "@/server/help";

// POST /api/v1/help/{id}/claim: a mentor claims a ticket. Atomic: a second
// concurrent claim gets 409 CONFLICT "already claimed by X". Claim is
// naturally idempotent per ticket, so no key is needed.

export async function POST(req: Request, ctx: RouteContext<"/api/v1/help/[id]/claim">) {
  return envelopeResponse(async () => {
    const { id } = await ctx.params;
    const staff = await requireHelpStaffFromRequest(req);
    const r = await claimHelpTicket(id, staff);
    return {
      message: `You claimed ${r.code}.`,
      data: { id: r.id, status: r.status, receipt: { id: r.id, server_time: r.server_time } },
      links: [{ label: `Open ${r.code}`, url: `/ops/help/${r.code}` }],
      fallbackText: `Claimed ${r.code} at ${r.server_time}.`,
    };
  });
}
