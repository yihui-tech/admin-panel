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

  const sorted = [...rows].sort((a, b) => {
    if (sortCol === 'swaps')  return (b[swapCol]  as number) - (a[swapCol]  as number);
    if (sortCol === 'issues') return (b[issueCol] as number) - (a[issueCol] as number);
    return (a.avg_swap_days ?? Infinity) - (b.avg_swap_days ?? Infinity);
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
        Issues = bins dropped off. Swaps = bins collected. Avg Swap = avg days a bin stayed at site before collection (all-time). Click column headers to sort.
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
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Site</th>
                {colHeader('Issues',   'issues')}
                {colHeader('Swaps',    'swaps')}
                {colHeader('Avg Swap', 'avg')}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const swapCount  = row[swapCol]  as number;
                const issueCount = row[issueCol] as number;
                return (
                  <tr key={row.location_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{row.customer_name}</td>
                    <td className="px-4 py-3 font-medium">{row.location_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {issueCount > 0
                        ? <span className="font-semibold text-blue-700">{issueCount}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {swapCount > 0
                        ? <span className="font-semibold text-orange-600">{swapCount}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.avg_swap_days !== null
                        ? <span className={`font-semibold ${row.avg_swap_days >= 14 ? 'text-red-600' : row.avg_swap_days >= 7 ? 'text-orange-500' : 'text-green-600'}`}>
                            {row.avg_swap_days}d
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
