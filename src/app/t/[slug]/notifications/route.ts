import { getHubFeed } from "@/lib/notifications";
import { photoSrc } from "@/lib/photos";
import { getMemberSession, getTeamSession } from "@/lib/session";
import { getMembers, getTeamBySlug } from "@/lib/teams";

// What the hub bell polls: the signed-in member's feed as JSON.
export async function GET(_req: Request, ctx: RouteContext<"/t/[slug]/notifications">) {
  const { slug } = await ctx.params;
  const [team, session, personal] = await Promise.all([getTeamBySlug(slug), getTeamSession(), getMemberSession()]);
  if (!team) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Same rule as the hub gate: the team cookie's member, or a personal sign-in by a teammate.
  let memberId = session?.teamId === team.id ? session.memberId : null;
  if (!memberId && personal?.personal && (await getMembers(team.id)).some((m) => m.id === personal.memberId)) memberId = personal.memberId;
  if (!memberId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { pinned, feed, unread } = await getHubFeed(team, memberId);
  const shape = (n: (typeof feed)[number]) => ({ ...n, image: photoSrc(n.image_path), send_at: n.send_at.toISOString() });
  return Response.json({ pinned: pinned.map(shape), feed: feed.map(shape), unread }, { headers: { "cache-control": "no-store" } });
}
