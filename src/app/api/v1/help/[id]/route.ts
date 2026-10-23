import { hasRole } from "@/server/auth";
import { envelopeResponse, siteUrl } from "@/server/core";
import { getHelpTicket, getHelpTicketForStaff } from "@/server/help";
import { viewerFor } from "../request";

// GET /api/v1/help/{id}: ticket status by H-code or numeric id. Participants
// see their own and their team's tickets; mentors/organizers see any (with
// staff notes). Mentor name only once claimed.

export async function GET(req: Request, ctx: RouteContext<"/api/v1/help/[id]">) {
  return envelopeResponse(async () => {
    const { id } = await ctx.params;
    const viewer = await viewerFor(req);
    const t = hasRole(viewer.staff, "mentor", "organizer") ? await getHelpTicketForStaff(id, viewer.staff) : await getHelpTicket(id, viewer);
    const last = [...t.messages].reverse().find((m) => m.author_type !== "member") ?? null;
    const who = t.mentor ? ` by ${t.mentor}` : "";
    return {
      message: `${t.code}: ${t.status_label}${["claimed", "in_progress"].includes(t.status) ? who : ""}.`,
      data: { ...t, url: siteUrl(t.url), last_reply: last },
      uiType: "help_ticket",
      links: [{ label: `Open ${t.code}`, url: t.url }],
      freshness: { as_of: t.updated_at, state: "fresh", source: "help_tickets" },
      fallbackText: `${t.code} is ${t.status_label.toLowerCase()}${t.mentor ? ` (${t.mentor})` : ""}.${last ? ` Last update: ${last.body}` : ""} ${siteUrl(t.url)}`,
    };
  });
}
