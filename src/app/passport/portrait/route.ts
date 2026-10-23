import { query } from "@/lib/db";
import { getPersonalMember, getStaff, hasRole } from "@/server/auth";
import { getPrivate } from "@/server/avatar";
import { getConsents } from "@/server/passport";

// Serves a member's current profile photo from the private store (?m=<member id>).
//   the member themselves, and organizer/admin staff: always
//   a signed-in teammate: while selfie storage is on
//   a signed-in participant: while that member is in the matchmaking pool
//     (they opted in to teammate discovery and are looking for a team)
//   anyone else: only while that member has BOTH selfie storage and photo
//     publication switched on. Revoking either stops it at the next request.

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("m"));
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  const [viewer, staff, consents, target] = await Promise.all([
    getPersonalMember(),
    getStaff(),
    getConsents(id),
    query<{ team_id: number | null; in_pool: boolean }>("select team_id, coalesce(looking_for_team, false) and team_id is null as in_pool from members where id = $1 and deleted_at is null", [id]).then((r) => r[0]),
  ]);
  if (!target) return new Response("Not found", { status: 404 });
  const own = viewer?.id === id;
  const stored = consents.selfie_storage === true;
  const teammate = !!viewer && stored && target.team_id !== null && viewer.team_id === target.team_id;
  const pool = !!viewer && stored && target.in_pool && consents.teammate_discovery === true;
  const isPublic = stored && consents.photo_publication === true;
  if (!own && !hasRole(staff, "organizer") && !teammate && !pool && !isPublic) return new Response("Not found", { status: 404 });

  const [row] = await query<{ object_key: string }>("select object_key from selfies where member_id = $1 and deleted_at is null", [id]);
  if (!row) return new Response("Not found", { status: 404 });
  const file = await getPrivate(row.object_key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body as BodyInit, {
    headers: {
      "content-type": file.contentType,
      // Private and short: a revoked consent should take effect quickly.
      "cache-control": "private, max-age=60",
    },
  });
}
