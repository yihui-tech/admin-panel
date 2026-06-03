# CLAUDE.md — worker-assignment

Admin portal for Yi Hui Tech. See root `../CLAUDE.md` for shared DB schema, architecture, bin validation rules, and Karpathy guardrails.

---

## Project Overview

Two domains:
1. **Projects** — daily worker assignment, timesheets, rolling labour cost tracking
2. **Trips** — truck trip dispatch, bin inventory, WhatsApp message generation, drag-to-reorder

**Production URL:** https://ops.yihui.sg
**Staging URL:** https://stg.ops.yihui.sg
**Repo:** https://github.com/yihui-tech/worker-assignment
**Companion app:** `trips-records` → https://github.com/yihui-tech/trips-records

---

## Git Branches

| Branch | Deployment | Supabase |
|---|---|---|
| `main` | ops.yihui.sg (production) | prod (`xshucanagbaxgfirtbuc`) |
| `staging` | stg.ops.yihui.sg | staging (`pkbqsinxfaiphdargamd`) |

Workflow: develop on `staging` → test on `stg.ops.yihui.sg` → merge to `main` → live.

---

## Cross-App Interactions with trips-records

Both apps share the same Supabase project per environment. Supabase is the integration point — apps do not call each other directly.

### What this app owns
- Trip creation and all trip metadata (vehicle, driver, customer, site, dropoff, requester, remarks)
- Setting `trip_order` for driver list sequencing
- Adding bins to trips with initial dropoff/pickup actions
- Generating the WhatsApp dispatch message (admin copies and sends manually to driver)
- **Bin location update on trip complete** — `handleMarkComplete` in `/trips/page.tsx` updates `bins` table
- Customer, customer_locations, locations, vehicles, drivers master data

### What trips-records does that affects this app
- **Driver marks trip complete** → sets `trips.status = 'completed'`, `completed_at`, and updates bin locations
- **trips-records `/admin` marks trip complete** → also updates bin locations
- **Driver records weigh_bridge loads** → this app shows net weight breakdown per load on the trips list
- **Driver can add/edit/delete bin movements** on a trip (same `trip_bins` table) — admin may see different bins than originally set

### Bin location update rules (both apps)

| Action | Bin location set to |
|---|---|
| Issue (dropoff) | `customer_location_id` from trip (falls back to `customer_id`) |
| Collect (pickup) | `location_id` = trip's `dropoff_id` (yard) |
| Roundtrip | `location_id` = trip's `dropoff_id` (yard) |

Both apps now apply these rules consistently. `handleMarkComplete` here handles all three action types including roundtrip.

### Data that flows between apps

| Data | Direction | How |
|---|---|---|
| Trip details (vehicle, customer, bins, order) | worker-assignment → trips-records | Written to DB, read by driver app |
| `trip_order` | worker-assignment → trips-records | Driver list sorted by this field |
| WhatsApp message | worker-assignment → driver (manual) | Admin copies text, sends via WhatsApp |
| `weigh_bridge` loads | trips-records → worker-assignment | Driver inserts, admin reads net weight totals |
| Trip `status` / `completed_at` | trips-records → worker-assignment | Driver marks complete, admin sees status change |
| Bin action edits (`trip_bins`) | trips-records → worker-assignment | Driver may adjust actions admin set |

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (`@supabase/ssr`) — all routes protected |
| Deployment | Vercel (Hobby plan) |

---

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Run dev server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
```

---

## Project Structure

```
middleware.ts                   # Auth guard — protects all routes, redirects to /login
app/
  components/
    Nav.tsx                     # Top navigation (Projects | Trips sections) + Sign out button
  login/
    page.tsx                    # Login page (email + password via Supabase Auth)
  page.tsx                      # Home dashboard (cost summary + bin locations)
  analytics/
    page.tsx                    # Bin swap analytics per customer site (week/month toggle)
  assignments/
    page.tsx                    # Daily worker assignment
  bins/
    page.tsx                    # Bin inventory (CRUD + filters + days at site)
  cost/
    page.tsx                    # Rolling cost dashboard per project
  customers/
    page.tsx                    # Customer CRUD + multi-site management
  projects/
    page.tsx                    # Project CRUD
  reporting/
    page.tsx                    # Trip weight reporting — date range + material filter, weight summaries
  timesheets/
    page.tsx                    # Timesheet entry per worker per project
  trips/
    page.tsx                    # Trip dispatch, bin movements, WhatsApp, drag-to-reorder
  lib/
    supabase.ts                 # Supabase client (legacy pattern, used in data pages)
  layout.tsx
  globals.css
