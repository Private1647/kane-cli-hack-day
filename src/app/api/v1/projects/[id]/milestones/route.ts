import { AppError, envelopeResponse } from "@/server/core";
import { idParam, readMutation } from "@/server/kane-http";
import { approveMilestone, callerMember, listMilestones, projectFor, proposeMilestone, resolveCaller } from "@/server/kane";

// /api/v1/projects/{id}/milestones
//   GET   the project's milestones (team: all; judges/mentors: approved judges/public ones)
//   POST  propose one (MCP milestone_propose uses the same service). Confidence
//         is decided server-side; judges/public visibility waits for a teammate.
//   PATCH { milestone_id, decision: approve|withdraw } (a teammate, signed in)

export async function GET(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/milestones">) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const project = await projectFor(caller, idParam((await ctx.params).id), { read: true });
    let rows = await listMilestones(project.id);
    if (caller.kind === "staff") rows = rows.filter((m) => m.status === "approved" && m.visibility !== "team");
    return {
      message: `${rows.length} milestone(s).`,
      data: {
        milestones: rows.map((m) => ({
          id: m.id,
          title: m.title,
          claim: m.claim,
          confidence: m.confidence,
          evidence_ids: m.evidence_ids,
          source_run_id: m.source_run_id,
          visibility: m.visibility,
          requested_visibility: m.requested_visibility,
          status: m.status,
          created_at: new Date(m.created_at).toISOString(),
        })),
      },
      evidence: rows.map((m) => ({ kind: "milestone", id: `MS-${m.id}`, confidence: m.confidence === "verified" ? ("verified" as const) : m.confidence })),
    };
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/milestones">) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const { payload, idempotencyKey } = await readMutation(req);
    const r = await proposeMilestone(caller, { ...payload, project_id: idParam((await ctx.params).id), idempotency_key: idempotencyKey ?? undefined });
    return {
      status: r.needs_team_approval ? "needs_action" : "ok",
      message: r.needs_team_approval
        ? `Milestone ${r.id} proposed (${r.confidence}). A teammate must approve ${r.requested_visibility} visibility.`
        : `Milestone ${r.id} added for the team (${r.confidence}).`,
      data: r,
      evidence: [{ kind: "milestone", id: r.id, confidence: r.confidence === "verified" ? "verified" : r.confidence }],
      actions: r.needs_team_approval ? [{ id: "approve_milestone", label: "Teammate approves visibility", requires_human_confirmation: true, href: r.url }] : [],
      links: [{ label: "Open Proof tab", url: r.url }],
      fallbackText: `${r.id}: ${r.confidence.toUpperCase().replace("_", " ")}, visible to team${r.needs_team_approval ? `; awaiting approval for ${r.requested_visibility}` : ""}. ${r.url}`,
    };
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/milestones">) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    // Approval is a person's decision in the browser, not a token's.
    if (caller.kind !== "member") throw new AppError("FORBIDDEN", { userMessage: "Approve milestones from the Proof tab while signed in." });
    await projectFor(caller, idParam((await ctx.params).id));
    const { payload } = await readMutation(req);
    const id = Number(payload.milestone_id);
    const decision = payload.decision === "withdraw" ? "withdraw" : payload.decision === "approve" ? "approve" : null;
    if (!Number.isSafeInteger(id) || id <= 0 || !decision) throw new AppError("VALIDATION_FAILED", { userMessage: "Send milestone_id and decision (approve|withdraw)." });
    const r = await approveMilestone(callerMember(caller)!, id, decision);
    return { message: `Milestone ${r.id} ${r.status}.`, data: r };
  });
}
