import { getHubFeed } from "@/lib/notifications";
import { photoSrc } from "@/lib/photos";
import { getTeamSession } from "@/lib/session";
import { getTeamBySlug } from "@/lib/teams";

// What the hub bell polls: the signed-in member's feed as JSON.
export async function GET(_req: Request, ctx: RouteContext<"/t/[slug]/notifications">) {
  const { slug } = await ctx.params;
  const [team, session] = await Promise.all([getTeamBySlug(slug), getTeamSession()]);
  if (!team || session?.teamId !== team.id || !session.memberId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { pinned, feed, unread } = await getHubFeed(team, session.memberId);
  const shape = (n: (typeof feed)[number]) => ({ ...n, image: photoSrc(n.image_path), send_at: n.send_at.toISOString() });
  return Response.json({ pinned: pinned.map(shape), feed: feed.map(shape), unread }, { headers: { "cache-control": "no-store" } });
}
