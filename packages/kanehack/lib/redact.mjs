// Redaction before anything leaves this machine. Mirrors the server's
// credential guard (src/server/kane-ndjson.ts): the server refuses reports
// that still look like they contain secrets, so we scrub first.

const SECRET_VALUE = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bkh[kpbh]_[A-Za-z0-9_-]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bLT_ACCESS_KEY\s*[=:]\s*\S+/gi,
  /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi,
];

const SECRET_KEY = /"([^"]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|cookie|credential|bearer)[^"]*)"\s*:\s*"[^"]*"/gi;

const LOCAL_PATH = /(~\/|\/Users\/[^/\s"']+|\/home\/[^/\s"']+|[A-Za-z]:\\\\?Users\\\\?[^\\\s"']+)[^\s"']*/g;

/** Scrub one NDJSON text blob: secrets → [REDACTED], home paths → [local path]. */
export function redactText(text) {
  let out = text;
  for (const re of SECRET_VALUE) out = out.replace(re, "[REDACTED]");
  // "api_key": "abc" → "api_key": "[REDACTED]" (keeps the JSON valid).
  out = out.replace(SECRET_KEY, (m, key) => `"${key}":"[REDACTED]"`);
  out = out.replace(LOCAL_PATH, "[local path]");
  return out;
}

/** Keep only typed events (drop progress chatter) when a stream is too big to send whole. */
export function typedOnly(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => /^\s*\{.*"type"\s*:/.test(l))
    .join("\n");
}
