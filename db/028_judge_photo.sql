-- judge-photo: in-app studio photos (taken before anyone is identified, so no
-- team yet), the staff attestations the consent check needs, and lookups for
-- the media queue and consent revocation. Idempotent; safe to re-run.

-- A studio photo has no team until a person in it is identified.
alter table event_photos alter column team_id drop not null;

-- "Nobody identifiable in frame" (a robot, a screen, a crowd from behind),
-- attested by a staff member instead of a per-person consent check.
alter table event_photos add column if not exists no_people_attested_by bigint references staff_accounts(id) on delete set null;
alter table event_photos add column if not exists no_people_attested_at timestamptz;
-- Image rights basis, e.g. 'staff_photographer' or 'pipeline'.
alter table event_photos add column if not exists rights_basis text;
-- Why a photo is held (consent unknown, revoked, unconfirmed candidate…).
alter table event_photos add column if not exists hold_reason text;

-- The same studio upload twice is the same photo.
create unique index if not exists event_photos_studio_key_idx on event_photos(photo_key) where source = 'studio';

create index if not exists photo_people_member_idx on photo_people(member_id);
create index if not exists social_drafts_photo_idx on social_drafts(photo_id, created_at desc);
create index if not exists social_drafts_status_idx on social_drafts(status, created_at desc);
create index if not exists judge_scores_submission_idx on judge_scores(submission_id, round);
