# Business Rules — worker-assignment

See root `../Business rules.md` for shared rules: company context, trips, bin tracking, weigh bridge weight logic, deployment environments, deferred work.
Companion app: `trips-records` → https://github.com/yihui-tech/trips-records

This file covers rules specific to the **Projects, Workers, Assignments, Cost, and cross-app trip behaviour** from the admin perspective.

---

## Domain: Workers & Projects

### Workers
- ~26 active field workers
- Each worker has a **monthly gross salary** in `workers.monthly_rate`
- Workers identified by employee code from Times Software HR (format: `YH0001`)
- Workers also have an NRIC for identity verification
- Workers can have roles (e.g. Driver, Operator, Labourer)
- `active = false` workers must not appear in assignment dropdowns
- Worker skills and licences are not yet tracked — deferred

### Projects
- Each project is tied to a **single location**
- Status must be one of: `active`, `completed`, `on-hold`
- Only `active` projects appear in assignment dropdowns
- Completed projects retain all historical cost data and remain visible in the cost dashboard
- No fixed headcount — any number of workers can be assigned

### Daily Assignments
- Assignments are made **per day** — no multi-day records
- Each assignment links one worker to one project for a specific date and shift
- A worker can be assigned to a **maximum of two projects per day** via split shifts
- Shift options: `full_day`, `morning`, `afternoon`
- Default shift is `full_day`
- Constraint: `UNIQUE (worker_id, assigned_date, shift)`
- Unassigned workers have no record — there is no "absent" status

---

## Domain: Cost Calculation

### Working Day Calculation

Used to derive daily rate from monthly salary. Always calculate dynamically — never hardcode.

| Day | Count |
|---|---|
| Monday – Friday | 1 full day |
| Saturday | 0.5 day |
| Sunday | 0 |

```
Working days in month = count(Mon–Fri) + count(Saturdays) × 0.5
```

### Rate Formulas

```
Daily rate  = monthly_rate ÷ working days in that month
Hourly rate = daily rate ÷ 8
```

### Cost Per Timesheet Entry

```
Regular cost = (regular_hours ÷ 8) × daily rate
OT 1.5 cost  = ot_15_hours × hourly rate × 1.5
OT 2.0 cost  = ot_20_hours × hourly rate × 2.0
Total        = regular cost + OT 1.5 cost + OT 2.0 cost
```

> In the cost page: if `regular_hours > 4` treat as full day; otherwise prorate.

### Rolling Cost Per Project

```
Project total = SUM of all timesheet entry costs where project_id matches
```

### OT Rules

- OT 1.5x applies on **weekday overtime**
- OT 2.0x applies on **weekends and public holidays**
- Determination is made at the timesheet level — admin enters hours into the correct column
- Public holidays are managed by Times Software — no public holidays table in this system
- No automatic OT multiplier calculation — entered manually or imported from Times Software

### Timesheets

- Timesheets are the **source of truth for cost** — assignments alone do not generate cost
- One timesheet entry links one worker to one project for one date
- A worker can have multiple entries on the same day (one per project)
- `source` field: `manual` (default) or `csv_import`
- CSV import from Times Software is **not yet built**

---

## Domain: Weigh Bridge (read-only in this app)

- This app reads `weigh_bridge` loads but does not write them (trips-records writes them)
- Trips list shows net weight breakdown per load
- When rubbish or FOC weights are recorded: internal net and total adjustments are shown alongside net weight
- See root `../Business rules.md` and `trips-records/Business rules.md` for full weight calculation rules
