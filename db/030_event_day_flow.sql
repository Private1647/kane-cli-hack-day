-- Event-day participant flow (branch event-day-flow): profile → team → activate → Codex → hub.
-- Additive and idempotent: scripts/migrate.mjs re-applies every file on each run.

-- ── Profile builder (/register) ─────────────────────────────────────────────
-- looking_for_team: the answer to "Are you looking to form a team?" (null = not asked yet).
-- true + no current team = in the matchmaking pool. Joining any team clears it (trigger below).
alter table members add column if not exists looking_for_team boolean;
-- When the person finished (or skipped) the photo step of /register.
alter table members add column if not exists photo_step_at timestamptz;
create index if not exists members_pool_idx on members(looking_for_team) where looking_for_team and deleted_at is null;

-- Landing on a team by any route (create, invite, organizer, matchmaking) leaves the pool.
create or replace function members_leave_pool() returns trigger language plpgsql as $$
begin
  if new.left_at is null then
    update members set looking_for_team = false where id = new.member_id and looking_for_team;
  end if;
  return new;
end $$;
drop trigger if exists team_memberships_leave_pool on team_memberships;
create trigger team_memberships_leave_pool after insert on team_memberships
  for each row execute function members_leave_pool();

-- ── Activation checklist (/activate) ────────────────────────────────────────
-- One row per finished step per member. Steps: testmu_signup, testmu_plan, codex_credits.
create table if not exists activation_ticks (
  member_id  bigint not null references members(id) on delete cascade,
  step       text not null check (step in ('testmu_signup','testmu_plan','codex_credits')),
  done_at    timestamptz not null default now(),
  primary key (member_id, step)
);

-- The TestMu AI plan claim (server-side POST). One row per member; claimed_at set once.
create table if not exists testmu_plan_claims (
  member_id        bigint primary key references members(id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending','claimed','not_registered','error')),
  http_status      int,
  response         jsonb,
  last_error       text,
  attempts         int not null default 0,
  claimed_at       timestamptz,
  last_attempt_at  timestamptz,
  updated_at       timestamptz not null default now()
);

-- ── OpenAI Codex credit codes ───────────────────────────────────────────────
-- Organizer-uploaded pool of unique codes. A code is a secret: only the member it is
-- assigned to (and organizers, via an audited reveal) ever see it in full.
-- Revoked codes are never reassigned.
create table if not exists codex_credit_codes (
  id                  bigint generated always as identity primary key,
  event_id            bigint not null default current_event_id() references hack_events(id),
  code                text not null unique,
  batch               text,
  extra               jsonb not null default '{}'::jsonb,
  status              text not null default 'available' check (status in ('available','assigned','revoked')),
  assigned_member_id  bigint references members(id) on delete set null,
  assigned_at         timestamptz,
  -- 'system' (self-serve on /activate) or 'staff:<id>' (organizer reassignment).
  assigned_by         text,
  revealed_at         timestamptz,
  revoked_reason      text,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now()
);
create unique index if not exists codex_credit_codes_one_per_member on codex_credit_codes(assigned_member_id) where status = 'assigned';
create index if not exists codex_credit_codes_available_idx on codex_credit_codes(event_id, id) where status = 'available';
