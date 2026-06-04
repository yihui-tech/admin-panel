'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type WeighBridgeRecord = {
  id: string;
  net_weight: number | null;
  rubbish_weight: number | null;
  foc_weight: number | null;
  material_type_ids: number[] | null;
  outbound_material_type_ids: number[] | null;
};

type TripReport = {
  id: string;
  trip_type: string | null;
  trip_date: string | null;
  created_at: string;
  vehicle_number: string | null;
  customer_id: number | null;
  dropoff_id: number | null;
  source_location_id: number | null;
  outbound_location_id: number | null;
  customers: { name: string } | null;
  outbound_locations: { name: string } | null;
  weigh_bridge: WeighBridgeRecord[];
};

type MaterialType = {
  id: number;
  name: string;
  category: string;
};

type CustomerOption = {
  customer_id: number;
  name: string;
};

type LocationOption = {
  id: number;
  name: string;
};

type MaterialFilter = null | 'inbound' | 'outbound' | number;

const formatKg = (val: number) =>
  `${val.toLocaleString('en-SG', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });

const parseMaterialFilter = (val: string): MaterialFilter => {
  if (!val) return null;
  if (val === 'inbound' || val === 'outbound') return val;
  return Number(val);
};

const tripNetWeight = (trip: TripReport) =>
  trip.weigh_bridge.reduce((sum, wb) => {
    const net = Math.abs(wb.net_weight ?? 0);
    return sum + (trip.trip_type === 'outbound' ? net : net - (wb.rubbish_weight ?? 0));
  }, 0);

const today = new Date();
const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const defaultTo = today.toISOString().slice(0, 10);

export default function ReportingPage() {
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>(null);
  const [customerFilter, setCustomerFilter] = useState<number | null>(null);
  const [yardFilter, setYardFilter] = useState<number | null>(null);
  const [trips, setTrips] = useState<TripReport[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('material_types').select('id, name, category').order('category').order('name'),
      supabase.from('customers').select('customer_id, name').order('name'),
      supabase.from('locations').select('id, name').order('name'),
    ]).then(([matRes, custRes, locRes]) => {
      if (matRes.data) setMaterialTypes(matRes.data);
      if (custRes.data) setCustomers(custRes.data);
      if (locRes.data) setLocations(locRes.data);
    });
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    supabase
      .from('trips')
      .select(`
        id,
        trip_type,
        trip_date,
        created_at,
        vehicle_number,
        customer_id,
        dropoff_id,
        source_location_id,
        outbound_location_id,
        customers(name),
        outbound_locations(name),
        weigh_bridge(id, net_weight, rubbish_weight, foc_weight, material_type_ids, outbound_material_type_ids)
      `)
      .eq('status', 'completed')
      .then(({ data, error }) => {
        console.log('[report] query result:', { count: data?.length, error, sample: (data ?? []).slice(0, 3).map((t: any) => ({ trip_type: t.trip_type, dropoff_id: t.dropoff_id, source_location_id: t.source_location_id })) });
        if (data) setTrips(data as unknown as TripReport[]);
        setLoading(false);
      });
  }, [fromDate, toDate]);

  const effectiveDate = (trip: TripReport) => trip.trip_date ?? trip.created_at.slice(0, 10);

  const tripYardId = (trip: TripReport): number | null =>
    trip.trip_type === 'outbound' ? trip.source_location_id : trip.dropoff_id;

  const matchesMaterialFilter = (trip: TripReport): WeighBridgeRecord[] | null => {
    const isOutboundTrip = trip.trip_type === 'outbound';
    if (materialFilter === 'inbound' && isOutboundTrip) return null;
    if (materialFilter === 'outbound' && !isOutboundTrip) return null;
    let wbs = trip.weigh_bridge;
    if (typeof materialFilter === 'number') {
      const mat = materialTypes.find(m => m.id === materialFilter);
      if (mat) {
        wbs = mat.category === 'inbound'
          ? wbs.filter(w => w.material_type_ids?.includes(materialFilter) ?? false)
          : wbs.filter(w => w.outbound_material_type_ids?.includes(materialFilter) ?? false);
      }
      if (wbs.length === 0) return null;
    }
    return wbs;
  };

  const withinRange = (trip: TripReport) => {
    const d = effectiveDate(trip);
    return d >= fromDate && d <= toDate;
  };

  // Filtered trips for the table (company filter: collection trips match company OR outbound always shown)
  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      if (!withinRange(trip)) return false;
      const isOutbound = trip.trip_type === 'outbound';
      if (yardFilter !== null && tripYardId(trip) !== yardFilter) return false;
      if (customerFilter !== null && trip.customer_id !== customerFilter) return false;
      return matchesMaterialFilter(trip) !== null;
    });
  }, [trips, materialFilter, customerFilter, yardFilter, materialTypes, fromDate, toDate]);

  // Summary cards: company filter excludes outbound trips
  const stats = useMemo(() => {
    let totalTrips = 0;
    let inboundNet = 0;
    let focTotal = 0;
    let rubbishTotal = 0;
    let outboundTotal = 0;

    for (const trip of trips) {
      if (!withinRange(trip)) continue;
      if (yardFilter !== null && tripYardId(trip) !== yardFilter) continue;
      if (customerFilter !== null && trip.customer_id !== customerFilter) continue;
      const wbs = matchesMaterialFilter(trip);
      if (wbs === null) continue;
      totalTrips++;
      const isOutbound = trip.trip_type === 'outbound';
      for (const wb of wbs) {
        const net = Math.abs(wb.net_weight ?? 0);
        const rubbish = wb.rubbish_weight ?? 0;
        if (isOutbound) { outboundTotal += net; } else { inboundNet += net - rubbish; }
        focTotal += wb.foc_weight ?? 0;
        rubbishTotal += rubbish;
      }
    }
    return { totalTrips, inboundNet, outboundTotal, focTotal, rubbishTotal };
  }, [trips, materialFilter, customerFilter, yardFilter, materialTypes, fromDate, toDate]);

  // Grouped table (all companies): one row per date + company/destination
  const groupedRows = useMemo(() => {
    if (customerFilter !== null) return null;
    const groups: Record<string, { date: string; name: string; isOutbound: boolean; tripCount: number; totalWeight: number }> = {};
    for (const trip of filteredTrips) {
      const date = effectiveDate(trip);
      const isOutbound = trip.trip_type === 'outbound';
      const name = isOutbound
        ? (trip.outbound_locations?.name ?? 'Unknown destination')
        : (trip.customers?.name ?? 'Unknown company');
      const key = `${date}_${isOutbound ? 'out_' + (trip.outbound_location_id ?? 'x') : 'in_' + (trip.customer_id ?? 'x')}`;
      if (!groups[key]) groups[key] = { date, name, isOutbound, tripCount: 0, totalWeight: 0 };
      groups[key].tripCount++;
      groups[key].totalWeight += tripNetWeight(trip);
    }
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }, [filteredTrips, customerFilter]);

  // Individual trip rows (specific company selected)
  const tripRows = useMemo(() => {
    if (customerFilter === null) return null;
    return [...filteredTrips].sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)));
  }, [filteredTrips, customerFilter]);

  const inboundMaterials = materialTypes.filter(m => m.category === 'inbound');
  const outboundMaterials = materialTypes.filter(m => m.category === 'outbound');

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Reporting</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-8 p-4 bg-gray-50 border rounded-lg">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
          <select
            value={customerFilter ?? ''}
            onChange={e => setCustomerFilter(e.target.value ? Number(e.target.value) : null)}
            className="border rounded px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">All companies</option>
            {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Yard</label>
          <select
            value={yardFilter ?? ''}
            onChange={e => setYardFilter(e.target.value ? Number(e.target.value) : null)}
            className="border rounded px-3 py-2 text-sm min-w-[160px]"
          >
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
          <select
            value={materialFilter === null ? '' : String(materialFilter)}
            onChange={e => setMaterialFilter(parseMaterialFilter(e.target.value))}
            className="border rounded px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">All</option>
            <option value="inbound">All Inbound</option>
            <option value="outbound">All Outbound</option>
            {inboundMaterials.length > 0 && (
              <optgroup label="Inbound">
                {inboundMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
            {outboundMaterials.length > 0 && (
              <optgroup label="Outbound">
                {outboundMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        {loading && <span className="text-sm text-gray-400 pb-2">Loading…</span>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Trips</div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalTrips}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Inbound Net</div>
          <div className="text-lg font-bold text-gray-900">{formatKg(stats.inboundNet)}</div>
          <div className="text-xs text-gray-400 mt-1">After rubbish deduction</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Outbound Net</div>
          <div className="text-lg font-bold text-gray-900">{formatKg(stats.outboundTotal)}</div>
          <div className="text-xs text-gray-400 mt-1">All destinations</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">FOC Weight</div>
          <div className="text-lg font-bold text-gray-900">{formatKg(stats.focTotal)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rubbish Weight</div>
          <div className="text-lg font-bold text-gray-900">{formatKg(stats.rubbishTotal)}</div>
        </div>
      </div>

      {/* Table: grouped by date+company when no filter, individual trips when company selected */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {customerFilter === null ? 'Summary by Company & Date' : 'Trips'}
          </h2>
          <span className="text-sm text-gray-500">
            {customerFilter === null
              ? `${filteredTrips.length} trips`
              : `${tripRows?.length ?? 0} trips`}
          </span>
        </div>

        {/* All companies: grouped view */}
        {groupedRows !== null && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company / Destination</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Trips</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Net Weight</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center px-4 py-6 text-gray-400">No trips for this period</td></tr>
              ) : (
                groupedRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.isOutbound ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {row.isOutbound ? 'Outbound' : 'Collection'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.tripCount}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.totalWeight > 0 ? formatKg(row.totalWeight) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Specific company: individual trip view */}
        {tripRows !== null && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company / Destination</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vehicle</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Net Weight</th>
              </tr>
            </thead>
            <tbody>
              {tripRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center px-4 py-6 text-gray-400">No trips for this period</td></tr>
              ) : (
                tripRows.map(trip => {
                  const isOutbound = trip.trip_type === 'outbound';
                  const weight = tripNetWeight(trip);
                  return (
                    <tr key={trip.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(effectiveDate(trip))}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${isOutbound ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {isOutbound ? 'Outbound' : 'Collection'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {isOutbound ? (trip.outbound_locations?.name ?? '—') : (trip.customers?.name ?? '—')}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{trip.vehicle_number ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {weight > 0 ? formatKg(weight) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
