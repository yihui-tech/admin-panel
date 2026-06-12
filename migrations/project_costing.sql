-- Migration: project_costing
-- Run in Supabase SQL editor on staging first, then production
-- Date: 2026-06-12

-- ─── project_invoices ────────────────────────────────────────────────────────
-- External vendor / rental invoices against a project

CREATE TABLE project_invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date        date NOT NULL,
  description text NOT NULL,
  vendor      text,
  amount      numeric NOT NULL,
  invoice_ref text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE project_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON project_invoices FOR ALL USING (true) WITH CHECK (true);

-- ─── project_estimates ───────────────────────────────────────────────────────
-- Estimate vs actual line items (e.g. crane-days, scaffold weeks)
-- Variance is computed in the UI: (actual_qty * actual_unit_cost) - (estimated_qty * estimated_unit_cost)

CREATE TABLE project_estimates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category            text NOT NULL,
  unit                text,
  estimated_qty       numeric NOT NULL DEFAULT 1,
  estimated_unit_cost numeric,
  actual_qty          numeric,
  actual_unit_cost    numeric,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE project_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON project_estimates FOR ALL USING (true) WITH CHECK (true);

-- After running, reload PostgREST schema cache:
-- NOTIFY pgrst, 'reload schema';
