import "server-only";
import { headers } from "next/headers";
import { query } from "@/lib/db";
import { AppError, sha256 } from "./core";
import { log } from "./log";

// Rate limits (T-SEC-01) for login, help, finalize, check-in search and
// webhooks. A fixed window per (bucket, window) in Postgres (db/020), so every
// function instance shares the count. If the database can't be reached, an
// in-memory window on this instance is used instead: a limiter must never be
// the reason check-in, help or submission stop working.
//
//   await enforceRateLimit(`login:${await clientKey()}`, { limit: 10, windowSec: 60 });

export type RateLimitResult = { ok: boolean; hits: number; limit: number; resetAt: Date };

const memory = new Map<string, { start: number; hits: number }>();

function memoryHit(bucket: string, windowMs: number, now: number) {
  const start = Math.floor(now / windowMs) * windowMs;
  const cur = memory.get(bucket);
  const next = cur && cur.start === start ? { start, hits: cur.hits + 1 } : { start, hits: 1 };
  memory.set(bucket, next);
  if (memory.size > 5000) for (const [k, v] of memory) if (v.start < start) memory.delete(k);
  return next;
}

/** Count one hit against `bucket` and say whether it is still under `limit` for this window. */
export async function rateLimit(bucket: string, opts: { limit: number; windowSec: number }): Promise<RateLimitResult> {
  const windowMs = opts.windowSec * 1000;
  const key = bucket.length > 120 ? `${bucket.slice(0, 40)}:${sha256(bucket).slice(0, 32)}` : bucket;
  try {
    const [row] = await query<{ hits: number; window_start: Date }>(
      `insert into rate_limit_buckets (bucket, window_start, hits)
       values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       on conflict (bucket, window_start) do update set hits = rate_limit_buckets.hits + 1
       returning hits, window_start`,
      [key, opts.windowSec],
    );
    return { ok: row.hits <= opts.limit, hits: row.hits, limit: opts.limit, resetAt: new Date(new Date(row.window_start).getTime() + windowMs) };
  } catch (err) {
    log.warn("ratelimit.db_unavailable", { bucket: key, err });
    const now = Date.now();
    const m = memoryHit(key, windowMs, now);
    return { ok: m.hits <= opts.limit, hits: m.hits, limit: opts.limit, resetAt: new Date(m.start + windowMs) };
  }
}

/** Like rateLimit but throws RATE_LIMITED (429) when over. */
export async function enforceRateLimit(bucket: string, opts: { limit: number; windowSec: number }) {
  const r = await rateLimit(bucket, opts);
  if (!r.ok) {
    const wait = Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
    throw new AppError("RATE_LIMITED", { userMessage: `Too many tries. Wait about ${wait}s and try again.`, details: { retry_after_sec: wait } });
  }
  return r;
}

/**
 * A stable, non-reversible key for the caller: a hash of the client IP (from
 * Vercel's forwarding headers). Pass a Request in route handlers; server
 * actions read the incoming headers.
 */
export async function clientKey(req?: Request) {
  const h = req ? req.headers : await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return sha256(`${ip}|${process.env.SESSION_SECRET ?? ""}`).slice(0, 24);
}

/** Delete windows older than a day (called by the retention cron). */
export async function pruneRateLimits() {
  const rows = await query<{ n: number }>("with d as (delete from rate_limit_buckets where window_start < now() - interval '1 day' returning 1) select count(*)::int as n from d");
  return rows[0]?.n ?? 0;
}
