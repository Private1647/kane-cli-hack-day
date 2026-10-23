import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { authorizeStudio } from "@/server/story";
import { studioPrefix } from "@/server/gtm";

// Client-upload tokens for real footage and stills (T-VID-01): the browser
// uploads straight to the private Blob store (no function body limit). Only
// signed-in members of this team, only into studio/{slug}/, only video and
// images, size-capped. The storyboard saves the pathname afterwards.

export async function POST(request: Request, ctx: RouteContext<"/studio/[slug]/video/upload">) {
  const { slug } = await ctx.params;
  const body = (await request.json()) as HandleUploadBody;
  try {
    // Token requests come from the browser with the member's cookies; the
    // completion callback comes from Blob and carries no cookies.
    if (body.type === "blob.generate-client-token") await authorizeStudio(slug, { write: true });
    const prefix = studioPrefix(slug);
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(prefix) || pathname.includes("..")) throw new Error("Bad upload path");
        return {
          allowedContentTypes: ["video/mp4", "video/webm", "video/quicktime", "image/png", "image/jpeg", "image/webp"],
          maximumSizeInBytes: 250 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 15 * 60_000,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message || "Upload refused" }, { status: 400 });
  }
}
