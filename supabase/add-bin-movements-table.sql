-- Migration: add-bin-movements-table
-- Creates a dedicated bin_movements table for free-form movement recording.
-- Admin enters bin movements (date, time, action, destination, optional vehicle/driver).
-- The system uses this table to reconstruct per-bin history and detect missing trips.
-- Run in Supabase SQL editor on staging first, then production.

CREATE TABLE IF NOT EXISTS bin_movements (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_id               uuid        NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
  action               text        NOT NULL,         -- 'dropoff' | 'pickup'
  movement_date        date        NOT NULL,         -- actual date the movement occurred
  movement_time        time,                         -- actual time (optional)
  from_label           text,                         -- human-readable previous location
  to_label             text        NOT NULL,         -- human-readable new location
  customer_location_id integer     REFERENCES customer_locations(id) ON DELETE SET NULL,
  customer_id          integer     REFERENCES customers(customer_id) ON DELETE SET NULL,
  location_id          integer     REFERENCES locations(id) ON DELETE SET NULL,
  vehicle_number       text        REFERENCES vehicles(plate_number) ON DELETE SET NULL,
  driver_id            text        REFERENCES drivers(employee_id) ON DELETE SET NULL,
  note                 text,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE bin_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON bin_movements FOR ALL USING (true) WITH CHECK (true);

-- Reload PostgREST schema cache after running:
NOTIFY pgrst, 'reload schema';
