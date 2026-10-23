-- Studio, deck, video and GTM kit (area: studio-deck). Builds on 011's
-- project_stories / deck_versions / render_jobs / published_assets.
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.

-- ── Per-project studio settings ─────────────────────────────────────────────
-- Which Ship Page template the team picked, and the level-3 custom HTML they
-- are previewing. Custom HTML only ever renders in a sandboxed iframe in the
-- studio; public pages always use the default templates.
create table if not exists studio_settings (
  project_id             bigint primary key references projects(id) on delete cascade,
  ship_template          text not null default 'product-proof'
                           check (ship_template in ('product-proof','proof-atlas','launch-film','terminal-zine','shipping-ledger','confidence-specimen')),
  custom_html            text,
  custom_html_sha256     text,
  custom_html_updated_at timestamptz,
  updated_by             bigint references members(id) on delete set null,
  updated_at             timestamptz not null default now()
);

-- ── 60s video storyboard (versioned, append-only) ──────────────────────────
create table if not exists video_plans (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  version    int not null,
  -- { scenes[{ id, start, end, title, footage{kind,url|object_key,label}, source_in, source_out, caption, voiceover }],
  --   fallback_montage{ enabled, stills[] }, captions_reviewed }
  content    jsonb not null,
  created_by bigint references members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

-- ── GTM kit drafts (X post, thread, README, alt text) ──────────────────────
-- Drafts only: nothing here is ever posted automatically. A kit is tied to
-- the story version it was drafted from, and records who approved it.
create table if not exists gtm_kits (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references projects(id) on delete cascade,
  story_id      bigint references project_stories(id) on delete set null,
  story_version int not null,
  content       jsonb not null,
  generator     text not null check (generator in ('llm','rules','human')),
  model         text,
  status        text not null default 'draft' check (status in ('draft','approved','superseded')),
  created_by    bigint references members(id) on delete set null,
  approved_by   bigint references members(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists gtm_kits_project_idx on gtm_kits(project_id, created_at desc);

-- A published deck/page is pinned to the team's live submission when one exists.
alter table published_assets add column if not exists submission_id bigint references submissions(id) on delete set null;

-- ── Immutability ────────────────────────────────────────────────────────────
-- Updates are blocked; deletes are left to the project cascade so a privacy
-- deletion of a team still works.
-- Story versions never change once written (edits insert a new version). Only
-- the review stamp may be filled in later.
create or replace function project_stories_guard() returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content or new.version <> old.version or new.project_id <> old.project_id then
    raise exception 'project_stories versions are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists project_stories_immutable on project_stories;
create trigger project_stories_immutable before update on project_stories
  for each row execute function project_stories_guard();

-- Deck versions: slides and theme are frozen at insert; status may move on
-- (draft → approved → published → archived) but a published version can only
-- be archived, never edited.
create or replace function deck_versions_guard() returns trigger language plpgsql as $$
begin
  if new.scenes is distinct from old.scenes or new.theme_tokens is distinct from old.theme_tokens
     or new.version <> old.version or new.project_id <> old.project_id
     or new.source_story_id is distinct from old.source_story_id or new.template <> old.template then
    raise exception 'deck_versions are immutable' using errcode = '42501';
  end if;
  if old.status = 'published' and new.status not in ('published','archived') then
    raise exception 'a published deck version can only be archived' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists deck_versions_immutable on deck_versions;
create trigger deck_versions_immutable before update on deck_versions
  for each row execute function deck_versions_guard();

-- Published assets: what was published (version, sources, consent receipt,
-- object, pinned submission) never changes; moderation may change `state`.
create or replace function published_assets_guard() returns trigger language plpgsql as $$
begin
  if new.version <> old.version or new.kind <> old.kind or new.project_id <> old.project_id
     or new.source_story_id is distinct from old.source_story_id or new.source_deck_id is distinct from old.source_deck_id
     or new.object_key is distinct from old.object_key or new.consent_receipt is distinct from old.consent_receipt
     or new.published_at <> old.published_at or new.submission_id is distinct from old.submission_id then
    raise exception 'published_assets are append-only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists published_assets_immutable on published_assets;
create trigger published_assets_immutable before update on published_assets
  for each row execute function published_assets_guard();

drop trigger if exists video_plans_append_only on video_plans;
create trigger video_plans_append_only before update on video_plans
  for each row execute function forbid_mutation();

create index if not exists published_assets_lookup_idx on published_assets(project_id, kind, version desc);
create index if not exists project_stories_latest_idx on project_stories(project_id, version desc);
create index if not exists deck_versions_latest_idx on deck_versions(project_id, version desc);
