import { get } from "@vercel/blob";
import { query } from "@/lib/db";
import { getPersonalMember, getStaff, hasRole } from "@/server/auth";
import { getConsents } from "@/server/passport";

// Serves a member's current selfie from the private store (?m=<member id>).
//   the member themselves, and organizer/admin staff: always
//   anyone else: only while that member has BOTH selfie storage and photo
//   publication switched on. Revoking either stops it at the next request.

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("m"));
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  const [member, staff, consents] = await Promise.all([getPersonalMember(), getStaff(), getConsents(id)]);
  const own = member?.id === id;
  const isPublic = consents.selfie_storage === true && consents.photo_publication === true;
  if (!own && !hasRole(staff, "organizer") && !isPublic) return new Response("Not found", { status: 404 });

  const [row] = await query<{ object_key: string }>("select object_key from selfies where member_id = $1 and deleted_at is null", [id]);
  if (!row) return new Response("Not found", { status: 404 });
  const file = await get(row.object_key, { access: "private" }).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "content-type": file.blob.contentType ?? "image/jpeg",
      // Private and short: a revoked consent should take effect quickly.
      "cache-control": "private, max-age=60",
    },
  });
}
