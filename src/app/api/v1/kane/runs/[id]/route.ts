import { envelopeResponse } from "@/server/core";
import { idParam } from "@/server/kane-http";
import { getRun, resolveCaller, runForEnvelope } from "@/server/kane";

// GET /api/v1/kane/runs/{id}: one run with per-test results, evidence and
// linked defects. Scoped to the team, judges, mentors and organizers.

export async function GET(req: Request, ctx: RouteContext<"/api/v1/kane/runs/[id]">) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const run = await getRun(caller, idParam((await ctx.params).id));
    const verified = run.source_verified;
    return {
      message: `Run KR-${run.id}: ${run.status}${verified ? " (source verified)" : ""}.`,
      data: {
        ...runForEnvelope(run),
        evidence: run.evidence.map((e) => ({ id: e.id, kind: e.kind, sha256: e.sha256, redaction_state: e.redaction_state, url: `/api/v1/kane/evidence/${e.id}` })),
        defects: run.defects.map((d) => ({ id: d.id, title: d.title, status: d.status, failure_class: d.failure_class })),
      },
      evidence: [
        { kind: "kane_run", id: `KR-${run.id}`, confidence: verified ? ("verified" as const) : ("unverified" as const) },
        ...run.evidence
          .filter((e) => e.redaction_state !== "quarantined")
          .map((e) => ({ kind: "evidence_artifact", id: `EV-${e.id}`, confidence: e.verified_at ? ("verified" as const) : ("participant_reported" as const) })),
      ],
      uiType: "kane_run",
      fallbackText: `KR-${run.id} ${run.status.toUpperCase()} · exit ${run.exit_code ?? "—"} · ${run.commit_sha?.slice(0, 7) ?? "no SHA"} · ${
        verified ? "VERIFIED" : run.verification_state === "manual_unverified" ? "UNVERIFIED (manual)" : "REPORTED"
      }`,
    };
  });
}
