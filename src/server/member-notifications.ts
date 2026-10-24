import "server-only";
import { query } from "@/lib/db";

// Per-person notifications for the bell next to the avatar (NotificationBell).
// Written inside the same transaction as the thing they announce.

type Tx = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
export type NotificationInput = { kind: string; title: string; body?: string; href?: string | null };
export type MemberNotification = { id: number; kind: string; title: string; body: string; href: string | null; created_at: Date; unread: boolean };

export async function notifyMembers(tx: Tx, memberIds: number[], n: NotificationInput) {
  const ids = [...new Set(memberIds)].filter(Boolean);
  if (!ids.length) return;
  await tx.query(
    `insert into member_notifications (member_id, kind, title, body, href)
     select unnest($1::bigint[]), $2, $3, $4, $5`,
    [ids, n.kind, n.title.slice(0, 200), (n.body ?? "").slice(0, 400), n.href ?? null],
  );
}

/** Everyone currently on the team, except `except` (usually whoever caused it). */
export async function notifyTeam(tx: Tx, teamId: number, n: NotificationInput, except?: number) {
  await tx.query(
    `insert into member_notifications (member_id, kind, title, body, href)
     select tm.member_id, $2, $3, $4, $5 from team_memberships tm
      where tm.team_id = $1 and tm.left_at is null and tm.member_id <> coalesce($6::bigint, 0)`,
    [teamId, n.kind, n.title.slice(0, 200), (n.body ?? "").slice(0, 400), n.href ?? null, except ?? null],
  );
}

export async function listMyNotifications(memberId: number) {
  const [items, [{ unread }]] = await Promise.all([
    query<MemberNotification>(
      `select id, kind, title, body, href, created_at, read_at is null as unread from member_notifications
        where member_id = $1 order by created_at desc, id desc limit 30`,
      [memberId],
    ),
    query<{ unread: number }>("select count(*)::int as unread from member_notifications where member_id = $1 and read_at is null", [memberId]),
  ]);
  return { items, unread };
}

export async function markMyNotificationsRead(memberId: number) {
  await query("update member_notifications set read_at = now() where member_id = $1 and read_at is null", [memberId]);
}
