import { query } from "@/lib/db";
import { ingestGithubPush } from "@/server/kane";
import { verifyHmac } from "@/server/kane-http";

// POST /webhooks/github: GitHub App webhook (T-KANE-09).
//   1. HMAC-SHA256 of the raw body with GITHUB_WEBHOOK_SECRET (X-Hub-Signature-256)
//   2. X-GitHub-Delivery dedupe (redeliveries return 200 "duplicate")
//   3. push → repository_links + the commit timeline; ping → 200; anything else ignored
// The App needs only Contents: read + Metadata: read and the "push" event.
// Nothing from the payload is trusted until the signature checks out.

const MAX_BODY = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "payload too large" }, { status: 413 });
  if (!process.env.GITHUB_WEBHOOK_SECRET) return Response.json({ error: "webhook not configured" }, { status: 503 });
  if (!verifyHmac(process.env.GITHUB_WEBHOOK_SECRET, raw, req.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  const delivery = req.headers.get("x-github-delivery")?.slice(0, 100);
  const event = req.headers.get("x-github-event")?.slice(0, 60) ?? "unknown";
  if (!delivery) return Response.json({ error: "missing delivery id" }, { status: 400 });

  const fresh = await query<{ id: number }>(
    "insert into webhook_deliveries (provider, delivery_id, event) values ('github', $1, $2) on conflict (provider, delivery_id) do nothing returning id",
    [delivery, event],
  );
  if (!fresh.length) return Response.json({ ok: true, duplicate: true });

  const mark = (status: string, detail: string) =>
    query("update webhook_deliveries set status = $3, detail = $4 where provider = 'github' and delivery_id = $1 and event = $2", [delivery, event, status, detail.slice(0, 300)]).catch(() => {});

  try {
    if (event === "ping") {
      await mark("processed", "ping");
      return Response.json({ ok: true, pong: true });
    }
    if (event !== "push") {
      await mark("ignored", `event ${event} not handled`);
      return Response.json({ ok: true, ignored: event });
    }
    const out = await ingestGithubPush(delivery, JSON.parse(raw));
    await mark(out.status, out.detail);
    return Response.json({ ok: true, ...out });
  } catch (err) {
    console.error("[webhooks/github] failed", (err as Error)?.name);
    await mark("failed", (err as Error)?.name ?? "error");
    await query("update integration_state set status = 'degraded', last_error_at = now(), last_error_code = 'webhook', updated_at = now() where system = 'github'").catch(() => {});
    // Let GitHub retry: drop our dedupe row so the redelivery is processed.
    await query("delete from webhook_deliveries where provider = 'github' and delivery_id = $1 and status = 'failed'", [delivery]).catch(() => {});
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
