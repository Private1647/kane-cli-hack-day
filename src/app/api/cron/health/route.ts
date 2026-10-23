import { logger } from "@/server/log";
import { probeIntegrations } from "@/server/ops";
import { cronAuthorized } from "@/server/outbox";

// Vercel Cron → probe DB / Blob / outbox lag and write integration_state,
// which drives the /ops and TV banners. CRON_SECRET protected.
export const maxDuration = 30;

export async function GET(req: Request) {
  const l = logger(req, { route: "cron.health" });
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const results = await probeIntegrations({ type: "system", label: "cron" });
    l.info("cron.health.done", { results: results.map((r) => `${r.system}:${r.status}`) });
    return Response.json({ ok: true, results: results.map(({ system, status }) => ({ system, status })), request_id: l.requestId });
  } catch (err) {
    l.error("cron.health.failed", err);
    return Response.json({ ok: false, request_id: l.requestId }, { status: 500 });
  }
}
