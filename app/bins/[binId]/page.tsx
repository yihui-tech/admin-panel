'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

type Bin = {
  id: string;
  serial_number: string;
  type: string | null;
  size: string | null;
  status: string | null;
  customer_id: number | null;
  customer_location_id: number | null;
  location_id: number | null;
  customers: { name: string } | null;
  customer_locations: { name: string; customers: { name: string } | null } | null;
  locations: { name: string } | null;
};

type HistoryEntry = {
  id: string;
  action: 'pickup' | 'dropoff' | 'roundtrip';
  removed_at: string | null;
  sortDate: string;
  trips: {
    id: string;
    vehicle_number: string | null;
    driver_id: string | null;
    trip_date: string | null;
    completed_at: string | null;
    customers: { name: string } | null;
    customer_locations: { name: string; customers: { name: string } | null } | null;
    locations: { name: string } | null;
  } | null;
};

type OverrideEntry = {
  id: string;
  note: string | null;
  created_at: string;
  sortDate: string;
};

type TimelineItem =
  | ({ kind: 'trip' } & HistoryEntry)
  | ({ kind: 'override' } & OverrideEntry);

type DriverMap = Record<string, string>;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgo(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function BinHistoryPage() {
  const { binId } = useParams<{ binId: string }>();
  const router = useRouter();

  const [bin, setBin] = useState<Bin | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [drivers, setDrivers] = useState<DriverMap>({});
  const [loading, setLoading] = useState(true);
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    const init = async () => {
      const [binResult, driverResult, historyResult, overridesResult] = await Promise.all([
        supabase
          .from('bins')
          .select('id, serial_number, type, size, status, customer_id, customer_location_id, location_id, customers(name), customer_locations(name, customers(name)), locations(name)')
          .eq('id', binId)
          .single(),
        supabase.from('drivers').select('employee_id, name').order('name'),
        supabase
          .from('trip_bins')
          .select('id, action, removed_at, trips!inner(id, vehicle_number, driver_id, trip_date, completed_at, customers(name), customer_locations(name, customers(name)), locations!dropoff_id(name))')
          .eq('bin_id', binId)
          .eq('trips.status', 'completed'),
        supabase
          .from('bin_location_overrides')
          .select('id, note, created_at')
          .eq('bin_id', binId),
      ]);

      if (binResult.data) setBin(binResult.data as unknown as Bin);

      if (driverResult.data) {
        const map: DriverMap = {};
        for (const d of driverResult.data) map[d.employee_id] = d.name;
        setDrivers(map);
      }

      const tripItems: TimelineItem[] = (historyResult.data ?? []).map(e => {
        const raw = e as unknown as Omit<HistoryEntry, 'sortDate'>;
        return {
          kind: 'trip' as const,
          ...raw,
          sortDate: raw.trips?.trip_date ?? raw.trips?.completed_at?.slice(0, 10) ?? '',
        };
      });

      const overrideItems: TimelineItem[] = (overridesResult.data ?? []).map(o => ({
        kind: 'override' as const,
        id: o.id,
        note: o.note,
        created_at: o.created_at,
        sortDate: o.created_at.slice(0, 10),
      }));

      const merged = [...tripItems, ...overrideItems];
      merged.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
      setTimeline(merged);

      setLoading(false);
    };
    init();
  }, [binId]);

  const displayed = newestFirst ? timeline : [...timeline].reverse();

  const lastDropoffDate = timeline.find(e => e.kind === 'trip' && e.action === 'dropoff' && !e.removed_at)?.sortDate ?? null;

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
        <p className="text-sm text-gray-400 text-center py-16">Loading…</p>
      </main>
    );
  }

  if (!bin) {
    return (
      <main className="max-w-2xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
        <p className="text-sm text-red-500 text-center py-16">Bin not found.</p>
      </main>
    );
  }

  const locationLabel = (() => {
    if (bin.customer_locations) return `${bin.customer_locations.customers?.name ?? ''} · ${bin.customer_locations.name}`;
    if (bin.customers) return bin.customers.name;
    if (bin.locations) return bin.locations.name;
    return '—';
  })();

  const locationTag = bin.customer_location_id || bin.customer_id
    ? { label: 'At customer', color: 'bg-blue-50 text-blue-700' }
    : bin.location_id
    ? { label: 'At yard', color: 'bg-green-50 text-green-700' }
    : { label: 'Unknown', color: 'bg-gray-100 text-gray-500' };

  return (
    <main className="max-w-2xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <button
        onClick={() => router.push('/bins')}
        className="text-sm text-gray-400 hover:text-gray-700 mb-6 flex items-center gap-1"
      >
        ← Back to Bins
      </button>

      {/* Bin summary */}
      <div className="border rounded-xl p-5 mb-8 bg-gray-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{bin.serial_number}</h1>
            {(bin.type || bin.size) && (
              <p className="text-sm text-gray-500 mt-0.5">{[bin.type, bin.size].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded ${
            bin.status === 'disposed' || bin.status === 'retired' ? 'bg-gray-200 text-gray-600' :
            bin.status === 'rented' ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {bin.status === 'disposed' || bin.status === 'retired' ? 'Disposed' :
             bin.status === 'rented' ? 'Rented' : 'Active'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-400">Location </span>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${locationTag.color}`}>
              {locationTag.label}:
            </span>{' '}
            <span className="text-gray-700">{locationLabel}</span>
          </div>
          {lastDropoffDate && (
            <div>
              <span className="text-gray-400">Last issued </span>
              <span className="text-gray-700">{formatDate(lastDropoffDate)}</span>
              <span className="text-gray-400 ml-1">({daysAgo(lastDropoffDate)})</span>
            </div>
          )}
        </div>
      </div>

      {/* Movement history */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-700">
          Movement History
          {timeline.length > 0 && (
            <span className="text-gray-400 font-normal text-sm ml-2">{timeline.length} events</span>
          )}
        </h2>
        {timeline.length > 1 && (
          <button
            onClick={() => setNewestFirst(f => !f)}
            className="text-xs text-gray-400 hover:text-blue-600 border rounded px-2 py-1"
          >
            {newestFirst ? 'Oldest first' : 'Newest first'}
          </button>
        )}
      </div>

      {timeline.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No movement history for this bin.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
          <div className="space-y-4">
            {displayed.map(item => {
              if (item.kind === 'override') {
                return (
                  <div key={item.id} className="flex gap-4">
                    <div className="mt-1 w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 text-xs font-bold bg-amber-100 text-amber-700">!</div>
                    <div className="flex-1 border border-amber-200 rounded-lg px-3 py-2.5 text-sm bg-amber-50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Location manually corrected</span>
                        <span className="text-xs text-gray-400">{formatDate(item.created_at)}</span>
                      </div>
                      <p className="text-amber-700 text-xs mt-1">Missing prior trip — location was changed without a trip record.</p>
                      {item.note && <p className="text-gray-600 text-xs mt-0.5">{item.note}</p>}
                    </div>
                  </div>
                );
              }

              const date = item.trips?.trip_date ?? item.trips?.completed_at?.slice(0, 10) ?? null;
              const isDropoff = item.action === 'dropoff';
              const isPickup  = item.action === 'pickup';
              const isRemoved = !!item.removed_at;
              const dotColor  = isRemoved ? 'bg-gray-100 text-gray-400' : isDropoff ? 'bg-blue-100 text-blue-700' : isPickup ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700';
              const tagColor  = isRemoved ? 'bg-gray-100 text-gray-400' : isDropoff ? 'bg-blue-50 text-blue-700'  : isPickup ? 'bg-orange-50 text-orange-700'  : 'bg-purple-50 text-purple-700';
              const dotSymbol = isDropoff ? '↓' : isPickup ? '↑' : '↕';
              const actionLabel = isDropoff ? 'Issued to customer' : isPickup ? 'Collected from customer' : 'Roundtrip';

              return (
                <div key={item.id} className="flex gap-4">
                  <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 text-xs font-bold ${dotColor}`}>
                    {dotSymbol}
                  </div>
                  <div className={`flex-1 border rounded-lg px-3 py-2.5 text-sm bg-white ${isRemoved ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${tagColor}`}>{actionLabel}</span>
                        {isRemoved && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-500 line-through">Removed</span>}
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(date)}</span>
                    </div>
                    <div className="text-gray-600 space-y-0.5 mt-1.5">
                      {(item.trips?.customer_locations || item.trips?.customers) && (
                        <div>
                          <span className="text-gray-400">Customer: </span>
                          {item.trips.customer_locations
                            ? `${item.trips.customer_locations.customers?.name ?? ''} · ${item.trips.customer_locations.name}`
                            : item.trips.customers?.name}
                        </div>
                      )}
                      {item.trips?.locations && (
                        <div>
                          <span className="text-gray-400">Yard: </span>
                          {item.trips.locations.name}
                        </div>
                      )}
                      {item.trips?.driver_id && (
                        <div>
                          <span className="text-gray-400">Driver: </span>
                          {drivers[item.trips.driver_id] ?? item.trips.driver_id}
                        </div>
                      )}
                      {item.trips?.vehicle_number && (
                        <div>
                          <span className="text-gray-400">Vehicle: </span>
                          {item.trips.vehicle_number}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
