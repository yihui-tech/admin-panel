# Business Rules — worker-assignment

This document defines the business logic and domain rules for Yi Hui Tech's internal tooling.
Read this before implementing any cost, timesheet, assignment, trip, or bin logic.

---

## Company Context

**Company:** Yi Hui Tech
**Operations:** Field workers assigned to construction/infrastructure projects. Trucks dispatched to collect waste/materials from customer sites.
**Apps:**
- `worker-assignment` (this app, admin-facing) — manage projects, assignments, timesheets, trip dispatch, bin inventory
- `trips-records` (driver-facing, companion app) — drivers view assigned trips and log weigh bridge entries (loads)

---

## Domain 1: Workers & Projects

### Workers
- The company has ~26 active field workers
- Each worker has a **monthly gross salary** stored in `workers.monthly_rate`
- Workers are identified by an employee code from Times Software HR system (format: `YH0001`)
- Workers also have an NRIC for identity verification
- Workers can have roles (e.g. Driver, Operator, Labourer)
- A worker marked `active = false` should not appear in assignment dropdowns
- Worker skills and licences are not yet tracked — deferred

### Projects
- Each project is tied to a **single location**
- Project status must be one of: `active`, `completed`, `on-hold`
- Only `active` projects appear in assignment dropdowns
- Completed projects retain all historical cost data and remain visible in the cost dashboard
- Projects do not have a fixed headcount — any number of workers can be assigned

### Daily Assignments
- Assignments are made **per day** — there is no multi-day assignment record
- Each assignment links one worker to one project for a specific date and shift
- A worker can be assigned to a **maximum of two projects in one day** via split shifts
- Shift options: `full_day`, `morning`, `afternoon`
- Default shift is `full_day`
- The combination of `(worker_id, assigned_date, shift)` must be unique
- Unassigned workers on a given day have no assignment record — there is no "absent" status at this stage

---

## Domain 2: Cost Calculation

### Working Day Calculation

Used to derive daily rate from monthly salary.

| Day | Count |
|---|---|
| Monday – Friday | 1 full day each |
| Saturday | 0.5 day |
| Sunday | 0 (not a working day) |

**Formula:**
```
Working days in month = count(Mon–Fri) + count(Saturdays) × 0.5
```

Always calculate dynamically — never hardcode. Varies by month.

### Daily Rate
```
Daily rate = monthly_rate ÷ working days in that month
```

### Hourly Rate
```
Hourly rate = daily rate ÷ 8
```

### Regular Cost (per timesheet entry)
```
Regular cost = (regular_hours ÷ 8) × daily rate
```
> `regular_hours` is typically 8 but may be less for half days or partial attendance.
> In the cost page: if `regular_hours > 4`, treat as full day; otherwise prorate.

### OT Cost
```
OT 1.5 cost = ot_15_hours × hourly rate × 1.5
OT 2.0 cost = ot_20_hours × hourly rate × 2.0
```

### Total Cost Per Timesheet Entry
```
Total = regular cost + OT 1.5 cost + OT 2.0 cost
```

### Rolling Cost Per Project
```
Project total = SUM of all timesheet entry costs where project_id matches
```

### OT Rules
- OT 1.5x applies on **weekday overtime**
- OT 2.0x applies on **weekends and public holidays**
- The determination is made **at the timesheet level** — the admin enters hours into the correct column
- Public holidays are managed by Times Software — this system does not maintain a public holidays table
- There is no automatic OT multiplier calculation — entered manually or imported from Times Software

### Timesheets
- Timesheets are the **source of truth for cost calculation** — assignments alone do not generate cost
- Each timesheet entry links a worker to a project for a specific date
- A worker can have multiple timesheet entries on the same day (one per project)
- `source` field: `manual` (default) or `csv_import`
- CSV import from Times Software is **not yet built** — manual entry only

---

## Domain 3: Trips & Bin Tracking

### Vehicles & Drivers
- Vehicles are identified by plate number (e.g. `SBX1234A`)
- Vehicle records include: type, status, purpose, supervisor, COE expiry, ownership type (company/leased), and cost fields (leasing, depreciation, insurance, road tax, parking)
- Each vehicle may have a `default_driver_id` for convenience but this does not auto-populate trips
- Drivers share the same employee ID format as workers (`YH0001`) but live in a separate `drivers` table
- Driver records include: NRIC, contact number, license class, supervisor, status, monthly salary
- `drivers.access_token` is a UUID used by the trips-records app to authenticate the driver before full Auth is implemented
- A trip must have a vehicle; driver is optional

