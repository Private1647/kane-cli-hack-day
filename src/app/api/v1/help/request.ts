import "server-only";
import { query } from "@/lib/db";
import { getMember, getStaff, requireBearer, type MemberRow, type Staff } from "@/server/auth";
import { AppError } from "@/server/core";
import { bearerRequester, webRequester, type HelpRequester } from "@/server/help";

// Shared request plumbing for /api/v1/help*: who is asking (bearer for the
// CLI / MCP, the member cookie for the browser) and the MutationRequest body
// ({ idempotency_key, payload }, or a flat object), with Idempotency-Key as a
// header alternative.

export async function requesterFor(req: Request): Promise<HelpRequester> {
  return req.headers.has("authorization") ? bearerRequester(req) : webRequester();
}

/**
 * For reads: the member and/or staff behind the request. A bearer token's
 * member counts as staff when linked to an active staff account.
 */
export async function viewerFor(req: Request): Promise<{ member: MemberRow | null; staff: Staff | null }> {
  if (req.headers.has("authorization")) {
    const auth = await requireBearer(req);
    const [staff] = await query<Staff>("select id, name, email, role from staff_accounts where member_id = $1 and active order by id limit 1", [auth.member.id]);
    return { member: auth.member, staff: staff ?? null };
  }
  const [member, staff] = await Promise.all([getMember(), getStaff()]);
  if (!member && !staff) throw new AppError("UNAUTHENTICATED");
  return { member, staff };
}

export async function readMutation(req: Request): Promise<Record<string, unknown>> {
  let body: unknown = {};
  const text = await req.text();
  if (text.length > 20_000) throw new AppError("VALIDATION_FAILED", { userMessage: "Request body is too large." });
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError("VALIDATION_FAILED", { userMessage: "Body must be JSON." });
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("VALIDATION_FAILED", { userMessage: "Body must be a JSON object." });
  const b = body as Record<string, unknown>;
  const payload = b.payload && typeof b.payload === "object" && !Array.isArray(b.payload) ? (b.payload as Record<string, unknown>) : b;
  const key = (typeof b.idempotency_key === "string" ? b.idempotency_key : null) ?? req.headers.get("idempotency-key");
  return { ...payload, ...(key ? { idempotency_key: key } : {}) };
}
