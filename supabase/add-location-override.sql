-- Run in Supabase SQL editor (staging first, then prod).
-- Creates bin_location_overrides table to record manual bin location corrections.
-- Used when admin corrects a bin's location without a corresponding trip record
-- (indicates a missing trip that needs to be traced and entered later).

create table if not exists bin_location_overrides (
  id         uuid primary key default gen_random_uuid(),
  bin_id     uuid references bins(id) on delete cascade,
  note       text,
  created_at timestamptz default now()
);
