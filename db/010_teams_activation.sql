-- Teams as their own lifecycle (membership history, invites, matchmaking) and
-- the activation ceremony (pairing, checkpoints, human-taken selfies).

alter table teams add column if not exists event_id bigint default current_event_id() references hack_events(id);
alter table teams add column if not exists state text not null default 'recruiting';
do $$ begin
  alter table teams add constraint teams_state_chk check (state in ('recruiting','formed','active','roster_locked','submitted','withdrawn'));
exception when duplicate_object then null; end $$;
alter table teams add column if not exists captain_id bigint references members(id) on delete set null;
-- The site has always allowed 5 (lib/teams.ts MAX_MEMBERS); keep it.
alter table teams add column if not exists max_size int not null default 5;
do $$ begin
  alter table teams add constraint teams_max_size_chk check (max_size between 1 and 10);
exception when duplicate_object then null; end $$;
alter table teams add column if not exists table_label text;
alter table teams add column if not exists summary_public text;
alter table teams add column if not exists recruiting_open boolean not null default false;
alter table teams add column if not exists invite_code_hash text;
alter table teams add column if not exists roster_locked_at timestamptz;

-- Existing teams: captain = the person who registered (lowest member id).
update teams t set captain_id = (select min(m.id) from members m where m.team_id = t.id)
 where t.captain_id is null;
-- One-shot (migrate.mjs re-applies every file): teams registered before Hack OS are already formed.
do $$ begin
  if not exists (select 1 from settings where key = 'backfill:010_team_state') then
    update teams set state = 'formed' where state = 'recruiting' and exists (select 1 from members m where m.team_id = teams.id);
    insert into settings (key, value) values ('backfill:010_team_state', now()::text);
  end if;
end $$;

-- ── Membership history ─────────────────────────────────────────────────────
-- members.team_id stays the fast "current team" pointer; this is the history.
create table if not exists team_memberships (
  id          bigint generated always as identity primary key,
  team_id     bigint not null references teams(id) on delete cascade,
  member_id   bigint not null references members(id) on delete cascade,
  role        text not null default 'member' check (role in ('captain','member')),
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  left_reason text,
  approved_by bigint references staff_accounts(id) on delete set null
);
-- A10: at most one current team per member.
create unique index if not exists one_current_team_per_member on team_memberships(member_id) where left_at is null;
create index if not exists team_memberships_team_idx on team_memberships(team_id) where left_at is null;

insert into team_memberships (team_id, member_id, role, joined_at)
select m.team_id, m.id, case when t.captain_id = m.id then 'captain' else 'member' end, m.created_at
  from members m join teams t on t.id = m.team_id
 where not exists (select 1 from team_memberships x where x.member_id = m.id and x.left_at is null);

create table if not exists invitations (
  id                 bigint generated always as identity primary key,
  team_id            bigint not null references teams(id) on delete cascade,
  invite_hash        text not null unique,
  invited_member_id  bigint references members(id) on delete cascade,
  invited_email_hash text,
  created_by         bigint references members(id) on delete set null,
  expires_at         timestamptz not null,
  accepted_at        timestamptz,
  accepted_by        bigint references members(id) on delete set null,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists teammate_profiles (
  member_id      bigint primary key references members(id) on delete cascade,
  discoverable   boolean not null default false,
  skills         text[] not null default '{}',
  interests      text[] not null default '{}',
  preferred_work text,
  availability   text,
  learning_goals text,
  bio            text,
  updated_at     timestamptz not null default now()
);

create table if not exists teammate_introductions (
  id               bigint generated always as identity primary key,
  requester_id     bigint not null references members(id) on delete cascade,
  target_member_id bigint references members(id) on delete cascade,
  target_team_id   bigint references teams(id) on delete cascade,
  message          text,
  status           text not null default 'proposed' check (status in ('proposed','accepted','declined','withdrawn','expired')),
  responded_at     timestamptz,
  created_at       timestamptz not null default now(),
  check (target_member_id is not null or target_team_id is not null)
);
create unique index if not exists teammate_intro_open_idx
  on teammate_introductions(requester_id, coalesce(target_member_id, 0), coalesce(target_team_id, 0)) where status = 'proposed';

-- ── Activation ─────────────────────────────────────────────────────────────
create table if not exists activation_sessions (
  id                  bigint generated always as identity primary key,
  event_id            bigint not null default current_event_id() references hack_events(id),
  member_id           bigint references members(id) on delete cascade,
  guest_id            bigint references roster_guests(id) on delete set null,
  pair_token_hash     text not null unique,
  status              text not null default 'invited' check (status in ('invited','paired','identity_confirmed','ready_for_camera','selfie_pending','selfie_confirmed','selfie_skipped','browser_verified','active','action_required','recoverable_error','expired')),
  expires_at          timestamptz not null,
  browser_session_ref text,
  kane_run_id         text,
  receipt_code        text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists activation_sessions_member_idx on activation_sessions(member_id, created_at desc);

create table if not exists activation_checkpoints (
  id            bigint generated always as identity primary key,
  activation_id bigint not null references activation_sessions(id) on delete cascade,
  checkpoint    text not null,
  status        text not null,
  actor         text not null check (actor in ('participant','kane','staff','system')),
  run_id        text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (activation_id, checkpoint, status)
);

create table if not exists selfies (
  id                  bigint generated always as identity primary key,
  member_id           bigint not null references members(id) on delete cascade,
  object_key          text not null,
  captured_at         timestamptz not null default now(),
  -- Always a human click: the client sends the isTrusted check result.
  captured_by         text not null default 'participant' check (captured_by in ('participant','staff')),
  approved_at         timestamptz,
  deletion_due_at     timestamptz,
  deleted_at          timestamptz,
  face_template_key   text,
  template_consent_id bigint references member_consents(id) on delete set null,
  created_at          timestamptz not null default now()
);
create unique index if not exists selfies_current_idx on selfies(member_id) where deleted_at is null;
