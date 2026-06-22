'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type BinMovementRaw = {
  id: string;
  bin_id: string;
  action: string;
  movement_date: string;
  movement_time: string | null;
  from_label: string | null;
  to_label: string;
  bins: { serial_number: string } | null;
};

type TripBinRaw = {
  id: string;
  bin_id: string;
  action: string;
  removed_at: string | null;
  trips: {
    trip_date: string | null;
    completed_at: string | null;
    customers: { name: string } | null;
    customer_locations: { name: string; customers: { name: string } | null } | null;
  } | null;
  bins: { serial_number: string } | null;
};

type Gap = {
  source: 'trip' | 'movement';
  kind: 'missing_pickup' | 'missing_dropoff' | 'inconsistency';
  bin_id: string;
  bin_serial: string;
  description: string;
  after_date: string;
  before_date: string;
  // movement-source only
  prev_id?: string;
  curr_id?: string;
  at_location?: string;
};

// ── Gap detection ──────────────────────────────────────────────────────────────

function detectMovementGaps(movements: BinMovementRaw[]): Gap[] {
  const byBin: Record<string, BinMovementRaw[]> = {};
  for (const m of movements) {
    if (!byBin[m.bin_id]) byBin[m.bin_id] = [];
    byBin[m.bin_id].push(m);
  }

  const gaps: Gap[] = [];

  for (const [binId, binMovements] of Object.entries(byBin)) {
    const sorted = [...binMovements].sort((a, b) => {
      const ka = a.movement_date + 'T' + (a.movement_time ?? '00:00');
      const kb = b.movement_date + 'T' + (b.movement_time ?? '00:00');
      return ka.localeCompare(kb);
    });

    const serial = sorted[0].bins?.serial_number ?? binId;

    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const curr = sorted[i + 1];

      if (prev.action === 'dropoff' && curr.action === 'dropoff') {
        gaps.push({ source: 'movement', kind: 'missing_pickup', bin_id: binId, bin_serial: serial,
          description: `Missing pickup from ${prev.to_label}`, at_location: prev.to_label,
          after_date: prev.movement_date, before_date: curr.movement_date, prev_id: prev.id, curr_id: curr.id });
        continue;
      }
      if (prev.action === 'pickup' && curr.action === 'pickup') {
        gaps.push({ source: 'movement', kind: 'missing_dropoff', bin_id: binId, bin_serial: serial,
          description: `Missing delivery between two pickups`, at_location: curr.from_label ?? curr.to_label,
          after_date: prev.movement_date, before_date: curr.movement_date, prev_id: prev.id, curr_id: curr.id });
        continue;
      }
      if (prev.action === 'dropoff' && curr.action === 'pickup') {
        const expectedFrom = prev.to_label.trim().toLowerCase();
        const actualFrom   = (curr.from_label ?? '').trim().toLowerCase();
        if (actualFrom && expectedFrom && actualFrom !== expectedFrom) {
          gaps.push({ source: 'movement', kind: 'inconsistency', bin_id: binId, bin_serial: serial,
            description: `Delivered to "${prev.to_label}" but collected from "${curr.from_label}"`,
            at_location: prev.to_label,
            after_date: prev.movement_date, before_date: curr.movement_date, prev_id: prev.id, curr_id: curr.id });
        }
      }
    }
  }

  return gaps;
}

function detectTripGaps(tripBins: TripBinRaw[]): Gap[] {
  const byBin: Record<string, TripBinRaw[]> = {};
  for (const tb of tripBins) {
    if (tb.removed_at) continue;
    if (!byBin[tb.bin_id]) byBin[tb.bin_id] = [];
    byBin[tb.bin_id].push(tb);
  }

  const gaps: Gap[] = [];

  for (const [binId, entries] of Object.entries(byBin)) {
    const sorted = [...entries].sort((a, b) => {
      const da = a.trips?.trip_date ?? a.trips?.completed_at?.slice(0, 10) ?? '';
      const db = b.trips?.trip_date ?? b.trips?.completed_at?.slice(0, 10) ?? '';
      return da.localeCompare(db);
    });

    const serial = sorted[0].bins?.serial_number ?? binId;

    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const curr = sorted[i + 1];
      const prevDate = prev.trips?.trip_date ?? prev.trips?.completed_at?.slice(0, 10) ?? '';
      const currDate = curr.trips?.trip_date ?? curr.trips?.completed_at?.slice(0, 10) ?? '';

      const prevCustomer = prev.trips?.customer_locations
        ? `${prev.trips.customer_locations.customers?.name ?? ''} · ${prev.trips.customer_locations.name}`.trim()
        : prev.trips?.customers?.name ?? 'unknown customer';

      // treat roundtrip same as pickup — bin ends up at yard
      const prevEndsAtYard = prev.action === 'pickup' || prev.action === 'roundtrip';
      const currEndsAtYard = curr.action === 'pickup' || curr.action === 'roundtrip';

      if (prev.action === 'dropoff' && curr.action === 'dropoff') {
        gaps.push({ source: 'trip', kind: 'missing_pickup', bin_id: binId, bin_serial: serial,
          description: `Missing pickup from ${prevCustomer}`,
          after_date: prevDate, before_date: currDate });
        continue;
      }
      if (prevEndsAtYard && currEndsAtYard) {
        gaps.push({ source: 'trip', kind: 'missing_dropoff', bin_id: binId, bin_serial: serial,
          description: `Missing delivery between two collections`,
          after_date: prevDate, before_date: currDate });
      }
    }
  }

  return gaps;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}

