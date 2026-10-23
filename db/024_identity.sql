-- Identity (E4 / T-AUTH): CLI/MCP device pairing, personal one-time login
-- codes and Kane readiness reports. Everything else identity uses lives in
-- the foundation (members, member_tokens, member_consents, member_identities,
-- activation_sessions, activation_checkpoints, selfies). Idempotent: re-run safe.

-- ── Device pairing (kanehack login / MCP) ──────────────────────────────────
-- The CLI asks for a pairing (no account yet), shows the short user code, and
-- polls with the long device code. A signed-in person approves the user code
-- in the browser; the first poll after that exchanges the device code for a
-- bearer token exactly once. Only hashes are stored. Expired, denied or
-- already-exchanged rows fail closed.
create table if not exists pairing_requests (
  id                bigint generated always as identity primary key,
  event_id          bigint not null default current_event_id() references hack_events(id),
  user_code_hash    text not null unique,
  device_code_hash  text not null unique,
  label             text,
  status            text not null default 'pending' check (status in ('pending','approved','exchanged','denied','expired')),
  member_id         bigint references members(id) on delete cascade,
  bearer_token_id   bigint references member_tokens(id) on delete set null,
  expires_at        timestamptz not null,
  approved_at       timestamptz,
  exchanged_at      timestamptz,
  last_polled_at    timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists pairing_requests_member_idx on pairing_requests(member_id, created_at desc);

-- ── Personal one-time login codes ──────────────────────────────────────────
-- For members who registered through a team form and want to sign in on their
-- own (or lost the team password). Issued by staff at the desk or by the
-- member from a device that is already signed in. Single use.
create table if not exists member_login_codes (
  id               bigint generated always as identity primary key,
  member_id        bigint not null references members(id) on delete cascade,
  code_hash        text not null,
  issued_by_staff  bigint references staff_accounts(id) on delete set null,
  issued_by_member bigint references members(id) on delete set null,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists member_login_codes_lookup_idx on member_login_codes(code_hash) where used_at is null;

-- ── Readiness (hack-doctor) ────────────────────────────────────────────────
-- One row per report. checks = [{id, status pass|warn|fail|skip, detail, version}].
-- 'cli' rows come from a paired machine (bearer); 'web' rows are self-reported
-- in the browser; 'staff' rows are a mentor's manual check. A report is never
-- treated as proof of a working setup on its own (hack-doctor rule).
create table if not exists readiness_reports (
  id              bigint generated always as identity primary key,
  event_id        bigint not null default current_event_id() references hack_events(id),
  member_id       bigint not null references members(id) on delete cascade,
  token_id        bigint references member_tokens(id) on delete set null,
  source          text not null check (source in ('cli','web','staff')),
  client          jsonb not null default '{}'::jsonb,
  checks          jsonb not null default '[]'::jsonb,
  passed          int not null default 0,
  failed          int not null default 0,
  warned          int not null default 0,
  idempotency_key text,
  created_at      timestamptz not null default now()
);
create index if not exists readiness_reports_member_idx on readiness_reports(member_id, created_at desc);
create unique index if not exists readiness_reports_idem_idx on readiness_reports(member_id, idempotency_key) where idempotency_key is not null;
