-- Kane runs and evidence. A failing run is a SUSPECTED detection, never a
-- confirmed bug; success is decided by exit status + a terminal event.

create table if not exists kane_runs (
  id                    bigint generated always as identity primary key,
  event_id              bigint not null default current_event_id() references hack_events(id),
  project_id            bigint not null references projects(id) on delete cascade,
  team_id               bigint not null references teams(id) on delete cascade,
  member_id             bigint references members(id) on delete set null,
  token_id              bigint references member_tokens(id) on delete set null,
  source                text not null check (source in ('kanehack_cli','mcp','manual','github_action','webhook')),
  upstream_execution_id text not null,
  batch_execution_id    text,
  status                text not null check (status in ('running','passed','failed','blocked','errored','cancelled')),
  exit_code             int,
  has_terminal_event    boolean not null default false,
  commit_sha            text,
  objective             text,
  -- Parsed run_end / testrun_done summary: counts, durations. Redacted.
  summary               jsonb not null default '{}'::jsonb,
  started_at            timestamptz,
  finished_at           timestamptz,
  evidence_hash         text,
  evidence_artifact_id  bigint,
  -- true only when tied to a paired token + project and a terminal event.
  source_verified       boolean not null default false,
  verification_state    text not null default 'reported' check (verification_state in ('reported','verified','manual_unverified')),
  report_url            text,
  raw_metadata          jsonb not null default '{}'::jsonb,
  received_at           timestamptz not null default now(),
  unique (source, upstream_execution_id)
);
create index if not exists kane_runs_project_idx on kane_runs(project_id, received_at desc);

create table if not exists kane_test_members (
  id                    bigint generated always as identity primary key,
  run_id                bigint not null references kane_runs(id) on delete cascade,
  upstream_member_id    text not null,
  name                  text,
  test_definition_hash  text,
  status                text not null check (status in ('passed','failed','blocked','skipped','errored')),
  duration_ms           bigint,
  unique (run_id, upstream_member_id)
);

create table if not exists evidence_artifacts (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references projects(id) on delete cascade,
  object_key      text not null,
  sha256          text not null,
  kind            text not null check (kind in ('ndjson','screenshot','video','report','testmd','zip','log','other')),
  content_type    text,
  size_bytes      bigint,
  visibility      text not null default 'private' check (visibility in ('private','team','judges','public')),
  source_run_id   bigint references kane_runs(id) on delete set null,
  uploaded_by     bigint references members(id) on delete set null,
  verified_at     timestamptz,
  redaction_state text not null default 'unreviewed' check (redaction_state in ('unreviewed','clean','redacted','quarantined')),
  uploaded_at     timestamptz not null default now(),
  unique (project_id, sha256)
);

do $$ begin
  alter table kane_runs add constraint kane_runs_evidence_fk foreign key (evidence_artifact_id) references evidence_artifacts(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists defects (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references projects(id) on delete cascade,
  signature     text not null,
  title         text not null,
  detail        text,
  source_run_id bigint references kane_runs(id) on delete set null,
  status        text not null default 'suspected' check (status in ('suspected','confirmed','not_a_bug','fixed','reverified')),
  -- Infra/auth failures are excluded from confirmation.
  failure_class text not null default 'product' check (failure_class in ('product','infra','auth','unknown')),
  confirmed_by  bigint references members(id) on delete set null,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, signature)
);

create table if not exists defect_verifications (
  id         bigint generated always as identity primary key,
  defect_id  bigint not null references defects(id) on delete cascade,
  run_id     bigint not null references kane_runs(id) on delete cascade,
  commit_sha text,
  result     text not null check (result in ('reproduced','passed','inconclusive')),
  created_at timestamptz not null default now(),
  unique (defect_id, run_id)
);

create table if not exists milestones (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references projects(id) on delete cascade,
  title         text not null,
  claim         text not null,
  confidence    text not null default 'participant_reported' check (confidence in ('verified','participant_reported','inferred')),
  evidence_id   bigint references evidence_artifacts(id) on delete set null,
  source_run_id bigint references kane_runs(id) on delete set null,
  visibility    text not null default 'team' check (visibility in ('team','judges','public')),
  proposed_by   bigint references members(id) on delete set null,
  approved_by   bigint references members(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  -- 'verified' requires evidence or a run.
  constraint milestones_verified_chk check (confidence <> 'verified' or evidence_id is not null or source_run_id is not null)
);
create index if not exists milestones_project_idx on milestones(project_id, created_at desc);
