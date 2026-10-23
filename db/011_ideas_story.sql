-- Ideas (private by default), the project story that powers the showcase,
-- deck and social copy, and render jobs / published assets.

create table if not exists ideas (
  id                  bigint generated always as identity primary key,
  team_id             bigint not null unique references teams(id) on delete cascade,
  title               text not null,
  private_description text not null default '',
  public_summary      text,
  discovery_opt_in    boolean not null default false,
  project_type        text not null default 'other',
  qualification       text not null default 'draft' check (qualification in ('draft','qualifies','needs_work','ineligible')),
  status              text not null default 'draft' check (status in ('draft','validated','shared','selected','frozen')),
  frozen_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

insert into ideas (team_id, title, private_description)
select t.id, left(t.name, 120), t.idea from teams t
on conflict (team_id) do nothing;

do $$ begin
  alter table projects add constraint projects_idea_fk foreign key (idea_id) references ideas(id) on delete set null;
exception when duplicate_object then null; end $$;
update projects p set idea_id = i.id from ideas i where i.team_id = p.team_id and p.idea_id is null;

create table if not exists idea_revisions (
  id             bigint generated always as identity primary key,
  idea_id        bigint not null references ideas(id) on delete cascade,
  revision       int not null,
  user_submitted jsonb not null,
  -- Advisory validator output (8 criteria, verdict, 3 changes, kane path, generator 'llm'|'rules').
  assessment     jsonb,
  actor_id       bigint references members(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (idea_id, revision)
);

create table if not exists idea_similarity_edges (
  id             bigint generated always as identity primary key,
  source_idea_id bigint not null references ideas(id) on delete cascade,
  target_idea_id bigint not null references ideas(id) on delete cascade,
  similarity     numeric(6,5),
  label          text check (label in ('similar_angle','possible_overlap','complementary')),
  explanation    text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (source_idea_id <> target_idea_id),
  unique (source_idea_id, target_idea_id)
);

-- ── Story → showcase / deck / social ───────────────────────────────────────
create table if not exists project_stories (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references projects(id) on delete cascade,
  version     int not null,
  -- Shape: blueprint templates/project-story.schema.json.
  content     jsonb not null,
  created_by  bigint references members(id) on delete set null,
  reviewed_by bigint references members(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists deck_versions (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references projects(id) on delete cascade,
  source_story_id bigint references project_stories(id) on delete set null,
  version         int not null,
  template        text not null default 'product-proof',
  scenes          jsonb not null,
  theme_tokens    jsonb not null default '{}'::jsonb,
  status          text not null default 'draft' check (status in ('draft','approved','published','archived')),
  approved_by     bigint references members(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists render_jobs (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references projects(id) on delete cascade,
  source_version  text not null,
  kind            text not null check (kind in ('html_deck','pdf_deck','mp4_video','og_card','social_card')),
  status          text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  object_key      text,
  error_code      text,
  attempt_count   int not null default 0,
  idempotency_key text unique,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
create index if not exists render_jobs_pending_idx on render_jobs(created_at) where status in ('queued','running');

create table if not exists published_assets (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references projects(id) on delete cascade,
  kind            text not null check (kind in ('ship_page','deck','pdf','og_card','video','social_card')),
  version         int not null,
  source_story_id bigint references project_stories(id) on delete set null,
  source_deck_id  bigint references deck_versions(id) on delete set null,
  object_key      text,
  state           text not null default 'public' check (state in ('draft','unlisted','public','hidden_by_moderation')),
  -- Who is credited and that each of them consented, at publish time.
  consent_receipt jsonb not null default '{}'::jsonb,
  published_by    bigint references members(id) on delete set null,
  published_at    timestamptz not null default now(),
  unique (project_id, kind, version)
);
