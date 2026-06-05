'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type AnalyticsRow = {
  location_id: number;
  location_name: string;
  customer_name: string;
  issues_this_week: number;
  issues_this_month: number;
  swaps_this_week: number;
  swaps_this_month: number;
  avg_swap_days: number | null;
};

type SortCol = 'swaps' | 'issues' | 'avg';

export default function AnalyticsPage() {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [sortCol, setSortCol] = useState<SortCol>('swaps');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('bin_analytics');
      if (error) console.error('bin_analytics RPC error:', error);
      setRows((data ?? []) as AnalyticsRow[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const swapCol: keyof AnalyticsRow  = period === 'week' ? 'swaps_this_week'  : 'swaps_this_month';
  const issueCol: keyof AnalyticsRow = period === 'week' ? 'issues_this_week' : 'issues_this_month';

  const siteVal = (row: AnalyticsRow): number =>
    sortCol === 'swaps'  ? (row[swapCol]  as number) :
    sortCol === 'issues' ? (row[issueCol] as number) :
    row.avg_swap_days ?? Infinity;

  // Group sites by customer
  const grouped: Record<string, AnalyticsRow[]> = {};
  for (const row of rows) {
    if (!grouped[row.customer_name]) grouped[row.customer_name] = [];
    grouped[row.customer_name].push(row);
  }

  // Sort sites within each customer by selected column
  for (const sites of Object.values(grouped)) {
    sites.sort((a, b) =>
      sortCol === 'avg'
        ? (a.avg_swap_days ?? Infinity) - (b.avg_swap_days ?? Infinity)
        : (b[swapCol] as number) - (a[swapCol] as number)
    );
  }

  // Sort customer groups by their aggregate (sum for issues/swaps, avg for avg)
  const customerOrder = Object.keys(grouped).sort((a, b) => {
    const aRows = grouped[a];
    const bRows = grouped[b];
    if (sortCol === 'avg') {
      const aAvg = aRows.filter(r => r.avg_swap_days !== null).map(r => r.avg_swap_days as number);
      const bAvg = bRows.filter(r => r.avg_swap_days !== null).map(r => r.avg_swap_days as number);
      const aVal = aAvg.length ? aAvg.reduce((s, v) => s + v, 0) / aAvg.length : Infinity;
      const bVal = bAvg.length ? bAvg.reduce((s, v) => s + v, 0) / bAvg.length : Infinity;
      return aVal - bVal;
    }
    const aTotal = aRows.reduce((s, r) => s + siteVal(r), 0);
    const bTotal = bRows.reduce((s, r) => s + siteVal(r), 0);
    return bTotal - aTotal;
  });

  const colHeader = (label: string, col: SortCol) => (
    <th
      className="text-right px-4 py-3 font-medium w-28 cursor-pointer hover:text-blue-600 select-none"
      onClick={() => setSortCol(col)}
    >
      {label}{sortCol === col ? (col === 'avg' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bin Analytics</h1>
        <div className="flex border rounded overflow-hidden">
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium ${period === p ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              This {p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-base font-semibold mb-1 text-gray-700">Activity by Customer Site</h2>
      <p className="text-xs text-gray-400 mb-4">
        Issues = bins dropped off or roundtripped. Swaps = bins collected or roundtripped. Avg Swap = avg days at site before collection (all-time). Click column headers to sort.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No customer sites configured yet.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Site</th>
                {colHeader('Issues',   'issues')}
                {colHeader('Swaps',    'swaps')}
                {colHeader('Avg Swap', 'avg')}
              </tr>
            </thead>
            <tbody>
              {customerOrder.map(customer => {
                const sites = grouped[customer];
                return (
                  <>
                    {/* Customer header row */}
                    <tr key={`customer-${customer}`} className="bg-gray-50 border-b border-t">
                      <td colSpan={4} className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                        {customer}
                      </td>
                    </tr>
                    {/* Site rows */}
                    {sites.map(row => {
                      const swapCount  = row[swapCol]  as number;
                      const issueCount = row[issueCol] as number;
                      return (
                        <tr key={row.location_id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5 pl-7 text-gray-800">{row.location_name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {issueCount > 0
                              ? <span className="font-semibold text-blue-700">{issueCount}</span>
                              : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {swapCount > 0
                              ? <span className="font-semibold text-orange-600">{swapCount}</span>
                              : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.avg_swap_days !== null
                              ? <span className={`font-semibold ${row.avg_swap_days >= 14 ? 'text-red-600' : row.avg_swap_days >= 7 ? 'text-orange-500' : 'text-green-600'}`}>
                                  {Number(row.avg_swap_days).toFixed(2)}d
                                </span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
