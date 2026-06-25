# admin-panel — Yi Hui Tech Operations Portal

Internal admin portal for Yi Hui Tech. Manages worker assignments, truck trip dispatch, bin inventory, weigh bridge reporting, and management reports.

**Production:** https://ops.yihui.sg  
**Staging:** https://stg.ops.yihui.sg  
**Companion app:** [trips-records](https://github.com/yihui-tech/trips-records) — driver-facing trip app

## Stack

- Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript
- Supabase (PostgreSQL + Auth via `@supabase/ssr`)
- Deployed on Vercel (Hobby plan)

## Development

```bash
npm install
npm run dev    # http://localhost:3000
npm run build
npm run lint
```

Requires `.env.local` with staging Supabase credentials (not committed — see CLAUDE.md for variable names).

## Nav sections (each gated by `user_module_permissions`)

| Section | Module | Pages |
|---|---|---|
| Projects | `projects` | Projects, Assignments, Timesheets |
| Trips | `trips` | Trips, Reporting |
| Bins | `bins` | Bins, Missing Trips, Analytics |
| Reports | `management` | Project Cost, Driver Checkout, Vehicle Costs |
| Admin | `admin` | Staff, Customers |

Module permissions are managed on the `/staff` page. New users start with no access.

## Deployment

```
feature/ → staging → stg.ops.yihui.sg → merge to main → ops.yihui.sg
```

Vercel auto-deploys on push to any branch. Production scope uses prod Supabase keys; Preview scope uses staging keys.

## Documentation

See `CLAUDE.md` for full architecture, DB schema, page-by-page behaviour, coding standards, and cross-app interaction details.
