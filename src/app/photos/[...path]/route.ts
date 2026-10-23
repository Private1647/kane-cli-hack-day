import { get } from "@vercel/blob";
import { getTeamSession, isAdmin } from "@/lib/session";
import { EVENT_PREFIX, REG_PREFIX, hasExportToken, isPublishedEventPhoto, teamForRegPhoto } from "@/lib/photos";
import { getStaff, hasRole } from "@/server/auth";

// Serves photos from the private Blob store.
//   event/...  photos the pipeline published to a team gallery: public, like the gallery.
//   reg/...    registration photos: that team's signed-in browsers, admins, and the pipeline.

export async function GET(request: Request, ctx: RouteContext<"/photos/[...path]">) {
  const pathname = (await ctx.params).path.join("/");

  let allowed = false;
  let staffOnly = false;
  if (pathname.startsWith(EVENT_PREFIX)) {
    allowed = await isPublishedEventPhoto(pathname);
    // Held / in-review photos: photographers and organizers only, never cached publicly.
    if (!allowed && hasRole(await getStaff(), "photographer", "organizer")) allowed = staffOnly = true;
  } else if (pathname.startsWith(REG_PREFIX)) {
    if (hasExportToken(request) || (await isAdmin())) allowed = true;
    else {
      const [session, teamId] = await Promise.all([getTeamSession(), teamForRegPhoto(pathname)]);
      allowed = teamId !== null && session?.teamId === teamId;
    }
  }
  if (!allowed) return new Response("Not found", { status: 404 });

  const file = await get(pathname, { access: "private" });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "content-type": file.blob.contentType ?? "image/jpeg",
      // Pathnames carry a random suffix and never change in place, so browsers can keep them.
      // Published photos can be unpublished (consent revoked), so keep the public cache short.
      "cache-control": staffOnly ? "private, no-store" : pathname.startsWith(EVENT_PREFIX) ? "public, max-age=300" : "private, max-age=3600",
    },
  });
}
