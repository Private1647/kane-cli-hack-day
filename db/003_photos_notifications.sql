-- Registration photos, social handles and consent; event photos matched to
-- teams by the local photo pipeline; and the notification feed in the hub.

-- Photo columns hold private Blob pathnames (served through /photos/...), not URLs.
alter table teams add column if not exists photo_url text;
alter table teams add column if not exists consent_social boolean not null default false;
alter table teams add column if not exists consent_at timestamptz;

alter table members add column if not exists photo_url text;
alter table members add column if not exists linkedin text;
alter table members add column if not exists x_handle text;
-- Everything in the feed newer than this is unread for this member.
alter table members add column if not exists notifications_seen_at timestamptz;

-- One row per (event photo, team): a group shot with two teams in frame lands in both galleries.
create table if not exists event_photos (
  id          bigint generated always as identity primary key,
  team_id     bigint not null references teams(id) on delete cascade,
  -- Stable id from the pipeline (content hash), so re-sending a photo is a no-op.
  photo_key   text not null,
  pathname    text not null,
  width       int,
  height      int,
  caption     text,
  created_at  timestamptz not null default now(),
  unique (team_id, photo_key)
);
create index if not exists event_photos_team_idx on event_photos(team_id, created_at desc);

-- team_id null means every team. send_at in the future is a scheduled nudge;
-- the hub only shows rows whose send_at has passed.
create table if not exists notifications (
  id          bigint generated always as identity primary key,
  team_id     bigint references teams(id) on delete cascade,
  kind        text not null default 'nudge',
  title       text not null,
  body        text not null default '',
  href        text,
  image_path  text,
  send_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists notifications_feed_idx on notifications(send_at desc);
create index if not exists notifications_team_idx on notifications(team_id, send_at desc);
