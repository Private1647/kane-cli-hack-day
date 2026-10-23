import "server-only";
import { randomUUID } from "node:crypto";

// Structured logs (T-DEP-03): one JSON line per event so Vercel's log search
// can filter by `evt`, `level` and `request_id`. Emails, tokens and secrets
// are redacted before anything is written; never log a request body.
//
//   const l = logger(req);                 // picks up x-request-id / x-vercel-id
//   l.info("cron.outbox.drained", { delivered: 3 });
//   l.error("roster.import.failed", err);

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Our own token prefixes, bearer headers and anything that looks like a long secret.
const TOKEN = /\b(kh[kpbh]_[A-Za-z0-9_-]{8,}|Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|xox[abp]-[A-Za-z0-9-]+)/g;
const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|signature|email|code_hash|ciphertext/i;

/** Strip PII and secrets from any value before it reaches a log line. */
export function redact(v: unknown, depth = 0): unknown {
  if (v == null || depth > 4) return v;
  if (typeof v === "string") return v.replace(EMAIL, "[email]").replace(TOKEN, "[token]").slice(0, 2000);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Error) return { name: v.name, message: redact(v.message), code: (v as { code?: unknown }).code ?? null };
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(x, depth + 1);
    return out;
  }
  return String(v);
}

function write(level: Level, evt: string, fields: Fields) {
  const line = JSON.stringify({ level, evt, time: new Date().toISOString(), ...(redact(fields) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type Logger = {
  requestId: string;
  debug: (evt: string, fields?: Fields) => void;
  info: (evt: string, fields?: Fields) => void;
  warn: (evt: string, fields?: Fields) => void;
  error: (evt: string, err?: unknown, fields?: Fields) => void;
  child: (fields: Fields) => Logger;
};

/** A correlation id for this request: the caller's x-request-id, Vercel's id, or a fresh uuid. */
export function requestIdOf(req?: Request | Headers | null) {
  const h = req instanceof Headers ? req : req?.headers;
  const given = h?.get("x-request-id") ?? h?.get("x-vercel-id");
  return given && /^[\w:.-]{4,128}$/.test(given) ? given : randomUUID();
}

export function logger(req?: Request | Headers | null, base: Fields = {}): Logger {
  const requestId = typeof base.request_id === "string" ? base.request_id : requestIdOf(req);
  const ctx = { ...base, request_id: requestId };
  return {
    requestId,
    debug: (evt, f = {}) => process.env.NODE_ENV !== "production" && write("debug", evt, { ...ctx, ...f }),
    info: (evt, f = {}) => write("info", evt, { ...ctx, ...f }),
    warn: (evt, f = {}) => write("warn", evt, { ...ctx, ...f }),
    error: (evt, err, f = {}) => write("error", evt, { ...ctx, ...f, err: err ?? null }),
    child: (f) => logger(null, { ...ctx, ...f }),
  };
}

/** A logger with no request (cron, scripts). */
export const log = logger(null, { request_id: "system" });
