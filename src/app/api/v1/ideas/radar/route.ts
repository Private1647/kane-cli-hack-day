import { envelopeResponse } from "@/server/core";
import { ideaCheckOverlapTool } from "@/server/team-tools";
import { actingMember } from "@/server/teams";

// POST /api/v1/ideas/radar  idea_check_overlap: compares your opt-in public summary
// with other teams' opt-in public summaries. Private descriptions are never used.

export async function POST(req: Request) {
  return envelopeResponse(async () => ideaCheckOverlapTool(await actingMember(req)));
}
