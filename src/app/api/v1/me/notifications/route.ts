import { getPersonalMember } from "@/server/auth";
import { listMyNotifications, markMyNotificationsRead } from "@/server/member-notifications";

// The bell next to your avatar. Browser-only (your own session cookie).
// GET: latest 30 and the unread count. POST: mark them all read.

export async function GET() {
  const member = await getPersonalMember();
  if (!member) return Response.json({ items: [], unread: 0 }, { status: 401, headers: { "cache-control": "no-store" } });
  return Response.json(await listMyNotifications(member.id), { headers: { "cache-control": "no-store" } });
}

export async function POST() {
  const member = await getPersonalMember();
  if (!member) return Response.json({ ok: false }, { status: 401 });
  await markMyNotificationsRead(member.id);
  return Response.json({ ok: true });
}
