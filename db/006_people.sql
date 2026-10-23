-- People: a member can now exist without a team (personal and team lifecycles
-- are independent), plus the admissions roster (Luma CSV and walk-ins),
-- append-only consents, linked identities and hashed CLI/MCP tokens.

-- ── Roster (admissions) ────────────────────────────────────────────────────
create table if not exists roster_guests (
  id              bigint generated always as identity primary key,
  event_id        bigint not null default current_event_id() references hack_events(id),
  source          text not null check (source in ('luma_csv','walk_in','manual_offline')),
  -- null for walk-ins and paper rows.
  luma_guest_id   text,
  name            text not null,
  -- sha256(lower(trim(email))) hex: match registrations without reading the address.
  email_hash      text,
  -- "an***@ex***.com" for staff confirmation screens; never the full address.
  email_hint      text,
  -- Optional app-level encrypted address (ROSTER_EMAIL_KEY). Never shown publicly.
  email_ciphertext bytea,
  approval_status text not null default 'approved' check (approval_status in ('approved','pending_approval','waitlist','declined','invited','walk_in')),
  admission_status text not null default 'admitted' check (admission_status in ('admitted','not_admitted','needs_reconciliation','revoked')),
  checked_in_at   timestamptz,
  checked_in_by   bigint references staff_accounts(id) on delete set null,
  member_id       bigint references members(id) on delete set null,
  source_version  text,
  source_hash     text,
  staff_reference text,
  imported_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists roster_guests_luma_idx on roster_guests(event_id, luma_guest_id) where luma_guest_id is not null;
create index if not exists roster_guests_email_idx on roster_guests(event_id, email_hash);
create index if not exists roster_guests_name_idx on roster_guests(lower(name));

-- ── Members (participants) ─────────────────────────────────────────────────
alter table members alter column team_id drop not null;
alter table members add column if not exists event_id bigint default current_event_id() references hack_events(id);
alter table members add column if not exists role text not null default 'participant';
do $$ begin
  alter table members add constraint members_role_chk check (role in ('participant','mentor','photographer','judge','organizer','admin'));
exception when duplicate_object then null; end $$;
alter table members add column if not exists display_name text;
create sequence if not exists member_code_seq start 1001;
-- P-#### : the offline staff id printed on badges and paper forms.
alter table members add column if not exists public_code text default ('P-' || nextval('member_code_seq')::text);
create unique index if not exists members_public_code_idx on members(public_code);
alter table members add column if not exists checked_in_at timestamptz;
alter table members add column if not exists activated_at timestamptz;
alter table members add column if not exists guest_id bigint references roster_guests(id) on delete set null;
create unique index if not exists members_guest_idx on members(guest_id) where guest_id is not null;
alter table members add column if not exists deleted_at timestamptz;
alter table members add column if not exists github_handle text;
alter table members add column if not exists skills text[] not null default '{}';
alter table members add column if not exists interests text[] not null default '{}';
-- sha256(lower(trim(email))) kept in step by the app, for roster matching.
alter table members add column if not exists email_hash text;
create index if not exists members_email_hash_idx on members(email_hash);
-- Per-member login (members without a team, CLI pairing): scrypt "salt:hash", optional.
alter table members add column if not exists password_hash text;
-- NEEDS_RECONCILIATION when a registration has no roster match.
alter table members add column if not exists admission_state text not null default 'unknown';
do $$ begin
  alter table members add constraint members_admission_chk check (admission_state in ('unknown','admitted','needs_reconciliation','not_admitted'));
exception when duplicate_object then null; end $$;

-- ── Consents (append-only; latest row per category wins) ───────────────────
create table if not exists member_consents (
  id             bigint generated always as identity primary key,
  member_id      bigint not null references members(id) on delete cascade,
  category       text not null check (category in ('selfie_storage','photo_publication','face_matching','social_mention','teammate_discovery','idea_discovery','activity_publication')),
  granted        boolean not null,
  policy_version text not null default '2026-10',
  source         text not null default 'web' check (source in ('web','mcp','staff','paper','backfill')),
  recorded_at    timestamptz not null default now()
);
create index if not exists member_consents_lookup_idx on member_consents(member_id, category, recorded_at desc, id desc);

drop trigger if exists member_consents_append_only on member_consents;
create trigger member_consents_append_only before update or delete on member_consents
  for each row execute function forbid_mutation();

create or replace view member_consent_current as
  select distinct on (member_id, category) member_id, category, granted, policy_version, recorded_at
    from member_consents
   order by member_id, category, recorded_at desc, id desc;

-- Backfill the 004 per-member answer as photo_publication + social_mention.
insert into member_consents (member_id, category, granted, source, recorded_at)
select m.id, c.category, m.consent_social, 'backfill', coalesce(m.consent_at, now())
  from members m
 cross join (values ('photo_publication'), ('social_mention')) c(category)
 where m.consent_social is not null
   and not exists (select 1 from member_consents x where x.member_id = m.id and x.category = c.category);

-- ── Linked identities (GitHub, X) ──────────────────────────────────────────
create table if not exists member_identities (
  id          bigint generated always as identity primary key,
  member_id   bigint not null references members(id) on delete cascade,
  provider    text not null check (provider in ('github','x','linkedin','luma')),
  subject     text not null,
  handle      text,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (provider, subject)
);

-- ── Tokens for CLI / MCP (only hashes stored) ──────────────────────────────
-- kind 'pairing' = short code shown in the browser, single use, minutes long;
-- kind 'bearer'  = what the CLI/MCP client sends, rotatable and revocable.
create table if not exists member_tokens (
  id           bigint generated always as identity primary key,
  member_id    bigint not null references members(id) on delete cascade,
  kind         text not null check (kind in ('pairing','bearer','badge','phone_handoff')),
  token_hash   text not null unique,
  label        text,
  scopes       text[] not null default '{}',
  expires_at   timestamptz not null,
  used_at      timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists member_tokens_member_idx on member_tokens(member_id, kind);
