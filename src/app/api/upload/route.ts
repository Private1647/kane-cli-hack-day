import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { REG_PREFIX } from "@/lib/photos";

// Issues short-lived tokens so the browser uploads registration photos straight
// to Blob (no 4.5 MB function body limit). Registration is anonymous, so this
// only allows images, capped in size, into the reg/ folder; a photo is attached
// to a team only when registration or the hub saves its pathname.

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(REG_PREFIX) || pathname.includes("..")) throw new Error("Bad upload path");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
