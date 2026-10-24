-- Per-person notifications (the bell next to your avatar): someone asked to
-- join your team, wants to team up, invited you, or answered you.
create table if not exists member_notifications (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references members(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  href       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists member_notifications_feed_idx on member_notifications(member_id, created_at desc);
create index if not exists member_notifications_unread_idx on member_notifications(member_id) where read_at is null;
