'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type CustomerAgingRow = {
  customer_id: number;
  customer_name: string;
  bin_count: number;
  oldest_days: number;
  avg_days: number;
  rented_count: number;
  last_collection_date: string | null;
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BinsAgingPage() {
  const [rows, setRows] = useState<CustomerAgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      // 1. All active/rented bins currently at customer sites
      const { data: rawBins, error: binsErr } = await supabase
        .from('bins')
        .select('id, status, customer_id, customer_location_id, customers(customer_id, name), customer_locations(id, customer_id, name, customers(customer_id, name))')
        .in('status', ['active', 'rented'])
        .or('customer_location_id.not.is.null,customer_id.not.is.null');

      if (binsErr) { setError(binsErr.message); setLoading(false); return; }
      if (!rawBins || rawBins.length === 0) { setRows([]); setLoading(false); return; }

      const typed = rawBins as unknown as {
        id: string;
        status: string;
        customer_id: number | null;
        customer_location_id: number | null;
        customers: { customer_id: number; name: string } | null;
        customer_locations: { id: number; customer_id: number; name: string; customers: { customer_id: number; name: string } | null } | null;
      }[];

      // 2. Last completed dropoff date per bin
      const binIds = typed.map(b => b.id);
      const { data: dropoffs } = await supabase
        .from('trip_bins')
        .select('bin_id, trips!inner(completed_at, trip_date)')
        .eq('action', 'dropoff')
        .eq('trips.status', 'completed')
        .is('removed_at', null)
        .in('bin_id', binIds)
        .order('trips(completed_at)', { ascending: false });

      const lastDropoffMap: Record<string, string> = {};
      for (const row of (dropoffs ?? []) as unknown as { bin_id: string; trips: { completed_at: string | null; trip_date: string | null } }[]) {
        if (!lastDropoffMap[row.bin_id]) {
          const ref = row.trips?.trip_date ?? row.trips?.completed_at?.slice(0, 10);
          if (ref) lastDropoffMap[row.bin_id] = ref;
        }
      }

      // 3. Last completed collection trip per customer
      const { data: collections } = await supabase
        .from('trips')
        .select('customer_id, trip_date, completed_at')
        .eq('status', 'completed')
        .eq('trip_type', 'collection')
        .not('customer_id', 'is', null)
        .order('trip_date', { ascending: false, nullsFirst: false });

      const lastCollectionMap: Record<number, string> = {};
      for (const trip of (collections ?? []) as { customer_id: number; trip_date: string | null; completed_at: string | null }[]) {
        if (!lastCollectionMap[trip.customer_id]) {
          const date = trip.trip_date ?? trip.completed_at?.slice(0, 10);
          if (date) lastCollectionMap[trip.customer_id] = date;
        }
      }

      // 4. Aggregate by customer
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const customerMap: Record<number, { name: string; days: number[]; rented: number }> = {};

      for (const bin of typed) {
        const customerId = bin.customer_location_id
          ? bin.customer_locations?.customer_id ?? null
          : bin.customer_id;
        const customerName = bin.customer_location_id
          ? bin.customer_locations?.customers?.name ?? null
          : bin.customers?.name ?? null;

        if (!customerId || !customerName) continue;

        const lastDropoff = lastDropoffMap[bin.id];
        const days = lastDropoff
          ? Math.floor((today.getTime() - new Date(lastDropoff).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        if (!customerMap[customerId]) {
          customerMap[customerId] = { name: customerName, days: [], rented: 0 };
        }
        customerMap[customerId].days.push(days);
        if (bin.status === 'rented') customerMap[customerId].rented++;
      }

      const result: CustomerAgingRow[] = Object.entries(customerMap).map(([idStr, data]) => {
        const cid = parseInt(idStr, 10);
        const totalDays = data.days.reduce((s, d) => s + d, 0);
        return {
          customer_id: cid,
          customer_name: data.name,
          bin_count: data.days.length,
          oldest_days: Math.max(...data.days),
          avg_days: Math.round(totalDays / data.days.length),
          rented_count: data.rented,
          last_collection_date: lastCollectionMap[cid] ?? null,
        };
      });

      result.sort((a, b) => b.oldest_days - a.oldest_days);
      setRows(result);
      setLoading(false);
    };

    load();
  }, []);

  const totals = useMemo(() => {
    const totalBins = rows.reduce((s, r) => s + r.bin_count, 0);
    const weightedAvg = totalBins > 0
      ? Math.round(rows.reduce((s, r) => s + r.avg_days * r.bin_count, 0) / totalBins)
      : 0;
    return {
      totalBins,
      totalCustomers: rows.length,
      oldestDays: rows.length > 0 ? rows[0].oldest_days : 0,
      avgDays: weightedAvg,
    };
  }, [rows]);

  return (
    <main className="bg-white text-gray-900 min-h-screen p-8">
      <div className="max-w-5xl mx-auto">

        <div className="mb-6">
          <h1 className="text-xl font-semibold">Bin Aging</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Bins currently at customer sites — days since last dropoff, grouped by customer
          </p>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Total Bins Out</p>
                <p className="text-lg font-semibold">{totals.totalBins}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Customers</p>
                <p className="text-lg font-semibold">{totals.totalCustomers}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Oldest Bin</p>
                <p className="text-lg font-semibold">{totals.oldestDays > 0 ? `${totals.oldestDays}d` : '—'}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Fleet Avg Days</p>
                <p className="text-lg font-semibold">{totals.avgDays > 0 ? `${totals.avgDays}d` : '—'}</p>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-gray-400">No bins currently at customer sites.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      <th className="text-left pb-2 pr-6">Customer</th>
                      <th className="text-right pb-2 pr-6 whitespace-nowrap">Bins at Site</th>
                      <th className="text-right pb-2 pr-6 whitespace-nowrap">Oldest (days)</th>
                      <th className="text-right pb-2 pr-6 whitespace-nowrap">Avg (days)</th>
                      <th className="text-right pb-2 pr-6 whitespace-nowrap">Rented</th>
                      <th className="text-right pb-2 whitespace-nowrap">Last Collection</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(r => (
                      <tr key={r.customer_id} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-6 font-medium">{r.customer_name}</td>
                        <td className="py-2.5 pr-6 text-right tabular-nums">{r.bin_count}</td>
                        <td className="py-2.5 pr-6 text-right tabular-nums">
                          <span className={
                            r.oldest_days >= 30 ? 'text-red-600 font-semibold' :
                            r.oldest_days >= 14 ? 'text-orange-500 font-medium' :
                            'text-gray-700'
                          }>
                            {r.oldest_days}
                          </span>
                        </td>
                        <td className="py-2.5 pr-6 text-right tabular-nums text-gray-600">{r.avg_days}</td>
                        <td className="py-2.5 pr-6 text-right tabular-nums text-gray-500">
                          {r.rented_count > 0 ? r.rented_count : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 text-right text-gray-500 whitespace-nowrap">{fmtDate(r.last_collection_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
