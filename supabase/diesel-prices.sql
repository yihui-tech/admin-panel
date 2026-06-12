-- Run in Supabase SQL editor (staging first, then prod).
-- Stores the diesel cost per litre for each month.
-- Used by the vehicle costs report to compute diesel spend.

create table if not exists diesel_prices (
  month          date    primary key,  -- first day of month, e.g. 2026-05-01
  cost_per_litre numeric not null,
  updated_at     timestamptz default now()
);

-- RLS (permissive, consistent with all other tables)
alter table diesel_prices enable row level security;

create policy "public select" on diesel_prices for select using (true);
create policy "public insert" on diesel_prices for insert with check (true);
create policy "public update" on diesel_prices for update using (true);
create policy "public delete" on diesel_prices for delete using (true);

notify pgrst, 'reload schema';
