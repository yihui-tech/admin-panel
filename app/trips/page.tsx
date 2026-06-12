'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

type Vehicle = { plate_number: string };
type Driver = { employee_id: string; name: string };
type CustomerOption = { customer_id: number; name: string; address: string | null };
type CustomerLocationOption = { id: number; customer_id: number; name: string; address: string | null; contact_person: string | null; contact_number: string | null };
type LocationOption = { id: number; name: string; address: string | null };
type BinOption = { id: string; serial_number: string; customer_id: number | null; location_id: number | null; customer_location_id: number | null; customers: { name: string } | null; customer_locations: { name: string } | null; locations: { name: string } | null };
type OutboundLocationOption = { id: number; name: string };
type PendingBin = { bin_id: string; serial_number: string; action: 'dropoff' | 'pickup' | 'roundtrip'; location_override?: boolean };

const inputCls = 'w-full border-2 border-gray-200 rounded-xl px-4 py-3 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const dropdownCls = 'absolute z-20 top-full left-0 right-0 mt-1 border-2 border-gray-200 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto';
const dropdownItemCls = 'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 text-gray-900';

const binCurrentLocation = (bin: BinOption): { name: string } | null => {
  if (bin.customer_location_id && bin.customer_locations) return bin.customer_locations;
  if (bin.customer_id && bin.customers) return bin.customers;
  if (bin.location_id && bin.locations) return bin.locations;
  return null;
};

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

