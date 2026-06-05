'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type AnalyticsRow = {
  location_id: number;
  location_name: string;
  customer_name: string;
  bins_at_site: number;
  oldest_days: number | null;
  issues_this_week: number;
  issues_this_month: number;
  swaps_this_week: number;
  swaps_this_month: number;
  avg_swap_days: number | null;
};

type SortCol = 'bins' | 'oldest' | 'swaps' | 'issues' | 'avg';

function oldestColor(days: number): string {
  if (days >= 14) return 'text-red-600';
  if (days >= 7)  return 'text-orange-500';
  return 'text-green-600';
}

export default function AnalyticsPage() {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [sortCol, setSortCol] = useState<SortCol>('bins');

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

  const siteVal = (row: AnalyticsRow): number => {
    if (sortCol === 'bins')    return row.bins_at_site;
    if (sortCol === 'oldest')  return row.oldest_days ?? -1;
    if (sortCol === 'swaps')   return row[swapCol]  as number;
    if (sortCol === 'issues')  return row[issueCol] as number;
    return row.avg_swap_days ?? -1;
  };

  const siteCmp = (a: AnalyticsRow, b: AnalyticsRow) =>
    sortCol === 'avg' || sortCol === 'oldest'
      ? siteVal(a) - siteVal(b)
      : siteVal(b) - siteVal(a);

  // Group sites by customer
  const grouped: Record<string, AnalyticsRow[]> = {};
  for (const row of rows) {
    if (!grouped[row.customer_name]) grouped[row.customer_name] = [];
    grouped[row.customer_name].push(row);
  }
  for (const sites of Object.values(grouped)) sites.sort(siteCmp);

  // Sort customer groups by their aggregate
  const customerOrder = Object.keys(grouped).sort((a, b) => {
    const aRows = grouped[a];
    const bRows = grouped[b];
    if (sortCol === 'avg') {
      const vals = (r: AnalyticsRow[]) => r.filter(x => x.avg_swap_days !== null).map(x => x.avg_swap_days as number);
      const avg = (v: number[]) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : -1;
      return avg(vals(aRows)) - avg(vals(bRows));
    }
    if (sortCol === 'oldest') {
      const max = (r: AnalyticsRow[]) => Math.max(...r.map(x => x.oldest_days ?? -1));
      return max(bRows) - max(aRows);
    }
    const sum = (r: AnalyticsRow[]) => r.reduce((s, x) => s + siteVal(x), 0);
    return sum(bRows) - sum(aRows);
  });

  const colHeader = (label: string, col: SortCol, asc = false) => (
    <th
      className="text-right px-4 py-3 font-medium w-24 cursor-pointer hover:text-blue-600 select-none whitespace-nowrap"
      onClick={() => setSortCol(col)}
    >
      {label}{sortCol === col ? (asc ? ' ↑' : ' ↓') : ''}
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
        Bins Now = bins currently at site. Oldest = days since the longest-sitting bin arrived.
        Issues = dropoffs + roundtrips. Swaps = collections + roundtrips. Avg Swap = all-time avg days at site. Click headers to sort.
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
                {colHeader('Bins Now', 'bins')}
                {colHeader('Oldest',   'oldest', true)}
                {colHeader('Issues',   'issues')}
                {colHeader('Swaps',    'swaps')}
                {colHeader('Avg Swap', 'avg',    true)}
              </tr>
            </thead>
            <tbody>
              {customerOrder.map(customer => {
                const sites = grouped[customer];
                return (
                  <>
                    <tr key={`customer-${customer}`} className="bg-gray-50 border-b border-t">
                      <td colSpan={6} className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                        {customer}
                      </td>
                    </tr>
                    {sites.map(row => (
                      <tr key={row.location_id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 pl-7 text-gray-800">{row.location_name}</td>

                        {/* Bins at site now */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.bins_at_site > 0
                            ? <span className="font-semibold text-gray-800">{row.bins_at_site}</span>
                            : <span className="text-gray-300">0</span>}
                        </td>

                        {/* Oldest bin days */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.oldest_days !== null
                            ? <span className={`font-semibold ${oldestColor(row.oldest_days)}`}>{row.oldest_days}d</span>
                            : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Issues this period */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {(row[issueCol] as number) > 0
                            ? <span className="font-semibold text-blue-700">{row[issueCol]}</span>
                            : <span className="text-gray-300">0</span>}
                        </td>

                        {/* Swaps this period */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {(row[swapCol] as number) > 0
                            ? <span className="font-semibold text-orange-600">{row[swapCol]}</span>
                            : <span className="text-gray-300">0</span>}
                        </td>

                        {/* Avg swap days */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.avg_swap_days !== null
                            ? <span className={`font-semibold ${oldestColor(row.avg_swap_days)}`}>
                                {Number(row.avg_swap_days).toFixed(2)}d
                              </span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
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
