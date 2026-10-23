-- Photo review state machine, people-in-photo with per-person consent,
-- social drafts/posts, provenance on the activity feed, and the live
-- metric projection read by /live and the home stats strip.

-- ── Photos ─────────────────────────────────────────────────────────────────
-- Rows imported before this migration were already published to galleries.
alter table event_photos add column if not exists status text not null default 'published';
do $$ begin
  alter table event_photos add constraint event_photos_status_chk
    check (status in ('captured','identity_review','consent_checked','caption_drafted','approved','published','rejected'));
exception when duplicate_object then null; end $$;
alter table event_photos add column if not exists photographer_id bigint references staff_accounts(id) on delete set null;
alter table event_photos add column if not exists source text not null default 'pipeline';
alter table event_photos add column if not exists alt_text text;
alter table event_photos add column if not exists captured_at timestamptz;
alter table event_photos add column if not exists consent_checked_at timestamptz;
alter table event_photos add column if not exists approved_by bigint references staff_accounts(id) on delete set null;
alter table event_photos add column if not exists approved_at timestamptz;
alter table event_photos add column if not exists rejected_reason text;
-- New rows start in review; galleries should show status = 'published' only.
alter table event_photos alter column status set default 'captured';
create index if not exists event_photos_status_idx on event_photos(status, created_at desc);

create table if not exists photo_people (
  id                bigint generated always as identity primary key,
  photo_id          bigint not null references event_photos(id) on delete cascade,
  member_id         bigint not null references members(id) on delete cascade,
  match_basis       text not null check (match_basis in ('qr_badge','manual_confirmation','opted_in_candidate')),
  reviewer_staff_id bigint references staff_accounts(id) on delete set null,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (photo_id, member_id)
);

create table if not exists social_drafts (
  id            bigint generated always as identity primary key,
  photo_id      bigint references event_photos(id) on delete cascade,
  project_id    bigint references projects(id) on delete cascade,
  team_id       bigint references teams(id) on delete cascade,
  style         text not null default 'proof' check (style in ('proof','story','hype','plain')),
  proposed_text text not null,
  alt_text      text,
  claim_ids     jsonb not null default '[]'::jsonb,
  generated_by  text not null default 'template' check (generated_by in ('llm','template','human')),
  checks        jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft','approved','rejected','published')),
  created_by    bigint references staff_accounts(id) on delete set null,
  approved_by   bigint references staff_accounts(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists social_posts (
  id             bigint generated always as identity primary key,
  draft_id       bigint not null unique references social_drafts(id) on delete restrict,
  platform       text not null default 'x' check (platform in ('x','linkedin','buffer','manual')),
  remote_post_id text unique,
  url            text,
  status         text not null default 'queued' check (status in ('queued','published','failed','manual')),
  error_code     text,
  published_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Activity provenance (SPEC §10 common event fields) ─────────────────────
alter table activity alter column team_id drop not null;
alter table activity add column if not exists event_id bigint default current_event_id() references hack_events(id);
alter table activity add column if not exists source text not null default 'web';
alter table activity add column if not exists source_event_id text;
alter table activity add column if not exists type text;
alter table activity add column if not exists visibility text not null default 'team';
do $$ begin
  alter table activity add constraint activity_visibility_chk check (visibility in ('private','team','judges','public'));
exception when duplicate_object then null; end $$;
alter table activity add column if not exists occurred_at timestamptz not null default now();
alter table activity add column if not exists ingested_at timestamptz not null default now();
alter table activity add column if not exists schema_version int not null default 1;
alter table activity add column if not exists payload jsonb not null default '{}'::jsonb;
alter table activity add column if not exists evidence_ref bigint references evidence_artifacts(id) on delete set null;
alter table activity add column if not exists signature_status text not null default 'unverified';
do $$ begin
  alter table activity add constraint activity_signature_chk check (signature_status in ('unverified','verified','invalid','not_applicable'));
exception when duplicate_object then null; end $$;
create unique index if not exists activity_source_event_idx on activity(source, source_event_id) where source_event_id is not null;
create index if not exists activity_public_idx on activity(occurred_at desc) where visibility = 'public';

-- ── Live projections ───────────────────────────────────────────────────────
create table if not exists live_metrics (
  event_id           bigint not null default current_event_id() references hack_events(id),
  name               text not null,
  value              numeric not null,
  denominator        numeric,
  sample_n           int,
  source             text not null,
  definition_version text not null default '1',
  as_of              timestamptz not null default now(),
  freshness          text not null default 'fresh' check (freshness in ('fresh','delayed','stale')),
  -- Must be false for anything shown as real on production /live.
  is_demo            boolean not null default false,
  primary key (event_id, name)
);

create table if not exists live_feed (
  id                 bigint generated always as identity primary key,
  event_id           bigint not null default current_event_id() references hack_events(id),
  team_id            bigint references teams(id) on delete cascade,
  kind               text not null,
  -- proof = evidence-backed (teal VERIFIED), detected = suspected (grey), linked = hairline.
  status             text not null check (status in ('proof','detected','linked','info')),
  title              text not null,
  detail             text,
  href               text,
  source_activity_id bigint unique references activity(id) on delete cascade,
  is_demo            boolean not null default false,
  occurred_at        timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists live_feed_recent_idx on live_feed(occurred_at desc);