### Customers
- Each customer represents a company that has waste/materials to be collected
- The customer's address is the **pickup location** for the trip
- Contact person and contact number are used in the WhatsApp dispatch message

### Locations (Yards)
- Company-owned yards or receiving sites where material is dropped off
- Each location has a name and address
- The dropoff location address appears in the WhatsApp dispatch message

### Trips
- A trip = one truck dispatch: one vehicle, one driver, collecting from one customer and dropping off at one location
- Trip status lifecycle: `open` → `completed` or `cancelled`
- Only `open` trips are visible to drivers in the trips-records app
- **One trip can have multiple loads** (weigh bridge entries) — the driver may make multiple runs
- Bins are optional on a trip — not every trip involves bin movements

### Bin Movements on Trips
- A trip can have zero or more bin movements (`trip_bins` table)
- Each movement has a bin + action:
  - `dropoff` — bin is being delivered TO the customer site (leaves yard, arrives at customer)
  - `pickup` — bin is being collected FROM the customer site (leaves customer, returns to yard)
- When creating a trip, the system auto-suggests action based on current bin location:
  - Bin currently at a **yard** → default action = `dropoff`
  - Bin currently at a **customer** → default action = `pickup`
- Admin can override the suggested action manually

### Bin Location Tracking
- Each bin's current location is tracked in `bins.customer_id` and `bins.location_id`
- Exactly one should be non-null (or both null if unknown)
- **Bin locations are auto-updated when a trip is marked complete:**
  - `pickup` action → bin moves to the trip's dropoff yard (`location_id = dropoff_id`, `customer_id = null`)
  - `dropoff` action → bin moves to the trip's customer (`customer_id = customer_id`, `location_id = null`)
- Cancelling a trip does NOT move bins

### Weigh Bridge (Loads)
- Each load = one weigh bridge entry in the `weigh_bridge` table, linked to a trip via `trip_id`
- Weigh bridge data is entered by the **driver** in the trips-records app — not by admin
- Net weight is stored as a regular column — the driver app calculates `gross_weight - tare_weight` and inserts it
- The admin trips page shows a net weight breakdown per load if a trip has multiple loads

### WhatsApp Dispatch Message
- Generated from trip data for the admin to share via WhatsApp with the driver or customer
- Format (blank lines between sections, no blank lines within):
  ```
  Date : DD/MM/YYYY

  Order placed by - {requester}

  Collect from - {customer name}
  Collection address - {customer address}
  Person in charge - {customer contact person}
  Contact no. - {customer contact number}

  Sent to - {location name}
  Address - {location address}
  Person in charge -
  Contact no. -

  Remarks: {remarks}
  Bin drop off - {serial_number}
  Bin pick up - {serial_number}
  ```
- Admin clicks clipboard icon on a trip row → preview modal → Copy Message button → paste to WhatsApp

---

## HR System — Times Software

- Times Software is the company's payroll and HR system
- Employee IDs match the `employee_id` format in workers/drivers tables (e.g. `YH0001`)
- Timesheet data (regular hours, OT hours, OT type) can be exported from Times Software as CSV
- The ETL process to import this CSV into Supabase is **not yet built**
- When built, the import should set `source = 'csv_import'` on imported timesheet rows
- Monthly salary data in Times Software should be the source of truth for `monthly_rate`

---

## Staging vs Production

- The current deployment is **staging only**
- Both `worker-assignment` and `trips-records` share the same Supabase project in staging
- When going to production:
  - A new Supabase project will be created for production
  - A new Vercel deployment will be created pointing to the production Supabase project
  - Staging will remain active for testing

---

## Deferred / Future Work

| Feature | Notes |
|---|---|
| Auth (admin vs driver) | Both apps currently use public RLS policies. Phase 3: migrate to `@supabase/ssr`, scope trips-records to authenticated driver |
| CSV import from Times Software | Timesheet ETL pipeline |
| Worker skills / licences | Not tracked yet |
| Public holidays table | OT classification is manual for now |
| Production Supabase project | Separate from staging |

---