function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerLocationOptions, setCustomerLocationOptions] = useState<CustomerLocationOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [binOptions, setBinOptions] = useState<BinOption[]>([]);
  const [outboundLocationOptions, setOutboundLocationOptions] = useState<OutboundLocationOption[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [copied, setCopied] = useState(false);

  // Modal trip fields
  const [modalTripType, setModalTripType] = useState<'collection' | 'outbound' | 'customer_dropoff' | 'issue_bin'>('collection');
  const [modalTripDate, setModalTripDate] = useState(new Date().toISOString().slice(0, 10));
  const [modalRequester, setModalRequester] = useState('');
  const [modalRemarks, setModalRemarks] = useState('');
  const [modalCustVehiclePlate, setModalCustVehiclePlate] = useState('');

  // Vehicle combobox
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleValue, setVehicleValue] = useState('');
  const [showVehicle, setShowVehicle] = useState(false);

  // Driver combobox
  const [driverSearch, setDriverSearch] = useState('');
  const [driverValue, setDriverValue] = useState('');
  const [showDriver, setShowDriver] = useState(false);

  // Customer combobox
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerValue, setCustomerValue] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Site combobox
  const [siteSearch, setSiteSearch] = useState('');
  const [siteValue, setSiteValue] = useState('');
  const [showSite, setShowSite] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  // Dropoff location combobox
  const [dropoffSearch, setDropoffSearch] = useState('');
  const [dropoffValue, setDropoffValue] = useState('');
  const [showDropoff, setShowDropoff] = useState(false);
  const [addingDropoff, setAddingDropoff] = useState(false);
  const [newDropoffName, setNewDropoffName] = useState('');
  const [newDropoffAddress, setNewDropoffAddress] = useState('');
  const [savingDropoff, setSavingDropoff] = useState(false);

  // Source location combobox (outbound from-yard)
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceValue, setSourceValue] = useState('');
  const [showSource, setShowSource] = useState(false);

  // Outbound location combobox
  const [outboundSearch, setOutboundSearch] = useState('');
  const [outboundValue, setOutboundValue] = useState('');
  const [showOutbound, setShowOutbound] = useState(false);
  const [addingOutbound, setAddingOutbound] = useState(false);
  const [newOutboundName, setNewOutboundName] = useState('');
  const [newOutboundAddress, setNewOutboundAddress] = useState('');
  const [savingOutbound, setSavingOutbound] = useState(false);

  // Bins
  const [pendingBins, setPendingBins] = useState<PendingBin[]>([]);
  const [binSearch, setBinSearch] = useState('');
  const [binValue, setBinValue] = useState('');
  const [showBinDropdown, setShowBinDropdown] = useState(false);
  const [binAction, setBinAction] = useState<'dropoff' | 'pickup' | 'roundtrip'>('dropoff');

  const [driverFilter, setDriverFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const searchParams = useSearchParams();
  const prefillBinId = searchParams.get('prefill_bin');
  const prefillAction = searchParams.get('prefill_action') as 'dropoff' | 'pickup' | null;
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

  const fetchLookups = async () => {
    const [v, d, c, cl, l, ol, b] = await Promise.all([
      supabase.from('vehicles').select('plate_number').eq('purpose', 'Goods').order('plate_number'),
      supabase.from('drivers').select('employee_id, name').order('name'),
      supabase.from('customers').select('customer_id, name, address').order('name'),
      supabase.from('customer_locations').select('id, customer_id, name, address, contact_person, contact_number').order('name'),
      supabase.from('locations').select('id, name, address').order('name'),
      supabase.from('outbound_locations').select('id, name').order('name'),
      supabase.from('bins').select('id, serial_number, customer_id, location_id, customer_location_id, customers(name), customer_locations(name), locations(name)').order('serial_number'),
    ]);
    if (v.data) setVehicles(v.data);
    if (d.data) setDrivers(d.data);
    if (c.data) setCustomerOptions(c.data);
    if (cl.data) setCustomerLocationOptions(cl.data);
    if (l.data) setLocationOptions(l.data);
    if (ol.data) setOutboundLocationOptions(ol.data);
    if (b.data) setBinOptions(b.data);
  };

  useEffect(() => {
    fetchTrips();
    fetchLookups();
  }, []);

  useEffect(() => {
    if (prefillBinId && binOptions.length > 0 && !prefillDone.current) {
      prefillDone.current = true;
      const bin = binOptions.find(b => b.id === prefillBinId);
      resetModalState();
      setEditingTrip(null);
      if (bin) {
        setPendingBins([{ bin_id: prefillBinId, serial_number: bin.serial_number, action: prefillAction ?? 'dropoff', location_override: true }]);
      }
      setShowModal(true);
    }
  }, [binOptions]);

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

  const sitesForCustomer = customerLocationOptions.filter(l => l.customer_id === Number(customerValue));
  const isDropoff = modalTripType === 'customer_dropoff';
  const isIssueBin = modalTripType === 'issue_bin';

  const selectedBin = binOptions.find(b => b.id === binValue);
  const binAtCustomer = (bin: BinOption) => !!(bin.customer_id || bin.customer_location_id);
  const binAtYard = (bin: BinOption) => !!bin.location_id;
  const binConflictMsg = selectedBin ? (() => {
    const bin = selectedBin;
    const atCustomer = binAtCustomer(bin);
    if (binAction === 'roundtrip' && atCustomer) return `Bin ${bin.serial_number} is at a customer site — use Collect instead.`;
    if (atCustomer && binAction === 'dropoff') return `Bin ${bin.serial_number} is already at a customer site — use Collect instead.`;
    if (bin.location_id && binAction === 'pickup') return `Bin ${bin.serial_number} is at the yard — use Issue instead.`;
    return null;
  })() : null;

  const eligibleBins = binOptions.filter(b => {
    if (pendingBins.some(pb => pb.bin_id === b.id)) return false;
    if (!b.serial_number.toLowerCase().includes(binSearch.toLowerCase())) return false;
    const atCustomer = binAtCustomer(b);
    const atYard = binAtYard(b);
    const unknown = !atCustomer && !atYard;
    if (binAction === 'dropoff') return unknown || atYard;
    if (binAction === 'pickup') {
      if (!atCustomer && !unknown) return false;
      if (siteValue) return unknown || b.customer_location_id === Number(siteValue);
      if (customerValue) return unknown || b.customer_id === Number(customerValue);
      return unknown || atCustomer;
    }
    return unknown || atYard; // roundtrip
  });

  const resetModalState = () => {
    setModalTripType('collection'); setModalTripDate(new Date().toISOString().slice(0, 10));
    setModalRequester(''); setModalRemarks(''); setModalCustVehiclePlate('');
    setVehicleSearch(''); setVehicleValue('');
    setDriverSearch(''); setDriverValue('');
    setCustomerSearch(''); setCustomerValue(''); setAddingCustomer(false); setNewCustomerName('');
    setSiteSearch(''); setSiteValue(''); setAddingSite(false); setNewSiteName(''); setNewSiteAddress('');
    setDropoffSearch(''); setDropoffValue(''); setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress('');
    setSourceSearch(''); setSourceValue('');
    setOutboundSearch(''); setOutboundValue(''); setAddingOutbound(false); setNewOutboundName(''); setNewOutboundAddress('');
    setPendingBins([]); setBinSearch(''); setBinValue(''); setBinAction('dropoff');
  };

  const openCreate = () => {
    resetModalState();
    setEditingTrip(null);
    setShowModal(true);
  };

  const openEdit = (trip: Trip) => {
    resetModalState();
    setModalTripType((trip.trip_type ?? 'collection') as 'collection' | 'outbound' | 'customer_dropoff' | 'issue_bin');
    setModalTripDate(trip.trip_date ?? new Date().toISOString().slice(0, 10));
    setModalRequester(trip.requester ?? '');
    setModalRemarks(trip.remarks ?? '');
    setModalCustVehiclePlate(trip.customer_vehicle_plate ?? '');
    if (trip.vehicle_number) { setVehicleValue(trip.vehicle_number); setVehicleSearch(trip.vehicle_number); }
    if (trip.driver_id) {
      const d = drivers.find(dr => dr.employee_id === trip.driver_id);
      setDriverValue(trip.driver_id); setDriverSearch(d ? `${d.name} (${d.employee_id})` : trip.driver_id);
    }
    if (trip.customer_id) {
      const c = customerOptions.find(co => co.customer_id === Number(trip.customer_id));
      setCustomerValue(String(trip.customer_id)); setCustomerSearch(c?.name ?? String(trip.customer_id));
    }
    if (trip.customer_location_id) {
      const s = customerLocationOptions.find(l => l.id === trip.customer_location_id);
      setSiteValue(String(trip.customer_location_id)); setSiteSearch(s?.name ?? String(trip.customer_location_id));
    }
    if (trip.dropoff_id) {
      const l = locationOptions.find(lo => String(lo.id) === trip.dropoff_id);
      setDropoffValue(trip.dropoff_id); setDropoffSearch(l?.name ?? trip.dropoff_id);
    }
    if (trip.source_location_id) {
      const l = locationOptions.find(lo => String(lo.id) === trip.source_location_id);
      setSourceValue(trip.source_location_id); setSourceSearch(l?.name ?? trip.source_location_id);
    }
    if (trip.outbound_location_id) {
      const l = outboundLocationOptions.find(lo => lo.id === trip.outbound_location_id);
      setOutboundValue(String(trip.outbound_location_id)); setOutboundSearch(l?.name ?? String(trip.outbound_location_id));
    }
    const bins = trip.trip_bins.filter(tb => !tb.removed_at).map(tb => ({
      bin_id: tb.bin_id,
      serial_number: tb.bins?.serial_number ?? tb.bin_id,
      action: tb.action as 'dropoff' | 'pickup' | 'roundtrip',
    }));
    setPendingBins(bins);
    setEditingTrip(trip);
    setShowModal(true);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    setSavingCustomer(true);
    const { data, error } = await supabase.from('customers').insert({ name: newCustomerName.trim() }).select('customer_id, name, address').single();
    setSavingCustomer(false);
    if (error) { alert('Error creating customer: ' + error.message); return; }
    if (data) {
      setCustomerOptions(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerValue(String(data.customer_id)); setCustomerSearch(data.name);
      setSiteValue(''); setSiteSearch('');
      setAddingCustomer(false); setNewCustomerName('');
    }
  };

  const handleCreateSite = async () => {
    if (!newSiteName.trim() || !customerValue) return;
    setSavingSite(true);
    const { data, error } = await supabase.from('customer_locations').insert({ customer_id: Number(customerValue), name: newSiteName.trim(), address: newSiteAddress.trim() || null }).select('id, customer_id, name, address, contact_person, contact_number').single();
    setSavingSite(false);
    if (error) { alert('Error creating site: ' + error.message); return; }
    if (data) {
      setCustomerLocationOptions(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSiteValue(String(data.id)); setSiteSearch(data.name);
      setAddingSite(false); setNewSiteName(''); setNewSiteAddress('');
    }
  };

  const handleCreateDropoff = async () => {
    if (!newDropoffName.trim()) return;
    setSavingDropoff(true);
    const { data, error } = await supabase.from('locations').insert({ name: newDropoffName.trim(), address: newDropoffAddress.trim() || null }).select('id, name, address').single();
    setSavingDropoff(false);
    if (error) { alert('Error creating location: ' + error.message); return; }
    if (data) {
      setLocationOptions(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setDropoffValue(String(data.id)); setDropoffSearch(data.name);
      setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress('');
    }
  };

  const handleCreateOutbound = async () => {
    if (!newOutboundName.trim()) return;
    setSavingOutbound(true);
    const { data, error } = await supabase.from('outbound_locations').insert({ name: newOutboundName.trim(), address: newOutboundAddress.trim() || null }).select('id, name').single();
    setSavingOutbound(false);
    if (error) { alert('Error creating destination: ' + error.message); return; }
    if (data) {
      setOutboundLocationOptions(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setOutboundValue(String(data.id)); setOutboundSearch(data.name);
      setAddingOutbound(false); setNewOutboundName(''); setNewOutboundAddress('');
    }
  };

  const handleAddPendingBin = () => {
    if (!binValue || !selectedBin) return;
    if (binConflictMsg) { alert(binConflictMsg); return; }
    if (pendingBins.some(b => b.bin_id === binValue)) return;
    setPendingBins(prev => [...prev, { bin_id: binValue, serial_number: selectedBin.serial_number, action: binAction }]);
    setBinValue(''); setBinSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (modalTripType === 'collection' && !vehicleValue) { alert('Vehicle is required.'); return; }
    if (modalTripType === 'outbound') {
      if (!vehicleValue) { alert('Vehicle is required.'); return; }
      if (!sourceValue) { alert('From Yard is required.'); return; }
      if (!outboundValue) { alert('To (Destination) is required.'); return; }
    }
    if (modalTripType === 'issue_bin' && !vehicleValue) { alert('Vehicle is required.'); return; }
    if (isDropoff && !modalCustVehiclePlate.trim()) { alert('Customer vehicle plate is required.'); return; }

    setLoading(true);

    const payload = {
      trip_type: modalTripType,
      trip_date: modalTripDate || null,
      vehicle_number: isDropoff ? null : (vehicleValue || null),
      driver_id: isDropoff ? null : (driverValue || null),
      customer_id: customerValue ? parseInt(customerValue, 10) : null,
      customer_location_id: (modalTripType === 'collection' || isIssueBin) && siteValue ? parseInt(siteValue, 10) : null,
      customer_vehicle_plate: isDropoff ? (modalCustVehiclePlate || null) : null,
      dropoff_id: (modalTripType === 'collection' || isDropoff) && dropoffValue ? parseInt(dropoffValue, 10) : null,
      source_location_id: modalTripType === 'outbound' && sourceValue ? parseInt(sourceValue, 10) : null,
      outbound_location_id: modalTripType === 'outbound' && outboundValue ? parseInt(outboundValue, 10) : null,
      requester: modalRequester || null,
      remarks: modalRemarks || null,
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
    if (pendingBins.length > 0) {
      await supabase.from('trip_bins').insert(
        pendingBins.map(b => ({ trip_id: tripId, bin_id: b.bin_id, action: b.action, location_override: b.location_override ?? false }))
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingTrip ? 'Edit Trip' : 'New Trip'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Trip type */}
              <div className="flex gap-2 flex-wrap">
                {([['collection','Collection','bg-blue-600'],['outbound','Outbound','bg-orange-500'],['customer_dropoff','Customer Drop-off','bg-purple-600'],['issue_bin','Issue Bin','bg-green-600']] as const).map(([v,l,c]) => (
                  <button key={v} type="button"
                    onClick={() => { resetModalState(); setModalTripType(v); setModalTripDate(modalTripDate); }}
                    className={`px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-colors ${modalTripType === v ? `${c} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                  >{l}</button>
                ))}
              </div>

              {/* Trip date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Trip Date</label>
                <input type="date" value={modalTripDate} onChange={e => setModalTripDate(e.target.value)} required className={inputCls} />
              </div>

              {/* Vehicle (not customer_dropoff) */}
              {!isDropoff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Vehicle</label>
                  <div className="relative">
                    <input value={vehicleSearch} onChange={e => { setVehicleSearch(e.target.value); setVehicleValue(''); setShowVehicle(true); }} onFocus={() => setShowVehicle(true)} onBlur={() => setTimeout(() => setShowVehicle(false), 150)} placeholder="Search plate…" className={inputCls} />
                    {showVehicle && (
                      <div className={dropdownCls}>
                        {vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).map(v => (
                          <button key={v.plate_number} type="button" onMouseDown={() => { setVehicleValue(v.plate_number); setVehicleSearch(v.plate_number); setShowVehicle(false); }} className={dropdownItemCls}>{v.plate_number}</button>
                        ))}
                        {!vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).length && <p className="px-4 py-2 text-sm text-gray-400">No vehicles found</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Driver (not customer_dropoff) */}
              {!isDropoff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Driver</label>
                  <div className="relative">
                    <input value={driverSearch} onChange={e => { setDriverSearch(e.target.value); setDriverValue(''); setShowDriver(true); }} onFocus={() => setShowDriver(true)} onBlur={() => setTimeout(() => setShowDriver(false), 150)} placeholder="Search driver…" className={inputCls} />
                    {showDriver && (
                      <div className={dropdownCls}>
                        {drivers.filter(d => `${d.name} ${d.employee_id}`.toLowerCase().includes(driverSearch.toLowerCase())).map(d => (
                          <button key={d.employee_id} type="button" onMouseDown={() => { setDriverValue(d.employee_id); setDriverSearch(`${d.name} (${d.employee_id})`); setShowDriver(false); }} className={dropdownItemCls}>{d.name} <span className="text-gray-400">({d.employee_id})</span></button>
                        ))}
                        {!drivers.filter(d => `${d.name} ${d.employee_id}`.toLowerCase().includes(driverSearch.toLowerCase())).length && <p className="px-4 py-2 text-sm text-gray-400">No drivers found</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer vehicle plate (customer_dropoff) */}
              {isDropoff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Vehicle Plate <span className="text-red-500">*</span></label>
                  <input value={modalCustVehiclePlate} onChange={e => setModalCustVehiclePlate(e.target.value.toUpperCase())} placeholder="e.g. SBX1234A" className={inputCls} />
                </div>
              )}

              {/* Outbound: From Yard + To Destination */}
              {modalTripType === 'outbound' && (<>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">From Yard <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input value={sourceSearch} onChange={e => { setSourceSearch(e.target.value); setSourceValue(''); setShowSource(true); }} onFocus={() => setShowSource(true)} onBlur={() => setTimeout(() => setShowSource(false), 150)} placeholder="Search yard…" className={inputCls} />
                    {showSource && (
                      <div className={dropdownCls}>
                        {locationOptions.filter(l => l.name.toLowerCase().includes(sourceSearch.toLowerCase())).map(l => (
                          <button key={l.id} type="button" onMouseDown={() => { setSourceValue(String(l.id)); setSourceSearch(l.name); setShowSource(false); }} className={dropdownItemCls}>{l.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">To Destination <span className="text-red-500">*</span></label>
                    <button type="button" onClick={() => { setAddingOutbound(true); setShowOutbound(false); }} className="text-xs text-blue-600 hover:underline">+ Add new</button>
                  </div>
                  {addingOutbound ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newOutboundName} onChange={e => setNewOutboundName(e.target.value)} placeholder="Destination name" className={inputCls} autoFocus />
                      <input value={newOutboundAddress} onChange={e => setNewOutboundAddress(e.target.value)} placeholder="Address (optional)" className={inputCls} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateOutbound} disabled={!newOutboundName.trim() || savingOutbound} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{savingOutbound ? 'Saving...' : 'Save'}</button>
                        <button type="button" onClick={() => { setAddingOutbound(false); setNewOutboundName(''); setNewOutboundAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 border-2 border-gray-200 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={outboundSearch} onChange={e => { setOutboundSearch(e.target.value); setOutboundValue(''); setShowOutbound(true); }} onFocus={() => setShowOutbound(true)} onBlur={() => setTimeout(() => setShowOutbound(false), 150)} placeholder="Search destination…" className={inputCls} />
                      {showOutbound && (
                        <div className={dropdownCls}>
                          {outboundLocationOptions.filter(l => l.name.toLowerCase().includes(outboundSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setOutboundValue(String(l.id)); setOutboundSearch(l.name); setShowOutbound(false); }} className={dropdownItemCls}>{l.name}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>)}

              {/* Customer + Site (all except outbound) */}
              {modalTripType !== 'outbound' && (
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-gray-700">Customer</label>
                      <button type="button" onClick={() => { setAddingCustomer(true); setShowCustomer(false); }} className="text-xs text-blue-600 hover:underline">+ Add new</button>
                    </div>
                    {addingCustomer ? (
                      <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                        <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Company name" className={inputCls} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreateCustomer(); if (e.key === 'Escape') { setAddingCustomer(false); setNewCustomerName(''); }}} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateCustomer} disabled={!newCustomerName.trim() || savingCustomer} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{savingCustomer ? 'Saving...' : 'Save'}</button>
                          <button type="button" onClick={() => { setAddingCustomer(false); setNewCustomerName(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 border-2 border-gray-200 rounded-lg">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setCustomerValue(''); setSiteValue(''); setSiteSearch(''); setShowCustomer(true); }} onFocus={() => setShowCustomer(true)} onBlur={() => setTimeout(() => setShowCustomer(false), 150)} placeholder="Search customer…" className={inputCls} />
                        {showCustomer && (
                          <div className={dropdownCls}>
                            {customerOptions.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                              <button key={c.customer_id} type="button" onMouseDown={() => { setCustomerValue(String(c.customer_id)); setCustomerSearch(c.name); setSiteValue(''); setSiteSearch(''); setShowCustomer(false); }} className={dropdownItemCls}>{c.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {customerValue && !addingCustomer && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-semibold text-gray-700">Site</label>
                        <button type="button" onClick={() => { setAddingSite(true); setShowSite(false); }} className="text-xs text-blue-600 hover:underline">+ Add new</button>
                      </div>
                      {addingSite ? (
                        <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                          <input value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="Site name" className={inputCls} autoFocus />
                          <input value={newSiteAddress} onChange={e => setNewSiteAddress(e.target.value)} placeholder="Address" className={inputCls} />
                          <div className="flex gap-2">
                            <button type="button" onClick={handleCreateSite} disabled={!newSiteName.trim() || savingSite} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{savingSite ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => { setAddingSite(false); setNewSiteName(''); setNewSiteAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 border-2 border-gray-200 rounded-lg">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <input value={siteSearch} onChange={e => { setSiteSearch(e.target.value); setSiteValue(''); setShowSite(true); }} onFocus={() => setShowSite(true)} onBlur={() => setTimeout(() => setShowSite(false), 150)} placeholder="Search site…" className={inputCls} />
                          {showSite && (
                            <div className={dropdownCls}>
                              {sitesForCustomer.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase())).map(s => (
                                <button key={s.id} type="button" onMouseDown={() => { setSiteValue(String(s.id)); setSiteSearch(s.name); setShowSite(false); }} className={dropdownItemCls}>{s.name}{s.address && <div className="text-xs text-gray-400">{s.address}</div>}</button>
                              ))}
                              {!sitesForCustomer.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase())).length && <p className="px-4 py-2 text-sm text-gray-400">No sites — add one above</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Delivery location (collection + customer_dropoff) */}
              {(modalTripType === 'collection' || isDropoff) && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">Delivery Location {modalTripType === 'collection' && <span className="text-red-500">*</span>}</label>
                    <button type="button" onClick={() => { setAddingDropoff(true); setShowDropoff(false); }} className="text-xs text-blue-600 hover:underline">+ Add new</button>
                  </div>
                  {addingDropoff ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newDropoffName} onChange={e => setNewDropoffName(e.target.value)} placeholder="Location name" className={inputCls} autoFocus />
                      <input value={newDropoffAddress} onChange={e => setNewDropoffAddress(e.target.value)} placeholder="Address (optional)" className={inputCls} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateDropoff} disabled={!newDropoffName.trim() || savingDropoff} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{savingDropoff ? 'Saving...' : 'Save'}</button>
                        <button type="button" onClick={() => { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 border-2 border-gray-200 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={dropoffSearch} onChange={e => { setDropoffSearch(e.target.value); setDropoffValue(''); setShowDropoff(true); }} onFocus={() => setShowDropoff(true)} onBlur={() => setTimeout(() => setShowDropoff(false), 150)} placeholder="Search location…" className={inputCls} />
                      {showDropoff && (
                        <div className={dropdownCls}>
                          {locationOptions.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setDropoffValue(String(l.id)); setDropoffSearch(l.name); setShowDropoff(false); }} className={dropdownItemCls}>{l.name}{l.address && <div className="text-xs text-gray-400">{l.address}</div>}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Requester</label>
                <input value={modalRequester} onChange={e => setModalRequester(e.target.value)} placeholder="Who placed this order" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Remarks</label>
                <textarea value={modalRemarks} onChange={e => setModalRemarks(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
              </div>

              {/* Bins (not for customer_dropoff) */}
              {!isDropoff && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Bins <span className="text-gray-400 font-normal">(optional)</span></h3>
                  <div className="space-y-2">
                    {pendingBins.map(pb => (
                      <div key={pb.bin_id} className="flex items-center gap-3 border-2 border-gray-100 rounded-xl px-3 py-2.5 bg-white">
                        <span className={`font-bold text-lg w-6 shrink-0 ${pb.action === 'dropoff' ? 'text-blue-600' : pb.action === 'pickup' ? 'text-orange-500' : 'text-purple-600'}`}>
                          {pb.action === 'dropoff' ? '↓' : pb.action === 'pickup' ? '↑' : '↕'}
                        </span>
                        <div className="flex-1 text-sm">
                          <span className="font-semibold">{pb.serial_number}</span>
                          <span className="ml-2 text-gray-500">{pb.action === 'dropoff' ? 'Issue Bin' : pb.action === 'pickup' ? 'Collect Bin' : 'Roundtrip'}</span>
                          {pb.location_override && <span className="ml-2 text-xs text-amber-600">(override)</span>}
                        </div>
                        <button type="button" onClick={() => setPendingBins(prev => prev.filter(b => b.bin_id !== pb.bin_id))} className="text-gray-400 hover:text-red-500 text-xl px-1">×</button>
                      </div>
                    ))}
                    <div className="flex gap-2 items-center">
                      {!isIssueBin && (
                        <select value={binAction} onChange={e => { setBinAction(e.target.value as 'dropoff' | 'pickup' | 'roundtrip'); setBinValue(''); setBinSearch(''); }} className="border-2 border-gray-200 rounded-xl px-3 py-3 text-sm bg-white shrink-0">
                          <option value="dropoff">Issue Bin</option>
                          <option value="pickup">Collect Bin</option>
                          <option value="roundtrip">Roundtrip</option>
                        </select>
                      )}
                      <div className="relative flex-1">
                        <input value={binSearch} onChange={e => { setBinSearch(e.target.value); setBinValue(''); setShowBinDropdown(true); }} onFocus={() => setShowBinDropdown(true)} onBlur={() => setTimeout(() => setShowBinDropdown(false), 150)} placeholder="Search bin…" className={inputCls} />
                        {showBinDropdown && (
                          <div className={dropdownCls}>
                            {eligibleBins.length === 0
                              ? <p className="px-4 py-2 text-sm text-gray-400">{binAction === 'pickup' && (siteValue || customerValue) ? 'No bins at this location' : 'No bins found'}</p>
                              : eligibleBins.map(b => {
                                  const loc = binCurrentLocation(b);
                                  return (
                                    <button key={b.id} type="button" onMouseDown={() => { setBinValue(b.id); setBinSearch(b.serial_number); setShowBinDropdown(false); }} className={dropdownItemCls}>
                                      <span>{b.serial_number}</span>
                                      {loc && <div className="text-xs text-gray-400">{loc.name}</div>}
                                    </button>
                                  );
                                })
                            }
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={handleAddPendingBin} disabled={!binValue || !!binConflictMsg} className="bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shrink-0">Add</button>
                    </div>
                    {selectedBin && binConflictMsg && <p className="text-sm text-red-600 font-medium">{binConflictMsg}</p>}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Saving...' : editingTrip ? 'Save Changes' : 'Create Trip'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="border-2 border-gray-200 px-6 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">
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

export default function TripsPageWrapper() {
  return (
    <Suspense>
      <TripsPage />
    </Suspense>
  );
}
