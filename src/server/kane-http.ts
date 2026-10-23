import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./core";

/**
 * Constant-time check of a `sha256=<hex>` HMAC header over the raw body.
 * The body must be the exact bytes received (read with req.text() before any
 * JSON parsing).
 */
export function verifyHmac(secret: string | undefined, rawBody: string, header: string | null): boolean {
  if (!secret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(m[1], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Small request helpers shared by the kane-mcp route handlers.

/**
 * Read a JSON mutation body. Accepts the OpenAPI MutationRequest shape
 * `{ idempotency_key, payload }` or a flat object; the key may also come in
 * the `Idempotency-Key` header.
 */
export async function readMutation(req: Request, maxBytes = 2_500_000): Promise<{ payload: Record<string, unknown>; idempotencyKey: string | null }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new AppError("VALIDATION_FAILED", { userMessage: "Request body is too large." });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("VALIDATION_FAILED", { userMessage: "Send a JSON body." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("VALIDATION_FAILED", { userMessage: "Send a JSON object." });
  const b = body as Record<string, unknown>;
  const wrapped = b.payload && typeof b.payload === "object" && !Array.isArray(b.payload);
  const payload = (wrapped ? b.payload : b) as Record<string, unknown>;
  const key = req.headers.get("idempotency-key") ?? (typeof b.idempotency_key === "string" ? b.idempotency_key : null);
  if (key !== null && (key.length < 8 || key.length > 200)) throw new AppError("VALIDATION_FAILED", { userMessage: "Idempotency key must be 8–200 characters." });
  if (!wrapped) delete payload.idempotency_key;
  return { payload, idempotencyKey: key };
}

/** A positive integer path param, or NOT_FOUND. Accepts "KR-12" style codes too. */
export function idParam(raw: string): number {
  const n = Number(raw.replace(/^[A-Z]{2}-/, ""));
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError("NOT_FOUND");
  return n;
}
