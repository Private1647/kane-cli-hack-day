-- Check-in exceptions: who admitted a roster row and on what basis (a staff
-- walk-in exception, an organizer override at the desk), how its check-in was
-- taken (desk or a signed paper ledger), and one reconciliation row per paper
-- check-in receipt entered after an outage. Additive; safe to re-run.

-- ── Admission provenance ───────────────────────────────────────────────────
-- Null basis = the roster file admitted them (Luma / template import).
alter table roster_guests add column if not exists admission_basis text;
do $$ begin
  alter table roster_guests add constraint roster_guests_admission_basis_chk
    check (admission_basis in ('walk_in_exception','desk_override','override'));
exception when duplicate_object then null; end $$;
alter table roster_guests add column if not exists admitted_by bigint references staff_accounts(id) on delete set null;
alter table roster_guests add column if not exists admitted_at timestamptz;
alter table roster_guests add column if not exists admission_reason text;

-- ── Check-in provenance (the attendance fact, separate from admission) ─────
-- checked_in_at stays the actual arrival time. For a paper check-in it is the
-- time on the slip, so the entry time and the slip id are kept beside it.
alter table roster_guests add column if not exists checkin_source text;
do $$ begin
  alter table roster_guests add constraint roster_guests_checkin_source_chk
    check (checkin_source in ('desk','offline_ledger','import'));
exception when duplicate_object then null; end $$;
alter table roster_guests add column if not exists checkin_entered_at timestamptz;
alter table roster_guests add column if not exists checkin_ref text;

-- Walk-ins admitted before this migration: record what we know.
update roster_guests
   set admission_basis = 'walk_in_exception',
       admitted_by = checked_in_by,
       admitted_at = coalesce(checked_in_at, imported_at),
       admission_reason = coalesce(staff_reference, 'walk-in, not on the Luma roster')
 where source = 'walk_in' and admission_basis is null;

-- ── Paper check-in reconciliation (checkin-ledger-template.csv) ────────────
-- One row per signed paper receipt that matched an admitted roster row.
-- receipt_id is the slip's own id and is unique per event, so replaying a
-- ledger never checks anyone in twice.
create table if not exists checkin_reconciliations (
  id              bigint generated always as identity primary key,
  event_id        bigint not null default current_event_id() references hack_events(id),
  receipt_id      text not null,
  -- What the slip says: a Luma guest id, a P-#### code or a roster row id.
  attendee_ref    text not null,
  guest_id        bigint references roster_guests(id) on delete set null,
  member_id       bigint references members(id) on delete set null,
  -- The time written on the slip (actual arrival) and when it was typed in.
  paper_at        timestamptz not null,
  entered_at      timestamptz not null default now(),
  delay_reason    text not null,
  staff_id        text not null,
  staff_signature text not null,
  witness_id      text,
  -- already_checked_in: the attendee was checked in some other way first; that record is kept.
  outcome         text not null check (outcome in ('checked_in','already_checked_in')),
  note            text,
  batch_sha256    text,
  entered_by      bigint references staff_accounts(id) on delete set null,
  unique (event_id, receipt_id)
);
create index if not exists checkin_reconciliations_guest_idx on checkin_reconciliations(guest_id);
create index if not exists checkin_reconciliations_entered_idx on checkin_reconciliations(event_id, entered_at desc);
