import { envelopeResponse } from "@/server/core";
import { teamJoinTool } from "@/server/team-tools";
import { actingMember } from "@/server/teams";
import { readBody } from "../body";

// POST /api/v1/teams/join { code, explicit_confirmation: true }
// One-time invite. TEAM_FULL (409), DEADLINE_PASSED (423, roster locked) or an
// expired code leave no partial membership behind.

export async function POST(req: Request) {
  return envelopeResponse(async () => teamJoinTool(await actingMember(req), await readBody(req)));
}
