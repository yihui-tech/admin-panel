-- Fix incorrect plate XE2321Z → XE2321A
-- Run in Supabase SQL editor on STAGING first, then PROD.
-- Uses a transaction so all updates succeed or none do.

begin;

-- 1. Insert the correct plate by copying the existing row
insert into vehicles
  select 'XE2321A' as plate_number,
         default_driver_id, vehicle_type, status, purpose, supervisor,
         cartrack, coe_expiry, ownership_type, leasing_cost, depreciation,
         insurance_premium, road_tax, vpc_season_parking, created_at
  from vehicles where plate_number = 'XE2321Z';

-- 2. Re-point all child tables to the new plate
update trips        set vehicle_number = 'XE2321A' where vehicle_number = 'XE2321Z';
update weigh_bridge set vehicle_number = 'XE2321A' where vehicle_number = 'XE2321Z';

-- 3. Remove the old plate
delete from vehicles where plate_number = 'XE2321Z';

commit;
