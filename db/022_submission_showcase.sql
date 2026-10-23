-- Submission + public showcase (area: submission-showcase).
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.

-- When an organizer renames a project's public slug, the old /ship/{slug}
-- keeps working as a permanent redirect. One row per retired slug.
create table if not exists project_slug_redirects (
  old_slug    text primary key,
  project_id  bigint not null references projects(id) on delete cascade,
  created_by  bigint references staff_accounts(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists project_slug_redirects_project_idx on project_slug_redirects(project_id);

-- The receipt page and ops list look submissions up by team and status.
create index if not exists submissions_status_idx on submissions(status);

-- Gallery: public projects by type.
create index if not exists projects_showcase_idx on projects(showcase_state, project_type);

-- Latest published ship page per project.
create index if not exists published_assets_kind_idx on published_assets(project_id, kind, version desc);
