-- Consent to social posts and face matching is per person, not per team: a
-- captain can't agree on teammates' behalf. null means "not asked yet".
alter table members add column if not exists consent_social boolean;
alter table members add column if not exists consent_at timestamptz;

-- teams.consent_social (from 003) is superseded by these columns and no longer
-- read. A team-level yes can't be traced to the person who gave it, so every
-- member starts as "not asked".
