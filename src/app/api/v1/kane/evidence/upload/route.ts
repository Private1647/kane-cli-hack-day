import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { AppError, toAppError } from "@/server/core";
import { SIGNED_PREFIX, projectFor, resolveCaller } from "@/server/kane";
import { MAX_SIGNED_BYTES } from "@/server/kane-evidence";

// Signed client uploads for evidence over 4 MB (the Proof tab uses this via
// @vercel/blob/client `upload()`). The token only allows a private upload
// under evidence-incoming/{projectId}/ for the caller's own project; nothing
// counts until POST /api/v1/kane/evidence has checked and moved the file.

export async function POST(request: Request) {
  try {
    const caller = await resolveCaller(request);
    const project = await projectFor(caller);
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`${SIGNED_PREFIX}${project.id}/`) || pathname.includes("..")) throw new AppError("FORBIDDEN", { userMessage: "Uploads must go to your own project folder." });
        return {
          maximumSizeInBytes: MAX_SIGNED_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    const e = toAppError(err);
    return Response.json({ error: e.toJSON() }, { status: e.status });
  }
}
