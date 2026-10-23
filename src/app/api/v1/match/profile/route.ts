import { requireFlag } from "@/lib/flags";
import { envelopeResponse } from "@/server/core";
import { getProfile, upsertProfile } from "@/server/match";
import { actingMember } from "@/server/teams";
import { readBody } from "../../teams/body";

// GET  /api/v1/match/profile  your matchmaker profile
// POST /api/v1/match/profile  { discoverable, skills[], interests[], preferred_work?, availability?, learning_goals?, bio? }
// Turning discoverability on or off is a consent change: send explicit_confirmation: true with it.

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const who = await actingMember(req);
    const profile = await getProfile(who.member.id);
    return { message: profile.discoverable ? "You're discoverable." : "You're not discoverable.", data: { profile }, links: [{ label: "Team finder", url: "/match" }] };
  });
}

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    await requireFlag("match");
    const who = await actingMember(req);
    const body = await readBody(req);
    const current = await getProfile(who.member.id);
    const wants = body.discoverable === true || body.discoverable === "on" || body.discoverable === "true";
    if (wants !== current.discoverable && body.explicit_confirmation !== true) {
      return {
        status: "needs_action" as const,
        message: `This ${wants ? "turns on" : "turns off"} your discoverability to other participants. Confirm with the participant first.`,
        actions: [{ id: "confirm", label: "Call again with explicit_confirmation: true", requires_human_confirmation: true, tool: "match_profile" }],
      };
    }
    const out = await upsertProfile(who, { ...body, source: req.headers.get("authorization") ? "mcp" : "web" });
    return { message: "Profile saved.", data: { profile: out.profile, receipt: out.receipt }, links: [{ label: "Team finder", url: "/match" }] };
  });
}
