import "server-only";
import { query } from "@/lib/db";
import { AppError } from "@/server/core";
import { resolveCaller, type Caller } from "@/server/pairing";
import type { ActingAs } from "@/server/submission";

// Shared by the /api/v1/submissions routes: who is calling (bearer token or
// the browser's member cookie) and which team's submission that is.

export async function submissionCaller(req: Request): Promise<{ caller: Caller; slug: string; as?: ActingAs }> {
  const caller = await resolveCaller(req);
  if (!caller.member.team_id) throw new AppError("FORBIDDEN", { userMessage: "Join or create a team first." });
  const [t] = await query<{ slug: string }>("select slug from teams where id = $1", [caller.member.team_id]);
  if (!t) throw new AppError("FORBIDDEN", { userMessage: "Join or create a team first." });
  // Cookie callers go through the web path (team-scope and personal checks in
  // submission.ts); bearer callers act as their token's member over MCP rules.
  return { caller, slug: t.slug, as: caller.via === "bearer" ? { member: caller.member, actor: caller.actor, source: "mcp" } : undefined };
}
