-- "Do this first" ticks, per member, so they follow you across devices.
create table if not exists setup_ticks (
  member_id  bigint not null references members(id) on delete cascade,
  step       text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, step)
);
