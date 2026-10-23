import { envelopeResponse } from "@/server/core";
import { readMutation } from "@/server/kane-http";
import { listRuns, projectFor, recordRun, resolveCaller, runForEnvelope } from "@/server/kane";

// POST /api/v1/kane/runs: `kanehack report` and other paired clients report a
// Kane run. Success is the exit code; a missing completion event is not a pass.
// GET  /api/v1/kane/runs: the caller's project's recent runs.

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const { payload, idempotencyKey } = await readMutation(req);
    const { receipt, replayed } = await recordRun(caller, payload, { via: "kanehack_cli", idempotencyKey });
    const verified = receipt.source_verified;
    return {
      status: receipt.status === "passed" && verified ? "ok" : receipt.status === "running" ? "partial" : "needs_action",
      message: replayed
        ? `Run ${receipt.id} was already recorded (${receipt.status}).`
        : `Recorded run ${receipt.id}: ${receipt.status}${verified ? ", source verified" : ", reported (not verified)"}.`,
      data: { ...receipt, replayed },
      evidence: [{ kind: "kane_run", id: receipt.id, confidence: verified ? "verified" : "unverified" }],
      links: [{ label: "Open Proof tab", url: receipt.url }],
      uiType: "kane_run",
      warnings: receipt.warnings.filter((w) => w !== "duplicate"),
      fallbackText: `Kane run ${receipt.id}: ${receipt.status.toUpperCase()} (${verified ? "VERIFIED source" : "UNVERIFIED"}). ${
        receipt.defects_opened ? `${receipt.defects_opened} suspected defect(s) opened. ` : ""
      }Details: ${receipt.url}`,
    };
  });
}

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const pid = Number(url.searchParams.get("project_id")) || null;
    const project = await projectFor(caller, pid, { read: true });
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const runs = await listRuns(project.id, limit);
    return {
      message: `${runs.length} run(s) for ${project.name}.`,
      data: { project_id: project.id, team_slug: project.team_slug, runs: runs.map(runForEnvelope) },
      uiType: "kane_run",
      links: [{ label: "Open Proof tab", url: `/t/${project.team_slug}/proof` }],
      fallbackText: runs.length
        ? runs
            .slice(0, 5)
            .map((r) => `KR-${r.id} ${r.status}${r.source_verified ? " (verified)" : ""}`)
            .join("; ")
        : 'No Kane runs reported yet. Run `kanehack report -- kane-cli run "…" --agent`.',
    };
  });
}
