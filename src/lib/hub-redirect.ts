import "server-only";
import { isHubTab, hubPath, type HubTab } from "./hub";
import { getTeamSession } from "./session";
import { getTeamById } from "./teams";

/**
 * Old public pages (/resources, /submit, …) now live in each team's hub. Send a
 * signed-in visitor to their team's tab, anyone else to log in first. Browsers
 * carry the #fragment across the redirect, so deep links keep working.
 */
export async function redirectToHub(request: Request, tab: HubTab) {
  const session = await getTeamSession();
  const team = session ? await getTeamById(session.teamId) : null;
  const target = team ? hubPath(team.slug, tab) : `/login${tab ? `?next=${tab}` : ""}`;
  return Response.redirect(new URL(target, request.url), 307);
}

export const nextTab = (v: string | string[] | undefined): HubTab => (typeof v === "string" && isHubTab(v) ? v : "");
