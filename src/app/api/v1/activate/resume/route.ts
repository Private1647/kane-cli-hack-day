import { requireFlag } from "@/lib/flags";
import { beginActivation, getActivationState } from "@/server/activation";
import { envelopeResponse, siteUrl } from "@/server/core";
import { resolveCaller } from "@/server/pairing";

// Resume at the stored checkpoint (T-ACT-05). Idempotent: calling it again,
// after a crash or from a second device, returns the same session and never
// creates a second participant or selfie.

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    await requireFlag("activation");
    const caller = await resolveCaller(req);
    const s = await beginActivation(caller.member, caller.actor);
    const state = await getActivationState(caller.member.id);
    return {
      status: state.awaiting_human ? "needs_action" : "ok",
      message: `Resumed at “${state.step}”.`,
      data: { activation_id: s.id, status: state.session?.status ?? s.status, step: state.step, checkpoint: state.marker, receipt_code: state.receipt?.code ?? null },
      links: [{ label: "Activation", url: "/activate" }],
      fallbackText: `Activation is at “${state.step}”. Continue at ${siteUrl("/activate")}.`,
    };
  });
}
