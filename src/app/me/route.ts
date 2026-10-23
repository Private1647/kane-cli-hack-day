import { getMemberSession } from "@/lib/session";
import { flowState } from "@/server/flow";

// "Resume": wherever this person is in the event-day flow (profile → team →
// activate → Codex → hub). Signed out → start at /register.
export async function GET(request: Request) {
  const s = await getMemberSession();
  const next = s?.personal ? (await flowState(s.memberId)).next : "/register";
  return Response.redirect(new URL(next, request.url), 307);
}
