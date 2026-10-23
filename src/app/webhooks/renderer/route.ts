import { query } from "@/lib/db";
import { AppError, parse, toAppError } from "@/server/core";
import { verifyHmac } from "@/server/kane-http";
import { applyRenderCallback, renderCallbackSchema } from "@/server/mcp-adapters";

// POST /webhooks/renderer: the render worker reports a job's status.
//   X-Renderer-Signature: sha256=<hex HMAC of the raw body, RENDERER_WEBHOOK_SECRET>
//   X-Renderer-Delivery:  unique id per attempt (deduped)
// Body: { job_id, status: running|succeeded|failed|cancelled, object_key?, error_code? }
// A failed render never blocks anything: the HTML deck keeps working.

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) return Response.json({ error: "payload too large" }, { status: 413 });
  if (!process.env.RENDERER_WEBHOOK_SECRET) return Response.json({ error: "webhook not configured" }, { status: 503 });
  if (!verifyHmac(process.env.RENDERER_WEBHOOK_SECRET, raw, req.headers.get("x-renderer-signature"))) return Response.json({ error: "bad signature" }, { status: 401 });
  const delivery = req.headers.get("x-renderer-delivery")?.slice(0, 100);
  if (!delivery) return Response.json({ error: "missing delivery id" }, { status: 400 });

  const fresh = await query<{ id: number }>(
    "insert into webhook_deliveries (provider, delivery_id, event) values ('renderer', $1, 'render.status') on conflict (provider, delivery_id) do nothing returning id",
    [delivery],
  );
  if (!fresh.length) return Response.json({ ok: true, duplicate: true });

  try {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError("VALIDATION_FAILED", { userMessage: "Body must be JSON." });
    }
    const out = await applyRenderCallback(parse(renderCallbackSchema, body), delivery);
    await query("update webhook_deliveries set status = $2 where provider = 'renderer' and delivery_id = $1", [delivery, out.applied ? "processed" : "ignored"]);
    return Response.json({ ok: true, ...out });
  } catch (err) {
    const e = toAppError(err);
    await query("delete from webhook_deliveries where provider = 'renderer' and delivery_id = $1", [delivery]).catch(() => {});
    return Response.json({ error: e.toJSON() }, { status: e.status });
  }
}
