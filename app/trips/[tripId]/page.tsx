'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { supabase } from '../../lib/supabase';

const authSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Trip = {
  id: string;
  vehicle_number: string | null;
  driver_id: string | null;
  customer_id: number | null;
  customer_location_id: number | null;
  dropoff_id: number | null;
  source_location_id: number | null;
  outbound_location_id: number | null;
  customer_vehicle_plate: string | null;
  requester: string | null;
  remarks: string | null;
  status: string | null;
  trip_order: number | null;
  trip_type: string | null;
  trip_date: string | null;
  trip_time: string | null;
  created_at: string;
  completed_at: string | null;
  customers: { name: string; address: string | null } | null;
  customer_locations: { name: string; address: string | null } | null;
  locations: { name: string; address: string | null } | null;
  outbound_locations: { name: string; address: string | null } | null;
};

type TripForm = {
  vehicle_number: string;
  driver_id: string;
  customer_id: string;
  customer_location_id: string;
  dropoff_id: string;
  source_location_id: string;
  outbound_location_id: string;
  customer_vehicle_plate: string;
  requester: string;
  remarks: string;
  trip_type: string;
  trip_date: string;
  trip_time: string;
};

type Load = {
  id: string;
  trip_id: string;
  gross_weight: number;
  tare_weight: number | null;
  net_weight: number | null;
  rubbish_weight: number | null;
  foc_weight: number | null;
  material_type_ids: number[] | null;
  outbound_material_type_ids: number[] | null;
  material_custom: string | null;
  remarks: string | null;
  gross_time: string | null;
  tare_time: string | null;
  created_at: string;
};

type MaterialType = { id: number; name: string; category: string | null };

type TripBin = {
  id: string;
  bin_id: string;
  action: 'pickup' | 'dropoff' | 'roundtrip';
  removed_at: string | null;
  bins: { serial_number: string };
};

type Bin = {
  id: string;
  serial_number: string;
  customer_id: number | null;
  customer_location_id: number | null;
  location_id: number | null;
  customers: { name: string; address: string | null } | null;
  customer_locations: { name: string; address: string | null } | null;
  locations: { name: string; address: string | null } | null;
};
type Vehicle = { plate_number: string };
type Driver = { employee_id: string; name: string };
type Customer = { customer_id: number; name: string };
type CustomerLocation = { id: number; customer_id: number; name: string; address: string | null };
type Location = { id: number; name: string; address: string | null; location_type: string | null };
type OutboundLocation = { id: number; name: string; address: string | null };

const TRIP_SELECT =
  'id, vehicle_number, driver_id, customer_id, customer_location_id, dropoff_id, source_location_id, outbound_location_id, customer_vehicle_plate, requester, remarks, status, trip_order, trip_type, trip_date, trip_time, created_at, completed_at, customers(name, address), customer_locations(name, address), locations!dropoff_id(name, address), outbound_locations(name, address)';

const todayDate = () => new Date().toISOString().split('T')[0];
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const binActionConflict = (bin: Bin, action: 'pickup' | 'dropoff' | 'roundtrip'): string | null => {
  const atCustomer = !!(bin.customer_id || bin.customer_location_id);
  if (action === 'roundtrip') {
    if (atCustomer) return `Bin ${bin.serial_number} is at a customer site — use Collect instead.`;
    return null;
  }
  if (atCustomer && action === 'dropoff')
    return `Bin ${bin.serial_number} is already at a customer site — use Collect instead.`;
  if (bin.location_id && action === 'pickup')
    return `Bin ${bin.serial_number} is at the yard — use Issue instead.`;
  return null;
};

const binCurrentLocation = (bin: Bin): { name: string; address: string | null } | null => {
  if (bin.customer_location_id && bin.customer_locations) return bin.customer_locations;
  if (bin.customer_id && bin.customers) return bin.customers;
  if (bin.location_id && bin.locations) return bin.locations;
  return null;
};

const inputCls =
  'w-full border-2 border-gray-200 rounded-xl px-4 py-3 bg-white text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const btn =
  'inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700 px-5 py-3 text-base`;
const dropdownCls = 'absolute z-10 top-full left-0 right-0 mt-1 border-2 border-gray-200 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto';
const dropdownItemCls = 'w-full text-left px-4 py-2.5 text-base hover:bg-gray-50 border-b last:border-b-0 text-gray-900';

