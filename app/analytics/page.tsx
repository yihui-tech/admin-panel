'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type AnalyticsRow = {
  location_id: number;
  location_name: string;
  customer_name: string;
  dropoffs_this_week: number;
  dropoffs_this_month: number;
};

function startOfWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday
  return d.toISOString();
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function AnalyticsPage() {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const weekStart = startOfWeek();
      const monthStart = startOfMonth();

      const [locResult, dropoffResult] = await Promise.all([
        supabase
          .from('customer_locations')
          .select('id, name, customer_id, customers!inner(name)')
          .order('name'),
        supabase
          .from('trip_bins')
          .select('trips!inner(customer_location_id, completed_at, status)')
          .eq('action', 'dropoff')
          .eq('trips.status', 'completed'),
      ]);

      const allLocations = (locResult.data ?? []) as unknown as {
        id: number;
        name: string;
        customer_id: number;
        customers: { name: string };
      }[];

      const dropoffList = (dropoffResult.data ?? []) as unknown as {
        trips: { customer_location_id: number | null; completed_at: string | null };
      }[];

      const result: AnalyticsRow[] = allLocations.map(loc => {
        const relevant = dropoffList.filter(d => d.trips?.customer_location_id === loc.id);
        return {
          location_id: loc.id,
          location_name: loc.name,
          customer_name: loc.customers.name,
          dropoffs_this_week: relevant.filter(d => d.trips?.completed_at && d.trips.completed_at >= weekStart).length,
          dropoffs_this_month: relevant.filter(d => d.trips?.completed_at && d.trips.completed_at >= monthStart).length,
        };
      });

      result.sort((a, b) =>
        period === 'week'
          ? b.dropoffs_this_week - a.dropoffs_this_week
          : b.dropoffs_this_month - a.dropoffs_this_month
      );

      setRows(result);
      setLoading(false);
    };

    fetchData();
  }, [period]);

  const activeCol: keyof AnalyticsRow = period === 'week' ? 'dropoffs_this_week' : 'dropoffs_this_month';
  const max = Math.max(...rows.map(r => r[activeCol] as number), 1);

  return (
    <main className="max-w-4xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex border rounded overflow-hidden">
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium ${period === p ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              This {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-base font-semibold mb-3 text-gray-700">Bin Dropoffs by Customer Site</h2>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No customer sites configured yet. Add sites from the Customers page.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Site</th>
                <th className="text-right px-4 py-3 font-medium w-32">
                  {period === 'week' ? 'This Week' : 'This Month'}
                </th>
                <th className="px-4 py-3 w-48"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const count = row[activeCol] as number;
                const barWidth = Math.round((count / max) * 100);
                return (
                  <tr key={row.location_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{row.customer_name}</td>
                    <td className="px-4 py-3 font-medium">{row.location_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {count > 0 ? (
                        <span className="font-semibold text-gray-800">{count}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {count > 0 && (
                        <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                          <div className="h-2 rounded-full bg-blue-500" style={{ width: `${barWidth}%` }} />
                        </div>
                      )}
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
