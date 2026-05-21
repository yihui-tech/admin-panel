# CLAUDE.md — worker-assignment

This file provides full context for Claude Code to work on this project autonomously.
Read this file fully before writing any code or making any changes.

---

## Project Overview

A web application for managing daily worker assignments to projects and tracking rolling labour costs per project. Built for Yi Hui Tech (internal tooling).

**Live URL:** Deployed on Vercel (staging)
**Repo:** https://github.com/yihui-tech/worker-assignment

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (not yet implemented) |
| Deployment | Vercel |

---

## Essential Commands

```bash
npm install          # Install dependencies
npm run dev          # Run dev server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
```

---

## Project Structure

```
app/
  components/
    Nav.tsx              # Top navigation bar
  assignments/
    page.tsx             # Daily worker assignment page
  cost/
    page.tsx             # Rolling cost dashboard per project
  projects/
    page.tsx             # Project creation and management
  lib/
    supabase.ts          # Supabase client initialisation
  layout.tsx             # Root layout with Nav
  globals.css            # Global styles (dark mode disabled)
```

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://xshucanagbaxgfirtbuc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both apps (worker-assignment and trips-records) share the same Supabase project in staging.

---

## Database Schema

### workers
```sql
employee_id  text PRIMARY KEY        -- Format: YH0001 (from Times Software HR)
nric         text UNIQUE NOT NULL    -- Singapore NRIC
name         text NOT NULL
monthly_rate numeric(10,2) NOT NULL  -- Gross monthly salary in SGD
role         text                    -- Job role/designation
active       boolean DEFAULT true
created_at   timestamptz DEFAULT now()
```

### projects
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
name         text NOT NULL
location     text
start_date   date
end_date     date
status       text DEFAULT 'active'   -- CHECK: active | completed | on-hold
created_at   timestamptz DEFAULT now()
```

### assignments
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
worker_id      text REFERENCES workers(employee_id)
project_id     uuid REFERENCES projects(id)
assigned_date  date NOT NULL
shift          text DEFAULT 'full_day'  -- CHECK: full_day | morning | afternoon
notes          text
created_at     timestamptz DEFAULT now()
UNIQUE (worker_id, assigned_date, shift)
```

### timesheets
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
worker_id      text REFERENCES workers(employee_id)
project_id     uuid REFERENCES projects(id)
date           date NOT NULL
regular_hours  numeric(5,2) DEFAULT 8
ot_15_hours    numeric(5,2) DEFAULT 0   -- OT at 1.5x multiplier
ot_20_hours    numeric(5,2) DEFAULT 0   -- OT at 2.0x multiplier
source         text DEFAULT 'manual'    -- manual | csv_import
created_at     timestamptz DEFAULT now()
```

---

## Row Level Security

RLS is enabled on all tables. Current policies allow public read and insert (staging only).
When Auth is implemented, policies must be updated to scope by authenticated user role.

---

## Supabase Client

```typescript
// app/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

> Note: Currently using `@supabase/supabase-js` directly. When Auth is added, migrate to `@supabase/ssr` with `createBrowserClient` for client components and `createServerClient` for server components.

---

## Pages Summary

### /projects
- Create new projects with name, location, start date, end date, status
- Edit existing projects via modal
- Status options: active | completed | on-hold

### /assignments
- Pick a date → see all active workers
- Assign each worker to a project for that day
- Toggle **Split** to assign a worker to two different projects (morning/afternoon)
- Save handles upsert — re-opening the same date reloads existing assignments

### /cost
- Toggle between This Month and All Time views
- Filter by project status (all | active | completed | on-hold)
- Shows rolling labour cost per project calculated from timesheets
- Summary card shows total cost across all projects

---

## Coding Standards

### Next.js App Router
- Default to Server Components for data fetching
- Use `"use client"` only when using React state or hooks
- Keep Client Components small and leaf-level

### TypeScript
- Do not use `any` for database returns
- Type all component props explicitly

### Tailwind
- Dark mode is disabled — do not use `dark:` variants
- Always set `bg-white text-gray-900` on `<main>` to prevent system dark mode bleed

### Supabase
- Always handle both `data` and `error` from Supabase calls
- RLS is enabled — always test queries in context of the correct user role

---

## 🧠 Karpathy Behavioral Guardrails

### 1. Think Before Coding
- Highlight ambiguities and ask clarifying questions before writing code
- Never make silent assumptions about intent, architecture, or requirements
- If multiple valid paths exist, present them as trade-offs before starting

### 2. Simplicity First
- Always implement the simplest thing that could work
- Do not add hypothetical abstractions or flexibility that weren't explicitly requested
- Prevent code bloat — avoid speculative future-proofing

### 3. Surgical Changes
- Only modify files or functions directly required for the current task
- Do not perform unrelated refactoring, styling fixes, or housekeeping
- Clean up dead code only if a feature is rewritten or removed

### 4. Goal-Driven Execution
- Break multi-step requests into an explicit written plan first
- Define exact success criteria and verify outcomes step by step
- Do not mark a task complete until the outcome is verified

---