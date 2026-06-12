'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { AlertTriangle, CheckCircle, WifiOff, MapPin, Car } from 'lucide-react';

type DriverRow = {
  worker_id: string;
  employee_name: string;
  work_date: string;
  adj_time_out: string | null;
  vehicle_plate: string | null;
  trip_start_ts: string | null;
  trip_end_ts: string | null;
  trip_start_location: string | null;
  trip_end_location: string | null;
  no_vehicle: boolean;
  no_cartrack: boolean;
  has_ot: boolean;
  ot_hours: number | null;
};

type Status = 'has_ot' | 'no_vehicle' | 'no_cartrack' | 'ok';

function getStatus(r: DriverRow): Status {
  if (r.no_vehicle)  return 'no_vehicle';
  if (r.no_cartrack) return 'no_cartrack';
  if (r.has_ot)      return 'has_ot';
  return 'ok';
}

const STATUS_LABEL: Record<Status, { label: string; className: string; icon: React.ReactNode }> = {
  has_ot:      { label: 'OT — review location', className: 'text-orange-500', icon: <AlertTriangle size={11} /> },
  no_vehicle:  { label: 'No vehicle',            className: 'text-gray-400',  icon: <Car size={11} /> },
  no_cartrack: { label: 'No tracker data',       className: 'text-gray-400',  icon: <WifiOff size={11} /> },
  ok:          { label: 'OK',                    className: 'text-green-600', icon: <CheckCircle size={11} /> },
};

function toMonthValue(d: Date) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function monthToFirstDay(ym: string) {
  return `${ym}-01`;
}

export default function DriverLocationPage() {
  const [month, setMonth] = useState(() => toMonthValue(new Date()));
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('driver_location_report', {
        p_month: monthToFirstDay(month),
      });
      if (error) setError(error.message);
      else setRows((data as DriverRow[]) ?? []);
      setLoading(false);
    };
    load();
  }, [month]);

  const drivers = useMemo(() => [...new Set(rows.map(r => r.employee_name))].sort(), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (driverFilter && r.employee_name !== driverFilter) return false;
    if (statusFilter && getStatus(r) !== statusFilter) return false;
    return true;
  }), [rows, driverFilter, statusFilter]);

  const counts = useMemo(() => {
    const c = { has_ot: 0, no_vehicle: 0, no_cartrack: 0, ok: 0 };
    for (const r of rows) c[getStatus(r)]++;
    return c;
  }, [rows]);

  return (
    <main className="bg-white text-gray-900 min-h-screen p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Driver Location at Checkout</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Last CarTrack trip per driver relative to their adjusted clock-out time
            </p>
          </div>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
        </div>

        {loading && <p className="text-sm text-gray-400">Loading...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-gray-400">No timesheet records found for this month.</p>
        )}

        {!loading && rows.length > 0 && (
          <>
            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 mb-5">
              {/* Needs Review chip — always visible */}
              {(() => {
                const { label, icon } = STATUS_LABEL['has_ot'];
                const count = counts['has_ot'];
                return (
                  <button
                    onClick={() => setStatusFilter(prev => prev === 'has_ot' ? '' : 'has_ot')}
                    disabled={count === 0}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                      statusFilter === 'has_ot'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : count === 0
                          ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-default'
                          : 'bg-orange-50 border-orange-300 text-orange-600 hover:border-orange-500'
                    }`}
                  >
                    {icon} {count} {label}
                  </button>
                );
              })()}
              {/* Other status chips — only shown when count > 0 */}
              {(['no_vehicle', 'no_cartrack', 'ok'] as Status[]).map(s => {
                const { label, className, icon } = STATUS_LABEL[s];
                const count = counts[s];
                if (!count) return null;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                      statusFilter === s
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-400 ' + className
                    }`}
                  >
                    {icon} {count} {label}
                  </button>
                );
              })}
              {(driverFilter || statusFilter) && (
                <button
                  onClick={() => { setDriverFilter(''); setStatusFilter(''); }}
                  className="text-xs text-gray-400 hover:text-gray-700 px-2"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Driver filter */}
            <div className="mb-4">
              <select
                value={driverFilter}
                onChange={e => setDriverFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-56"
              >
                <option value="">All drivers</option>
                {drivers.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">Date</th>
                    <th className="text-left pb-2 pr-4">Driver</th>
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">Vehicle</th>
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">Clock-out</th>
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">OT Hrs</th>
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">Trip Start</th>
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">Trip End</th>
                    <th className="text-left pb-2 pr-4">Start Location</th>
                    <th className="text-left pb-2 pr-4">End Location</th>
                    <th className="text-left pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r, i) => {
                    const status = getStatus(r);
                    const { label, className, icon } = STATUS_LABEL[status];
                    return (
                      <tr key={`${r.worker_id}-${r.work_date}-${i}`} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                          {new Date(r.work_date).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}
                        </td>
                        <td className="py-2.5 pr-4 font-medium">{r.employee_name}</td>
                        <td className="py-2.5 pr-4 text-gray-500">{r.vehicle_plate ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-700 whitespace-nowrap">
                          {r.adj_time_out?.slice(0, 5) ?? '—'}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {r.ot_hours ? (
                            <span className="text-orange-600 font-medium">{r.ot_hours}h</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-700 whitespace-nowrap">
                          {r.trip_start_ts
                            ? new Date(r.trip_start_ts).toLocaleTimeString('en-SG', {
                                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore',
                              })
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-700 whitespace-nowrap">
                          {r.trip_end_ts
                            ? new Date(r.trip_end_ts).toLocaleTimeString('en-SG', {
                                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore',
                              })
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-500 max-w-xs">
                          {r.trip_start_location
                            ? <span className="flex items-start gap-1">
                                <MapPin size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                                <span className="line-clamp-1">{r.trip_start_location}</span>
                              </span>
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-500 max-w-xs">
                          {r.trip_end_location
                            ? <span className="flex items-start gap-1">
                                <MapPin size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                                <span className="line-clamp-1">{r.trip_end_location}</span>
                              </span>
                            : '—'}
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}>
                            {icon} {label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 py-4">No records match the current filters.</p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
