import "server-only";
import { AppError } from "@/server/core";

/**
 * The JSON body of a /api/v1 request as a plain object, with the
 * Idempotency-Key header folded in as `idempotency_key` (CONTRACTS §5).
 * Shared by the teams, match and ideas route handlers.
 */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown = {};
  if (req.headers.get("content-length") !== "0") {
    body = await req.json().catch(() => {
      throw new AppError("VALIDATION_FAILED", { userMessage: "Send a JSON object body." });
    });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new AppError("VALIDATION_FAILED", { userMessage: "Send a JSON object body." });
  const key = req.headers.get("idempotency-key");
  return key ? { idempotency_key: key, ...(body as Record<string, unknown>) } : (body as Record<string, unknown>);
}

/** ?a=1&b=2 → { a: "1", b: "2" } */
export const queryOf = (req: Request) => Object.fromEntries(new URL(req.url).searchParams);
