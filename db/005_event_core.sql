-- Hack OS core: the event row every other table hangs off, an append-only
-- audit log, idempotency keys, integration health, incidents, the outbox and
-- staff accounts. The server clock (now()) is the authority for every time here.

create table if not exists hack_events (
  id                  bigint generated always as identity primary key,
  slug                text not null unique,
  name                text not null,
  timezone            text not null default 'America/Los_Angeles',
  starts_at           timestamptz not null,
  team_lock_at        timestamptz not null,
  idea_lock_at        timestamptz not null,
  submission_locks_at timestamptz not null,
  demos_start_at      timestamptz not null,
  ends_at             timestamptz,
  -- null = derive the phase from the times above; set from /ops/settings to force one.
  phase_override      text check (phase_override in ('arrival','build','verify','submit','showtime','recap')),
  public_status       text not null default 'open' check (public_status in ('draft','open','in_progress','closed')),
  -- true only on staging: every number it produces must carry a DEMO chip.
  is_demo             boolean not null default false,
  settings            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

insert into hack_events (slug, name, timezone, starts_at, team_lock_at, idea_lock_at, submission_locks_at, demos_start_at, ends_at, is_demo)
values (
  'kane-cli-hack-day-2026', 'Kane CLI Hack Day', 'America/Los_Angeles',
  timestamptz '2026-10-24 09:30 America/Los_Angeles',
  timestamptz '2026-10-24 11:00 America/Los_Angeles',
  timestamptz '2026-10-24 12:00 America/Los_Angeles',
  timestamptz '2026-10-24 18:00 America/Los_Angeles',
  timestamptz '2026-10-24 18:00 America/Los_Angeles',
  timestamptz '2026-10-24 20:30 America/Los_Angeles',
  false
) on conflict (slug) do nothing;

-- New tables default event_id to the single current event, so service code
-- never has to pass it until a second edition exists.
create or replace function current_event_id() returns bigint
  language sql stable as $$ select id from hack_events order by id limit 1 $$;

-- ── Staff ──────────────────────────────────────────────────────────────────
-- Mentors, photographers, judges, organizers and admins. Participants live in
-- members; a staff account may also point at a member row.
create table if not exists staff_accounts (
  id            bigint generated always as identity primary key,
  event_id      bigint not null default current_event_id() references hack_events(id),
  email         text not null,
  name          text not null,
  role          text not null check (role in ('mentor','photographer','judge','organizer','admin')),
  member_id     bigint references members(id) on delete set null,
  active        boolean not null default true,
  created_by    bigint references staff_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists staff_accounts_email_idx on staff_accounts(lower(email));

-- One-time login codes (sha256 of the code; the code itself is shown once).
create table if not exists staff_login_codes (
  id         bigint generated always as identity primary key,
  staff_id   bigint not null references staff_accounts(id) on delete cascade,
  code_hash  text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ── Audit (append-only) ────────────────────────────────────────────────────
create table if not exists audit_events (
  id            bigint generated always as identity primary key,
  event_id      bigint default current_event_id() references hack_events(id),
  actor_type    text not null check (actor_type in ('member','staff','token','system','pipeline','anonymous')),
  actor_id      bigint,
  actor_label   text,
  action        text not null,
  resource_type text not null,
  resource_id   text not null,
  before_hash   text,
  after_hash    text,
  reason        text,
  request_id    text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists audit_events_resource_idx on audit_events(resource_type, resource_id, created_at desc);
create index if not exists audit_events_actor_idx on audit_events(actor_type, actor_id, created_at desc);
create index if not exists audit_events_created_idx on audit_events(created_at desc);

create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function forbid_mutation();

-- ── Idempotency ────────────────────────────────────────────────────────────
-- (scope, key) → the first response. A retry with the same key gets it back.
create table if not exists idempotency_keys (
  scope        text not null,
  key          text not null,
  request_hash text,
  status       text not null default 'pending' check (status in ('pending','done')),
  response     jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '3 days',
  primary key (scope, key)
);

-- ── Integration health (drives the TV / ops banners) ───────────────────────
create table if not exists integration_state (
  id              bigint generated always as identity primary key,
  event_id        bigint not null default current_event_id() references hack_events(id),
  system          text not null,
  status          text not null default 'unknown' check (status in ('ok','degraded','down','paused','unknown')),
  paused          boolean not null default false,
  detail          text,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error_code text,
  updated_at      timestamptz not null default now(),
  unique (event_id, system)
);
insert into integration_state (system)
select s from unnest(array['database','blob','slack','github','luma','kane_ingest','renderer','x','cron','ai_gateway','live_stream']) s
on conflict (event_id, system) do nothing;

-- ── Incidents / recovery ───────────────────────────────────────────────────
create sequence if not exists recovery_case_code_seq start 1;
create table if not exists recovery_cases (
  id             bigint generated always as identity primary key,
  event_id       bigint not null default current_event_id() references hack_events(id),
  code           text not null unique default ('INC-' || lpad(nextval('recovery_case_code_seq')::text, 3, '0')),
  subsystem      text not null,
  severity       text not null check (severity in ('sev1','sev2','sev3')),
  description    text not null,
  recovery_basis text,
  opened_by      bigint references staff_accounts(id) on delete set null,
  closed_by      bigint references staff_accounts(id) on delete set null,
  closed_at      timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Transactional outbox ───────────────────────────────────────────────────
create table if not exists outbox_events (
  id           bigint generated always as identity primary key,
  event_id     bigint default current_event_id() references hack_events(id),
  kind         text not null,
  payload      jsonb not null default '{}'::jsonb,
  dedupe_key   text unique,
  available_at timestamptz not null default now(),
  published_at timestamptz,
  retries      int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index if not exists outbox_pending_idx on outbox_events(available_at) where published_at is null;

-- ── Announcements reuse notifications ──────────────────────────────────────
-- kind = 'announcement'; visibility says where it shows.
alter table notifications add column if not exists visibility text not null default 'hub';
alter table notifications add column if not exists published_by bigint references staff_accounts(id) on delete set null;
do $$ begin
  alter table notifications add constraint notifications_visibility_chk check (visibility in ('hub','tv','both','staff'));
exception when duplicate_object then null; end $$;

-- Feature flags live in settings as key 'flag:<name>' = 'true'|'false'.
