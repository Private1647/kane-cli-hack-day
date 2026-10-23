-- Teams, their members, what they've shipped, and who did what.

create table if not exists teams (
  id            bigint generated always as identity primary key,
  slug          text not null unique,
  name          text not null,
  track         text not null,
  idea          text not null,
  is_solo       boolean not null default false,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists members (
  id         bigint generated always as identity primary key,
  team_id    bigint not null references teams(id) on delete cascade,
  name       text not null,
  email      text not null,
  created_at timestamptz not null default now()
);
create index if not exists members_team_id_idx on members(team_id);
-- One registration per email across the whole event.
create unique index if not exists members_email_idx on members(lower(email));

-- One row per checklist item a team has touched.
create table if not exists progress (
  team_id    bigint not null references teams(id) on delete cascade,
  item       text not null,
  value      text not null default '',
  done       boolean not null default false,
  updated_by bigint references members(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, item)
);

create table if not exists activity (
  id         bigint generated always as identity primary key,
  team_id    bigint not null references teams(id) on delete cascade,
  member_id  bigint references members(id) on delete set null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_team_id_idx on activity(team_id, created_at desc);

-- Admin switches, e.g. whether registration is open.
create table if not exists settings (
  key   text primary key,
  value text not null
);
insert into settings (key, value) values ('registration_open', 'true') on conflict do nothing;
