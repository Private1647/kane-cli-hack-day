import { envelopeResponse } from "@/server/core";
import { idParam, readMutation } from "@/server/kane-http";
import { listDefects, projectFor, resolveCaller, updateDefect } from "@/server/kane";

// /api/v1/projects/{id}/defects
//   GET   detected defects. A failing run opens a SUSPECTED one; it is only a
//         confirmed bug once a teammate says so, and only "reverified" after a
//         later passing run on a different commit.
//   POST  { defect_id, action: confirm|not_a_bug|mark_fixed|reopen, failure_class?, note? }

const PILL = { suspected: "SUSPECTED", confirmed: "CONFIRMED", not_a_bug: "NOT A BUG", fixed: "FIXED (awaiting re-run)", reverified: "VERIFIED FIX" } as const;

export async function GET(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/defects">) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const project = await projectFor(caller, idParam((await ctx.params).id), { read: true });
    const defects = await listDefects(project.id);
    return {
      message: `${defects.length} defect(s): ${defects.filter((d) => d.status === "suspected").length} suspected, ${defects.filter((d) => d.status === "confirmed").length} confirmed.`,
      data: {
        defects: defects.map((d) => ({
          id: d.id,
          title: d.title,
          detail: d.detail,
          status: d.status,
          failure_class: d.failure_class,
          source_run_id: d.source_run_id,
          verifications: d.verifications.map((v) => ({ run_id: v.run_id, commit_sha: v.commit_sha, result: v.result })),
        })),
      },
      fallbackText: defects.map((d) => `DF-${d.id} ${PILL[d.status]}: ${d.title}`).join("\n") || "No defects detected.",
    };
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/projects/[id]/defects">) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const { payload } = await readMutation(req);
    const r = await updateDefect(caller, payload, { projectId: idParam((await ctx.params).id) });
    return {
      message: `Defect ${r.id} is now ${PILL[r.defect.status]}.`,
      data: r,
      fallbackText: `${r.id} → ${PILL[r.defect.status]}`,
    };
  });
}
