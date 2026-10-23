import { envelopeResponse, parse, siteUrl, z } from "@/server/core";
import { githubEnabled, startPairing } from "@/server/pairing";

// Begin guest authentication. For a CLI/MCP client this is device pairing
// (same as /api/v1/pair/start); the envelope also lists the browser sign-in
// routes so a headless agent can tell the person where to go.

const body = z.object({ label: z.string().trim().max(80).optional() });

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const input = parse(body, await req.json().catch(() => ({})));
    const p = await startPairing({ label: input.label ?? null });
    return {
      status: "needs_action",
      message: `Open ${p.verification_url} and approve code ${p.user_code}.`,
      data: {
        pairing: p,
        browser_sign_in: {
          team_member: siteUrl("/passport/login"),
          activation_code: siteUrl("/activate"),
          github_link: githubEnabled() ? siteUrl("/api/v1/auth/github/start") : null,
        },
      },
      actions: [{ id: "approve_pairing", label: `Approve ${p.user_code}`, requires_human_confirmation: true, href: p.verification_url }],
      links: [
        { label: "Approve pairing", url: p.verification_url },
        { label: "Sign in", url: "/passport/login" },
      ],
      fallbackText: `Sign in at ${siteUrl("/passport/login")}, then approve ${p.user_code} at ${p.verification_url}. Poll /api/v1/pair/confirm with the device_code.`,
    };
  });
}
