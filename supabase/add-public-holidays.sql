-- Migration: add-public-holidays
-- Stores Singapore public holidays for working days calculation.
-- Add new years here each January; Islamic holidays (Hari Raya) are tentative
-- and should be verified against the official MOM calendar before finalising.
-- Run in Supabase SQL editor on staging first, then production.

CREATE TABLE IF NOT EXISTS public_holidays (
  date  date PRIMARY KEY,
  name  text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON public_holidays FOR ALL USING (true) WITH CHECK (true);

-- Singapore Public Holidays 2025
INSERT INTO public_holidays (date, name) VALUES
  ('2025-01-01', 'New Year''s Day'),
  ('2025-01-29', 'Chinese New Year'),
  ('2025-01-30', 'Chinese New Year'),
  ('2025-03-31', 'Hari Raya Puasa'),
  ('2025-04-18', 'Good Friday'),
  ('2025-05-01', 'Labour Day'),
  ('2025-05-12', 'Vesak Day'),
  ('2025-06-07', 'Hari Raya Haji'),
  ('2025-08-09', 'National Day'),
  ('2025-10-20', 'Deepavali'),
  ('2025-12-25', 'Christmas Day')
ON CONFLICT (date) DO NOTHING;

-- Singapore Public Holidays 2026
-- Hari Raya Puasa, Hari Raya Haji, and Deepavali are tentative —
-- verify against official MOM calendar once confirmed.
INSERT INTO public_holidays (date, name) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-17', 'Chinese New Year'),
  ('2026-02-18', 'Chinese New Year'),
  ('2026-03-20', 'Hari Raya Puasa'),       -- tentative
  ('2026-04-03', 'Good Friday'),
  ('2026-05-01', 'Labour Day'),
  ('2026-05-27', 'Hari Raya Haji'),        -- tentative
  ('2026-06-01', 'Vesak Day'),             -- in-lieu (May 31 falls on Sun)
  ('2026-08-10', 'National Day'),          -- in-lieu (Aug 9 falls on Sun)
  ('2026-10-09', 'Deepavali'),             -- tentative
  ('2026-12-25', 'Christmas Day')
ON CONFLICT (date) DO NOTHING;

-- Reload PostgREST schema cache after running:
NOTIFY pgrst, 'reload schema';
