-- Add trip_time column to trips table for intra-day ordering
-- Nullable: existing trips have no time, new trips can optionally record one
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_time time;

NOTIFY pgrst, 'reload schema';
