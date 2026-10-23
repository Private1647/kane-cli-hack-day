import { envelopeResponse, parse, z } from "@/server/core";
import { startPairing } from "@/server/pairing";

// kanehack login, step 1 (no account needed). Returns a short user code to
// show the person and a secret device code to poll /api/v1/pair/confirm with.
// The person approves the user code at /pair while signed in.

const body = z.object({ label: z.string().trim().max(80).optional() });

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const input = parse(body, await req.json().catch(() => ({})));
    const p = await startPairing({ label: input.label ?? null });
    return {
      status: "needs_action",
      message: `Open ${p.verification_url} and approve code ${p.user_code}.`,
      data: p,
      actions: [{ id: "approve_pairing", label: `Approve ${p.user_code}`, requires_human_confirmation: true, href: p.verification_url }],
      links: [{ label: "Approve pairing", url: p.verification_url }],
      fallbackText: `Go to ${p.verification_url} while signed in and approve ${p.user_code}. Then poll POST /api/v1/pair/confirm with the device_code every ${p.interval}s.`,
    };
  });
}
