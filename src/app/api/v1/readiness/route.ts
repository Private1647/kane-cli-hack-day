import { envelopeResponse, idempotent, parse } from "@/server/core";
import { resolveCaller } from "@/server/pairing";
import { getReadiness, readinessSchema, recordReadiness, type ReadinessView } from "@/server/passport";

// hack-doctor's endpoint. POST an attested report from a paired machine
// (bearer; partial reports are fine), GET the merged checklist with the
// exact fix for every check that isn't passing. Reported checks are what the
// machine said, not proof: the UI never shows them as VERIFIED.

function summary(r: ReadinessView) {
  const todo = r.checks.filter((c) => c.status !== "pass");
  return todo.length ? todo.map((c) => `✗ ${c.label}: ${c.fix}`).join("\n") : "All checks reported passing.";
}

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const { member } = await resolveCaller(req);
    const r = await getReadiness(member.id);
    return {
      status: r.failed || r.missing ? "partial" : "ok",
      message: `${r.passed} passing, ${r.failed} failing, ${r.missing} not reported.`,
      data: { ...r, at: r.at?.toISOString() ?? null },
      uiType: "SkillReadiness",
      links: [{ label: "Readiness doctor", url: "/readiness" }],
      fallbackText: summary(r),
    };
  });
}

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const input = parse(readinessSchema, await req.json().catch(() => ({})));
    const key = input.idempotency_key ?? req.headers.get("idempotency-key");
    await idempotent(key, `readiness.report:member:${caller.member.id}`, () =>
      recordReadiness(caller.member, caller.actor, input, caller.via === "bearer" ? "cli" : "web", caller.bearer?.tokenId ?? null).then((r) => ({ id: r.id })),
    );
    const r = await getReadiness(caller.member.id);
    return {
      status: r.failed ? "partial" : "ok",
      message: r.failed ? `${r.failed} check(s) need a fix.` : "Report saved.",
      data: { ...r, at: r.at?.toISOString() ?? null },
      links: [{ label: "Readiness doctor", url: "/readiness" }],
      fallbackText: summary(r),
    };
  });
}
