-- Teams & ideas (area teams-ideas): what a recruiting team is looking for, and
-- a cache of public-summary embeddings for the Idea Radar. Idempotent: the
-- migrate script re-applies every file.

-- Skills a recruiting team wants. Public by design (shown on team cards in
-- /match); never holds contact details.
create table if not exists team_recruiting (
  team_id        bigint primary key references teams(id) on delete cascade,
  seeking_skills text[] not null default '{}',
  updated_at     timestamptz not null default now()
);

-- One embedding per (idea, summary text, model). Only ever computed from an
-- OPT-IN public_summary (ideas.discovery_opt_in), never from private_description.
-- summary_sha lets a changed summary invalidate the cached vector.
create table if not exists idea_embeddings (
  idea_id     bigint not null references ideas(id) on delete cascade,
  summary_sha text not null,
  model       text not null,
  vector      double precision[] not null,
  created_at  timestamptz not null default now(),
  primary key (idea_id, model)
);

-- Radar reads ideas by opt-in; keep that scan cheap.
create index if not exists ideas_discovery_idx on ideas(team_id) where discovery_opt_in and public_summary is not null;
-- Intros are listed per target.
create index if not exists teammate_intro_target_member_idx on teammate_introductions(target_member_id, status);
create index if not exists teammate_intro_target_team_idx on teammate_introductions(target_team_id, status);
create index if not exists invitations_team_idx on invitations(team_id) where accepted_at is null and revoked_at is null;