const gapColors: Record<Gap['kind'], { bg: string; text: string; badge: string; badgeText: string; dot: string }> = {
  missing_pickup:  { bg: 'bg-orange-50',  text: 'text-orange-800', badge: 'bg-orange-100', badgeText: 'text-orange-700', dot: 'bg-orange-400' },
  missing_dropoff: { bg: 'bg-purple-50',  text: 'text-purple-800', badge: 'bg-purple-100', badgeText: 'text-purple-700', dot: 'bg-purple-400' },
  inconsistency:   { bg: 'bg-red-50',     text: 'text-red-800',    badge: 'bg-red-100',    badgeText: 'text-red-700',    dot: 'bg-red-400'    },
};

const gapLabel: Record<Gap['kind'], string> = {
  missing_pickup:  'Missing Pickup',
  missing_dropoff: 'Missing Delivery',
  inconsistency:   'Inconsistency',
};

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

      const [movResult, tripResult] = await Promise.all([
        supabase
          .from('bin_movements')
          .select('id, bin_id, action, movement_date, movement_time, from_label, to_label, bins(serial_number)')
          .order('movement_date')
          .order('movement_time'),
        supabase
          .from('trip_bins')
          .select('id, bin_id, action, removed_at, trips!inner(trip_date, completed_at, customers(name), customer_locations(name, customers(name))), bins(serial_number)')
          .eq('trips.status', 'completed'),
      ]);

      const movGaps = movResult.data
        ? detectMovementGaps(movResult.data as unknown as BinMovementRaw[])
        : [];
      const tripGaps = tripResult.data
        ? detectTripGaps(tripResult.data as unknown as TripBinRaw[])
        : [];

      // Trip gaps first (historical), then movement gaps
      setGaps([...tripGaps, ...movGaps]);
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
    inconsistency:   gaps.filter(g => g.kind === 'inconsistency').length,
  };

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Missing Trips</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gaps detected from trip history and recorded bin movements — consecutive dropoffs or pickups with no matching return trip.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {([
          ['all',             'All Gaps',           'bg-gray-50 border-gray-200 text-gray-700'],
          ['missing_pickup',  'Missing Pickups',    'bg-orange-50 border-orange-200 text-orange-700'],
          ['missing_dropoff', 'Missing Deliveries', 'bg-purple-50 border-purple-200 text-purple-700'],
          ['inconsistency',   'Inconsistencies',    'bg-red-50 border-red-200 text-red-700'],
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

      {/* Filter by bin */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter by bin no."
          value={filterBin}
          onChange={e => setFilterBin(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-48"
        />
      </div>

      {/* Gaps table */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-16">Analysing movements…</p>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-gray-400 text-sm">
            {gaps.length === 0
              ? 'No gaps detected — all recorded movements form a consistent sequence.'
              : 'No gaps match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((gap, i) => {
            const c = gapColors[gap.kind];
            return (
              <div key={i} className={`border rounded-lg p-4 ${c.bg}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${c.dot}`} style={{ marginTop: 6 }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.badge} ${c.badgeText}`}>
                          {gapLabel[gap.kind]}
                        </span>
                        <button
                          onClick={() => router.push(`/bins/${gap.bin_id}`)}
                          className="text-sm font-bold text-blue-600 hover:underline"
                        >
                          {gap.bin_serial}
                        </button>
                        <span className="text-xs text-gray-400">
                          {gap.source === 'trip' ? 'from trip history' : 'from movement log'}
                        </span>
                      </div>
                      <p className={`text-sm font-medium ${c.text}`}>{gap.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Between <span className="font-medium">{formatDate(gap.after_date)}</span>
                        {' '}and <span className="font-medium">{formatDate(gap.before_date)}</span>
                      </p>
                    </div>
                  </div>
                  {gap.source === 'trip' ? (
                    <button
                      onClick={() => router.push(`/trips?prefill_bin=${gap.bin_id}&prefill_action=${gap.kind === 'missing_pickup' ? 'pickup' : 'dropoff'}`)}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                    >
                      + Enter missing trip
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/bin-movements')}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                    >
                      + Add missing movement
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
