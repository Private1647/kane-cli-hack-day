"use server";

import { refresh } from "next/cache";
import { memberActor, requireMember } from "@/server/auth";
import { parse, runAction } from "@/server/core";
import { readinessSchema, recordReadiness } from "@/server/passport";

// A self-reported readiness check from the browser (source 'web'). The
// browser can test Chrome and API reachability itself; the CLI checks are
// what the person says they saw, and the page labels them that way.

export type ReportState = { error?: string; ok?: boolean } | null;

export async function reportWeb(input: { checks: { id: string; status: "pass" | "warn" | "fail" | "skip"; detail?: string }[]; idempotency_key?: string }): Promise<ReportState> {
  const r = await runAction(async () => {
    const member = await requireMember();
    const v = parse(readinessSchema, { ...input, client: { agent: "web" } });
    return recordReadiness(member, memberActor(member), v, "web", null);
  });
  if (!r.ok) return { error: `${r.error.message} ${r.error.next_action}` };
  refresh();
  return { ok: true };
}
