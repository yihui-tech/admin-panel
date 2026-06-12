-- Add missing vehicles and set purpose on all categorised vehicles.
-- Run on STAGING first, then PROD.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING for inserts,
-- then a separate UPDATE for purpose).

-- ─────────────────────────────────────────────
-- 1. Insert vehicles not yet in the table
-- ─────────────────────────────────────────────
insert into vehicles (plate_number, status, purpose) values
  ('GBG1396R', 'in_use', 'worker_transport'),
  ('GBK9167L', 'in_use', 'worker_transport'),
  ('YQ7151R',  'in_use', 'worker_transport'),
  ('YR1697S',  'in_use', 'worker_transport'),
  ('YR6533Z',  'in_use', 'worker_transport'),
  ('XE7086X',  'in_use', 'related_company'),
  ('XE7132X',  'in_use', 'related_company'),
  ('XE8187G',  'in_use', 'pending_sale')
on conflict (plate_number) do nothing;

-- ─────────────────────────────────────────────
-- 2. Set purpose on existing vehicles
-- ─────────────────────────────────────────────
update vehicles set purpose = 'worker_transport'
  where plate_number in ('GBG1396R','GBK9167L','YQ7151R','YR1697S','YR6533Z');

update vehicles set purpose = 'related_company'
  where plate_number in ('XE7086X','XE7132X');

update vehicles set purpose = 'pending_sale'
  where plate_number = 'XE8187G';

update vehicles set purpose = 'spare'
  where plate_number = 'XE3303X';
