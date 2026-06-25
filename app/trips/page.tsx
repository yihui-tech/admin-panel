'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Check, GripVertical, Pencil, Trash2, X } from 'lucide-react';

type Trip = {
  id: string;
  vehicle_number: string;
  driver_id: string | null;
  customer_id: string | null;
  customer_location_id: number | null;
  customer_vehicle_plate: string | null;
  dropoff_id: string | null;
  source_location_id: string | null;
  outbound_location_id: number | null;
  trip_type: string | null;
  requester: string | null;
  remarks: string | null;
  status: string;
  trip_order: number | null;
  trip_date: string | null;
  created_at: string;
  completed_at: string | null;
  customers: { name: string; address: string | null; contact_person: string | null; contact_number: string | null } | null;
  customer_locations: { name: string; address: string | null; contact_person: string | null; contact_number: string | null } | null;
  locations: { name: string; address: string | null } | null;
  outbound_locations: { name: string } | null;
  weigh_bridge: { net_weight: number }[];
  trip_bins: { id: string; bin_id: string; action: string; removed_at: string | null; bins: { serial_number: string } | null }[];
};

type Driver = { employee_id: string; name: string };

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return `px-2 py-1 rounded text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });

const totalNetWeight = (trip: Trip) =>
  trip.weigh_bridge.reduce((sum, w) => sum + w.net_weight, 0);

type TripRowHandlers = {
  onMarkComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPreview: (trip: Trip) => void;
};

function SortableTripRow({
  trip,
  canReorder,
  handlers,
}: {
  trip: Trip;
  canReorder: boolean;
  handlers: TripRowHandlers;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: trip.id,
    disabled: !canReorder,
  });

  const netWeight = totalNetWeight(trip);

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="border-b last:border-0 hover:bg-gray-50"
    >
      <td className="px-2 py-3 w-8 text-center">
        {canReorder ? (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab p-1 text-gray-300 hover:text-gray-500 touch-none"
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </button>
        ) : (
          <span className="block w-4" />
        )}
      </td>
      <td className="px-4 py-3 font-medium">{trip.vehicle_number}</td>
      <td className="px-4 py-3 text-gray-600">
        {trip.customers?.name ?? '—'}
        {trip.customer_locations && (
          <span className="block text-xs text-gray-400">{trip.customer_locations.name}</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{trip.locations?.name ?? '—'}</td>
      <td className="px-4 py-3">
        {trip.weigh_bridge.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : trip.weigh_bridge.length === 1 ? (
          <span className="text-gray-700 text-sm">{trip.weigh_bridge[0].net_weight.toFixed(0)} kg</span>
        ) : (
          <div className="text-xs space-y-0.5">
            {trip.weigh_bridge.map((w, i) => (
              <div key={i} className="text-gray-500">Load {i + 1}: {w.net_weight.toFixed(0)} kg</div>
            ))}
            <div className="font-semibold text-gray-800 border-t pt-0.5 mt-0.5">{netWeight.toFixed(0)} kg</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{trip.requester ?? '—'}</td>
      <td className="px-4 py-3">
        <span className={statusBadge(trip.status)}>{trip.status}</span>
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(trip.trip_date ?? trip.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          {trip.status === 'open' && (
            <div className="flex gap-1.5">
              <button onClick={() => handlers.onMarkComplete(trip.id)} className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">
                Complete
              </button>
              <button onClick={() => handlers.onCancel(trip.id)} className="px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200">
                Cancel
              </button>
            </div>
          )}
          <div className="flex gap-0.5">
            <button onClick={() => handlers.onPreview(trip)} title="Preview WhatsApp message" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded">
              <Copy size={14} />
            </button>
            <button onClick={() => handlers.onEdit(trip.id)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
              <Pencil size={14} />
            </button>
            <button onClick={() => handlers.onDelete(trip.id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [copied, setCopied] = useState(false);
  const [driverFilter, setDriverFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const searchParams = useSearchParams();
  const prefillBinId = searchParams.get('prefill_bin');
  const prefillAction = searchParams.get('prefill_action');
  const prefillDone = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
  );

  const fetchTrips = async () => {
    const { data } = await supabase
      .from('trips')
      .select('id, vehicle_number, driver_id, customer_id, customer_location_id, customer_vehicle_plate, dropoff_id, source_location_id, outbound_location_id, trip_type, requester, remarks, status, trip_order, trip_date, created_at, completed_at, customers(name, address, contact_person, contact_number), customer_locations(name, address, contact_person, contact_number), locations(name, address), outbound_locations(name), weigh_bridge(net_weight), trip_bins(id, bin_id, action, removed_at, bins(serial_number))')
      .order('created_at', { ascending: false });
    if (data) setTrips(data as unknown as Trip[]);
  };

  useEffect(() => {
    fetchTrips();
    supabase.from('drivers').select('employee_id, name').order('name').then(({ data }) => {
      if (data) setDrivers(data);
    });
  }, []);

  // Redirect prefill params to new trip page
  useEffect(() => {
    if (prefillBinId && !prefillDone.current) {
      prefillDone.current = true;
      const qs = new URLSearchParams();
      qs.set('prefill_bin', prefillBinId);
      if (prefillAction) qs.set('prefill_action', prefillAction);
      router.replace(`/trips/new?${qs.toString()}`);
    }
  }, [prefillBinId, prefillAction, router]);

  const canReorder = !!driverFilter && !!dateFilter;

  const filteredTrips = trips
    .filter(t => {
      if (driverFilter && t.driver_id !== driverFilter) return false;
      if (dateFilter && (t.trip_date ?? t.created_at).slice(0, 10) !== dateFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (canReorder) {
        if (a.trip_order != null && b.trip_order != null) return a.trip_order - b.trip_order;
        if (a.trip_order != null) return -1;
        if (b.trip_order != null) return 1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredTrips.findIndex(t => t.id === active.id);
    const newIndex = filteredTrips.findIndex(t => t.id === over.id);
    const reordered = arrayMove(filteredTrips, oldIndex, newIndex);

    const reorderMap = new Map(reordered.map((t, i) => [t.id, i + 1]));
    setTrips(prev => prev.map(t => reorderMap.has(t.id) ? { ...t, trip_order: reorderMap.get(t.id)! } : t));

    await Promise.all(
      reordered.map((trip, index) =>
        supabase.from('trips').update({ trip_order: index + 1 }).eq('id', trip.id)
      )
    );
  };

  const handleMarkComplete = async (id: string) => {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    const { error } = await supabase.from('trips').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert('Error updating trip: ' + error.message); return; }

    const yardId = trip.dropoff_id ? Number(trip.dropoff_id) : (trip.source_location_id ? Number(trip.source_location_id) : null);
    for (const tb of trip.trip_bins.filter(tb => !tb.removed_at)) {
      if (tb.action === 'pickup' || tb.action === 'roundtrip') {
        await supabase.from('bins').update({
          location_id: yardId,
          customer_id: null,
          customer_location_id: null,
        }).eq('id', tb.bin_id);
      } else if (tb.action === 'dropoff') {
        await supabase.from('bins').update({
          customer_location_id: trip.customer_location_id ?? null,
          customer_id: trip.customer_location_id ? null : (trip.customer_id ? parseInt(trip.customer_id, 10) : null),
          location_id: null,
        }).eq('id', tb.bin_id);
      }
    }
    fetchTrips();
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this trip?')) return;
    const { error } = await supabase.from('trips').update({ status: 'cancelled' }).eq('id', id);
    if (!error) fetchTrips();
    else alert('Error cancelling trip: ' + error.message);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip?')) return;
    await supabase.from('weigh_bridge').update({ trip_id: null }).eq('trip_id', id);
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (!error) fetchTrips();
    else alert('Error deleting trip: ' + error.message);
  };

  const generateMessage = (t: Trip) => {
    const date = new Date(t.trip_date ?? t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const loc = t.customer_locations;
    const pickupName = loc ? `${t.customers?.name ?? ''} (${loc.name})` : (t.customers?.name ?? '');
    const pickupAddress = loc?.address ?? t.customers?.address ?? '';
    const contactPerson = loc?.contact_person ?? t.customers?.contact_person ?? '';
    const contactNumber = loc?.contact_number ?? t.customers?.contact_number ?? '';
    const lines = [
      `Date : ${date}`,
      ``,
      `Order placed by - ${t.requester ?? ''}`,
      ``,
      `Pick up from - ${pickupName}`,
      `Pick up address - ${pickupAddress}`,
      `Person in charge - ${contactPerson}`,
      `Contact no. - ${contactNumber}`,
      ``,
      `Drop off to - ${t.locations?.name ?? ''}`,
      `Drop off address - ${t.locations?.address ?? ''}`,
      `Person in charge - `,
      `Contact no. - `,
      ``,
      `Remarks: ${t.remarks ?? ''}`,
    ];

    t.trip_bins.forEach(tb => {
      const label = tb.action === 'dropoff' ? 'Bin drop off' : tb.action === 'pickup' ? 'Bin pick up' : 'Bin roundtrip';
      lines.push(`${label} - ${tb.bins?.serial_number ?? ''}`);
    });

    return lines.join('\n');
  };

  const handleCopy = async () => {
    if (!previewTrip) return;
    await navigator.clipboard.writeText(generateMessage(previewTrip));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rowHandlers: TripRowHandlers = {
    onMarkComplete: handleMarkComplete,
    onCancel: handleCancel,
    onEdit: (id) => router.push(`/trips/${id}`),
    onDelete: handleDelete,
    onPreview: (trip) => { setPreviewTrip(trip); setCopied(false); },
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Trips</h1>
        <button onClick={() => router.push('/trips/new')} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">
          + New Trip
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Driver</label>
          <select
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">All drivers</option>
            {drivers.map(d => <option key={d.employee_id} value={d.employee_id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        {(driverFilter || dateFilter) && (
          <button
            onClick={() => { setDriverFilter(''); setDateFilter(''); }}
            className="text-sm text-gray-400 hover:text-gray-600 pb-2"
          >
            Clear
          </button>
        )}
        {canReorder && (
          <span className="text-xs text-blue-600 font-medium pb-2.5">
            ↕ Drag rows to set trip sequence
          </span>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-2 py-3 w-8"></th>
                <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Drop off</th>
                <th className="text-left px-4 py-3 font-medium">Net Weight</th>
                <th className="text-left px-4 py-3 font-medium">Requester</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <SortableContext items={filteredTrips.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {filteredTrips.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center px-4 py-6 text-gray-400">
                      {trips.length === 0 ? 'No trips yet' : 'No trips match filters'}
                    </td>
                  </tr>
                )}
                {filteredTrips.map(t => (
                  <SortableTripRow
                    key={t.id}
                    trip={t}
                    canReorder={canReorder}
                    handlers={rowHandlers}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </div>
      </DndContext>

      {/* WhatsApp message preview modal */}
      {previewTrip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">WhatsApp Message</h2>
              <button onClick={() => setPreviewTrip(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <pre className="bg-gray-50 border rounded p-4 text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed mb-4 max-h-[60vh] overflow-y-auto">
              {generateMessage(previewTrip)}
            </pre>

            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-5 py-2 rounded font-medium text-sm transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy Message
                  </>
                )}
              </button>
              <button onClick={() => setPreviewTrip(null)} className="border px-5 py-2 rounded font-medium text-sm hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TripsPageWrapper() {
  return (
    <Suspense>
      <TripsPage />
    </Suspense>
  );
}