const tripToForm = (t: Trip): TripForm => ({
  vehicle_number: t.vehicle_number ?? '',
  driver_id: t.driver_id ?? '',
  customer_id: t.customer_id?.toString() ?? '',
  customer_location_id: t.customer_location_id?.toString() ?? '',
  dropoff_id: t.dropoff_id?.toString() ?? '',
  source_location_id: t.source_location_id?.toString() ?? '',
  outbound_location_id: t.outbound_location_id?.toString() ?? '',
  customer_vehicle_plate: t.customer_vehicle_plate ?? '',
  requester: t.requester ?? '',
  remarks: t.remarks ?? '',
  trip_type: t.trip_type ?? 'collection',
  trip_date: t.trip_date ?? todayDate(),
  trip_time: t.trip_time ?? '',
});

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.tripId as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [form, setForm] = useState<TripForm | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [materials, setMaterials] = useState<MaterialType[]>([]);
  const [tripBins, setTripBins] = useState<TripBin[]>([]);
  const [allBins, setAllBins] = useState<Bin[]>([]);
  const [binSearch, setBinSearch] = useState('');
  const [showBinDropdown, setShowBinDropdown] = useState(false);
  const [binForm, setBinForm] = useState<{ bin_id: string; action: 'pickup' | 'dropoff' | 'roundtrip' }>({ bin_id: '', action: 'dropoff' });
  const [savingBin, setSavingBin] = useState(false);
  const [loadForm, setLoadForm] = useState(() => ({
    material_type_ids: [] as number[],
    outbound_material_type_ids: [] as number[],
    material_custom: '',
    gross_weight: '',
    tare_weight: '',
    remarks: '',
    has_rubbish: false,
    rubbish_weight: '',
    has_foc: false,
    foc_weight: '',
    gross_time: nowTime(),
    tare_time: nowTime(),
  }));
  const [savingLoad, setSavingLoad] = useState(false);
  const [loadSuccess, setLoadSuccess] = useState(false);
  const [editingLoad, setEditingLoad] = useState<string | null>(null);
  const [savingTrip, setSavingTrip] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allSites, setAllSites] = useState<CustomerLocation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [outboundLocations, setOutboundLocations] = useState<OutboundLocation[]>([]);

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showVehicle, setShowVehicle] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [showDriver, setShowDriver] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [showSite, setShowSite] = useState(false);
  const [dropoffSearch, setDropoffSearch] = useState('');
  const [showDropoff, setShowDropoff] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [outboundLocationSearch, setOutboundLocationSearch] = useState('');
  const [showOutboundLocation, setShowOutboundLocation] = useState(false);

  const [addingDropoff, setAddingDropoff] = useState(false);
  const [newDropoffName, setNewDropoffName] = useState('');
  const [newDropoffAddress, setNewDropoffAddress] = useState('');
  const [savingDropoff, setSavingDropoff] = useState(false);

  const [addingOutboundLocation, setAddingOutboundLocation] = useState(false);
  const [newOutboundLocationName, setNewOutboundLocationName] = useState('');
  const [newOutboundLocationAddress, setNewOutboundLocationAddress] = useState('');
  const [savingOutboundLocation, setSavingOutboundLocation] = useState(false);

  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [addingSite, setAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [savingSiteNew, setSavingSiteNew] = useState(false);

  useEffect(() => {
    const init = async () => {
      const [
        tripRes, loadsRes, binsRes, tripBinsRes,
        vehiclesRes, driversRes, customersRes, sitesRes, locsRes, outboundLocsRes, matsRes,
      ] = await Promise.all([
        supabase.from('trips').select(TRIP_SELECT).eq('id', tripId).single(),
        supabase.from('weigh_bridge').select('id, trip_id, gross_weight, tare_weight, net_weight, rubbish_weight, foc_weight, material_type_ids, outbound_material_type_ids, material_custom, remarks, gross_time, tare_time, created_at').eq('trip_id', tripId).order('created_at'),
        supabase.from('bins').select('id, serial_number, customer_id, customer_location_id, location_id, customers(name, address), customer_locations(name, address), locations(name, address)').order('serial_number'),
        supabase.from('trip_bins').select('id, bin_id, action, removed_at, bins(serial_number)').eq('trip_id', tripId).is('removed_at', null),
        supabase.from('vehicles').select('plate_number').eq('purpose', 'Goods').order('plate_number'),
        supabase.from('drivers').select('employee_id, name').order('name'),
        supabase.from('customers').select('customer_id, name').order('name'),
        supabase.from('customer_locations').select('id, customer_id, name, address').order('name'),
        supabase.from('locations').select('id, name, address, location_type').order('name'),
        supabase.from('outbound_locations').select('id, name, address').order('name'),
        supabase.from('material_types').select('id, name, category').order('name'),
      ]);

      if (tripRes.data) {
        const t = tripRes.data as unknown as Trip;
        setTrip(t);
        setForm(tripToForm(t));
        setVehicleSearch(t.vehicle_number ?? '');
        const drv = driversRes.data?.find(d => d.employee_id === t.driver_id);
        setDriverSearch(drv ? `${drv.name} (${drv.employee_id})` : '');
        const cust = customersRes.data?.find(c => c.customer_id === t.customer_id);
        setCustomerSearch(cust?.name ?? '');
        const site = sitesRes.data?.find(s => s.id === t.customer_location_id);
        setSiteSearch(site?.name ?? '');
        const dropoff = locsRes.data?.find(l => l.id === t.dropoff_id);
        setDropoffSearch(dropoff ? dropoff.name + (dropoff.location_type === 'port' ? ' — Export' : '') : '');
        const source = locsRes.data?.find(l => l.id === t.source_location_id);
        setSourceSearch(source?.name ?? '');
        const outboundLoc = outboundLocsRes.data?.find(l => l.id === t.outbound_location_id);
        setOutboundLocationSearch(outboundLoc?.name ?? '');
      }
      if (loadsRes.data) setLoads(loadsRes.data as unknown as Load[]);
      if (binsRes.data) setAllBins(binsRes.data as unknown as Bin[]);
      if (tripBinsRes.data) setTripBins(tripBinsRes.data as unknown as TripBin[]);
      if (vehiclesRes.data) setVehicles(vehiclesRes.data);
      if (driversRes.data) setDrivers(driversRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (sitesRes.data) setAllSites(sitesRes.data);
      if (locsRes.data) setLocations(locsRes.data);
      if (outboundLocsRes.data) setOutboundLocations(outboundLocsRes.data);
      if (matsRes.data) setMaterials(matsRes.data);
      setLoading(false);
    };
    init();
  }, [tripId]);

  const fetchTripBins = async () => {
    const { data } = await supabase
      .from('trip_bins').select('id, bin_id, action, removed_at, bins(serial_number)').eq('trip_id', tripId).is('removed_at', null);
    if (data) setTripBins(data as unknown as TripBin[]);
  };

  const setField =
    (k: keyof TripForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(prev => {
        if (!prev) return prev;
        const next = { ...prev, [k]: e.target.value };
        if (k === 'customer_id') next.customer_location_id = '';
        return next;
      });
    };

  const handleCreateDropoff = async () => {
    if (!newDropoffName.trim()) return;
    setSavingDropoff(true);
    const { data, error } = await supabase
      .from('locations')
      .insert({ name: newDropoffName.trim(), address: newDropoffAddress.trim() || null })
      .select('id, name, location_type')
      .single();
    setSavingDropoff(false);
    if (error) { alert('Error creating location: ' + error.message); return; }
    const loc = data as Location;
    setLocations(prev => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
    setDropoffSearch(loc.name);
    setForm(p => p ? { ...p, dropoff_id: loc.id.toString() } : p);
    setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress('');
  };

  const handleCreateOutboundLocation = async () => {
    if (!newOutboundLocationName.trim()) return;
    setSavingOutboundLocation(true);
    const { data, error } = await supabase
      .from('outbound_locations')
      .insert({ name: newOutboundLocationName.trim(), address: newOutboundLocationAddress.trim() || null })
      .select('id, name, address')
      .single();
    setSavingOutboundLocation(false);
    if (error) { alert('Error creating outbound location: ' + error.message); return; }
    const loc = data as OutboundLocation;
    setOutboundLocations(prev => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
    setOutboundLocationSearch(loc.name);
    setForm(p => p ? { ...p, outbound_location_id: loc.id.toString() } : p);
    setAddingOutboundLocation(false); setNewOutboundLocationName(''); setNewOutboundLocationAddress('');
  };

  const updateBinLocations = async () => {
    if (!form) return;
    const yardBins = tripBins.filter(tb => tb.action === 'pickup' || tb.action === 'roundtrip');
    const dropoffBins = tripBins.filter(tb => tb.action === 'dropoff');
    const dropoffId = form.dropoff_id ? parseInt(form.dropoff_id, 10) : null;
    const sourceId = form.source_location_id ? parseInt(form.source_location_id, 10) : null;
    const yardId = dropoffId ?? sourceId;
    const custLocId = form.customer_location_id ? parseInt(form.customer_location_id, 10) : null;
    const custId = form.customer_id ? parseInt(form.customer_id, 10) : null;

    if (yardBins.length > 0 && yardId) {
      const { error } = await authSupabase.from('bins').update({
        location_id: yardId,
        customer_id: null,
        customer_location_id: null,
      }).in('id', yardBins.map(tb => tb.bin_id));
      if (error) alert('Error updating yard bins: ' + error.message);
    }
    if (dropoffBins.length > 0 && (custLocId || custId)) {
      const { error } = await authSupabase.from('bins').update({
        customer_location_id: custLocId,
        customer_id: custLocId ? null : custId,
        location_id: null,
      }).in('id', dropoffBins.map(tb => tb.bin_id));
      if (error) alert('Error updating customer bins: ' + error.message);
    }

  };

  const handleSaveTrip = async () => {
    if (!form || !trip) return;
    if (form.trip_type === 'collection') {
      if (!form.vehicle_number) { alert('Vehicle is required.'); return; }
      if (!form.driver_id) { alert('Driver is required.'); return; }
      if (!form.dropoff_id) { alert('Delivery Location is required.'); return; }
    }
    if (form.trip_type === 'outbound') {
      if (!form.vehicle_number) { alert('Vehicle is required.'); return; }
      if (!form.driver_id) { alert('Driver is required.'); return; }
      if (!form.source_location_id) { alert('From Yard is required.'); return; }
      if (!form.outbound_location_id) { alert('To (Destination) is required.'); return; }
    }
    if (isDropoff) {
      if (!form.customer_vehicle_plate.trim()) { alert('Customer vehicle plate is required.'); return; }
    }
    setSavingTrip(true);
    const { error } = await supabase.from('trips').update({
      vehicle_number: isDropoff ? null : (form.vehicle_number || null),
      driver_id: isDropoff ? null : (form.driver_id || null),
      customer_id: form.customer_id ? Number(form.customer_id) : null,
      customer_location_id: (form.trip_type === 'collection' || isIssueBin) && form.customer_location_id ? Number(form.customer_location_id) : null,
      dropoff_id: (form.trip_type === 'collection' || isDropoff) && form.dropoff_id ? Number(form.dropoff_id) : null,
      source_location_id: form.source_location_id ? Number(form.source_location_id) : null,
      outbound_location_id: form.trip_type === 'outbound' && form.outbound_location_id ? Number(form.outbound_location_id) : null,
      customer_vehicle_plate: isDropoff ? (form.customer_vehicle_plate.trim() || null) : null,
      requester: form.requester || null,
      remarks: form.remarks || null,
      trip_type: form.trip_type || 'collection',
      trip_date: form.trip_date || null,
      trip_time: form.trip_time || null,
    }).eq('id', trip.id);
    if (!error) {
      setTrip(prev => prev ? {
        ...prev,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        customer_location_id: (form.trip_type === 'collection' || isIssueBin) && form.customer_location_id ? Number(form.customer_location_id) : null,
        dropoff_id: (form.trip_type === 'collection' || isDropoff) && form.dropoff_id ? Number(form.dropoff_id) : null,
        trip_type: form.trip_type || 'collection',
      } : prev);
      if (trip.status === 'completed') await updateBinLocations();
    }
    setSavingTrip(false);
    if (error) alert('Error saving: ' + error.message);
  };

  const handleToggleStatus = async () => {
    if (!trip) return;
    const isOpen = trip.status === 'open';
    if (!confirm(isOpen ? 'Mark this trip as completed?' : 'Reopen this trip?')) return;
    if (isOpen && form?.trip_type === 'collection' && !form.customer_id && tripBins.some(tb => tb.action === 'dropoff')) {
      if (!confirm('No customer is set. Issue bins won\'t have their location updated. Continue?')) return;
    }
    setCompleting(true);
    const update = isOpen
      ? { status: 'completed', completed_at: new Date().toISOString() }
      : { status: 'open', completed_at: null };
    const { error } = await supabase.from('trips').update(update).eq('id', trip.id);
    if (!error) {
      if (isOpen) await updateBinLocations();
      setTrip(prev => prev ? { ...prev, ...update } : prev);
    } else {
      alert('Error: ' + error.message);
    }
    setCompleting(false);
  };

  const handleDelete = async () => {
    if (!trip) return;
    if (!confirm('Permanently delete this trip and all its loads and bins? This cannot be undone.')) return;
    setDeleting(true);
    await supabase.from('trip_bins').delete().eq('trip_id', trip.id);
    await supabase.from('weigh_bridge').update({ trip_id: null }).eq('trip_id', trip.id);
    const { error } = await supabase.from('trips').delete().eq('id', trip.id);
    setDeleting(false);
    if (!error) router.push('/trips');
    else alert('Error deleting: ' + error.message);
  };

  const handleAddBin = async () => {
    if (!trip || !binForm.bin_id) return;
    const bin = allBins.find(b => b.id === binForm.bin_id);
    if (bin) {
      const conflict = binActionConflict(bin, binForm.action);
      if (conflict) { alert(conflict); return; }
    }
    setSavingBin(true);
    const { error } = await supabase.from('trip_bins').insert({
      trip_id: trip.id, bin_id: binForm.bin_id, action: binForm.action,
    });
    setSavingBin(false);
    if (!error) { setBinForm({ bin_id: '', action: 'dropoff' }); setBinSearch(''); fetchTripBins(); }
    else alert('Error adding bin: ' + error.message);
  };

  const handleToggleBinAction = async (tripBinId: string, current: 'pickup' | 'dropoff' | 'roundtrip') => {
    const next = current === 'dropoff' ? 'pickup' : current === 'pickup' ? 'roundtrip' : 'dropoff';
    if (trip?.status === 'open') {
      const tripBin = tripBins.find(tb => tb.id === tripBinId);
      const bin = tripBin ? allBins.find(b => b.id === tripBin.bin_id) : null;
      if (bin) {
        const conflict = binActionConflict(bin, next);
        if (conflict) { alert(conflict); return; }
      }
    }
    const { error } = await supabase.from('trip_bins').update({ action: next }).eq('id', tripBinId);
    if (!error) fetchTripBins();
    else alert('Error: ' + error.message);
  };

  const rollbackBinLocation = async (binId: string) => {
    type PrevRow = {
      action: 'pickup' | 'dropoff' | 'roundtrip';
      trips: { dropoff_id: number | null; source_location_id: number | null; customer_id: number | null; customer_location_id: number | null; trip_date: string | null; trip_time: string | null; completed_at: string | null };
    };
    const { data } = await supabase
      .from('trip_bins')
      .select('action, trips!inner(dropoff_id, source_location_id, customer_id, customer_location_id, trip_date, trip_time, completed_at)')
      .eq('bin_id', binId)
      .neq('trip_id', trip!.id)
      .is('removed_at', null)
      .eq('trips.status', 'completed');

    const rows = ((data ?? []) as unknown as PrevRow[]).sort((a, b) => {
      const aDate = a.trips.trip_date ?? a.trips.completed_at?.slice(0, 10) ?? '';
      const aTime = a.trips.trip_time ?? a.trips.completed_at?.slice(11, 16) ?? '00:00';
      const bDate = b.trips.trip_date ?? b.trips.completed_at?.slice(0, 10) ?? '';
      const bTime = b.trips.trip_time ?? b.trips.completed_at?.slice(11, 16) ?? '00:00';
      return `${bDate}T${bTime}`.localeCompare(`${aDate}T${aTime}`);
    });

    if (rows.length === 0) {
      await authSupabase.from('bins').update({ location_id: null, customer_id: null, customer_location_id: null }).eq('id', binId);
    } else {
      const prev = rows[0];
      if (prev.action === 'dropoff') {
        await authSupabase.from('bins').update({
          customer_location_id: prev.trips.customer_location_id ?? null,
          customer_id: prev.trips.customer_location_id ? null : (prev.trips.customer_id ?? null),
          location_id: null,
        }).eq('id', binId);
      } else {
        await authSupabase.from('bins').update({
          location_id: prev.trips.dropoff_id ?? prev.trips.source_location_id ?? null,
          customer_id: null,
          customer_location_id: null,
        }).eq('id', binId);
      }
    }
  };

  const handleDeleteBin = async (tripBinId: string) => {
    const isCompleted = trip?.status === 'completed';
    const msg = isCompleted
      ? 'Remove this bin from the completed trip? The movement record will be kept as an audit trail and the bin\'s location will be rolled back to its previous state.'
      : 'Remove this bin from the trip?';
    if (!confirm(msg)) return;
    const { error } = await supabase.from('trip_bins').update({ removed_at: new Date().toISOString() }).eq('id', tripBinId);
    if (error) { alert('Error: ' + error.message); return; }
    if (isCompleted) {
      const tripBin = tripBins.find(tb => tb.id === tripBinId);
      if (tripBin) await rollbackBinLocation(tripBin.bin_id);
    }
    fetchTripBins();
  };

  const fetchLoads = async () => {
    const { data } = await supabase
      .from('weigh_bridge')
      .select('id, trip_id, gross_weight, tare_weight, net_weight, rubbish_weight, foc_weight, material_type_ids, outbound_material_type_ids, material_custom, remarks, gross_time, tare_time, created_at')
      .eq('trip_id', tripId).order('created_at');
    if (data) setLoads(data as unknown as Load[]);
  };

  const handleMaterialToggle = (id: number) => {
    if (isOutbound) {
      setLoadForm(prev => ({
        ...prev,
        outbound_material_type_ids: prev.outbound_material_type_ids.includes(id)
          ? prev.outbound_material_type_ids.filter(x => x !== id)
          : [...prev.outbound_material_type_ids, id],
      }));
    } else {
      setLoadForm(prev => ({
        ...prev,
        material_type_ids: prev.material_type_ids.includes(id)
          ? prev.material_type_ids.filter(x => x !== id)
          : [...prev.material_type_ids, id],
      }));
    }
  };

  const resetLoadForm = () => {
    setLoadForm({ material_type_ids: [], outbound_material_type_ids: [], material_custom: '', gross_weight: '', tare_weight: '', remarks: '', has_rubbish: false, rubbish_weight: '', has_foc: false, foc_weight: '', gross_time: nowTime(), tare_time: nowTime() });
    setEditingLoad(null);
  };

  const handleEditLoad = (load: Load) => {
    setLoadForm({
      material_type_ids: load.material_type_ids ?? [],
      outbound_material_type_ids: load.outbound_material_type_ids ?? [],
      material_custom: load.material_custom ?? '',
      gross_weight: load.gross_weight.toString(),
      tare_weight: load.tare_weight?.toString() ?? '',
      rubbish_weight: load.rubbish_weight?.toString() ?? '',
      has_rubbish: load.rubbish_weight != null,
      foc_weight: load.foc_weight?.toString() ?? '',
      has_foc: load.foc_weight != null,
      remarks: load.remarks ?? '',
      gross_time: load.gross_time ? load.gross_time.slice(0, 5) : nowTime(),
      tare_time: load.tare_time ? load.tare_time.slice(0, 5) : nowTime(),
    });
    setEditingLoad(load.id);
    setLoadSuccess(false);
  };

  const handleAddLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    setSavingLoad(true);
    setLoadSuccess(false);
    const gross = parseFloat(loadForm.gross_weight);
    const tare = loadForm.tare_weight ? parseFloat(loadForm.tare_weight) : null;
    const payload = {
      material_type_ids: !isOutbound ? loadForm.material_type_ids : null,
      outbound_material_type_ids: isOutbound ? loadForm.outbound_material_type_ids : null,
      material_custom: loadForm.material_custom || null,
      gross_weight: gross,
      tare_weight: tare,
      rubbish_weight: loadForm.has_rubbish && loadForm.rubbish_weight ? parseFloat(loadForm.rubbish_weight) : null,
      foc_weight: loadForm.has_foc && loadForm.foc_weight ? parseFloat(loadForm.foc_weight) : null,
      remarks: loadForm.remarks || null,
      gross_time: loadForm.gross_time || null,
      tare_time: loadForm.tare_time || null,
    };
    let error;
    if (editingLoad) {
      ({ error } = await authSupabase.from('weigh_bridge').update(payload).eq('id', editingLoad));
    } else {
      ({ error } = await supabase.from('weigh_bridge').insert({
        trip_id: trip.id,
        vehicle_number: isDropoff ? null : (form?.vehicle_number || null),
        driver_id: isDropoff ? null : (form?.driver_id || null),
        customer_id: isDropoff && form?.customer_id ? Number(form.customer_id) : null,
        ...payload,
      }));
    }
    setSavingLoad(false);
    if (!error) {
      setLoadSuccess(true);
      resetLoadForm();
      await fetchLoads();
    } else {
      alert('Error saving load: ' + error.message);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    setSavingCustomer(true);
    const { data, error } = await supabase
      .from('customers').insert({ name: newCustomerName.trim() }).select('customer_id, name').single();
    setSavingCustomer(false);
    if (error) { alert('Error creating customer: ' + error.message); return; }
    const c = data as Customer;
    setCustomers(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerSearch(c.name);
    setForm(p => p ? { ...p, customer_id: c.customer_id.toString(), customer_location_id: '' } : p);
    setSiteSearch('');
    setAddingCustomer(false); setNewCustomerName('');
  };

  const handleCreateSite = async () => {
    if (!newSiteName.trim() || !newSiteAddress.trim() || !form?.customer_id) return;
    setSavingSiteNew(true);
    const { data, error } = await supabase
      .from('customer_locations')
      .insert({ customer_id: Number(form.customer_id), name: newSiteName.trim(), address: newSiteAddress.trim() })
      .select('id, customer_id, name, address').single();
    setSavingSiteNew(false);
    if (error) { alert('Error creating site: ' + error.message); return; }
    const s = data as CustomerLocation;
    setAllSites(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
    setSiteSearch(s.name);
    setForm(p => p ? { ...p, customer_location_id: s.id.toString() } : p);
    setAddingSite(false); setNewSiteName(''); setNewSiteAddress('');
  };

  const materialNames = (ids: number[] | null) => {
    if (!ids || ids.length === 0) return null;
    return ids.map(id => materials.find(m => m.id === id)?.name).filter(Boolean).join(', ');
  };

  const totalNet = loads.reduce((sum, l) => sum + (l.net_weight ?? 0), 0);
  const totalRubbish = loads.reduce((sum, l) => sum + (l.rubbish_weight ?? 0), 0);
  const totalFoc = loads.reduce((sum, l) => sum + (l.foc_weight ?? 0), 0);
  const totalAdjustments = totalRubbish + totalFoc;
  const internalNet = totalNet - totalRubbish;
  const sitesForCustomer = allSites.filter(s => s.customer_id === Number(form?.customer_id));

  const eligibleBinsForEdit = allBins.filter(b => {
    if (tripBins.some(tb => tb.bins.serial_number === b.serial_number)) return false;
    if (!b.serial_number.toLowerCase().includes(binSearch.toLowerCase())) return false;
    const atCustomer = !!(b.customer_id || b.customer_location_id);
    const atYard = !!b.location_id;
    const unknown = !atCustomer && !atYard;
    if (binForm.action === 'dropoff') return unknown || atYard;
    if (binForm.action === 'pickup') {
      const custId = form?.customer_id ? Number(form.customer_id) : null;
      const siteId = form?.customer_location_id ? Number(form.customer_location_id) : null;
      if (!atCustomer && !unknown) return false;
      if (siteId) return unknown || b.customer_location_id === siteId;
      if (custId) return unknown || b.customer_id === custId;
      return unknown || atCustomer;
    }
    return unknown || atYard;
  });

  const isOutbound = form?.trip_type === 'outbound';
  const isDropoff = form?.trip_type === 'customer_dropoff';
  const isIssueBin = form?.trip_type === 'issue_bin';
  const displayMaterials = materials.filter(m =>
    isOutbound ? m.category === 'outbound' : m.category === 'inbound'
  );

  if (loading || !form || !trip) {
    return (
      <main className="w-full max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8 bg-white text-gray-900 min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{loading ? 'Loading...' : 'Trip not found'}</p>
      </main>
    );
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 bg-white text-gray-900 min-h-screen">
      <button onClick={() => router.push('/trips')} className="text-base text-blue-600 hover:underline mb-4 font-medium">
        ← Back to trips
      </button>

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">
          {isDropoff
            ? (trip.customer_vehicle_plate ?? trip.customers?.name ?? 'Drop-off')
            : (trip.vehicle_number ?? 'Trip')}
        </h1>
        <div className="flex items-center gap-2">
          {isOutbound && (
            <span className="text-sm px-3 py-1 rounded-full font-semibold bg-orange-100 text-orange-700">Outbound</span>
          )}
          {isDropoff && (
            <span className="text-sm px-3 py-1 rounded-full font-semibold bg-purple-100 text-purple-700">Customer Drop-off</span>
          )}
          {isIssueBin && (
            <span className="text-sm px-3 py-1 rounded-full font-semibold bg-green-100 text-green-700">Issue Bin</span>
          )}
          <span className={`text-sm px-3 py-1 rounded-full font-semibold ${trip.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
            {trip.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Trip Details + Bins */}
        <div className="col-span-2 space-y-5">

          {/* Trip Type */}
          <div className="flex gap-2 flex-wrap">
            {(['collection', 'outbound', 'customer_dropoff', 'issue_bin'] as const).map(type => {
              const labels: Record<string, string> = { collection: 'Collection', outbound: 'Outbound Goods', customer_dropoff: 'Customer Drop-off', issue_bin: 'Issue Bin' };
              const colors: Record<string, string> = { collection: 'bg-blue-600 border-blue-600', outbound: 'bg-orange-500 border-orange-500', customer_dropoff: 'bg-purple-600 border-purple-600', issue_bin: 'bg-green-600 border-green-600' };
              const active = form.trip_type === type;
              return (
                <button key={type} type="button"
                  disabled={trip.status !== 'open'}
                  onClick={() => setForm(p => p ? { ...p, trip_type: type, customer_vehicle_plate: type === 'customer_dropoff' ? p.customer_vehicle_plate : '', vehicle_number: type === 'customer_dropoff' ? '' : p.vehicle_number, driver_id: type === 'customer_dropoff' ? '' : p.driver_id } : p)}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-base transition-colors border-2 ${active ? `${colors[type]} text-white` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'} ${trip.status !== 'open' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>

          {/* Trip Details */}
          <section className="border-2 border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">Trip Details</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Trip Date</label>
                  <input type="date" value={form.trip_date} onChange={setField('trip_date')} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Time <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="time" value={form.trip_time} onChange={setField('trip_time')} className={inputCls} />
                </div>
              </div>

              {!isDropoff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Vehicle <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input value={vehicleSearch}
                      onChange={e => { setVehicleSearch(e.target.value); setForm(p => p ? { ...p, vehicle_number: '' } : p); setShowVehicle(true); }}
                      onFocus={() => setShowVehicle(true)}
                      onBlur={() => setTimeout(() => setShowVehicle(false), 150)}
                      placeholder="Search plate…" className={inputCls} />
                    {showVehicle && (
                      <div className={dropdownCls}>
                        {vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).map(v => (
                          <button key={v.plate_number} type="button" onMouseDown={() => { setVehicleSearch(v.plate_number); setForm(p => p ? { ...p, vehicle_number: v.plate_number } : p); setShowVehicle(false); }} className={dropdownItemCls}>{v.plate_number}</button>
                        ))}
                        {vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No vehicles found</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isDropoff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Driver <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input value={driverSearch}
                      onChange={e => { setDriverSearch(e.target.value); setForm(p => p ? { ...p, driver_id: '' } : p); setShowDriver(true); }}
                      onFocus={() => setShowDriver(true)}
                      onBlur={() => setTimeout(() => setShowDriver(false), 150)}
                      placeholder="Search driver name…" className={inputCls} />
                    {showDriver && (
                      <div className={dropdownCls}>
                        {drivers.filter(d => `${d.name} ${d.employee_id}`.toLowerCase().includes(driverSearch.toLowerCase())).map(d => (
                          <button key={d.employee_id} type="button" onMouseDown={() => { setDriverSearch(`${d.name} (${d.employee_id})`); setForm(p => p ? { ...p, driver_id: d.employee_id } : p); setShowDriver(false); }} className={dropdownItemCls}>
                            {d.name} <span className="text-gray-400 text-sm">({d.employee_id})</span>
                          </button>
                        ))}
                        {drivers.filter(d => `${d.name} ${d.employee_id}`.toLowerCase().includes(driverSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No drivers found</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collection / Issue Bin: Customer → Site */}
              {(form.trip_type === 'collection' || isIssueBin) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-gray-700">Customer</label>
                      <button type="button" onClick={() => { setAddingCustomer(true); setShowCustomer(false); }} className="text-xs text-blue-600 hover:underline font-medium">
                        + Add new
                      </button>
                    </div>
                    {addingCustomer ? (
                      <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                        <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Customer name" className={inputCls} autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateCustomer(); if (e.key === 'Escape') { setAddingCustomer(false); setNewCustomerName(''); } }} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateCustomer} disabled={!newCustomerName.trim() || savingCustomer} className={`${btnPrimary} py-2 text-sm`}>{savingCustomer ? 'Saving...' : 'Save'}</button>
                          <button type="button" onClick={() => { setAddingCustomer(false); setNewCustomerName(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={customerSearch}
                          onChange={e => { setCustomerSearch(e.target.value); setForm(p => p ? { ...p, customer_id: '', customer_location_id: '' } : p); setSiteSearch(''); setShowCustomer(true); }}
                          onFocus={() => setShowCustomer(true)}
                          onBlur={() => setTimeout(() => setShowCustomer(false), 150)}
                          placeholder="Search customer…" className={inputCls} />
                        {showCustomer && (
                          <div className={dropdownCls}>
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                              <button key={c.customer_id} type="button" onMouseDown={() => { setCustomerSearch(c.name); setForm(p => p ? { ...p, customer_id: c.customer_id.toString(), customer_location_id: '' } : p); setSiteSearch(''); setShowCustomer(false); }} className={dropdownItemCls}>{c.name}</button>
                            ))}
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No customers found</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-gray-700">Site</label>
                      {form.customer_id && !addingSite && (
                        <button type="button" onClick={() => { setAddingSite(true); setShowSite(false); }} className="text-xs text-blue-600 hover:underline font-medium">+ Add new</button>
                      )}
                    </div>
                    {addingSite && form.customer_id ? (
                      <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                        <input value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="Site name" className={inputCls} autoFocus
                          onKeyDown={e => { if (e.key === 'Escape') { setAddingSite(false); setNewSiteName(''); setNewSiteAddress(''); } }} />
                        <input value={newSiteAddress} onChange={e => setNewSiteAddress(e.target.value)} placeholder="Address (required)" className={inputCls}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateSite(); }} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateSite} disabled={!newSiteName.trim() || !newSiteAddress.trim() || savingSiteNew} className={`${btnPrimary} py-2 text-sm`}>{savingSiteNew ? 'Saving...' : 'Save'}</button>
                          <button type="button" onClick={() => { setAddingSite(false); setNewSiteName(''); setNewSiteAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={siteSearch}
                          onChange={e => { setSiteSearch(e.target.value); setForm(p => p ? { ...p, customer_location_id: '' } : p); setShowSite(true); }}
                          onFocus={() => { if (form?.customer_id) setShowSite(true); }}
                          onBlur={() => setTimeout(() => setShowSite(false), 150)}
                          placeholder={form?.customer_id ? 'Search site…' : 'Select customer first'}
                          disabled={!form?.customer_id} className={inputCls} />
                        {showSite && form?.customer_id && (
                          <div className={dropdownCls}>
                            {sitesForCustomer.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase())).map(s => (
                              <button key={s.id} type="button" onMouseDown={() => { setSiteSearch(s.name); setForm(p => p ? { ...p, customer_location_id: s.id.toString() } : p); setShowSite(false); }} className={dropdownItemCls}>
                                <div>{s.name}</div>
                                {s.address && <div className="text-xs text-gray-400 mt-0.5">{s.address}</div>}
                              </button>
                            ))}
                            {sitesForCustomer.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No sites found</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Drop-off: Customer + Plate + Delivery Location */}
              {isDropoff && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-gray-700">Customer</label>
                      <button type="button" onClick={() => { setAddingCustomer(true); setShowCustomer(false); }} className="text-xs text-blue-600 hover:underline font-medium">+ Add new</button>
                    </div>
                    {addingCustomer ? (
                      <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                        <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Customer name" className={inputCls} autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateCustomer(); if (e.key === 'Escape') { setAddingCustomer(false); setNewCustomerName(''); } }} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateCustomer} disabled={!newCustomerName.trim() || savingCustomer} className={`${btnPrimary} py-2 text-sm`}>{savingCustomer ? 'Saving...' : 'Save'}</button>
                          <button type="button" onClick={() => { setAddingCustomer(false); setNewCustomerName(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={customerSearch}
                          onChange={e => { setCustomerSearch(e.target.value); setForm(p => p ? { ...p, customer_id: '' } : p); setShowCustomer(true); }}
                          onFocus={() => setShowCustomer(true)}
                          onBlur={() => setTimeout(() => setShowCustomer(false), 150)}
                          placeholder="Search customer…" className={inputCls} />
                        {showCustomer && (
                          <div className={dropdownCls}>
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                              <button key={c.customer_id} type="button" onMouseDown={() => { setCustomerSearch(c.name); setForm(p => p ? { ...p, customer_id: c.customer_id.toString() } : p); setShowCustomer(false); }} className={dropdownItemCls}>{c.name}</button>
                            ))}
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No customers found</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Customer Vehicle Plate <span className="text-red-500">*</span>
                    </label>
                    <input value={form.customer_vehicle_plate}
                      onChange={e => setForm(p => p ? { ...p, customer_vehicle_plate: e.target.value.toUpperCase() } : p)}
                      placeholder="e.g. XYZ1234A" className={inputCls} />
                  </div>
                </div>
              )}
              {isDropoff && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">Delivery Location</label>
                    <button type="button" onClick={() => { setAddingDropoff(true); setShowDropoff(false); }} className="text-xs text-blue-600 hover:underline font-medium">+ Add new</button>
                  </div>
                  {addingDropoff ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newDropoffName} onChange={e => setNewDropoffName(e.target.value)} placeholder="Location name" className={inputCls} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); if (e.key === 'Escape') { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); } }} />
                      <input value={newDropoffAddress} onChange={e => setNewDropoffAddress(e.target.value)} placeholder="Address (optional)" className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateDropoff} disabled={!newDropoffName.trim() || savingDropoff} className={`${btnPrimary} py-2 text-sm`}>{savingDropoff ? 'Saving...' : 'Save'}</button>
                        <button type="button" onClick={() => { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={dropoffSearch}
                        onChange={e => { setDropoffSearch(e.target.value); setForm(p => p ? { ...p, dropoff_id: '' } : p); setShowDropoff(true); }}
                        onFocus={() => setShowDropoff(true)}
                        onBlur={() => setTimeout(() => setShowDropoff(false), 150)}
                        placeholder="Search yard location…" className={inputCls} />
                      {showDropoff && (
                        <div className={dropdownCls}>
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setDropoffSearch(l.name + (l.location_type === 'port' ? ' — Export' : '')); setForm(p => p ? { ...p, dropoff_id: l.id.toString() } : p); setShowDropoff(false); }} className={dropdownItemCls}>
                              {l.name}{l.location_type === 'port' && <span className="ml-1 text-sm text-gray-400">— Export</span>}
                            </button>
                          ))}
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No locations found</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outbound: From Yard */}
              {isOutbound && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    From Yard <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input value={sourceSearch}
                      onChange={e => { setSourceSearch(e.target.value); setForm(p => p ? { ...p, source_location_id: '' } : p); setShowSource(true); }}
                      onFocus={() => setShowSource(true)}
                      onBlur={() => setTimeout(() => setShowSource(false), 150)}
                      placeholder="Search yard/location…" className={inputCls} />
                    {showSource && (
                      <div className={dropdownCls}>
                        {locations.filter(l => l.name.toLowerCase().includes(sourceSearch.toLowerCase())).map(l => (
                          <button key={l.id} type="button" onMouseDown={() => { setSourceSearch(l.name); setForm(p => p ? { ...p, source_location_id: l.id.toString() } : p); setShowSource(false); }} className={dropdownItemCls}>{l.name}</button>
                        ))}
                        {locations.filter(l => l.name.toLowerCase().includes(sourceSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No locations found</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collection: Delivery Location */}
              {form.trip_type === 'collection' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">
                      Delivery Location <span className="text-red-500">*</span>
                    </label>
                    <button type="button" onClick={() => { setAddingDropoff(true); setShowDropoff(false); }} className="text-xs text-blue-600 hover:underline font-medium">+ Add new</button>
                  </div>
                  {addingDropoff ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newDropoffName} onChange={e => setNewDropoffName(e.target.value)} placeholder="Location name" className={inputCls} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); if (e.key === 'Escape') { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); } }} />
                      <input value={newDropoffAddress} onChange={e => setNewDropoffAddress(e.target.value)} placeholder="Address (optional)" className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateDropoff} disabled={!newDropoffName.trim() || savingDropoff} className={`${btnPrimary} py-2 text-sm`}>{savingDropoff ? 'Saving...' : 'Save'}</button>
                        <button type="button" onClick={() => { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={dropoffSearch}
                        onChange={e => { setDropoffSearch(e.target.value); setForm(p => p ? { ...p, dropoff_id: '' } : p); setShowDropoff(true); }}
                        onFocus={() => setShowDropoff(true)}
                        onBlur={() => setTimeout(() => setShowDropoff(false), 150)}
                        placeholder="Search location…" className={inputCls} />
                      {showDropoff && (
                        <div className={dropdownCls}>
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setDropoffSearch(l.name + (l.location_type === 'port' ? ' — Export' : '')); setForm(p => p ? { ...p, dropoff_id: l.id.toString() } : p); setShowDropoff(false); }} className={dropdownItemCls}>
                              {l.name}{l.location_type === 'port' && <span className="ml-1 text-sm text-gray-400">— Export</span>}
                            </button>
                          ))}
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No locations found</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outbound: To (outbound_locations) */}
              {isOutbound && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">
                      To (Destination) <span className="text-red-500">*</span>
                    </label>
                    <button type="button" onClick={() => { setAddingOutboundLocation(true); setShowOutboundLocation(false); }} className="text-xs text-blue-600 hover:underline font-medium">+ Add new</button>
                  </div>
                  {addingOutboundLocation ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newOutboundLocationName} onChange={e => setNewOutboundLocationName(e.target.value)} placeholder="e.g. Container, Jurong Port" className={inputCls} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateOutboundLocation(); if (e.key === 'Escape') { setAddingOutboundLocation(false); setNewOutboundLocationName(''); setNewOutboundLocationAddress(''); } }} />
                      <input value={newOutboundLocationAddress} onChange={e => setNewOutboundLocationAddress(e.target.value)} placeholder="Address (optional)" className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateOutboundLocation(); }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateOutboundLocation} disabled={!newOutboundLocationName.trim() || savingOutboundLocation} className={`${btnPrimary} py-2 text-sm`}>{savingOutboundLocation ? 'Saving...' : 'Save'}</button>
                        <button type="button" onClick={() => { setAddingOutboundLocation(false); setNewOutboundLocationName(''); setNewOutboundLocationAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={outboundLocationSearch}
                        onChange={e => { setOutboundLocationSearch(e.target.value); setForm(p => p ? { ...p, outbound_location_id: '' } : p); setShowOutboundLocation(true); }}
                        onFocus={() => setShowOutboundLocation(true)}
                        onBlur={() => setTimeout(() => setShowOutboundLocation(false), 150)}
                        placeholder="Search destination…" className={inputCls} />
                      {showOutboundLocation && (
                        <div className={dropdownCls}>
                          {outboundLocations.filter(l => l.name.toLowerCase().includes(outboundLocationSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setOutboundLocationSearch(l.name); setForm(p => p ? { ...p, outbound_location_id: l.id.toString() } : p); setShowOutboundLocation(false); }} className={dropdownItemCls}>
                              <div>{l.name}</div>
                              {l.address && <div className="text-xs text-gray-400 mt-0.5">{l.address}</div>}
                            </button>
                          ))}
                          {outboundLocations.filter(l => l.name.toLowerCase().includes(outboundLocationSearch.toLowerCase())).length === 0 && <p className="px-4 py-2.5 text-base text-gray-500">No destinations found</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Requester</label>
                <input value={form.requester} onChange={setField('requester')} placeholder="Who placed this order" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Remarks</label>
                <input value={form.remarks} onChange={setField('remarks')} placeholder="—" className={inputCls} />
              </div>

              <button onClick={handleSaveTrip} disabled={savingTrip} className={`${btnPrimary} w-full justify-center`}>
                {savingTrip ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>

          {/* Bins */}
          {!isDropoff && (
            <section className="border-2 border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3">Bins</h2>
              <div className="space-y-2">
                {tripBins.map(tb => {
                  const binData = allBins.find(b => b.serial_number === tb.bins.serial_number);
                  const conflict = trip.status === 'open' && binData ? binActionConflict(binData, tb.action) : null;
                  return (
                    <div key={tb.id} className={`border-2 rounded-xl px-4 py-3 bg-white ${conflict ? 'border-red-300' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => handleToggleBinAction(tb.id, tb.action)}
                          className={`font-bold text-xl w-8 shrink-0 ${tb.action === 'dropoff' ? 'text-blue-600' : tb.action === 'pickup' ? 'text-orange-500' : 'text-purple-600'}`}
                          title="Toggle action">
                          {tb.action === 'dropoff' ? '↓' : tb.action === 'pickup' ? '↑' : '↕'}
                        </button>
                        <div className="flex-1">
                          <span className="font-bold text-gray-900">{tb.bins.serial_number}</span>
                          <span className="ml-2 text-gray-600 text-sm">
                            {tb.action === 'dropoff' ? 'Issue bin' : tb.action === 'pickup' ? 'Collect bin' : 'Roundtrip'}
                          </span>
                        </div>
                        <button onClick={() => handleDeleteBin(tb.id)} className="text-gray-400 hover:text-red-500 transition-colors text-2xl leading-none px-1">×</button>
                      </div>
                      {conflict && <p className="text-sm text-red-600 font-medium mt-1.5 ml-11">{conflict}</p>}
                    </div>
                  );
                })}

                <div className="mt-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <select value={binForm.action}
                      onChange={e => { setBinForm(prev => ({ ...prev, action: e.target.value as 'pickup' | 'dropoff' | 'roundtrip', bin_id: '' })); setBinSearch(''); }}
                      className="border-2 border-gray-200 rounded-xl px-3 py-3 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0">
                      <option value="dropoff">Issue Bin</option>
                      <option value="pickup">Collect Bin</option>
                      <option value="roundtrip">Roundtrip</option>
                    </select>
                    <div className="relative flex-1">
                      <input value={binSearch}
                        onChange={e => { setBinSearch(e.target.value); setBinForm(prev => ({ ...prev, bin_id: '' })); setShowBinDropdown(true); }}
                        onFocus={() => setShowBinDropdown(true)}
                        onBlur={() => setTimeout(() => setShowBinDropdown(false), 150)}
                        placeholder={binForm.action === 'pickup' && (form.customer_location_id || form.customer_id) ? `Bins at ${form.customer_location_id ? 'selected site' : 'selected customer'}…` : 'Search bin…'}
                        className={inputCls} />
                      {showBinDropdown && (
                        <div className={dropdownCls}>
                          {eligibleBinsForEdit.length === 0
                            ? <p className="px-4 py-2.5 text-base text-gray-500">
                                {binForm.action === 'pickup' && (form.customer_location_id || form.customer_id) ? 'No bins at this location' : 'No bins found'}
                              </p>
                            : eligibleBinsForEdit.map(b => {
                                const loc = binCurrentLocation(b);
                                return (
                                  <button key={b.id} type="button"
                                    onMouseDown={() => { setBinForm(prev => ({ ...prev, bin_id: b.id })); setBinSearch(b.serial_number); setShowBinDropdown(false); }}
                                    className={dropdownItemCls}>
                                    <span>{b.serial_number}</span>
                                    {loc && <div className="text-xs text-gray-400 mt-0.5">{loc.address || loc.name}</div>}
                                  </button>
                                );
                              })
                          }
                        </div>
                      )}
                    </div>
                    {(() => {
                      const selectedBin = allBins.find(b => b.id === binForm.bin_id);
                      const conflict = selectedBin ? binActionConflict(selectedBin, binForm.action) : null;
                      return (
                        <button onClick={handleAddBin} disabled={!binForm.bin_id || savingBin || !!conflict} className={btnPrimary}>
                          {savingBin ? '…' : 'Add'}
                        </button>
                      );
                    })()}
                  </div>
                  {(() => {
                    const selectedBin = allBins.find(b => b.id === binForm.bin_id);
                    if (!selectedBin) return null;
                    const conflict = binActionConflict(selectedBin, binForm.action);
                    if (conflict) return <p className="text-sm text-red-600 font-medium px-1">{conflict}</p>;
                    return null;
                  })()}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right: Loads + Add Load + Actions (sticky) */}
        <div className="col-span-1 space-y-5 sticky top-6 self-start max-h-[calc(100vh-5rem)] overflow-y-auto">

          {/* Existing Loads */}
          {loads.length > 0 && (
            <section className="border-2 border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-1">Loads ({loads.length})</h2>
              <div className="text-sm text-gray-700 mb-3 space-y-0.5">
                <div>Total net: <span className="font-bold text-gray-900">{totalNet.toFixed(0)} kg</span></div>
                {totalRubbish > 0 && <div>Internal net: <span className="font-bold text-gray-900">{internalNet.toFixed(0)} kg</span> <span className="text-gray-400">(net − rubbish)</span></div>}
                {totalAdjustments > 0 && <div>Adjustments: <span className="font-semibold text-orange-700">{totalAdjustments.toFixed(0)} kg</span></div>}
              </div>
              <div className="space-y-2">
                {loads.map((l, i) => (
                  <div key={l.id} className={`border-2 rounded-xl p-3 ${editingLoad === l.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100'}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold text-gray-700">Load {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleEditLoad(l)} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        <span className="text-gray-400 text-xs">
                          {new Date(l.created_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 space-y-0.5">
                      {l.net_weight != null ? (
                        <div className="space-y-0.5">
                          <div>Net: <span className="font-bold text-gray-900">{l.net_weight.toFixed(0)} kg</span></div>
                          <div className="text-gray-500">
                            Gross: {l.gross_weight.toFixed(0)}{l.gross_time && <span className="ml-1 text-gray-400">@ {l.gross_time.slice(0, 5)}</span>}
                            <span className="mx-1">−</span>
                            Tare: {l.tare_weight!.toFixed(0)}{l.tare_time && <span className="ml-1 text-gray-400">@ {l.tare_time.slice(0, 5)}</span>}
                          </div>
                        </div>
                      ) : (
                        <div>
                          Gross: <span className="font-bold text-gray-900">{l.gross_weight.toFixed(0)} kg</span>
                          {l.gross_time && <span className="ml-1 text-gray-400 text-xs">@ {l.gross_time.slice(0, 5)}</span>}
                          <span className="ml-2 text-xs font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">tare pending</span>
                        </div>
                      )}
                      {l.rubbish_weight != null && <div>Rubbish: <span className="font-semibold text-orange-700">−{l.rubbish_weight.toFixed(0)} kg</span></div>}
                      {l.foc_weight != null && <div>FOC: <span className="font-semibold text-orange-700">{l.foc_weight.toFixed(0)} kg</span></div>}
                      {materialNames(l.material_type_ids) && <div>{materialNames(l.material_type_ids)}</div>}
                      {materialNames(l.outbound_material_type_ids) && <div>{materialNames(l.outbound_material_type_ids)}</div>}
                      {l.material_custom && <div>{l.material_custom}</div>}
                      {l.remarks && <div className="text-gray-500">{l.remarks}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Add / Edit Load */}
          {!isIssueBin && (
            <section className="border-2 border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">
                {editingLoad ? 'Edit Load' : 'Add Load'}
              </h2>

              {loadSuccess && (
                <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-xl text-sm font-medium">Load saved!</div>
              )}

              <form onSubmit={handleAddLoad} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Material Type</label>
                  <div className="flex flex-wrap gap-2">
                    {displayMaterials.map(m => {
                      const selected = isOutbound
                        ? loadForm.outbound_material_type_ids.includes(m.id)
                        : loadForm.material_type_ids.includes(m.id);
                      return (
                        <button key={m.id} type="button" onClick={() => handleMaterialToggle(m.id)}
                          className={`px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Material (custom)</label>
                  <input value={loadForm.material_custom}
                    onChange={e => setLoadForm(prev => ({ ...prev, material_custom: e.target.value }))}
                    placeholder="If not in list above" className={inputCls} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Gross Time</label>
                    <input type="time" value={loadForm.gross_time}
                      onChange={e => setLoadForm(prev => ({ ...prev, gross_time: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Tare Time</label>
                    <input type="time" value={loadForm.tare_time}
                      onChange={e => setLoadForm(prev => ({ ...prev, tare_time: e.target.value }))}
                      className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Gross (kg)</label>
                    <input type="number" step="0.001" min="0" required
                      value={loadForm.gross_weight}
                      onChange={e => setLoadForm(prev => ({ ...prev, gross_weight: e.target.value }))}
                      onWheel={e => e.currentTarget.blur()}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Tare (kg)</label>
                    <input type="number" step="0.001" min="0"
                      value={loadForm.tare_weight}
                      onChange={e => setLoadForm(prev => ({ ...prev, tare_weight: e.target.value }))}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="Optional"
                      className={inputCls} />
                  </div>
                </div>

                {loadForm.gross_weight && loadForm.tare_weight && (() => {
                  const net = parseFloat(loadForm.gross_weight) - parseFloat(loadForm.tare_weight);
                  const rubbish = loadForm.has_rubbish && loadForm.rubbish_weight ? parseFloat(loadForm.rubbish_weight) : 0;
                  return (
                    <div className="text-sm bg-blue-50 border-2 border-blue-100 rounded-xl px-4 py-3 font-medium text-gray-700 space-y-1">
                      <div>Net: <span className="font-bold text-gray-900">{net.toFixed(0)} kg</span></div>
                      {rubbish > 0 && <div>Internal net: <span className="font-bold text-gray-900">{(net - rubbish).toFixed(0)} kg</span></div>}
                    </div>
                  );
                })()}

                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={loadForm.has_rubbish}
                      onChange={e => setLoadForm(prev => ({ ...prev, has_rubbish: e.target.checked, rubbish_weight: '' }))}
                      className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm font-semibold text-gray-700">Rubbish Weight</span>
                  </label>
                  {loadForm.has_rubbish && (
                    <input type="number" step="0.001" min="0"
                      value={loadForm.rubbish_weight}
                      onChange={e => setLoadForm(prev => ({ ...prev, rubbish_weight: e.target.value }))}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="kg" className={inputCls} />
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={loadForm.has_foc}
                      onChange={e => setLoadForm(prev => ({ ...prev, has_foc: e.target.checked, foc_weight: '' }))}
                      className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm font-semibold text-gray-700">FOC Weight</span>
                  </label>
                  {loadForm.has_foc && (
                    <input type="number" step="0.001" min="0"
                      value={loadForm.foc_weight}
                      onChange={e => setLoadForm(prev => ({ ...prev, foc_weight: e.target.value }))}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="kg" className={inputCls} />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Remarks</label>
                  <input value={loadForm.remarks}
                    onChange={e => setLoadForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional notes" className={inputCls} />
                </div>

                <div className="flex gap-2">
                  {editingLoad && (
                    <button type="button" onClick={resetLoadForm}
                      className="flex-1 inline-flex items-center justify-center rounded-lg font-semibold transition-colors px-5 py-3 text-base border-2 border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300">
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={savingLoad} className={`${btnPrimary} flex-1 justify-center`}>
                    {savingLoad ? 'Saving...' : editingLoad ? 'Update Load' : 'Save Load'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Actions */}
          <section className="border-2 border-gray-200 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-1">Actions</h2>
            <button onClick={handleToggleStatus} disabled={completing}
              className={`${btn} w-full justify-center py-3 text-base ${trip.status === 'open' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-yellow-500 text-white hover:bg-yellow-600'}`}>
              {completing ? '...' : trip.status === 'open' ? 'Mark as Complete' : 'Reopen Trip'}
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className={`${btn} w-full justify-center py-3 text-base bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-200`}>
              {deleting ? 'Deleting...' : 'Delete Trip'}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
