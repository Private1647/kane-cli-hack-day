-- Admissions + ops (area admissions-ops): a record of every roster import
-- (version, hash, diff counts) so "the last signed roster" is a real row, and
-- fixed-window rate-limit buckets shared by every function instance.
-- Idempotent: scripts/migrate.mjs re-applies every file on each run.

-- ── Roster imports ─────────────────────────────────────────────────────────
-- One row per committed CSV (Luma export or the fallback template). The
-- roster rows themselves live in roster_guests (006); this keeps the version
-- trail staff quote on paper ("last known good roster version").
create table if not exists roster_imports (
  id              bigint generated always as identity primary key,
  event_id        bigint not null default current_event_id() references hack_events(id),
  source          text not null default 'luma_csv' check (source in ('luma_csv','manual_offline','luma_webhook')),
  source_version  text not null,
  -- sha256 of the uploaded file bytes (after BOM strip), hex.
  source_hash     text not null,
  file_name       text,
  row_count       int not null default 0,
  added           int not null default 0,
  changed         int not null default 0,
  removed         int not null default 0,
  unchanged       int not null default 0,
  rejected        int not null default 0,
  imported_by     bigint references staff_accounts(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists roster_imports_created_idx on roster_imports(event_id, created_at desc);

-- ── Rate limits ────────────────────────────────────────────────────────────
-- Fixed window per (bucket, window_start). src/server/ratelimit.ts upserts and
-- reads the count in one statement; the retention cron deletes old windows.
create table if not exists rate_limit_buckets (
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, window_start)
);
create index if not exists rate_limit_buckets_window_idx on rate_limit_buckets(window_start);

-- Search the check-in desk by P-code / name quickly.
create index if not exists members_name_lower_idx on members(lower(name));
create index if not exists roster_guests_checked_idx on roster_guests(event_id, checked_in_at);
