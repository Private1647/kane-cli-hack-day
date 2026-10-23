import { logger } from "@/server/log";
import { cronAuthorized, runRetention } from "@/server/outbox";

// Vercel Cron → expire idempotency keys, used login codes, revoked tokens,
// delivered outbox rows and rate-limit windows. CRON_SECRET protected.
export const maxDuration = 60;

export async function GET(req: Request) {
  const l = logger(req, { route: "cron.retention" });
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const res = await runRetention();
    l.info("cron.retention.done", res);
    return Response.json({ ok: true, ...res, request_id: l.requestId });
  } catch (err) {
    l.error("cron.retention.failed", err);
    return Response.json({ ok: false, request_id: l.requestId }, { status: 500 });
  }
}
