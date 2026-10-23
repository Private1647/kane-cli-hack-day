import { connection } from "next/server";
import { envelopeResponse } from "@/server/core";
import { matchAggregates } from "@/server/match";

// GET /api/v1/match/aggregates  public counts for the TV / live page (T-MATCH-04):
// people looking, open seats, recruiting teams. Counts only; no names or contact.

export async function GET() {
  await connection();
  return envelopeResponse(async () => {
    const a = await matchAggregates();
    return {
      message: `${a.looking} looking · ${a.open_seats} open seats · ${a.recruiting_teams} recruiting teams`,
      data: a,
      freshness: { as_of: a.as_of.toISOString(), state: "fresh", source: "matchmaker" },
      links: [{ label: "Team finder", url: "/match" }],
    };
  });
}
