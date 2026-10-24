import { checkProfile, type ProfileKind } from "@/server/profile-check";
import { clientKey, rateLimit } from "@/server/ratelimit";

// POST { kind: "linkedin" | "x" | "github", value } → { status, url }.
// Open before sign-up (the /register form uses it), so it's throttled per visitor.

const KINDS = new Set<ProfileKind>(["linkedin", "x", "github"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: string; value?: string } | null;
  const kind = body?.kind as ProfileKind;
  const value = String(body?.value ?? "").slice(0, 200);
  if (!KINDS.has(kind) || !value.trim()) return Response.json({ status: "invalid", url: null }, { status: 400 });
  const limit = await rateLimit(`profile-check:${await clientKey(req)}`, { limit: 40, windowSec: 300 });
  if (!limit.ok) return Response.json({ status: "unknown", url: null }, { status: 429 });
  return Response.json(await checkProfile(kind, value), { headers: { "cache-control": "no-store" } });
}
