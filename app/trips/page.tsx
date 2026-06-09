'use client';

import { useEffect, useState } from 'react';
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
  dropoff_id: string | null;
  source_location_id: string | null;
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
  weigh_bridge: { net_weight: number }[];
  trip_bins: { id: string; bin_id: string; action: string; removed_at: string | null; bins: { serial_number: string } | null }[];
};

type Vehicle = { plate_number: string };
type Driver = { employee_id: string; name: string };
type CustomerOption = { customer_id: number; name: string; address: string | null };
type CustomerLocationOption = { id: number; customer_id: number; name: string; address: string | null; contact_person: string | null; contact_number: string | null };
type LocationOption = { id: number; name: string; address: string | null };
type BinOption = { id: string; serial_number: string; customer_id: number | null; location_id: number | null; customer_location_id: number | null };
type BinAction = { bin_id: string; action: 'dropoff' | 'pickup' | 'roundtrip' };

const emptyForm = {
  vehicle_number: '',
  driver_id: '',
  customer_id: '',
  customer_location_id: '',
  dropoff_id: '',
  requester: '',
  remarks: '',
};

const emptyCustomerForm = { name: '', contact_person: '', contact_number: '', address: '' };

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
  onEdit: (trip: Trip) => void;
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
            <button onClick={() => handlers.onEdit(trip)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
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

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerLocationOptions, setCustomerLocationOptions] = useState<CustomerLocationOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [binOptions, setBinOptions] = useState<BinOption[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [binActions, setBinActions] = useState<BinAction[]>([]);

  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [copied, setCopied] = useState(false);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(emptyCustomerForm);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [driverFilter, setDriverFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
  );

  const fetchTrips = async () => {
    const { data } = await supabase
      .from('trips')
      .select('id, vehicle_number, driver_id, customer_id, customer_location_id, dropoff_id, source_location_id, trip_type, requester, remarks, status, trip_order, trip_date, created_at, completed_at, customers(name, address, contact_person, contact_number), customer_locations(name, address, contact_person, contact_number), locations(name, address), weigh_bridge(net_weight), trip_bins(id, bin_id, action, removed_at, bins(serial_number))')
      .order('created_at', { ascending: false });
    if (data) setTrips(data as unknown as Trip[]);
  };

  const fetchLookups = async () => {
    const [v, d, c, cl, l, b] = await Promise.all([
      supabase.from('vehicles').select('plate_number').order('plate_number'),
      supabase.from('drivers').select('employee_id, name').order('name'),
      supabase.from('customers').select('customer_id, name, address').order('name'),
      supabase.from('customer_locations').select('id, customer_id, name, address, contact_person, contact_number').order('name'),
      supabase.from('locations').select('id, name, address').order('name'),
      supabase.from('bins').select('id, serial_number, customer_id, location_id, customer_location_id').order('serial_number'),
    ]);
    if (v.data) setVehicles(v.data);
    if (d.data) setDrivers(d.data);
    if (c.data) setCustomerOptions(c.data);
    if (cl.data) setCustomerLocationOptions(cl.data);
    if (l.data) setLocationOptions(l.data);
    if (b.data) setBinOptions(b.data);
  };

  useEffect(() => {
    fetchTrips();
    fetchLookups();
  }, []);

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

    // Optimistic update
    const reorderMap = new Map(reordered.map((t, i) => [t.id, i + 1]));
    setTrips(prev => prev.map(t => reorderMap.has(t.id) ? { ...t, trip_order: reorderMap.get(t.id)! } : t));

    // Persist
    await Promise.all(
      reordered.map((trip, index) =>
        supabase.from('trips').update({ trip_order: index + 1 }).eq('id', trip.id)
      )
    );
  };

  const sitesForCustomer = customerLocationOptions.filter(l => String(l.customer_id) === form.customer_id);
  const selectedSite = customerLocationOptions.find(l => String(l.id) === form.customer_location_id) ?? null;
  const selectedDropoffAddress = locationOptions.find(l => String(l.id) === form.dropoff_id)?.address ?? '';

  const openCreate = () => {
    setForm(emptyForm);
    setEditingTrip(null);
    setShowNewCustomer(false);
    setNewCustomerForm(emptyCustomerForm);
    setBinActions([]);
    setShowModal(true);
  };

  const openEdit = (trip: Trip) => {
    setForm({
      vehicle_number: trip.vehicle_number,
      driver_id: trip.driver_id ?? '',
      customer_id: trip.customer_id != null ? String(trip.customer_id) : '',
      customer_location_id: trip.customer_location_id != null ? String(trip.customer_location_id) : '',
      dropoff_id: trip.dropoff_id != null ? String(trip.dropoff_id) : '',
      requester: trip.requester ?? '',
      remarks: trip.remarks ?? '',
    });
    setBinActions(trip.trip_bins.filter(tb => !tb.removed_at).map(tb => ({ bin_id: tb.bin_id, action: tb.action as 'dropoff' | 'pickup' | 'roundtrip' })));
    setEditingTrip(trip);
    setShowNewCustomer(false);
    setNewCustomerForm(emptyCustomerForm);
    setShowModal(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'customer_id' && value === '__new__') {
      setShowNewCustomer(true);
      setForm(prev => ({ ...prev, customer_id: '', customer_location_id: '' }));
    } else if (name === 'customer_id') {
      setForm(prev => ({ ...prev, customer_id: value, customer_location_id: '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSaveNewCustomer = async () => {
    if (!newCustomerForm.name.trim()) return;
    setSavingCustomer(true);
    const { data, error } = await supabase
      .from('customers')
      .insert(newCustomerForm)
      .select('customer_id, name, address')
      .single();
    setSavingCustomer(false);
    if (error) { alert('Error creating customer: ' + error.message); return; }
    if (data) {
      setCustomerOptions(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(prev => ({ ...prev, customer_id: String(data.customer_id) }));
      setShowNewCustomer(false);
      setNewCustomerForm(emptyCustomerForm);
    }
  };

  const binAtCustomer = (bin: BinOption) => !!(bin.customer_id || bin.customer_location_id);
  const binAtYard = (bin: BinOption) => !!(bin.location_id);

  const binActionConflict = (bin_id: string, action: 'dropoff' | 'pickup' | 'roundtrip'): string | null => {
    const bin = binOptions.find(b => b.id === bin_id);
    if (!bin) return null;
    if (action === 'roundtrip') {
      if (binAtCustomer(bin)) return `Bin ${bin.serial_number} is at a customer site — roundtrip requires bin to start at the yard.`;
      return null;
    }
    if (binAtCustomer(bin) && action === 'dropoff')
      return `Bin ${bin.serial_number} is already at a customer site — cannot drop off again. Change action to Pick up.`;
    if (binAtYard(bin) && action === 'pickup')
      return `Bin ${bin.serial_number} is at the yard — cannot pick up from customer. Change action to Drop off.`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const conflictErrors = binActions
      .filter(ba => ba.bin_id)
      .map(ba => binActionConflict(ba.bin_id, ba.action))
      .filter(Boolean);
    if (conflictErrors.length > 0) {
      alert(conflictErrors.join('\n'));
      return;
    }

    setLoading(true);

    const payload = {
      vehicle_number: form.vehicle_number,
      driver_id: form.driver_id || null,
      customer_id: form.customer_id ? parseInt(form.customer_id, 10) : null,
      customer_location_id: form.customer_location_id ? parseInt(form.customer_location_id, 10) : null,
      dropoff_id: form.dropoff_id ? parseInt(form.dropoff_id, 10) : null,
      requester: form.requester || null,
      remarks: form.remarks || null,
    };

    let tripId = '';
    let saveError;

    if (editingTrip) {
      const { error } = await supabase.from('trips').update(payload).eq('id', editingTrip.id);
      saveError = error;
      tripId = editingTrip.id;
    } else {
      const { data, error } = await supabase.from('trips').insert(payload).select('id').single();
      saveError = error;
      tripId = data?.id ?? '';
    }

    if (saveError) {
      setLoading(false);
      alert('Error saving trip: ' + saveError.message);
      return;
    }

    if (editingTrip) {
      await supabase.from('trip_bins').delete().eq('trip_id', tripId);
    }
    const validBinActions = binActions.filter(ba => ba.bin_id);
    if (validBinActions.length > 0) {
      await supabase.from('trip_bins').insert(
        validBinActions.map(ba => ({ trip_id: tripId, bin_id: ba.bin_id, action: ba.action }))
      );
    }

    setLoading(false);
    setShowModal(false);
    fetchTrips();
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
    // Unlink weigh_bridge records before deleting — FK prevents cascade delete, but records should be preserved
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
    onEdit: openEdit,
    onDelete: handleDelete,
    onPreview: (trip) => { setPreviewTrip(trip); setCopied(false); },
  };

  return (
    <main className="max-w-7xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Trips</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">
          + New Trip
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 mb-5">
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
        <div className="bg-white border rounded-lg overflow-hidden">
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

      {/* Trip create/edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingTrip ? 'Edit Trip' : 'New Trip'}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Vehicle</label>
                <select name="vehicle_number" value={form.vehicle_number} onChange={handleChange} required className="w-full border rounded px-3 py-2">
                  <option value="">Select vehicle</option>
                  {vehicles.map(v => <option key={v.plate_number} value={v.plate_number}>{v.plate_number}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Driver</label>
                <select name="driver_id" value={form.driver_id} onChange={handleChange} className="w-full border rounded px-3 py-2">
                  <option value="">— No driver —</option>
                  {drivers.map(d => <option key={d.employee_id} value={d.employee_id}>{d.name} ({d.employee_id})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Customer</label>
                <select
                  name="customer_id"
                  value={showNewCustomer ? '__new__' : form.customer_id}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">— No customer —</option>
                  {customerOptions.map(c => <option key={c.customer_id} value={String(c.customer_id)}>{c.name}</option>)}
                  <option value="__new__">+ Create new customer…</option>
                </select>

                {!showNewCustomer && form.customer_id && sitesForCustomer.length > 0 && (
                  <div className="mt-2">
                    <select
                      name="customer_location_id"
                      value={form.customer_location_id}
                      onChange={handleChange}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">— Select site —</option>
                      {sitesForCustomer.map(s => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </select>
                    {selectedSite && (
                      <div className="mt-2 px-3 py-2 bg-gray-50 border rounded text-sm text-gray-600 space-y-0.5">
                        {selectedSite.address && <div><span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-2">Address</span>{selectedSite.address}</div>}
                        {selectedSite.contact_person && <div><span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-2">Contact</span>{selectedSite.contact_person}{selectedSite.contact_number ? ` · ${selectedSite.contact_number}` : ''}</div>}
                      </div>
                    )}
                  </div>
                )}

                {showNewCustomer && (
                  <div className="mt-3 p-4 border border-blue-200 rounded-lg bg-blue-50 space-y-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">New Customer</p>
                    <div>
                      <label className="block text-sm font-medium mb-1">Company Name</label>
                      <input value={newCustomerForm.name} onChange={e => setNewCustomerForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Pick up address</label>
                      <input value={newCustomerForm.address} onChange={e => setNewCustomerForm(prev => ({ ...prev, address: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Person</label>
                      <input value={newCustomerForm.contact_person} onChange={e => setNewCustomerForm(prev => ({ ...prev, contact_person: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Number</label>
                      <input value={newCustomerForm.contact_number} onChange={e => setNewCustomerForm(prev => ({ ...prev, contact_number: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSaveNewCustomer} disabled={savingCustomer || !newCustomerForm.name.trim()} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {savingCustomer ? 'Saving...' : 'Save Customer'}
                      </button>
                      <button type="button" onClick={() => { setShowNewCustomer(false); setNewCustomerForm(emptyCustomerForm); }} className="border px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Drop off location</label>
                <select name="dropoff_id" value={form.dropoff_id} onChange={handleChange} className="w-full border rounded px-3 py-2">
                  <option value="">— No drop off —</option>
                  {locationOptions.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                </select>

                {selectedDropoffAddress && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 border rounded text-sm text-gray-600">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-2">Drop off address</span>
                    {selectedDropoffAddress}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Requester</label>
                <input name="requester" value={form.requester} onChange={handleChange} className="w-full border rounded px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Remarks</label>
                <textarea name="remarks" value={form.remarks} onChange={handleChange} rows={2} className="w-full border rounded px-3 py-2 resize-none" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Bin Movements</label>
                <div className="space-y-2">
                  {binActions.map((ba, i) => {
                    const selectedBin = binOptions.find(b => b.id === ba.bin_id);
                    const conflict = ba.bin_id ? binActionConflict(ba.bin_id, ba.action) : null;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex gap-2 items-center">
                          <select
                            value={ba.bin_id}
                            onChange={e => {
                              const bin = binOptions.find(b => b.id === e.target.value);
                              const action = bin?.location_id ? 'dropoff' : (bin?.customer_id || bin?.customer_location_id) ? 'pickup' : ba.action;
                              setBinActions(prev => prev.map((a, j) => j === i ? { ...a, bin_id: e.target.value, action } : a));
                            }}
                            className="flex-1 border rounded px-3 py-2 text-sm"
                          >
                            <option value="">Select bin</option>
                            {binOptions.map(b => <option key={b.id} value={b.id}>{b.serial_number}</option>)}
                          </select>
                          <select
                            value={ba.action}
                            onChange={e => setBinActions(prev => prev.map((a, j) => j === i ? { ...a, action: e.target.value as 'dropoff' | 'pickup' | 'roundtrip' } : a))}
                            className={`border rounded px-3 py-2 text-sm ${conflict ? 'border-red-400 bg-red-50' : ''}`}
                          >
                            <option value="dropoff" disabled={!!(selectedBin && binAtCustomer(selectedBin))}>Drop off</option>
                            <option value="pickup" disabled={!!(selectedBin && binAtYard(selectedBin))}>Pick up</option>
                            <option value="roundtrip" disabled={!!(selectedBin && binAtCustomer(selectedBin))}>Roundtrip</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setBinActions(prev => prev.filter((_, j) => j !== i))}
                            className="text-red-500 hover:text-red-700 px-1 text-lg leading-none"
                          >
                            ×
                          </button>
                        </div>
                        {conflict && (
                          <p className="text-xs text-red-600 pl-1">{conflict}</p>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setBinActions(prev => [...prev, { bin_id: '', action: 'dropoff' }])}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + Add bin
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading || showNewCustomer} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Saving...' : editingTrip ? 'Save Changes' : 'Create Trip'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp message preview modal */}
      {previewTrip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
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
