'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check } from 'lucide-react';

type VehicleRow = {
  plate_number: string;
  vehicle_type: string | null;
  purpose: string | null;
  ownership_type: string | null;
  leasing_cost: number;
  depreciation: number;
  insurance_premium: number;
  road_tax: number;
  vpc_season_parking: number;
  total_litres: number;
  total_km: number;
};

type SaveStatus = 'idle' | 'saving' | 'saved';

function toMonthValue(d: Date) {
  return d.toISOString().slice(0, 7);
}

function fmt(n: number | null, decimals = 0): string {
  if (n === null || isNaN(n)) return '—';
  return n.toLocaleString('en-SG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PURPOSE_LABEL: Record<string, string> = {
  worker_transport: 'Worker Transport',
  related_company:  'Related Company',
  pending_sale:     'Pending Sale',
  spare:            'Spare',
};

export default function VehicleCostsPage() {
  const [month, setMonth] = useState(() => toMonthValue(new Date()));
  const [costPerLitre, setCostPerLitre] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Load vehicle data when month changes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('vehicle_cost_report', {
        p_month: `${month}-01`,
      });
      if (error) setError(error.message);
      else setRows((data as VehicleRow[]) ?? []);
      setLoading(false);
    };
    load();
  }, [month]);

  // Load saved cost per litre when month changes
  useEffect(() => {
    const loadPrice = async () => {
      setPriceError(null);
      setCostPerLitre('');
      const { data, error } = await supabase
        .from('diesel_prices')
        .select('cost_per_litre')
        .eq('month', `${month}-01`)
        .maybeSingle();
      if (error) { setPriceError(`Load failed: ${error.message}`); return; }
      if (data != null && data.cost_per_litre != null) {
        setCostPerLitre(String(data.cost_per_litre));
      }
    };
    loadPrice();
  }, [month]);

  const handlePriceBlur = async () => {
    const val = parseFloat(costPerLitre);
    if (!val || val <= 0) return;
    setSaveStatus('saving');
    setPriceError(null);
    const { error: saveErr } = await supabase
      .from('diesel_prices')
      .upsert({ month: `${month}-01`, cost_per_litre: val, updated_at: new Date().toISOString() });
    if (saveErr) {
      setPriceError(`Save failed: ${saveErr.message}`);
      setSaveStatus('idle');
      return;
    }
    setSaveStatus('saved');
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const cpl = parseFloat(costPerLitre) || 0;

  const computed = useMemo(() => rows.map(r => {
    const fixedTotal = r.leasing_cost + r.depreciation + r.insurance_premium + r.road_tax + r.vpc_season_parking;
    const dieselCost = cpl > 0 ? r.total_litres * cpl : null;
    const totalCost  = cpl > 0 ? fixedTotal + dieselCost! : null;
    const kmPerLitre = r.total_litres > 0 && r.total_km > 0 ? r.total_km / r.total_litres : null;
    const costPerKm  = totalCost !== null && r.total_km > 0 ? totalCost / r.total_km : null;
    return { ...r, fixedTotal, dieselCost, totalCost, kmPerLitre, costPerKm };
  }), [rows, cpl]);

  const totals = useMemo(() => ({
    fixedTotal:  computed.reduce((s, r) => s + r.fixedTotal,  0),
    dieselCost:  cpl > 0 ? computed.reduce((s, r) => s + (r.dieselCost ?? 0), 0) : null,
    totalCost:   cpl > 0 ? computed.reduce((s, r) => s + (r.totalCost  ?? 0), 0) : null,
    totalLitres: computed.reduce((s, r) => s + r.total_litres, 0),
    totalKm:     computed.reduce((s, r) => s + r.total_km,     0),
  }), [computed, cpl]);

  const fleetKmPerLitre = totals.totalLitres > 0 && totals.totalKm > 0
    ? totals.totalKm / totals.totalLitres : null;
  const fleetCostPerKm = totals.totalCost !== null && totals.totalKm > 0
    ? totals.totalCost / totals.totalKm : null;

  return (
    <main className="bg-white text-gray-900 min-h-screen px-4 md:px-8 py-4 md:py-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Vehicle Costs</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Fixed costs + diesel spend per vehicle for the selected month
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">Cost / litre (SGD)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 1.85"
                  value={costPerLitre}
                  onChange={e => { setCostPerLitre(e.target.value); setSaveStatus('idle'); }}
                  onBlur={handlePriceBlur}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-28"
                />
              </div>
              {priceError && (
                <span className="text-xs text-red-500">{priceError}</span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-xs text-gray-400">Saving…</span>
              )}
              {saveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <Check size={11} /> Saved
                </span>
              )}
            </div>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading...</p>}
        {error   && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-gray-400">No vehicle data found for this month.</p>
        )}

        {!loading && computed.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Total Fixed Cost</p>
                <p className="text-lg font-semibold">{fmtCurrency(totals.fixedTotal)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Total Diesel Cost</p>
                <p className="text-lg font-semibold">
                  {totals.dieselCost !== null
                    ? fmtCurrency(totals.dieselCost)
                    : <span className="text-gray-400 text-sm">Enter cost/litre</span>}
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Total Fleet Cost</p>
                <p className="text-lg font-semibold">
                  {totals.totalCost !== null
                    ? fmtCurrency(totals.totalCost)
                    : <span className="text-gray-400 text-sm">Enter cost/litre</span>}
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Fleet km/L</p>
                <p className="text-lg font-semibold">
                  {fleetKmPerLitre !== null ? fmt(fleetKmPerLitre, 1) : '—'}
                </p>
                {fleetCostPerKm !== null && (
                  <p className="text-xs text-gray-400 mt-0.5">{fmtCurrency(fleetCostPerKm)} / km</p>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-2 pr-4 whitespace-nowrap">Vehicle</th>
                    <th className="text-left pb-2 pr-4">Type</th>
                    <th className="text-left pb-2 pr-4">Purpose</th>
                    <th className="text-right pb-2 pr-4 whitespace-nowrap">Fixed Cost</th>
                    <th className="text-right pb-2 pr-4 whitespace-nowrap">Litres</th>
                    <th className="text-right pb-2 pr-4 whitespace-nowrap">Diesel Cost</th>
                    <th className="text-right pb-2 pr-4 whitespace-nowrap">Total Cost</th>
                    <th className="text-right pb-2 pr-4 whitespace-nowrap">km Driven</th>
                    <th className="text-right pb-2 pr-4 whitespace-nowrap">km/L</th>
                    <th className="text-right pb-2 whitespace-nowrap">$/km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {computed.map(r => (
                    <tr key={r.plate_number} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium whitespace-nowrap">{r.plate_number}</td>
                      <td className="py-2.5 pr-4 text-gray-500">{r.vehicle_type ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {r.purpose ? (PURPOSE_LABEL[r.purpose] ?? r.purpose) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {r.fixedTotal > 0 ? fmtCurrency(r.fixedTotal) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-gray-600">
                        {r.total_litres > 0 ? fmt(r.total_litres, 1) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {r.dieselCost !== null && r.total_litres > 0
                          ? fmtCurrency(r.dieselCost)
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-medium">
                        {r.totalCost !== null && r.total_litres > 0
                          ? fmtCurrency(r.totalCost)
                          : r.fixedTotal > 0
                            ? fmtCurrency(r.fixedTotal)
                            : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-gray-600">
                        {r.total_km > 0 ? fmt(r.total_km, 1) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-gray-600">
                        {r.kmPerLitre !== null ? fmt(r.kmPerLitre, 1) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-gray-600">
                        {r.costPerKm !== null ? fmtCurrency(r.costPerKm) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="pt-2.5 pr-4" colSpan={3}>Total</td>
                    <td className="pt-2.5 pr-4 text-right tabular-nums">{fmtCurrency(totals.fixedTotal)}</td>
                    <td className="pt-2.5 pr-4 text-right tabular-nums text-gray-600">
                      {totals.totalLitres > 0 ? fmt(totals.totalLitres, 1) : '—'}
                    </td>
                    <td className="pt-2.5 pr-4 text-right tabular-nums">
                      {totals.dieselCost !== null ? fmtCurrency(totals.dieselCost) : '—'}
                    </td>
                    <td className="pt-2.5 pr-4 text-right tabular-nums">
                      {totals.totalCost !== null ? fmtCurrency(totals.totalCost) : fmtCurrency(totals.fixedTotal)}
                    </td>
                    <td className="pt-2.5 pr-4 text-right tabular-nums text-gray-600">
                      {totals.totalKm > 0 ? fmt(totals.totalKm, 1) : '—'}
                    </td>
                    <td className="pt-2.5 pr-4 text-right tabular-nums text-gray-600">
                      {fleetKmPerLitre !== null ? fmt(fleetKmPerLitre, 1) : '—'}
                    </td>
                    <td className="pt-2.5 text-right tabular-nums text-gray-600">
                      {fleetCostPerKm !== null ? fmtCurrency(fleetCostPerKm) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {!costPerLitre && (
              <p className="text-xs text-gray-400 mt-4">
                Enter cost per litre above to see diesel costs, total cost, and $/km.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
