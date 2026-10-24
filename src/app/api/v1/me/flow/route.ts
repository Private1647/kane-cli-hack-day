import { getPersonalMember } from "@/server/auth";
import { flowState } from "@/server/flow";
import { getPassport } from "@/server/passport";
import { listBearerTokens } from "@/server/pairing";

// Where you are in the event-day flow. Browser-only (your own session cookie).
// Teammates waiting on the team page poll this to move on once the captain
// confirms the final team; /setup polls it to move on to the Idea tab once a
// machine is paired and a Kane run is on record.

export async function GET() {
  const member = await getPersonalMember();
  if (!member) return Response.json({ stage: null }, { status: 401, headers: { "cache-control": "no-store" } });
  const [{ stage, next, teamSlug }, tokens, passport] = await Promise.all([flowState(member.id), listBearerTokens(member.id), getPassport(member.id)]);
  const setupDone = tokens.length > 0 && passport.kane_runs > 0;
  return Response.json({ stage, next, setupDone, ideaUrl: teamSlug ? `/t/${teamSlug}/idea` : null }, { headers: { "cache-control": "no-store" } });
}
