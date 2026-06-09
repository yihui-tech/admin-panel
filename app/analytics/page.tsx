'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type AnalyticsRow = {
  location_id: number;
  location_name: string;
  customer_name: string;
  bin_serials: string[];
  oldest_days: number | null;
  issues_in_range: number;
  swaps_in_range: number;
  avg_swap_days: number | null;
};

type SortCol = 'bins' | 'oldest' | 'swaps' | 'issues' | 'avg';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}
function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function weekStartStr(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}

function ageColor(days: number): string {
  if (days >= 14) return 'text-red-600';
  if (days >= 7)  return 'text-orange-500';
  return 'text-green-600';
}

const QUICK: { label: string; from: () => string; to: () => string }[] = [
  { label: 'This week',  from: weekStartStr,  to: todayStr },
  { label: 'This month', from: monthStartStr, to: todayStr },
];

export default function AnalyticsPage() {
  const [rows, setRows]         = useState<AnalyticsRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [fromDate, setFromDate] = useState(monthStartStr());
  const [toDate, setToDate]     = useState(todayStr());
  const [sortCol, setSortCol]   = useState<SortCol>('bins');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('bin_analytics', {
        from_date: fromDate,
        to_date:   toDate,
      });
      if (error) console.error('bin_analytics RPC error:', error);
      setRows((data ?? []) as AnalyticsRow[]);
      setLoading(false);
    };
    fetchData();
  }, [fromDate, toDate]);

  const siteVal = (row: AnalyticsRow): number => {
    if (sortCol === 'bins')   return row.bin_serials.length;
    if (sortCol === 'oldest') return row.oldest_days ?? -1;
    if (sortCol === 'swaps')  return row.swaps_in_range;
    if (sortCol === 'issues') return row.issues_in_range;
    return row.avg_swap_days ?? -1;
  };

  const siteCmp = (a: AnalyticsRow, b: AnalyticsRow) =>
    sortCol === 'avg' || sortCol === 'oldest'
      ? siteVal(a) - siteVal(b)
      : siteVal(b) - siteVal(a);

  const grouped: Record<string, AnalyticsRow[]> = {};
  for (const row of rows) {
    if (!grouped[row.customer_name]) grouped[row.customer_name] = [];
    grouped[row.customer_name].push(row);
  }
  for (const sites of Object.values(grouped)) sites.sort(siteCmp);

  const customerOrder = Object.keys(grouped).sort((a, b) => {
    const aRows = grouped[a];
    const bRows = grouped[b];
    if (sortCol === 'avg') {
      const avg = (r: AnalyticsRow[]) => {
        const v = r.filter(x => x.avg_swap_days !== null).map(x => x.avg_swap_days as number);
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : -1;
      };
      return avg(aRows) - avg(bRows);
    }
    if (sortCol === 'oldest') {
      return Math.max(...bRows.map(x => x.oldest_days ?? -1)) - Math.max(...aRows.map(x => x.oldest_days ?? -1));
    }
    return bRows.reduce((s, r) => s + siteVal(r), 0) - aRows.reduce((s, r) => s + siteVal(r), 0);
  });

  const colHeader = (label: string, col: SortCol, asc = false) => (
    <th
      className="text-right px-4 py-3 font-medium cursor-pointer hover:text-blue-600 select-none whitespace-nowrap"
      onClick={() => setSortCol(col)}
    >
      {label}{sortCol === col ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bin Analytics</h1>
      </div>

      {/* Date range picker */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm text-gray-700"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm text-gray-700"
          />
        </div>
        <div className="flex border rounded overflow-hidden">
          {QUICK.map(q => (
            <button
              key={q.label}
              onClick={() => { setFromDate(q.from()); setToDate(q.to()); }}
              className={`px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 ${fromDate === q.from() && toDate === q.to() ? 'bg-blue-50 text-blue-700' : ''}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-base font-semibold mb-1 text-gray-700">Activity by Customer Site</h2>
      <p className="text-xs text-gray-400 mb-4">
        Bins Now = bins currently at site. Oldest = days since longest-sitting bin arrived.
        Issues = dropoffs + roundtrips. Swaps = collections + roundtrips. Avg Swap = all-time avg turnaround. Click headers to sort.
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
              {customerOrder.map(customer => (
                <>
                  <tr key={`h-${customer}`} className="bg-gray-50 border-b border-t">
                    <td colSpan={6} className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                      {customer}
                    </td>
                  </tr>
                  {grouped[customer].map(row => {
                    const serials = row.bin_serials ?? [];
                    const SHOW = 4;
                    const isExpanded = expanded[row.location_id];
                    const visible = isExpanded ? serials : serials.slice(0, SHOW);
                    const extra = serials.length - SHOW;
                    return (
                      <tr key={row.location_id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                        <td className="px-4 py-2.5 pl-7 text-gray-800">{row.location_name}</td>

                        {/* Bins at site — serial number badges */}
                        <td className="px-4 py-2.5 text-right">
                          {serials.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="flex flex-wrap justify-end gap-1">
                              {visible.map(s => (
                                <span key={s} className="inline-block bg-blue-50 text-blue-700 text-xs font-medium px-1.5 py-0.5 rounded">
                                  {s}
                                </span>
                              ))}
                              {!isExpanded && extra > 0 && (
                                <button
                                  onClick={() => setExpanded(e => ({ ...e, [row.location_id]: true }))}
                                  className="text-xs text-gray-400 hover:text-blue-600"
                                >
                                  +{extra} more
                                </button>
                              )}
                              {isExpanded && extra > 0 && (
                                <button
                                  onClick={() => setExpanded(e => ({ ...e, [row.location_id]: false }))}
                                  className="text-xs text-gray-400 hover:text-blue-600"
                                >
                                  less
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Oldest */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.oldest_days !== null
                            ? <span className={`font-semibold ${ageColor(row.oldest_days)}`}>{row.oldest_days}d</span>
                            : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Issues */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.issues_in_range > 0
                            ? <span className="font-semibold text-blue-700">{row.issues_in_range}</span>
                            : <span className="text-gray-300">0</span>}
                        </td>

                        {/* Swaps */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.swaps_in_range > 0
                            ? <span className="font-semibold text-orange-600">{row.swaps_in_range}</span>
                            : <span className="text-gray-300">0</span>}
                        </td>

                        {/* Avg swap */}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.avg_swap_days !== null
                            ? <span className={`font-semibold ${ageColor(row.avg_swap_days)}`}>
                                {Number(row.avg_swap_days).toFixed(2)}d
                              </span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
