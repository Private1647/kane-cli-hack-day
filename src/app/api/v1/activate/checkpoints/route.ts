import { requireFlag } from "@/lib/flags";
import { AGENT_CHECKPOINTS, getActivationState, recordAgentCheckpoint } from "@/server/activation";
import { envelopeResponse, parse, siteUrl, z } from "@/server/core";
import { resolveCaller } from "@/server/pairing";

// GET  : where this person's activation is. The Kane controller polls this
//        between run A (stops at awaiting_selfie) and run B (verifies active).
// POST : an agent reports kane_run_a_started / kane_run_a_stopped /
//        browser_verified. Never a selfie step: only a human click does that.

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const { member } = await resolveCaller(req);
    const s = await getActivationState(member.id);
    const status = s.session?.status ?? "none";
    return {
      status: s.awaiting_human ? "needs_action" : "ok",
      message: s.awaiting_human ? `Waiting for the participant at step “${s.step}”.` : "Activation is complete.",
      data: {
        activation_id: s.session?.id ?? null,
        status,
        step: s.step,
        checkpoint: s.marker,
        awaiting_human: s.awaiting_human,
        receipt: s.receipt ? { code: s.receipt.code, server_time: s.receipt.server_time.toISOString(), checks: s.receipt.checks } : null,
        checkpoints: s.checkpoints.map((c) => ({ checkpoint: c.checkpoint, status: c.status, actor: c.actor, run_id: c.run_id, at: c.created_at.toISOString() })),
      },
      actions: s.awaiting_human ? [{ id: "open_activation", label: "Open activation in the browser", requires_human_confirmation: true, href: siteUrl("/activate") }] : [],
      links: [{ label: "Activation", url: "/activate" }, { label: "Passport", url: "/passport" }],
      fallbackText: s.awaiting_human
        ? `Activation is at “${status}”. Ask the participant to finish it at ${siteUrl("/activate")} (only they can take the selfie).`
        : `Activated. Receipt ${s.receipt?.code ?? ""}. Passport: ${siteUrl("/passport")}`,
    };
  });
}

const body = z.object({
  checkpoint: z.enum(AGENT_CHECKPOINTS),
  run_id: z.string().trim().min(1).max(120).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    await requireFlag("activation");
    const caller = await resolveCaller(req);
    const input = parse(body, await req.json().catch(() => ({})));
    const r = await recordAgentCheckpoint(caller.member, caller.actor, input.checkpoint, input.run_id ?? null, input.payload ?? {});
    return {
      message: `Recorded ${input.checkpoint}.`,
      data: r,
      warnings: input.checkpoint === "browser_verified" ? ["The passport shows the Kane check as VERIFIED only once this run is source-verified in /api/v1/kane/runs."] : [],
    };
  });
}
