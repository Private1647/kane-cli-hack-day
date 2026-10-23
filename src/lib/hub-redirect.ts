import "server-only";
import { hubPath, type HubTab } from "./hub";
import { getMemberSession } from "./session";
import { query } from "./db";

/**
 * Old public pages (/submit, /judging) now live in each team's hub. Send a
 * personally signed-in member to their team's tab, anyone else to sign in
 * first (and then on to /me, which resumes their flow). Browsers carry the
 * #fragment across the redirect, so deep links keep working.
 */
export async function redirectToHub(request: Request, tab: HubTab) {
  const session = await getMemberSession();
  const [team] = session?.personal
    ? await query<{ slug: string }>("select t.slug from members m join teams t on t.id = m.team_id where m.id = $1 and m.deleted_at is null", [session.memberId])
    : [];
  const target = team ? hubPath(team.slug, tab) : session?.personal ? "/me" : "/passport/login?next=/me";
  return Response.redirect(new URL(target, request.url), 307);
}
