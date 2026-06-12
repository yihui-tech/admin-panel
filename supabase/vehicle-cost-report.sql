-- Run in Supabase SQL editor (staging first, then prod).
-- Creates vehicle_cost_report(p_month) RPC.
--
-- Returns one row per vehicle that has any cost data or activity in the month:
--   - Fixed monthly costs from the vehicles table
--   - Aggregated diesel litres from diesel_transactions
--   - Aggregated km driven from cartrack_trips (sum trip_distance_m / 1000)
--
-- Diesel cost and derived metrics (km/L, $/km) are computed client-side
-- using the user-provided cost per litre.

drop function if exists vehicle_cost_report(date);

create or replace function vehicle_cost_report(p_month date)
returns table (
  plate_number       text,
  vehicle_type       text,
  purpose            text,
  ownership_type     text,
  leasing_cost       numeric,
  depreciation       numeric,
  insurance_premium  numeric,
  road_tax           numeric,
  vpc_season_parking numeric,
  total_litres       numeric,
  total_km           numeric
)
language sql stable as $$
  select
    v.plate_number,
    v.vehicle_type,
    v.purpose,
    v.ownership_type,
    coalesce(v.leasing_cost, 0)        as leasing_cost,
    coalesce(v.depreciation, 0)        as depreciation,
    coalesce(v.insurance_premium, 0)   as insurance_premium,
    coalesce(v.road_tax, 0)            as road_tax,
    coalesce(v.vpc_season_parking, 0)  as vpc_season_parking,
    coalesce(d.total_litres, 0)        as total_litres,
    coalesce(ct.total_km, 0)           as total_km
  from vehicles v
  left join (
    select vehicle_plate, sum(litres) as total_litres
    from diesel_transactions
    where date_trunc('month', transaction_datetime at time zone 'Asia/Singapore')
          = date_trunc('month', p_month)
    group by vehicle_plate
  ) d on d.vehicle_plate = v.plate_number
  left join (
    select registration, round(sum(trip_distance_m) / 1000.0, 1) as total_km
    from cartrack_trips
    where date_trunc('month', start_timestamp at time zone 'Asia/Singapore')
          = date_trunc('month', p_month)
    group by registration
  ) ct on ct.registration = v.plate_number
  where
    coalesce(v.leasing_cost, 0) + coalesce(v.depreciation, 0) +
    coalesce(v.insurance_premium, 0) + coalesce(v.road_tax, 0) +
    coalesce(v.vpc_season_parking, 0) > 0
    or d.total_litres is not null
    or ct.total_km is not null
  order by
    v.purpose nulls last,
    v.plate_number;
$$;
