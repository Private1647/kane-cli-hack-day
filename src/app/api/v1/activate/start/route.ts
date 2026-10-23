import { requireFlag } from "@/lib/flags";
import { findSession, issueActivationCode } from "@/server/activation";
import { envelopeResponse, siteUrl } from "@/server/core";
import { resolveCaller } from "@/server/pairing";

// activation_begin (Kane run A). A paired CLI/MCP client asks for a one-time
// activation link (30 minutes) to open in Chrome; opening it and pressing
// Continue signs that browser in and resumes the person's activation.
// Already active → nothing to do, the passport link instead.

export async function POST(req: Request) {
  return envelopeResponse<unknown>(async () => {
    await requireFlag("activation");
    const caller = await resolveCaller(req);
    const existing = await findSession(caller.member.id);
    if (existing?.status === "active") {
      return {
        message: "Already activated.",
        data: { status: "active", receipt_code: existing.receipt_code, passport_url: siteUrl("/passport") },
        links: [{ label: "Passport", url: "/passport" }],
        fallbackText: `Already activated (receipt ${existing.receipt_code}). Passport: ${siteUrl("/passport")}`,
      };
    }
    const code = await issueActivationCode({ memberId: caller.member.id }, caller.actor, 30);
    return {
      status: "needs_action",
      message: "Open the activation link in Chrome. Kane may fill the form; the participant takes the selfie.",
      data: {
        activation_url: code.url,
        code: code.code,
        expires_at: code.expires_at.toISOString(),
        checkpoints_url: siteUrl("/api/v1/activate/checkpoints"),
        stop_marker: '[data-checkpoint="awaiting_selfie"]',
      },
      actions: [{ id: "open_activation", label: "Open activation", requires_human_confirmation: true, href: code.url }],
      links: [{ label: "Activation", url: code.url }],
      fallbackText: `Open ${code.url} (code ${code.code}, valid 30 minutes). Stop at the camera step; the participant presses the shutter.`,
    };
  });
}
