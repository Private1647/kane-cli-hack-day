import { get } from "@vercel/blob";
import { isTeamMediaKey } from "@/server/gtm";
import { authorizeStudio } from "@/server/story";

// Streams the team's private studio uploads (footage, stills) back to the
// team's own browsers. Never public: published pages link footage by URL only.

export async function GET(_req: Request, ctx: RouteContext<"/studio/[slug]/media/[...path]">) {
  const { slug, path } = await ctx.params;
  const key = path.join("/");
  if (!isTeamMediaKey(slug, key)) return new Response("Not found", { status: 404 });
  try {
    await authorizeStudio(slug);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const file = await get(key, { access: "private" });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: { "content-type": file.blob.contentType ?? "application/octet-stream", "cache-control": "private, max-age=3600" },
  });
}
