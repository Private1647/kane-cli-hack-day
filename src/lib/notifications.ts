import "server-only";
import { event, schedule } from "@/data/hackday";
import { query } from "./db";

// The hub's notification feed. Rows with team_id null go to every team; rows
// with send_at in the future are scheduled nudges and stay hidden until then.

export type Notice = {
  id: number | string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  image_path: string | null;
  send_at: Date;
  unread: boolean;
};

export async function getFeed(teamId: number, memberId: number | null, limit = 30) {
  const [seen] = memberId
    ? await query<{ notifications_seen_at: Date | null }>("select notifications_seen_at from members where id = $1", [memberId])
    : [];
  const since = seen?.notifications_seen_at ?? null;
  const rows = await query<Omit<Notice, "unread">>(
    `select id, kind, title, body, href, image_path, send_at
       from notifications
      where (team_id = $1 or team_id is null) and send_at <= now()
      order by send_at desc limit $2`,
    [teamId, limit],
  );
  return rows.map((r) => ({ ...r, unread: memberId !== null && (!since || r.send_at > since) }));
}

export async function markSeen(memberId: number) {
  await query("update members set notifications_seen_at = now() where id = $1", [memberId]);
}

export async function notify(input: { teamId: number | null; kind?: string; title: string; body?: string; href?: string | null; imagePath?: string | null; sendAt?: Date }) {
  await query(
    `insert into notifications (team_id, kind, title, body, href, image_path, send_at)
     values ($1, $2, $3, $4, $5, $6, coalesce($7, now()))`,
    [input.teamId, input.kind ?? "nudge", input.title, input.body ?? "", input.href ?? null, input.imagePath ?? null, input.sendAt ?? null],
  );
}

// ── Admin ───────────────────────────────────────────────────────────────────

export type ScheduledNotice = { id: number; team_name: string | null; kind: string; title: string; body: string; send_at: Date };

export async function listNotifications(limit = 100) {
  return query<ScheduledNotice>(
    `select n.id, t.name as team_name, n.kind, n.title, n.body, n.send_at
       from notifications n left join teams t on t.id = n.team_id
      where n.kind <> 'photo'
      order by n.send_at desc limit $1`,
    [limit],
  );
}

export async function deleteNotification(id: number) {
  await query("delete from notifications where id = $1", [id]);
}

/** "HH:MM" on the event day, in the event's time zone, as an absolute instant. */
export function eventTime(hhmm: string) {
  const [y, mo, d] = event.date.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m); // the wall-clock time, read as if it were UTC
  // How far the event's zone is from UTC at that moment (DST-aware), then shift by it.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: event.timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(wall)
      .map((x) => [x.type, Number(x.value)]),
  );
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall;
  return new Date(wall - offset);
}

/** A reminder 15 minutes before every hard deadline in the schedule. Skips ones already scheduled. */
export async function seedScheduleNudges() {
  let added = 0;
  for (const slot of schedule.filter((s) => s.deadline)) {
    const at = new Date(eventTime(slot.start).getTime() - 15 * 60_000);
    const title = `15 minutes: ${slot.title}`;
    const exists = await query("select 1 from notifications where team_id is null and title = $1 and send_at = $2", [title, at]);
    if (exists.length) continue;
    await notify({ teamId: null, kind: "nudge", title, body: `Due at ${slot.start}. Don't leave it to the last minute.`, href: slot.href ?? null, sendAt: at });
    added++;
  }
  return added;
}

/**
 * The hub bell's feed: stored notifications plus nudges worked out from the
 * team's state (no team photo yet, no selfie). Those stay pinned until done.
 */
export async function getHubFeed(team: { id: number; slug: string }, memberId: number | null) {
  const [feed, [state]] = await Promise.all([
    getFeed(team.id, memberId),
    query<{ team_photo: string | null; consent: boolean | null; selfie: string | null }>(
      `select t.photo_url as team_photo, m.consent_social as consent, m.photo_url as selfie
         from teams t left join members m on m.id = $2 and m.team_id = t.id
        where t.id = $1`,
      [team.id, memberId],
    ),
  ]);
  const pinned: Notice[] = [];
  const href = `/t/${team.slug}/photos`;
  const pin = (id: string, title: string, body: string) =>
    pinned.push({ id, kind: "pinned", title, body, href, image_path: null, send_at: new Date(), unread: false });
  if (state && memberId && state.consent === null)
    pin("pin-consent", "Photos from the day: yes or no?", "Tell us if we can match your face to find your photos and tag you in posts. It's your call, not your team's.");
  if (state && !state.team_photo)
    pin("pin-team-photo", "Add your team photo", "Photographers shoot all day. A clear team photo is how we find your shots and send them here.");
  if (state && memberId && !state.selfie && state.consent)
    pin("pin-selfie", "Add your selfie", "So posts from the day can name and tag you.");
  return { pinned, feed, unread: feed.filter((n) => n.unread).length };
}
