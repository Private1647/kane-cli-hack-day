import { get } from "@vercel/blob";
import { getStaff, hasRole, staffActor } from "@/server/auth";
import { writeAudit } from "@/server/core";
import { getJudgeEvidence } from "@/server/judging";

// Streams one evidence artifact from the private Blob store to a judge.
// Only artifacts shared with judges (or public), never quarantined ones.
// Every open is audited.

export async function GET(_request: Request, ctx: RouteContext<"/judge/evidence/[id]">) {
  const staff = await getStaff();
  if (!hasRole(staff, "judge", "organizer")) return new Response("Not found", { status: 404 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  const row = await getJudgeEvidence(id);
  if (!row) return new Response("Not found", { status: 404 });
  const file = await get(row.object_key, { access: "private" }).catch(() => null);
  if (!file) return new Response("Evidence file is missing from storage.", { status: 404 });

  await writeAudit(staffActor(staff!), { action: "judge.evidence_open", resourceType: "evidence_artifact", resourceId: id }).catch(() => {});
  const type = row.content_type ?? file.blob.contentType ?? "application/octet-stream";
  // Only images, PDFs and plain text render inline; everything else downloads.
  const inline = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/.test(type);
  return new Response(file.stream, {
    headers: {
      "content-type": inline ? type : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="evidence-${id}-${row.kind}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
