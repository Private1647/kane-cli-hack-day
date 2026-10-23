import { get } from "@vercel/blob";
import { canViewMedia } from "@/server/showcase";

// Screenshots live in the private Blob store under showcase/p<id>/. The team
// and organizers can load any of their project's uploads (draft previews);
// the public only sees images that are in the published story of a public or
// unlisted page. Everything else is a 404, so private drafts can't be probed.

export async function GET(_request: Request, ctx: RouteContext<"/ship/[slug]/media/[...path]">) {
  const { slug, path } = await ctx.params;
  const pathname = path.map((p) => decodeURIComponent(p)).join("/");
  const access = await canViewMedia(slug, pathname).catch((): false => false);
  if (!access) return new Response("Not found", { status: 404 });

  const file = await get(pathname, { access: "private" }).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "content-type": file.blob.contentType ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
      // Pathnames carry a random suffix and never change in place; private copies stay out of shared caches.
      "cache-control": access.cacheable ? "public, max-age=300" : "private, max-age=600",
    },
  });
}
