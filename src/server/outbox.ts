import "server-only";
import { del } from "@vercel/blob";
import { query } from "@/lib/db";
import { writeAudit } from "./core";
import { log } from "./log";
import { isPaused, recordIntegration } from "./ops";
import { pruneRateLimits } from "./ratelimit";

// Background work for Vercel Cron (T-DEP-02): drain the transactional outbox
// and run the retention job. Both are safe to run twice at once (rows are
// claimed with SKIP LOCKED) and both report into integration_state('cron').
//
// Outbox contract for other areas: insert into outbox_events in the same
// transaction as the change, with a `kind` this file knows how to deliver:
//   slack.<anything>  payload { text: string }  → SLACK_WEBHOOK_URL (safe summary only)
//   webhook.<name>    payload { url: string (https), body: object } → POST JSON
//   noop.<anything>   marked published (for tests / rehearsal)
// Unknown kinds are retried with backoff and show up as failing on /ops/integrations.

const MAX_RETRIES = 8;
const BATCH = 25;

type OutboxRow = { id: number; kind: string; payload: Record<string, unknown>; retries: number };

class Permanent extends Error {}

async function deliver(row: OutboxRow) {
  const [family] = row.kind.split(".");
  if (family === "noop") return;
  if (family === "slack") {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) throw new Permanent("SLACK_WEBHOOK_URL not set");
    if (await isPaused("slack")) throw new Error("slack paused");
    const text = typeof row.payload.text === "string" ? row.payload.text.slice(0, 3000) : null;
    if (!text) throw new Permanent("slack payload has no text");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      await recordIntegration("slack", { ok: false, code: `http_${res.status}` });
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Permanent(`slack ${res.status}`);
      throw new Error(`slack ${res.status}`);
    }
    await recordIntegration("slack", { ok: true });
    return;
  }
  if (family === "webhook") {
    const url = typeof row.payload.url === "string" ? row.payload.url : "";
    if (!url.startsWith("https://")) throw new Permanent("webhook url must be https");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(row.payload.body ?? {}), signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return;
  }
  throw new Error(`no handler for ${row.kind}`);
}

export type DrainResult = { claimed: number; delivered: number; failed: number; dead: number };

/** Deliver up to `limit` due events. Each is claimed by pushing available_at forward, so a crash just retries it later. */
export async function drainOutbox(limit = BATCH): Promise<DrainResult> {
  const rows = await query<OutboxRow>(
    `update outbox_events o set available_at = now() + interval '2 minutes'
       from (select id from outbox_events where published_at is null and available_at <= now() and retries < $2
              order by available_at, id limit $1 for update skip locked) c
      where o.id = c.id returning o.id, o.kind, o.payload, o.retries`,
    [limit, MAX_RETRIES],
  );
  const out: DrainResult = { claimed: rows.length, delivered: 0, failed: 0, dead: 0 };
  for (const row of rows) {
    try {
      await deliver(row);
      await query("update outbox_events set published_at = now(), last_error = null where id = $1", [row.id]);
      out.delivered++;
    } catch (err) {
      const permanent = err instanceof Permanent;
      const retries = permanent ? MAX_RETRIES : row.retries + 1;
      // Exponential backoff: 1, 2, 4 … minutes, capped at 30.
      await query("update outbox_events set retries = $2, last_error = $3, available_at = now() + make_interval(mins => $4) where id = $1", [
        row.id,
        retries,
        String((err as Error).message ?? err).slice(0, 300),
        Math.min(30, 2 ** row.retries),
      ]);
      if (retries >= MAX_RETRIES) out.dead++;
      else out.failed++;
      log.warn("outbox.delivery_failed", { id: row.id, kind: row.kind, retries, permanent, err });
    }
  }
  return out;
}

/** Put dead or failing events back in the queue (ops "retry"). */
export async function requeueOutbox(onlyDead: boolean) {
  const rows = await query<{ n: number }>(
    `with r as (update outbox_events set retries = 0, available_at = now(), last_error = null
                 where published_at is null and ($1::boolean = false or retries >= $2) returning 1)
     select count(*)::int as n from r`,
    [onlyDead, MAX_RETRIES],
  );
  return rows[0]?.n ?? 0;
}

export async function outboxSummary() {
  const [s] = await query<{ pending: number; retrying: number; dead: number; delivered_24h: number; oldest: Date | null }>(
    `select count(*) filter (where published_at is null and retries < $1)::int as pending,
            count(*) filter (where published_at is null and retries between 1 and $1 - 1)::int as retrying,
            count(*) filter (where published_at is null and retries >= $1)::int as dead,
            count(*) filter (where published_at > now() - interval '24 hours')::int as delivered_24h,
            min(available_at) filter (where published_at is null and retries < $1) as oldest
       from outbox_events`,
    [MAX_RETRIES],
  );
  const recent = await query<{ id: number; kind: string; retries: number; last_error: string | null; available_at: Date; created_at: Date }>(
    "select id, kind, retries, last_error, available_at, created_at from outbox_events where published_at is null order by retries desc, created_at limit 20",
  );
  return { ...s, recent };
}

// ── Retention ────────────────────────────────────────────────────────────────

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the secret
 * configured, cron routes refuse to run rather than run open.
 */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type RetentionResult =Record<string, number> & { selfiesDue: number; selfiesDeleted: number };

/**
 * Housekeeping that has no business value once expired: idempotency keys,
 * used/expired login codes, revoked/expired tokens, delivered outbox rows,
 * old rate-limit windows. Selfies past deletion_due_at are only counted unless
 * RETENTION_DELETE_SELFIES=1, because deleting a person's photo is
 * irreversible and the policy date should be confirmed by an organizer first.
 */
export async function runRetention(): Promise<RetentionResult> {
  const count = async (sql: string) => (await query<{ n: number }>(`with d as (${sql} returning 1) select count(*)::int as n from d`))[0]?.n ?? 0;
  const res = {
    idempotencyKeys: await count("delete from idempotency_keys where expires_at < now()"),
    staffLoginCodes: await count("delete from staff_login_codes where (used_at is not null and used_at < now() - interval '1 day') or expires_at < now() - interval '1 day'"),
    memberTokens: await count("delete from member_tokens where (revoked_at is not null and revoked_at < now() - interval '7 days') or expires_at < now() - interval '7 days'"),
    outboxDelivered: await count("delete from outbox_events where published_at is not null and published_at < now() - interval '7 days'"),
    rateLimitWindows: await pruneRateLimits(),
    selfiesDue: 0,
    selfiesDeleted: 0,
  };
  try {
    const due = await query<{ id: number; object_key: string }>("select id, object_key from selfies where deletion_due_at < now() and deleted_at is null limit 100");
    res.selfiesDue = due.length;
    if (due.length && process.env.RETENTION_DELETE_SELFIES === "1" && process.env.BLOB_READ_WRITE_TOKEN) {
      for (const s of due) {
        try {
          await del(s.object_key);
          await query("update selfies set deleted_at = now() where id = $1", [s.id]);
          await writeAudit({ type: "system", label: "retention" }, { action: "selfie.delete_retention", resourceType: "selfie", resourceId: s.id });
          res.selfiesDeleted++;
        } catch (err) {
          log.warn("retention.selfie_delete_failed", { id: s.id, err });
        }
      }
    }
  } catch (err) {
    log.warn("retention.selfies_unavailable", { err });
  }
  return res;
}
