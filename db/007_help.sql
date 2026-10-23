-- Help desk (Tier-0): tickets from the hub, MCP or paper; mentors claim them
-- atomically with UPDATE … WHERE status IN ('new','triaged') RETURNING.

create sequence if not exists help_ticket_code_seq start 1;

create table if not exists help_tickets (
  id                 bigint generated always as identity primary key,
  event_id           bigint not null default current_event_id() references hack_events(id),
  -- H-#### ; paper tickets keep their pre-printed number instead.
  code               text not null unique default ('H-' || lpad(nextval('help_ticket_code_seq')::text, 4, '0')),
  member_id          bigint references members(id) on delete set null,
  team_id            bigint references teams(id) on delete set null,
  table_label        text,
  category           text not null check (category in ('kane_cli','test_manager','auth','ci_cloud','mobile','idea','github','other')),
  summary            text not null,
  details            text,
  tried              text,
  priority           text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status             text not null default 'new' check (status in ('new','triaged','claimed','in_progress','resolved','closed','escalated','duplicate')),
  assigned_mentor_id bigint references staff_accounts(id) on delete set null,
  -- A run id the participant chose to share; free text, never logs.
  safe_run_id        text,
  source             text not null default 'web' check (source in ('web','mcp','paper')),
  duplicate_of       bigint references help_tickets(id) on delete set null,
  -- Paper tickets: the time written on the slip, and who typed it in.
  paper_original_at  timestamptz,
  entered_by         bigint references staff_accounts(id) on delete set null,
  idempotency_key    text,
  created_at         timestamptz not null default now(),
  claimed_at         timestamptz,
  resolved_at        timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists help_tickets_status_idx on help_tickets(status, created_at);
create index if not exists help_tickets_member_idx on help_tickets(member_id, created_at desc);
create index if not exists help_tickets_team_idx on help_tickets(team_id, created_at desc);
create unique index if not exists help_tickets_idem_idx on help_tickets(member_id, idempotency_key) where idempotency_key is not null;

create table if not exists help_messages (
  id               bigint generated always as identity primary key,
  ticket_id        bigint not null references help_tickets(id) on delete cascade,
  author_type      text not null check (author_type in ('member','staff','system')),
  author_member_id bigint references members(id) on delete set null,
  author_staff_id  bigint references staff_accounts(id) on delete set null,
  body             text not null,
  visibility       text not null default 'ticket' check (visibility in ('ticket','staff_only')),
  created_at       timestamptz not null default now()
);
create index if not exists help_messages_ticket_idx on help_messages(ticket_id, created_at);
