'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type BinRow = {
  id: string;
  serial_number: string;
  customer_id: number | null;
  customer_location_id: number | null;
  location_id: number | null;
  customers: { name: string } | null;
  customer_locations: { name: string; customers: { name: string } | null } | null;
  locations: { name: string } | null;
};

type TripBinRow = {
  bin_id: string;
  action: string;
  trips: {
    trip_date: string | null;
    completed_at: string | null;
    customer_id: number | null;
    customer_location_id: number | null;
    dropoff_id: number | null;
    customer_locations: { name: string; customers: { name: string } | null } | null;
    locations: { name: string } | null;
  };
};

type Gap = {
  kind: 'missing_pickup' | 'missing_dropoff';
  bin_id: string;
  bin_serial: string;
  description: string;
  last_action_date: string;
  expected_label: string;
  current_label: string;
  prefill_action: 'pickup' | 'dropoff';
};

// ── Gap detection ──────────────────────────────────────────────────────────────

function binCurrentLabel(b: BinRow): string {
  if (b.customer_locations) return `${b.customer_locations.customers?.name ?? ''} · ${b.customer_locations.name}`.trim();
  if (b.customers) return b.customers.name;
  if (b.locations) return b.locations.name;
  return 'Unknown';
}

function detectMismatches(bins: BinRow[], tripBins: TripBinRow[]): Gap[] {
  // Group by bin, sort newest first
  const byBin: Record<string, TripBinRow[]> = {};
  for (const tb of tripBins) {
    if (!byBin[tb.bin_id]) byBin[tb.bin_id] = [];
    byBin[tb.bin_id].push(tb);
  }
  for (const arr of Object.values(byBin)) {
    arr.sort((a, b) => {
      const da = (a.trips.trip_date ?? a.trips.completed_at?.slice(0, 10) ?? '') + 'T' + (a.trips.completed_at?.slice(11, 16) ?? '00:00');
      const db = (b.trips.trip_date ?? b.trips.completed_at?.slice(0, 10) ?? '') + 'T' + (b.trips.completed_at?.slice(11, 16) ?? '00:00');
      return db.localeCompare(da);
    });
  }

  const gaps: Gap[] = [];

  for (const bin of bins) {
    const binTrips = byBin[bin.id];
    if (!binTrips || binTrips.length === 0) continue; // no trip history — no baseline

    const last = binTrips[0];
    const lastDate = last.trips.trip_date ?? last.trips.completed_at?.slice(0, 10) ?? '';
    const currentAtCustomer = !!(bin.customer_location_id || bin.customer_id);
    const currentAtYard = !!bin.location_id;

    if (last.action === 'dropoff') {
      // Bin should still be at the customer it was last delivered to
      const expCustLocId = last.trips.customer_location_id;
      const expCustId = last.trips.customer_id;
      const stillAtSame =
        (expCustLocId && bin.customer_location_id === expCustLocId) ||
        (!expCustLocId && expCustId && bin.customer_id === expCustId);
      if (stillAtSame) continue;

      const lastCustomerLabel = last.trips.customer_locations
        ? `${last.trips.customer_locations.customers?.name ?? ''} · ${last.trips.customer_locations.name}`.trim()
        : last.trips.customer_id ? 'Customer' : 'Unknown';

      if (currentAtYard) {
        gaps.push({
          kind: 'missing_pickup',
          bin_id: bin.id, bin_serial: bin.serial_number,
          description: `Missing pickup from ${lastCustomerLabel}`,
          last_action_date: lastDate,
          expected_label: lastCustomerLabel,
          current_label: bin.locations?.name ?? 'Yard',
          prefill_action: 'pickup',
        });
      } else if (currentAtCustomer) {
        const currentLabel = binCurrentLabel(bin);
        gaps.push({
          kind: 'missing_pickup',
          bin_id: bin.id, bin_serial: bin.serial_number,
          description: `Missing pickup from ${lastCustomerLabel} before delivery to ${currentLabel}`,
          last_action_date: lastDate,
          expected_label: lastCustomerLabel,
          current_label: currentLabel,
          prefill_action: 'pickup',
        });
      }
    } else if (last.action === 'pickup' || last.action === 'roundtrip') {
      // Bin should be at a yard — flag if it's now at a customer
      if (currentAtCustomer) {
        const currentLabel = binCurrentLabel(bin);
        const lastYardLabel = last.trips.locations?.name ?? 'Yard';
        gaps.push({
          kind: 'missing_dropoff',
          bin_id: bin.id, bin_serial: bin.serial_number,
          description: `Missing delivery to ${currentLabel}`,
          last_action_date: lastDate,
          expected_label: lastYardLabel,
          current_label: currentLabel,
          prefill_action: 'dropoff',
        });
      }
    }
  }

  return gaps;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MissingTripsPage() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<'all' | Gap['kind']>('all');
  const [filterBin, setFilterBin] = useState('');
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const [binResult, tripBinResult] = await Promise.all([
        supabase
          .from('bins')
          .select('id, serial_number, customer_id, customer_location_id, location_id, customers(name), customer_locations(name, customers(name)), locations(name)')
          .not('status', 'in', '(disposed,retired)'),
        supabase
          .from('trip_bins')
          .select('bin_id, action, trips!inner(trip_date, completed_at, customer_id, customer_location_id, dropoff_id, customer_locations(name, customers(name)), locations!dropoff_id(name))')
          .eq('trips.status', 'completed')
          .is('removed_at', null),
      ]);

      const bins = (binResult.data ?? []) as unknown as BinRow[];
      const tripBins = (tripBinResult.data ?? []) as unknown as TripBinRow[];
      setGaps(detectMismatches(bins, tripBins));
      setLoading(false);
    };
    run();
  }, []);

  const filtered = gaps.filter(g => {
    if (filterKind !== 'all' && g.kind !== filterKind) return false;
    if (filterBin && !g.bin_serial.toLowerCase().includes(filterBin.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: gaps.length,
    missing_pickup:  gaps.filter(g => g.kind === 'missing_pickup').length,
    missing_dropoff: gaps.filter(g => g.kind === 'missing_dropoff').length,
  };

  const gapStyles = {
    missing_pickup:  { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700', text: 'text-orange-800', dot: 'bg-orange-400', label: 'Missing Pickup' },
    missing_dropoff: { bg: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-700', text: 'text-purple-800', dot: 'bg-purple-400', label: 'Missing Delivery' },
  };

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-8 bg-white text-gray-900 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Missing Trips</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bins whose current location does not match their last recorded trip — a formal trip was never entered.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {([
          ['all',             'All',                'bg-gray-50 border-gray-200 text-gray-700'],
          ['missing_pickup',  'Missing Pickups',    'bg-orange-50 border-orange-200 text-orange-700'],
          ['missing_dropoff', 'Missing Deliveries', 'bg-purple-50 border-purple-200 text-purple-700'],
        ] as const).map(([kind, label, style]) => (
          <button
            key={kind}
            onClick={() => setFilterKind(kind)}
            className={`border rounded-lg p-3 text-left transition-all ${style} ${filterKind === kind ? 'ring-2 ring-offset-1 ring-current' : 'hover:opacity-80'}`}
          >
            <div className="text-2xl font-bold">{counts[kind]}</div>
            <div className="text-xs font-medium mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter by bin no."
          value={filterBin}
          onChange={e => setFilterBin(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full sm:w-48"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-16">Checking bin locations…</p>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-gray-400 text-sm">
            {gaps.length === 0
              ? 'No discrepancies found — all bins match their last recorded trip.'
              : 'No gaps match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((gap, i) => {
            const s = gapStyles[gap.kind];
            return (
              <div key={i} className={`border rounded-lg p-4 ${s.bg}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} style={{ marginTop: 6 }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${s.badge}`}>
                          {s.label}
                        </span>
                        <button
                          onClick={() => router.push(`/bins/${gap.bin_id}`)}
                          className="text-sm font-bold text-blue-600 hover:underline"
                        >
                          {gap.bin_serial}
                        </button>
                      </div>
                      <p className={`text-sm font-medium ${s.text}`}>{gap.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last trip: <span className="font-medium">{formatDate(gap.last_action_date)}</span>
                        <span className="mx-1.5 text-gray-300">·</span>
                        Expected: <span className="font-medium">{gap.expected_label}</span>
                        <span className="mx-1.5 text-gray-300">→</span>
                        Actual: <span className="font-medium">{gap.current_label}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/trips/new?prefill_bin=${gap.bin_id}&prefill_action=${gap.prefill_action}`)}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                  >
                    + Enter missing trip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
