-- The Idea tab asks for a few more things: what kind of app it is (free text),
-- how the team plans to use Kane CLI, and anything else they want to add.
alter table ideas add column if not exists app_type   text not null default '';
alter table ideas add column if not exists kane_plan  text not null default '';
alter table ideas add column if not exists extra_info text not null default '';
