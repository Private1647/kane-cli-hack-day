import { envelopeResponse } from "@/server/core";
import { helpMetrics, listHelpQueue, requireHelpStaffFromRequest } from "@/server/help";

// GET /api/v1/ops/help: the mentor queue (mentor / organizer; staff cookie or
// a bearer token linked to a staff account). ?mine=1 for my claims only.

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const staff = await requireHelpStaffFromRequest(req);
    const mine = new URL(req.url).searchParams.get("mine") === "1";
    const [queue, metrics] = await Promise.all([listHelpQueue(staff, { mine }), helpMetrics().catch(() => [])]);
    const waiting = queue.open.filter((t) => ["new", "triaged", "escalated"].includes(t.status)).length;
    return {
      message: `${queue.open.length} open · ${waiting} waiting for a mentor.`,
      data: { ...queue, metrics },
      uiType: "help_queue",
      freshness: { as_of: queue.server_time, state: "fresh", source: "help_tickets" },
      fallbackText: queue.open.map((t) => `${t.code} ${t.status} ${t.priority} ${t.category_label} table ${t.table_label ?? "?"}: ${t.summary}`).join("\n") || "Queue empty.",
    };
  });
}
