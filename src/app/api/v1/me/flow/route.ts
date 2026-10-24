import { getPersonalMember } from "@/server/auth";
import { flowState } from "@/server/flow";

// Where you are in the event-day flow. Browser-only (your own session cookie).
// Teammates waiting on the team page poll this to move on once the captain
// confirms the final team.

export async function GET() {
  const member = await getPersonalMember();
  if (!member) return Response.json({ stage: null }, { status: 401, headers: { "cache-control": "no-store" } });
  const { stage, next } = await flowState(member.id);
  return Response.json({ stage, next }, { headers: { "cache-control": "no-store" } });
}
