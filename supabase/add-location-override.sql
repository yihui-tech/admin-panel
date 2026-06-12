-- Run in Supabase SQL editor (staging first, then prod).
-- Adds location_override flag to trip_bins to track manual location overrides
-- (used when admin submits a pickup/dropoff with no matching prior trip record).

alter table trip_bins
  add column if not exists location_override boolean default false;
