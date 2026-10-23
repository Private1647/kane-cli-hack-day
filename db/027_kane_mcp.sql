-- kane-mcp: what 009 needs for defect re-verification, milestone approval,
-- the GitHub commit timeline and webhook delivery dedupe. Idempotent: every
-- statement can run again (scripts/migrate.mjs re-applies every file).

-- ── Defects ────────────────────────────────────────────────────────────────
-- What the defect is *about* (a one-shot objective or a _test.md path),
-- hashed. A later run on the same subject is what can re-verify it.
alter table defects add column if not exists subject_key text;
-- Who marked it not-a-bug / fixed, and why (a human, never an agent).
alter table defects add column if not exists resolution_note text;
create index if not exists defects_subject_idx on defects(project_id, subject_key);

-- ── Kane runs ──────────────────────────────────────────────────────────────
-- Same subject key on runs, so a passing run can find the defects it clears.
alter table kane_runs add column if not exists subject_keys text[] not null default '{}';
-- Why a run is (not) source_verified, in words, for the EvidenceInspector.
alter table kane_runs add column if not exists trust_reasons text[] not null default '{}';
create index if not exists kane_runs_team_idx on kane_runs(team_id, received_at desc);

-- ── Milestones ─────────────────────────────────────────────────────────────
-- All evidence ids the claim cites (evidence_id keeps the first, for the FK).
alter table milestones add column if not exists evidence_ids bigint[] not null default '{}';
-- What the proposer asked for; `visibility` only widens once a teammate approves.
alter table milestones add column if not exists requested_visibility text not null default 'team';
do $$ begin
  alter table milestones add constraint milestones_requested_visibility_chk check (requested_visibility in ('team','judges','public'));
exception when duplicate_object then null; end $$;
alter table milestones add column if not exists status text not null default 'proposed';
do $$ begin
  alter table milestones add constraint milestones_status_chk check (status in ('proposed','approved','withdrawn'));
exception when duplicate_object then null; end $$;

-- ── Evidence ───────────────────────────────────────────────────────────────
-- Why an upload was quarantined (zip bomb, traversal, executable…).
alter table evidence_artifacts add column if not exists quarantine_reason text;
alter table evidence_artifacts add column if not exists original_name text;

-- ── GitHub commit timeline (from push webhooks) ────────────────────────────
-- Only SHAs and times: no commit messages, no diffs, no author emails.
create table if not exists repository_commits (
  id                 bigint generated always as identity primary key,
  repository_link_id bigint not null references repository_links(id) on delete cascade,
  project_id         bigint not null references projects(id) on delete cascade,
  sha                text not null,
  ref                text,
  committed_at       timestamptz,
  pushed_at          timestamptz not null default now(),
  author_login       text,
  delivery_id        text,
  unique (repository_link_id, sha)
);
create index if not exists repository_commits_project_idx on repository_commits(project_id, pushed_at desc);

-- ── Webhook delivery dedupe (GitHub X-GitHub-Delivery, renderer ids) ───────
create table if not exists webhook_deliveries (
  id          bigint generated always as identity primary key,
  provider    text not null check (provider in ('github','renderer','luma','kane')),
  delivery_id text not null,
  event       text,
  status      text not null default 'received' check (status in ('received','processed','ignored','failed')),
  detail      text,
  received_at timestamptz not null default now(),
  unique (provider, delivery_id)
);
