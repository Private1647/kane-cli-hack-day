-- A team can invite someone from the matchmaking pool (the reverse of "ask to
-- join"). The invite is an intro from a team member to the person; accepting it
-- puts the person on from_team_id if a seat is still free.
alter table teammate_introductions add column if not exists from_team_id bigint references teams(id) on delete cascade;
create index if not exists teammate_intro_from_team_idx on teammate_introductions(from_team_id, status) where from_team_id is not null;
