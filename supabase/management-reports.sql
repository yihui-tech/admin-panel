-- Run in Supabase SQL editor (staging first, then prod).
-- 1. Adds management role to user_profiles
-- 2. Creates driver_location_report RPC

-- ─────────────────────────────────────────────
-- 1. Add management column to user_profiles
-- ─────────────────────────────────────────────
alter table user_profiles
  add column if not exists management boolean default false;


-- ─────────────────────────────────────────────
-- 2. driver_location_report(p_month)
--
-- For each driver with a timesheet record in p_month:
--   - Gets adj_time_out (HR-adjusted clock-out time)
--   - Finds their default vehicle via vehicles.default_driver_id
--   - Finds the LAST trip for that vehicle on the work_date (by end_timestamp)
--   - Returns start/end timestamps and locations for that trip
--
-- Status flags:
--   no_vehicle  — driver has no vehicle assigned (can't verify OT)
--   no_cartrack — vehicle assigned but no CarTrack trips on that date (can't verify OT)
--   has_ot      — driver has OT hours recorded; location data shown for management review
--                 (no OT = checkout is fine, row shown as OK)
-- ─────────────────────────────────────────────
drop function if exists driver_location_report(date);

-- p_month: first day of the month, e.g. '2026-05-01'
create or replace function driver_location_report(p_month date)
returns table (
  worker_id              text,
  employee_name          text,
  work_date              date,
  adj_time_out           time,
  vehicle_plate          text,
  trip_start_ts          timestamptz,
  trip_end_ts            timestamptz,
  trip_start_location    text,
  trip_end_location      text,
  no_vehicle             boolean,
  no_cartrack            boolean,
  has_ot                 boolean,
  ot_hours               numeric
)
language sql stable
as $$
  select
    tr.worker_id,
    tr.employee_name,
    tr.work_date,
    tr.adj_time_out,
    v.plate_number                                                    as vehicle_plate,
    last_trip.start_timestamp                                         as trip_start_ts,
    last_trip.end_timestamp                                           as trip_end_ts,
    last_trip.start_location                                          as trip_start_location,
    last_trip.end_location                                            as trip_end_location,
    v.plate_number is null                                            as no_vehicle,
    v.plate_number is not null and last_trip.trip_id is null          as no_cartrack,
    -- Flag OT only when the last trip started BEFORE clock-out (driver was actively driving during OT).
    -- Trips starting after clock-out are the drive home — not flagged.
    coalesce(tr.ot_1x_hours, 0) + coalesce(tr.ot_1_5x_hours, 0) + coalesce(tr.ot_2x_hours, 0) > 0
      and last_trip.trip_id is not null
      and last_trip.start_timestamp < (
        (tr.work_date::text || ' ' || tr.adj_time_out::text)::timestamp
        at time zone 'Asia/Singapore'
      )                                                               as has_ot,
    coalesce(tr.ot_1x_hours, 0) + coalesce(tr.ot_1_5x_hours, 0) + coalesce(tr.ot_2x_hours, 0)
                                                                      as ot_hours
  from timesheet_records tr
  -- Pick one vehicle per driver: cartrack-enabled first, then alphabetical
  left join lateral (
    select plate_number, cartrack
    from vehicles
    where default_driver_id = tr.worker_id
    order by cartrack desc nulls last, plate_number
    limit 1
  ) v on true
  -- Last trip of the day for this vehicle (by end_timestamp)
  left join lateral (
    select trip_id, start_timestamp, end_timestamp, start_location, end_location
    from cartrack_trips
    where registration = v.plate_number
      and date(start_timestamp at time zone 'Asia/Singapore') = tr.work_date
    order by end_timestamp desc nulls first
    limit 1
  ) last_trip on v.plate_number is not null
  where date_trunc('month', tr.work_date) = date_trunc('month', p_month)
    and tr.adj_time_out is not null
  order by tr.work_date, tr.employee_name;
$$;
