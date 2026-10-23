import { envelopeResponse } from "@/server/core";
import { teamCreateTool, teamFindTool } from "@/server/team-tools";
import { actingMember } from "@/server/teams";
import { queryOf, readBody } from "./body";

// GET  /api/v1/teams?skill=&show=  team_find: open teams and opted-in people, with reasons.
// POST /api/v1/teams               team_create { name, track, summary_public?, recruiting_open?, solo?, password?, explicit_confirmation: true }
// Auth: Bearer token (CLI/MCP) or the browser's member cookie.

export async function GET(req: Request) {
  return envelopeResponse(async () => teamFindTool(await actingMember(req), queryOf(req)));
}

export async function POST(req: Request) {
  return envelopeResponse(async () => teamCreateTool(await actingMember(req), await readBody(req)));
}
