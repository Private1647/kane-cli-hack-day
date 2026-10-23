import { envelopeResponse } from "@/server/core";
import { ideaValidateTool } from "@/server/team-tools";
import { actingMember } from "@/server/teams";
import { readBody } from "../../teams/body";

// POST /api/v1/ideas/validate
//   {}                                   validate the team's saved idea (stored as a revision)
//   { project_idea, title?, project_type? }  ad-hoc check, not stored
//   use_ai: false keeps the text off the model (rule-based check).
// Always advisory: never an official score.

export async function POST(req: Request) {
  return envelopeResponse(async () => ideaValidateTool(await actingMember(req), await readBody(req)));
}
