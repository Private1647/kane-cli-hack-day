import { envelopeResponse } from "@/server/core";
import { teamFindTool } from "@/server/team-tools";
import { actingMember } from "@/server/teams";
import { queryOf } from "../../teams/body";

// GET /api/v1/match/suggestions?skill=&show=all|people|teams
// Ranked opted-in people and recruiting teams, each with an explanation. No contact details.

export async function GET(req: Request) {
  return envelopeResponse(async () => teamFindTool(await actingMember(req), queryOf(req)));
}
