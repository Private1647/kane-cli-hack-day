-- Projects (1:1 with a team), linked repositories, the official immutable
-- submission (receipt S-XXXX, signed snapshot) and judge scores.

create table if not exists projects (
  id           bigint generated always as identity primary key,
  event_id     bigint not null default current_event_id() references hack_events(id),
  team_id      bigint not null unique references teams(id) on delete cascade,
  -- idea_id FK is added in 011 once ideas exists.
  idea_id      bigint,
  project_type text not null default 'other' check (project_type in ('application','agent','extension','plugin','workflow','ci_pipeline','validation_harness','tool','other')),
  name         text not null,
  summary      text,
  -- Reserved when the team is created; the public showcase lives at /ship/{slug}.
  slug         text not null unique,
  repo_url     text,
  live_url     text,
  run_command  text,
  state        text not null default 'draft' check (state in ('draft','building','verifying','demo_ready','submitted','archived')),
  -- Showcase visibility; becomes 'public' when the submission is finalized.
  showcase_state text not null default 'draft' check (showcase_state in ('draft','unlisted','public','hidden_by_moderation')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Backfill one project per existing team from the progress checklist.
insert into projects (team_id, name, slug, repo_url, live_url)
select t.id, t.name, t.slug,
       nullif((select p.value from progress p where p.team_id = t.id and p.item = 'repo'), ''),
       nullif((select p.value from progress p where p.team_id = t.id and p.item = 'live-url-or-run-command'), '')
  from teams t
on conflict (team_id) do nothing;

create table if not exists repository_links (
  id               bigint generated always as identity primary key,
  project_id       bigint not null references projects(id) on delete cascade,
  provider         text not null default 'github',
  installation_id  text,
  repo_id          text,
  repo_full_name   text not null,
  default_branch   text,
  permission_scope jsonb not null default '[]'::jsonb,
  linked_by        bigint references members(id) on delete set null,
  last_push_at     timestamptz,
  last_commit_sha  text,
  created_at       timestamptz not null default now(),
  unique (project_id, repo_full_name)
);

-- ── Submissions ────────────────────────────────────────────────────────────
create table if not exists submissions (
  id                 bigint generated always as identity primary key,
  event_id           bigint not null default current_event_id() references hack_events(id),
  project_id         bigint not null references projects(id) on delete restrict,
  team_id            bigint not null references teams(id) on delete restrict,
  status             text not null default 'draft' check (status in ('draft','preflighted','awaiting_confirmation','finalized','locked','withdrawn','organizer_exception')),
  -- Editable draft fields before finalize (repo, sha, links, harness text…).
  draft              jsonb not null default '{}'::jsonb,
  preflight          jsonb,
  receipt_code       text unique,
  finalized_by       bigint references members(id) on delete set null,
  finalized_by_staff bigint references staff_accounts(id) on delete set null,
  -- Server time (now()) at finalize; for manual_offline, the time staff record it.
  finalized_at       timestamptz,
  -- Manual receipts: when the officer actually received it (never backdates finalized_at).
  received_at        timestamptz,
  witness            text,
  incident_ref       text,
  immutable_snapshot jsonb,
  snapshot_sha256    text,
  -- HMAC-SHA256(snapshot_sha256) with RECEIPT_SIGNING_KEY, base64url.
  signature          text,
  source             text not null default 'web' check (source in ('web','mcp','manual_offline')),
  exception_ref      text,
  supersedes_id      bigint references submissions(id) on delete set null,
  idempotency_key    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- One live submission per project; withdrawn ones stay as history.
create unique index if not exists submissions_one_live_idx on submissions(project_id) where status not in ('withdrawn','organizer_exception');
create index if not exists submissions_team_idx on submissions(team_id);

-- Once finalized, the snapshot and receipt can never change. Only the status
-- may move forward (finalized → locked | withdrawn). Deletes are refused.
create or replace function submissions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('finalized','locked','organizer_exception') then
      raise exception 'finalized submissions cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status in ('finalized','locked','organizer_exception') then
    if new.immutable_snapshot is distinct from old.immutable_snapshot
       or new.snapshot_sha256 is distinct from old.snapshot_sha256
       or new.signature is distinct from old.signature
       or new.receipt_code is distinct from old.receipt_code
       or new.finalized_at is distinct from old.finalized_at
       or new.finalized_by is distinct from old.finalized_by
       or new.project_id is distinct from old.project_id
       or new.team_id is distinct from old.team_id
       or new.source is distinct from old.source
       or new.draft is distinct from old.draft then
      raise exception 'submission % is finalized and immutable', old.receipt_code using errcode = '42501';
    end if;
    if new.status not in ('finalized','locked','withdrawn','organizer_exception') then
      raise exception 'submission % cannot return to %', old.receipt_code, new.status using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists submissions_immutable on submissions;
create trigger submissions_immutable before update or delete on submissions
  for each row execute function submissions_guard();

-- ── Judge scores ───────────────────────────────────────────────────────────
-- category_scores: {"harness_kane": {"anchor": 4, "points": 24, "evidence": "…"}, …}
-- rubric_version 'kane-hack-os-eval@1' = EVALUATION.md (30/25/20/15/10).
create table if not exists judge_scores (
  id              bigint generated always as identity primary key,
  submission_id   bigint not null references submissions(id) on delete restrict,
  judge_id        bigint not null references staff_accounts(id) on delete restrict,
  rubric_version  text not null,
  round           text not null default 'final' check (round in ('mid','final','stage')),
  category_scores jsonb not null,
  total           numeric(6,2),
  comments        text,
  uncertainty     text,
  frozen          boolean not null default false,
  committed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (submission_id, judge_id, rubric_version, round)
);

create or replace function judge_scores_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.frozen then raise exception 'frozen scores cannot be deleted' using errcode = '42501'; end if;
    return old;
  end if;
  if old.frozen then
    raise exception 'score % is frozen', old.id using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists judge_scores_frozen on judge_scores;
create trigger judge_scores_frozen before update or delete on judge_scores
  for each row execute function judge_scores_guard();
