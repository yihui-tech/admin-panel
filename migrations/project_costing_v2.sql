-- Migration: project_costing_v2
-- Alters tables created in project_costing.sql
-- Run in Supabase SQL editor on staging first, then production
-- Date: 2026-06-12

-- Add invoice detail columns + link to estimate
ALTER TABLE project_invoices
  ADD COLUMN IF NOT EXISTS estimate_id  uuid REFERENCES project_estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qty          numeric,
  ADD COLUMN IF NOT EXISTS unit_cost    numeric;

-- Actuals now come from invoices — remove the estimate-side actual columns
ALTER TABLE project_estimates
  DROP COLUMN IF EXISTS actual_qty,
  DROP COLUMN IF EXISTS actual_unit_cost;

-- Reload PostgREST schema cache after running:
-- NOTIFY pgrst, 'reload schema';
