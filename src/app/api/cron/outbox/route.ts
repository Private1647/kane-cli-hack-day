import { logger } from "@/server/log";
import { recordIntegration } from "@/server/ops";
import { cronAuthorized, drainOutbox } from "@/server/outbox";

// Vercel Cron → deliver queued side effects (Slack, webhooks). CRON_SECRET protected.
export const maxDuration = 60;

export async function GET(req: Request) {
  const l = logger(req, { route: "cron.outbox" });
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    let total = { claimed: 0, delivered: 0, failed: 0, dead: 0 };
    // A few batches per tick, so a burst (20 help tickets at once) clears in one run.
    for (let i = 0; i < 4; i++) {
      const r = await drainOutbox();
      total = { claimed: total.claimed + r.claimed, delivered: total.delivered + r.delivered, failed: total.failed + r.failed, dead: total.dead + r.dead };
      if (r.claimed < 25) break;
    }
    await recordIntegration("cron", { ok: true, detail: `outbox: ${total.delivered} delivered, ${total.failed} retrying, ${total.dead} dead` });
    l.info("cron.outbox.done", total);
    return Response.json({ ok: true, ...total, request_id: l.requestId });
  } catch (err) {
    l.error("cron.outbox.failed", err);
    await recordIntegration("cron", { ok: false, code: "outbox_drain_failed" });
    return Response.json({ ok: false, request_id: l.requestId }, { status: 500 });
  }
}
