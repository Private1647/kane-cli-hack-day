-- Live (Mission Control): small additions on top of 012's projections.
-- Idempotent; scripts/migrate.mjs re-applies every file on each run.

-- Per-metric split (kane_executions by status, test members vs unique
-- definitions, detections set aside as infra/auth…) and its own window.
alter table live_metrics add column if not exists breakdown jsonb not null default '{}'::jsonb;

-- Feed rows derived from tables other than `activity` (a verified Kane run, a
-- reverified defect, a published ship page) dedupe on a stable key such as
-- 'kane_run:42', so re-running the projection never adds a second row.
alter table live_feed add column if not exists source_key text;
create unique index if not exists live_feed_source_key_idx on live_feed(source_key) where source_key is not null;
create index if not exists live_feed_team_recent_idx on live_feed(team_id, occurred_at desc);

-- Health of the projection itself, read by the /live status banner.
insert into integration_state (system) values ('live_metrics')
on conflict (event_id, system) do nothing;
