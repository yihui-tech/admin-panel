-- Run in Supabase SQL editor (staging first, then prod).
-- Creates bin_location_overrides table to record manual bin location corrections.
-- Used when admin corrects a bin's location without a corresponding trip record
-- (indicates a missing trip that needs to be traced and entered later).

create table if not exists bin_location_overrides (
  id         uuid primary key default gen_random_uuid(),
  bin_id     uuid references bins(id) on delete cascade,
  from_label text,
  to_label   text,
  note       text,
  created_at timestamptz default now()
);

-- If the table was already created without from_label/to_label, add them:
alter table bin_location_overrides
  add column if not exists from_label text,
  add column if not exists to_label   text;
