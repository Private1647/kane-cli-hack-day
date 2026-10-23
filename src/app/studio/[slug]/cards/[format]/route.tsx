import { ImageResponse } from "next/og";
import { CARD_FORMATS, isCardFormat, socialCard } from "@/components/deck/socialCard";
import { toAppError } from "@/server/core";
import { testmuDataUri } from "@/server/deck";
import { authorizeStudio, getLatestPublished, getPublishedStory, previewStory } from "@/server/story";

// Social cards for the GTM kit (T-GTM-02): og | square | portrait | story.
// Team-only. Renders the published story when there is one; otherwise the
// draft, stamped "Draft preview · not published" so it can't pass as final.
// ?download=1 serves it as an attachment.

export async function GET(request: Request, ctx: RouteContext<"/studio/[slug]/cards/[format]">) {
  const { slug, format } = await ctx.params;
  if (!isCardFormat(format)) return new Response("Unknown format", { status: 404 });
  try {
    const access = await authorizeStudio(slug);
    const published = await getLatestPublished(access.project.id, "ship_page");
    const story = (published && (await getPublishedStory(access.project.id))?.story) || (await previewStory(access)).story;
    const { width, height } = CARD_FORMATS[format];
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new ImageResponse(socialCard({ story, format, testmuDataUri: await testmuDataUri(), draft: story.preview }), {
      width,
      height,
      headers: {
        "cache-control": "private, no-store",
        ...(download ? { "content-disposition": `attachment; filename="${slug}-${format}-${width}x${height}.png"` } : {}),
      },
    });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.userMessage, { status: err.status });
  }
}
