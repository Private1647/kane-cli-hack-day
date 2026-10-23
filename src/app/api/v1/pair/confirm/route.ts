import { envelopeResponse, parse, z } from "@/server/core";
import { exchangePairing } from "@/server/pairing";

// kanehack pair, step 3 (poll). pending → keep polling at `interval`;
// approved → the bearer token, exactly once. Expired, denied or replayed
// device codes fail closed with PAIR_EXPIRED (410).

const body = z.object({ device_code: z.string().trim().min(10).max(200) });

export async function POST(req: Request) {
  return envelopeResponse<unknown>(async () => {
    const input = parse(body, await req.json().catch(() => ({})));
    const r = await exchangePairing(input.device_code);
    if (r.status === "pending") {
      return { status: "needs_action", message: "Waiting for approval in the browser.", data: r, fallbackText: `Not approved yet. Poll again in ${r.interval}s.` };
    }
    return {
      message: `Paired as ${r.member.name} (${r.member.public_code ?? "member"}).`,
      data: r,
      warnings: ["Store this token securely. It is shown once; revoke it from /pair if it leaks."],
      fallbackText: `Paired. Send "Authorization: Bearer <token>" on /api/v1 and /mcp calls. Expires ${r.expires_at}.`,
    };
  });
}
