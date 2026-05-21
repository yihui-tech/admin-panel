# BUSINESS_RULES.md — worker-assignment

This document defines the business logic and domain rules for the worker assignment and cost tracking system. Read this before implementing any cost, timesheet, or assignment logic.

---

## Company Context

**Company:** Yi Hui Tech (internal tooling)
**Use case:** Daily assignment of 26 field workers to active projects, with rolling labour cost tracking per project.

---

## Workers

- The company has 26 active field workers
- Each worker has a **monthly gross salary** stored in `workers.monthly_rate`
- Workers are identified by an employee code from Times Software HR system (format: `YH0001`)
- Workers also have an NRIC for identity verification
- Workers can have roles (e.g. Driver, Operator, Labourer)
- A worker marked `active = false` should not appear in assignment dropdowns
- Worker skills and licences exist but are not yet tracked in this system — deferred to a later phase

---

## Projects

- Each project is tied to a **single location**
- Project status must be one of: `active`, `completed`, `on-hold`
- Only `active` projects appear in assignment dropdowns
- Completed projects retain all historical cost data and remain visible in the cost dashboard
- Projects do not have a fixed headcount — any number of workers can be assigned

---

## Daily Assignments

- Assignments are made **per day** — there is no multi-day assignment record
- Each assignment links one worker to one project for a specific date and shift
- A worker can be assigned to a **maximum of two projects in one day** via split shifts
- Shift options: `full_day`, `morning`, `afternoon`
- Default shift is `full_day`
- The combination of `(worker_id, assigned_date, shift)` must be unique
- Unassigned workers on a given day simply have no assignment record — there is no "absent" status at this stage

---

## Working Day Calculation

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

This varies by month — always calculate dynamically, never hardcode.

---

## Cost Calculation

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

> Note: `regular_hours` is typically 8 but may be less for half days or partial attendance.

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

---

## OT Rules

- OT 1.5x applies on **weekday overtime**
- OT 2.0x applies on **weekends and public holidays**
- The determination of whether OT is 1.5x or 2.0x is made **at the timesheet level** — the admin enters hours into the correct column (`ot_15_hours` or `ot_20_hours`)
- Public holidays are managed by **Times Software** — this system does not maintain a public holidays table
- There is no automatic OT multiplier calculation — it is entered manually or imported from Times Software

---

## Timesheets

- Timesheets are the **source of truth for cost calculation** — assignments alone do not generate cost
- Each timesheet entry links a worker to a project for a specific date
- A worker can have multiple timesheet entries on the same day if assigned to multiple projects
- `source` field tracks whether the entry was manually entered (`manual`) or imported from Times Software (`csv_import`)
- CSV import from Times Software is not yet built — manual entry only at this stage

### Timesheet Entry Fields
| Field | Description |
|---|---|
| `regular_hours` | Standard working hours (typically 8) |
| `ot_15_hours` | OT hours billed at 1.5x |
| `ot_20_hours` | OT hours billed at 2.0x |

---

## HR System — Times Software

- Times Software is the company's payroll and HR system
- Employee IDs in this system match the `employee_id` format in the workers table (e.g. `YH0001`)
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