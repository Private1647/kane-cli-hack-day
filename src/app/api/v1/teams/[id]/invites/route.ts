import { AppError, envelopeResponse, siteUrl } from "@/server/core";
import { actingMember, createInvite, getRoster, getTeamInfo, listOpenInvites } from "@/server/teams";
import { readBody } from "../../body";

// GET  /api/v1/teams/{id|slug}/invites  open invites (members of that team only; codes are never returned again)
// POST /api/v1/teams/{id|slug}/invites  { hours?: 1..72, for_code?: "P-1234" } → the one-time code, shown once

async function team(id: string) {
  const t = /^\d+$/.test(id) ? await getTeamInfo({ id: Number(id) }) : await getTeamInfo({ slug: id });
  if (!t) throw new AppError("NOT_FOUND", { userMessage: "Team not found." });
  return t;
}

export async function GET(req: Request, { params }: RouteContext<"/api/v1/teams/[id]/invites">) {
  return envelopeResponse(async () => {
    const who = await actingMember(req);
    const t = await team((await params).id);
    if (!(await getRoster(t.id)).some((r) => r.member_id === who.member.id)) throw new AppError("FORBIDDEN", { userMessage: "You're not on this team." });
    const invites = await listOpenInvites(t.id);
    return {
      message: `${invites.length} open invites · ${t.member_count}/${t.cap} members${t.locked ? " · roster locked" : ""}`,
      data: { team_id: t.id, locked: t.locked, open_seats: Math.max(0, t.cap - t.member_count), invites },
      links: [{ label: "Roster & invites", url: "/team" }],
    };
  });
}

export async function POST(req: Request, { params }: RouteContext<"/api/v1/teams/[id]/invites">) {
  return envelopeResponse(async () => {
    const who = await actingMember(req);
    const t = await team((await params).id);
    const inv = await createInvite(who, t.id, await readBody(req));
    return {
      message: `Invite ${inv.code} created. One use; share it privately.`,
      data: { invite_id: inv.inviteId, code: inv.code, expires_at: inv.expiresAt, join_url: siteUrl(inv.joinPath), receipt: inv.receipt },
      links: [{ label: "Join link", url: inv.joinPath }],
      fallbackText: `Invite code ${inv.code} (expires ${inv.expiresAt}). Join: ${siteUrl(inv.joinPath)}`,
    };
  });
}
