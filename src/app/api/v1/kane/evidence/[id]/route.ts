import { toAppError } from "@/server/core";
import { idParam } from "@/server/kane-http";
import { readEvidence, resolveCaller, type KaneCaller } from "@/server/kane";

// GET /api/v1/kane/evidence/{id}: the file itself, streamed from private
// Blob. The team, judges/mentors (for judges-visible files) and organizers
// only; quarantined files are organizer-only. Unknown or forbidden → 404, so
// the endpoint never confirms that a file exists.

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "application/pdf"]);

export async function GET(req: Request, ctx: RouteContext<"/api/v1/kane/evidence/[id]">) {
  try {
    const caller: KaneCaller | null = await resolveCaller(req).catch(() => null);
    const { artifact, stream } = await readEvidence(caller, idParam((await ctx.params).id));
    const type = artifact.redaction_state === "quarantined" ? "application/octet-stream" : (artifact.content_type ?? "application/octet-stream");
    const name = (artifact.original_name ?? `evidence-${artifact.id}`).replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(stream, {
      headers: {
        // HTML / markdown / JSON evidence is never rendered on our origin.
        "content-type": INLINE.has(type) ? type : "text/plain; charset=utf-8",
        "content-disposition": `${INLINE.has(type) ? "inline" : "attachment"}; filename="${name}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": "private, no-store",
        "x-evidence-sha256": artifact.sha256,
      },
    });
  } catch (err) {
    const e = toAppError(err);
    return Response.json({ error: e.toJSON() }, { status: e.status });
  }
}