```

---

## Environment Variables

Set in Vercel with scope split (Production vs Preview):

| Variable | Production | Preview (staging) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xshucanagbaxgfirtbuc.supabase.co` | `https://pkbqsinxfaiphdargamd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key |

Local development uses `.env.local` (not committed).

---

## Authentication

All routes are protected by `middleware.ts` using `@supabase/ssr`:
- Unauthenticated requests redirect to `/login`
- Authenticated users on `/login` are redirected to `/`
- Sign out button in the top-right of `Nav.tsx`
- Admin users are created in Supabase dashboard → Authentication → Users
- Use `createBrowserClient` for auth operations in client components
- Use `createServerClient` in middleware for session refresh and auth checks

---

## Pages Summary

### / (Home Dashboard)
- Two-panel layout: Project Costs (2/3) + Bin Locations (1/3)
- Cost panel: current month, active projects, sorted by cost descending. Links to `/cost`
- Bins panel: grouped by At Customer / At Yard / Unknown. Links to `/bins`
  - Sections with more than 10 bins show first 10 with "Show N more / Show less" toggle

### /projects
- CRUD via modal; mandays column shows total assignment mandays per project
- Status: active | completed | on-hold

### /assignments
- Pick a date → see all active workers
- Assign worker to project; toggle **Split** for morning/afternoon split across two projects
- Save handles upsert — re-opening same date reloads existing assignments

### /timesheets
- Regular hours + OT hours per worker per project per date
- Source tracked as `manual`

### /cost
- Toggle This Month / All Time
- Filter by project status
- Rolling labour cost per project from timesheets; total summary card

### /trips
- Create and manage truck dispatch trips
- Fields: vehicle, driver, customer, customer site (filtered by customer), dropoff location, requester, remarks
- Bin movements: add bins with dropoff/pickup/roundtrip actions — see root CLAUDE.md for validation rules
- Drag-to-reorder: open trips only, requires driver + date filter applied; persists via `trip_order`
- Trip actions: Complete, Cancel, Copy (WhatsApp), Edit, Delete
- On complete: updates trip status + bin locations (see root CLAUDE.md)
- Weigh bridge loads shown per trip: net weight, internal net (if rubbish recorded), total adjustments (rubbish + FOC)

### /bins
- Full CRUD via modal: serial number, type, size, unit weight, status, remarks, location
- Filter tabs: All / At Customer / At Yard / Unknown
- **Days at Site** — elapsed time since last dropoff, colour-coded: green = today, gray = <7d, orange = 7–13d, red = 14+d
- Location badge: blue = customer site, green = yard, gray = unknown

### /customers
- Customer CRUD
- **Manage Sites** (pin icon) — modal to create/edit/delete `customer_locations` per customer

### /analytics
- Bin swap analytics: dropoff counts per customer site, week/month toggle, bar chart

### /reporting
- Filters: date range (from/to, defaults to current month), company dropdown, material type dropdown
- Material filter options: All | All Inbound | All Outbound | specific material (grouped by category)
- **Summary cards:** Total Trips, Inbound Net weight (after rubbish deduction), Outbound Net weight, FOC weight, Rubbish weight
- **Table — two modes depending on company filter:**
  - *All companies:* grouped by date + company/destination — shows trip count and total net weight per group, sorted latest first
  - *Specific company:* one row per individual trip (Date, Type, Company/Destination, Vehicle, Net Weight) — outbound trips are excluded since they have no customer
- Data: fetches all completed trips on mount; date filtering is client-side using `trip_date ?? created_at.slice(0, 10)`
- Outbound `net_weight` is stored negative in DB (weigh bridge convention); use `Math.abs()` when displaying
- All aggregation is client-side; **tech debt:** migrate to a Supabase RPC as data volume grows (~70 trips/day across 2 yards)
- All aggregation is client-side; **tech debt:** migrate to a Supabase RPC as data volume grows (~70 trips/day across 2 yards)

---

## UI Patterns

Icons — use `lucide-react`, no inline SVGs:
- Edit: `<Pencil size={14} />`, button `hover:text-blue-600 hover:bg-blue-50`
- Delete: `<Trash2 size={14} />`, button `hover:text-red-600 hover:bg-red-50`
- History: `<Clock size={14} />`, button `hover:text-purple-600 hover:bg-purple-50`
- All icon buttons base class: `p-1.5 text-gray-400 rounded`

Nav section icons: `<FolderKanban>` for Projects, `<Truck>` for Trips

---

## Coding Standards

**Next.js App Router**
- Default to Server Components for data fetching
- `"use client"` only when using React state or hooks
- Keep Client Components small and leaf-level

**TypeScript**
- No `any` for DB returns — use `as unknown as MyType[]` for Supabase nested selects
- Type all component props explicitly

**Tailwind**
- Dark mode disabled — no `dark:` variants
- Always set `bg-white text-gray-900` on `<main>`

**Supabase**
- Always handle both `data` and `error`
- RLS enabled — test queries in context of the correct user role
- Use `createBrowserClient` from `@supabase/ssr` for any auth-related operations (sign in, sign out)
