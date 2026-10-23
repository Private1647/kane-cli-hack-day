import { get } from "@vercel/blob";
import { getStaff, hasRole, staffActor } from "@/server/auth";
import { writeAudit } from "@/server/core";
import { getPhoto } from "@/server/photos";

// Download an approved/published photo for manual posting (copy/download
// path when X is unavailable). Staff only; audited. Held photos can't be
// downloaded for posting.

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/media/[id]/download">) {
  const staff = await getStaff();
  if (!hasRole(staff, "photographer", "organizer")) return new Response("Not found", { status: 404 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const { photo } = await getPhoto(id).catch(() => ({ photo: null }));
  if (!photo) return new Response("Not found", { status: 404 });
  if (photo.status !== "approved" && photo.status !== "published") return new Response("Only approved photos can be downloaded for posting.", { status: 409 });
  const file = await get(photo.pathname, { access: "private" }).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  await writeAudit(staffActor(staff!), { action: "photo.download", resourceType: "event_photo", resourceId: id }).catch(() => {});
  const ext = photo.pathname.split(".").pop() ?? "jpg";
  return new Response(file.stream, {
    headers: {
      "content-type": file.blob.contentType ?? "image/jpeg",
      "content-disposition": `attachment; filename="kane-hack-${photo.team_slug ?? "photo"}-${id}.${ext}"`,
      "cache-control": "private, no-store",
    },
  });
}
