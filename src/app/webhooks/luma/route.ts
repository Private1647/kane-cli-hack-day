import { createHmac, timingSafeEqual } from "node:crypto";
import { idempotent, sha256 } from "@/server/core";
import { logger } from "@/server/log";
import { isPaused, recordIntegration } from "@/server/ops";
import { clientKey, rateLimit } from "@/server/ratelimit";
import { upsertGuestFromLuma } from "@/server/roster";

// Luma guest webhooks (T-ROS-04, W2). Off unless LUMA_WEBHOOK_SECRET is set
// (needs Luma Plus); the CSV import stays the source of truth either way.
// Accepted: guest.registered / guest.updated. Signature: HMAC-SHA256 of the
// raw body with the secret, sent as hex/base64 (optionally "sha256=…"), or the
// Standard Webhooks scheme (webhook-id / webhook-timestamp / webhook-signature
// "v1,<base64>", secret "whsec_<base64>"). Replays are deduped by delivery id
// (or body hash) and timestamps older than 5 minutes are refused.
//
// The exact Luma payload/signature format must be confirmed against Luma's
// docs before enabling; until then this is a tolerant, fail-closed adapter.

const MAX_BODY = 256 * 1024;
const TOLERANCE_SEC = 300;

function eq(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function verify(secret: string, raw: string, h: Headers): { ok: boolean; why?: string } {
  // Standard Webhooks.
  const id = h.get("webhook-id");
  const ts = h.get("webhook-timestamp");
  const sigs = h.get("webhook-signature");
  if (id && ts && sigs) {
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(age) || age > TOLERANCE_SEC) return { ok: false, why: "stale_timestamp" };
    const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest();
    const ok = sigs.split(" ").some((s) => {
      const [, b64] = s.split(",");
      return !!b64 && eq(Buffer.from(b64, "base64"), expected);
    });
    return ok ? { ok } : { ok: false, why: "bad_signature" };
  }
  // Plain HMAC of the body.
  const given = (h.get("x-luma-signature") ?? h.get("luma-signature") ?? h.get("x-webhook-signature") ?? "").replace(/^sha256=/, "").trim();
  if (!given) return { ok: false, why: "missing_signature" };
  const expected = createHmac("sha256", secret).update(raw).digest();
  const asHex = /^[0-9a-f]{64}$/i.test(given) ? Buffer.from(given, "hex") : Buffer.from(given, "base64");
  return eq(asHex, expected) ? { ok: true } : { ok: false, why: "bad_signature" };
}

type Guest = { api_id?: string; id?: string; guest_id?: string; name?: string; user_name?: string; first_name?: string; last_name?: string; email?: string; user_email?: string; approval_status?: string };

export async function POST(req: Request) {
  const l = logger(req, { route: "webhooks.luma" });
  const secret = process.env.LUMA_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "luma webhooks are not enabled" }, { status: 404 });

  const rl = await rateLimit(`webhook:luma:${await clientKey(req)}`, { limit: 120, windowSec: 60 });
  if (!rl.ok) return Response.json({ error: "rate_limited" }, { status: 429 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });

  const v = verify(secret, raw, req.headers);
  if (!v.ok) {
    l.warn("luma.webhook.rejected", { why: v.why });
    await recordIntegration("luma", { ok: false, code: v.why ?? "rejected", detail: "Webhook signature rejected" });
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  if (await isPaused("luma")) return Response.json({ ok: true, ignored: "paused" }, { status: 202 });

  let body: { type?: string; event?: string; data?: Guest & { guest?: Guest } };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const type = String(body.type ?? body.event ?? "");
  if (!/^guest\.(registered|updated)$/.test(type)) return Response.json({ ok: true, ignored: type || "unknown" });
  const g: Guest = body.data?.guest ?? body.data ?? {};
  const guestId = String(g.api_id ?? g.guest_id ?? g.id ?? "").slice(0, 120);
  const name = String(g.name ?? g.user_name ?? [g.first_name, g.last_name].filter(Boolean).join(" ")).trim().slice(0, 120);
  const email = String(g.email ?? g.user_email ?? "").trim().toLowerCase() || null;
  if (!guestId || !name) return Response.json({ error: "missing guest id or name" }, { status: 422 });

  const deliveryId = req.headers.get("webhook-id") ?? req.headers.get("x-luma-delivery") ?? sha256(raw);
  try {
    const { replayed } = await idempotent(deliveryId.slice(0, 200), "webhook.luma", () =>
      upsertGuestFromLuma({ lumaGuestId: guestId, name, email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null, approval: String(g.approval_status ?? "approved"), eventType: type }),
    );
    await recordIntegration("luma", { ok: true, detail: `Last webhook ${type}` });
    l.info("luma.webhook.applied", { type, replayed });
    return Response.json({ ok: true, replayed });
  } catch (err) {
    l.error("luma.webhook.failed", err);
    await recordIntegration("luma", { ok: false, code: "apply_failed" });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
