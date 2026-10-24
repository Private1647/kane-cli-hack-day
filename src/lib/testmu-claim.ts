// Pure helpers for the TestMu AI hack-day plan claim (no I/O, unit tested in
// tests/unit/activation-rules.test.mts). The HTTP call itself lives in
// src/server/event-activation.ts.

export type ClaimOutcome = "claimed" | "not_registered" | "error";

export type ClaimResult = {
  outcome: ClaimOutcome;
  /** For staff (stored as last_error): status, code and the API's messages. Never the email. */
  detail: string | null;
};

// The real API's answer for an email with no TestMu AI account (it may come
// with a 2xx): {"code":"NON_SIGNEDUP","message":"Claim recorded. Trial will be activated after signup."}
const NON_SIGNEDUP = /^NON[_\s-]?SIGNE?D[_\s-]?UP$|^NOT[_\s-]?SIGNE?D[_\s-]?UP$/i;

const NOT_REGISTERED = /not[_\s-]?found|not[_\s-]?registered|does\s*n[o’']t\s*exist|does not exist|no\s+(such\s+)?(user|account)|\buser\b|\baccount\b/i;

/** Flatten `{code, message, errors: {field: [msg]}}` into one line of text. */
export function claimErrorText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as { code?: unknown; message?: unknown; error?: unknown; errors?: unknown };
  const parts: string[] = [];
  for (const v of [b.code, b.message, b.error]) if (typeof v === "string" && v) parts.push(v);
  if (b.errors && typeof b.errors === "object") {
    for (const [field, msgs] of Object.entries(b.errors as Record<string, unknown>)) {
      const list = Array.isArray(msgs) ? msgs : [msgs];
      for (const m of list) if (typeof m === "string") parts.push(`${field}: ${m}`);
    }
  }
  return parts.join(" · ").slice(0, 500);
}

/**
 * The one mapping from the claim API's answer to what the participant sees.
 *   code NON_SIGNEDUP (any status)      → not_registered (claim saved; activates after signup)
 *   2xx                                  → claimed
 *   404, or 400/422 whose code/errors say the user/account isn't there → not_registered
 *   anything else (5xx, other 4xx, timeout, network, malformed)        → error
 * `status` null means the request never got an answer (network, timeout).
 */
export function mapClaimResponse(status: number | null, body: unknown, failure?: string): ClaimResult {
  if (status === null) return { outcome: "error", detail: failure ?? "no response" };
  const text = claimErrorText(body);
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  if (typeof code === "string" && NON_SIGNEDUP.test(code.trim())) return { outcome: "not_registered", detail: `HTTP ${status} · ${text}` };
  if (status >= 200 && status < 300) return { outcome: "claimed", detail: null };
  const detail = `HTTP ${status}${text ? ` · ${text}` : body === undefined ? " · malformed response" : ""}`;
  if (status === 404) return { outcome: "not_registered", detail };
  if ((status === 400 || status === 422) && text) {
    // "The email field is required." is a request problem, not an unknown user.
    const lowered = text.toLowerCase();
    // So is "already claimed for this account": the staff see the detail and sort it out.
    if ((/required/.test(lowered) || /already/.test(lowered)) && !/not\s*(found|registered)/.test(lowered)) return { outcome: "error", detail };
    if (NOT_REGISTERED.test(text)) return { outcome: "not_registered", detail };
  }
  return { outcome: "error", detail };
}
