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
  outbound_location_id: number | null;
  outbound_locations: { name: string } | null;
  weigh_bridge: WeighBridgeRecord[];
};

type MaterialType = {
  id: number;
  name: string;
  category: string;
};

type MaterialFilter = null | 'inbound' | 'outbound' | number;

const formatKg = (val: number) =>
  `${val.toLocaleString('en-SG', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

const parseMaterialFilter = (val: string): MaterialFilter => {
  if (!val) return null;
  if (val === 'inbound' || val === 'outbound') return val;
  return Number(val);
};

const today = new Date();
const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const defaultTo = today.toISOString().slice(0, 10);

export default function ReportingPage() {
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>(null);
  const [trips, setTrips] = useState<TripReport[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('material_types')
      .select('id, name, category')
      .order('category')
      .order('name')
      .then(({ data }) => { if (data) setMaterialTypes(data); });
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
        outbound_location_id,
        outbound_locations(name),
        weigh_bridge(id, net_weight, rubbish_weight, foc_weight, material_type_ids, outbound_material_type_ids)
      `)
      .eq('status', 'completed')
      .then(({ data }) => {
        if (data) setTrips(data as unknown as TripReport[]);
        setLoading(false);
      });
  }, [fromDate, toDate]);

  const stats = useMemo(() => {
    let totalTrips = 0;
    let inboundNet = 0;
    let focTotal = 0;
    let rubbishTotal = 0;
    const outboundByDest: Record<string, { name: string; weight: number }> = {};

    for (const trip of trips) {
      // Use trip_date when set; fall back to created_at date for older trips
      const effectiveDate = trip.trip_date ?? trip.created_at.slice(0, 10);
      if (effectiveDate < fromDate || effectiveDate > toDate) continue;

      const isOutboundTrip = trip.trip_type === 'outbound';

      if (materialFilter === 'inbound' && isOutboundTrip) continue;
      if (materialFilter === 'outbound' && !isOutboundTrip) continue;

      let wbs: WeighBridgeRecord[] = trip.weigh_bridge;
      if (typeof materialFilter === 'number') {
        const mat = materialTypes.find(m => m.id === materialFilter);
        if (mat) {
          wbs = mat.category === 'inbound'
            ? wbs.filter(w => w.material_type_ids?.includes(materialFilter) ?? false)
            : wbs.filter(w => w.outbound_material_type_ids?.includes(materialFilter) ?? false);
        }
        if (wbs.length === 0) continue;
      }

      totalTrips++;

      for (const wb of wbs) {
        const net = Math.abs(wb.net_weight ?? 0);
        const rubbish = wb.rubbish_weight ?? 0;
        const foc = wb.foc_weight ?? 0;

        if (isOutboundTrip) {
          const key = String(trip.outbound_location_id ?? 'unknown');
          const name = trip.outbound_locations?.name ?? 'Unknown destination';
          if (!outboundByDest[key]) outboundByDest[key] = { name, weight: 0 };
          outboundByDest[key].weight += net;
        } else {
          inboundNet += net - rubbish;
        }

        focTotal += foc;
        rubbishTotal += rubbish;
      }
    }

    const outboundRows = Object.values(outboundByDest).sort((a, b) => b.weight - a.weight);
    const outboundTotal = outboundRows.reduce((s, r) => s + r.weight, 0);
    return { totalTrips, inboundNet, focTotal, rubbishTotal, outboundRows, outboundTotal };
  }, [trips, materialFilter, materialTypes]);

  const inboundMaterials = materialTypes.filter(m => m.category === 'inbound');
  const outboundMaterials = materialTypes.filter(m => m.category === 'outbound');

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Reporting</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-8 p-4 bg-gray-50 border rounded-lg">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
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

      {/* Outbound by destination */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Outbound Goods by Destination</h2>
          {stats.outboundRows.length > 0 && (
            <span className="text-sm font-semibold text-gray-900">{formatKg(stats.outboundTotal)} total</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Destination</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Weight</th>
            </tr>
          </thead>
          <tbody>
            {stats.outboundRows.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center px-4 py-6 text-gray-400">
                  No outbound data for this period
                </td>
              </tr>
            ) : (
              stats.outboundRows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatKg(row.weight)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
