'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { supabase } from '../../lib/supabase';

type Vehicle = { plate_number: string };
type Driver = { employee_id: string; name: string };
type Customer = { customer_id: number; name: string };
type CustomerLocation = { id: number; customer_id: number; name: string; address: string | null };
type Location = { id: number; name: string; address: string | null; location_type: string | null };
type OutboundLocation = { id: number; name: string; address: string | null };
type MaterialType = { id: number; name: string; category: string | null };
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
type PendingBin = { bin_id: string; serial_number: string; action: 'pickup' | 'dropoff' | 'roundtrip'; location_override?: boolean };

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

const inputCls = 'w-full border-2 border-gray-200 rounded-xl px-4 py-3 bg-white text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const btn = 'inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700 px-5 py-3 text-base`;
const dropdownCls = 'absolute z-10 top-full left-0 right-0 mt-1 border-2 border-gray-200 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto';
const dropdownItemCls = 'w-full text-left px-4 py-2.5 text-base hover:bg-gray-50 border-b last:border-b-0 text-gray-900';

const todayDate = () => new Date().toISOString().split('T')[0];
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const emptyLoadForm = {
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
  gross_time: '',
  tare_time: '',
};

function NewTripPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillBinId = searchParams.get('prefill_bin');
  const prefillAction = searchParams.get('prefill_action') as 'dropoff' | 'pickup' | null;
  const prefillDone = useRef(false);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allSites, setAllSites] = useState<CustomerLocation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [outboundLocations, setOutboundLocations] = useState<OutboundLocation[]>([]);
  const [allBins, setAllBins] = useState<Bin[]>([]);
  const [materials, setMaterials] = useState<MaterialType[]>([]);

  const [tripType, setTripType] = useState<'collection' | 'outbound' | 'customer_dropoff' | 'issue_bin'>('collection');
  const [requester, setRequester] = useState('');
  const [tripRemarks, setTripRemarks] = useState('');
  const [customerVehiclePlate, setCustomerVehiclePlate] = useState('');

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleValue, setVehicleValue] = useState('');
  const [showVehicle, setShowVehicle] = useState(false);

  const [driverSearch, setDriverSearch] = useState('');
  const [driverValue, setDriverValue] = useState('');
  const [showDriver, setShowDriver] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerValue, setCustomerValue] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);

  const [siteSearch, setSiteSearch] = useState('');
  const [siteValue, setSiteValue] = useState('');
  const [showSite, setShowSite] = useState(false);

  const [dropoffSearch, setDropoffSearch] = useState('');
  const [dropoffValue, setDropoffValue] = useState('');
  const [showDropoff, setShowDropoff] = useState(false);

  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceValue, setSourceValue] = useState('');
  const [showSource, setShowSource] = useState(false);

  const [outboundLocationSearch, setOutboundLocationSearch] = useState('');
  const [outboundLocationValue, setOutboundLocationValue] = useState('');
  const [showOutboundLocation, setShowOutboundLocation] = useState(false);
  const [addingOutboundLocation, setAddingOutboundLocation] = useState(false);
  const [newOutboundLocationName, setNewOutboundLocationName] = useState('');
  const [newOutboundLocationAddress, setNewOutboundLocationAddress] = useState('');
  const [savingOutboundLocation, setSavingOutboundLocation] = useState(false);

  const [addingDropoff, setAddingDropoff] = useState(false);
  const [newDropoffName, setNewDropoffName] = useState('');
  const [newDropoffAddress, setNewDropoffAddress] = useState('');
  const [savingDropoff, setSavingDropoff] = useState(false);

  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [addingSite, setAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  const [pendingBins, setPendingBins] = useState<PendingBin[]>([]);
  const [binAction, setBinAction] = useState<'pickup' | 'dropoff' | 'roundtrip'>('dropoff');
  const [binSearch, setBinSearch] = useState('');
  const [binValue, setBinValue] = useState('');
  const [showBinDropdown, setShowBinDropdown] = useState(false);

  const [tripDate, setTripDate] = useState(todayDate);
  const [loadForm, setLoadForm] = useState(() => ({ ...emptyLoadForm, gross_time: nowTime(), tare_time: nowTime() }));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const authClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await authClient.auth.getUser();

      const [v, d, c, cl, l, ol, b, m, profileRes] = await Promise.all([
        supabase.from('vehicles').select('plate_number').eq('purpose', 'Goods').order('plate_number'),
        supabase.from('drivers').select('employee_id, name').order('name'),
        supabase.from('customers').select('customer_id, name').order('name'),
        supabase.from('customer_locations').select('id, customer_id, name, address').order('name'),
        supabase.from('locations').select('id, name, address, location_type').order('name'),
        supabase.from('outbound_locations').select('id, name, address').order('name'),
        supabase.from('bins').select('id, serial_number, customer_id, customer_location_id, location_id, customers(name, address), customer_locations(name, address), locations(name, address)').order('serial_number'),
        supabase.from('material_types').select('id, name, category').order('name'),
        user
          ? supabase.from('user_profiles').select('location_id').eq('user_id', user.id).single()
          : Promise.resolve({ data: null }),
      ]);

      if (v.data) setVehicles(v.data);
      if (d.data) setDrivers(d.data);
      if (c.data) setCustomers(c.data);
      if (cl.data) setAllSites(cl.data);
      if (l.data) {
        setLocations(l.data as Location[]);
        const profile = (profileRes as { data: { location_id: number } | null }).data;
        if (!profile && user) {
          supabase.from('user_profiles').insert({ user_id: user.id, email: user.email!, is_superadmin: false });
        }
        if (profile?.location_id) {
          const yard = (l.data as Location[]).find(loc => loc.id === profile.location_id);
          if (yard) {
            const label = yard.name + (yard.location_type === 'port' ? ' — Export' : '');
            setDropoffValue(yard.id.toString());
            setDropoffSearch(label);
            setSourceValue(yard.id.toString());
            setSourceSearch(yard.name);
          }
        }
      }
      if (ol.data) setOutboundLocations(ol.data);
      if (b.data) setAllBins(b.data as unknown as Bin[]);
      if (m.data) setMaterials(m.data);
    };
    load();
  }, []);

  // Pre-fill bin from query params (missing-trip flow from /bins/[binId])
  useEffect(() => {
    if (prefillBinId && allBins.length > 0 && !prefillDone.current) {
      prefillDone.current = true;
      const bin = allBins.find(b => b.id === prefillBinId);
      if (bin) {
        const action = prefillAction ?? 'dropoff';
        setPendingBins([{ bin_id: bin.id, serial_number: bin.serial_number, action, location_override: true }]);
        setBinAction(action);
      }
    }
  }, [prefillBinId, prefillAction, allBins]);

  const sitesForCustomer = allSites.filter(s => s.customer_id === Number(customerValue));
  const displayMaterials = materials.filter(m =>
    tripType === 'outbound' ? m.category === 'outbound' : m.category === 'inbound'
  );
  const isDropoff = tripType === 'customer_dropoff';
  const isIssueBin = tripType === 'issue_bin';

  const selectedBin = allBins.find(b => b.id === binValue);
  const binConflict = selectedBin ? binActionConflict(selectedBin, binAction) : null;

  const eligibleBins = allBins.filter(b => {
    if (pendingBins.some(pb => pb.bin_id === b.id)) return false;
    if (!b.serial_number.toLowerCase().includes(binSearch.toLowerCase())) return false;
    const atCustomer = !!(b.customer_id || b.customer_location_id);
    const atYard = !!b.location_id;
    const unknown = !atCustomer && !atYard;
    if (binAction === 'dropoff') return unknown || atYard;
    if (binAction === 'pickup') {
      if (!atCustomer && !unknown) return false;
      if (siteValue) return unknown || b.customer_location_id === Number(siteValue);
      if (customerValue) return unknown || b.customer_id === Number(customerValue);
      return unknown || atCustomer;
    }
    return unknown || atYard;
  });

  const handleAddPendingBin = () => {
    if (!binValue || !selectedBin) return;
    if (binConflict) { alert(binConflict); return; }
    if (pendingBins.some(b => b.bin_id === binValue)) return;
    setPendingBins(prev => [...prev, { bin_id: binValue, serial_number: selectedBin.serial_number, action: binAction }]);
    setBinValue('');
    setBinSearch('');
  };

  const handleRemovePendingBin = (binId: string) => {
    setPendingBins(prev => prev.filter(b => b.bin_id !== binId));
  };

  const handleMaterialToggle = (id: number) => {
    if (tripType === 'outbound') {
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

  const clearVehicleDriver = () => {
    setVehicleValue(''); setVehicleSearch('');
    setDriverValue(''); setDriverSearch('');
  };

  const clearCollectionFields = () => {
    setSiteValue(''); setSiteSearch('');
    setDropoffValue(''); setDropoffSearch('');
  };

  const clearOutboundFields = () => {
    setSourceValue(''); setSourceSearch('');
    setOutboundLocationValue(''); setOutboundLocationSearch('');
    setLoadForm(prev => ({ ...prev, outbound_material_type_ids: [] }));
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    setSavingCustomer(true);
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomerName.trim() })
      .select('customer_id, name')
      .single();
    setSavingCustomer(false);
    if (error) { alert('Error creating customer: ' + error.message); return; }
    const cust = data as Customer;
    setCustomers(prev => [...prev, cust].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerValue(cust.customer_id.toString());
    setCustomerSearch(cust.name);
    setSiteSearch(''); setSiteValue('');
    setAddingCustomer(false); setNewCustomerName('');
  };

  const handleCreateSite = async () => {
    if (!newSiteName.trim() || !newSiteAddress.trim() || !customerValue) return;
    setSavingSite(true);
    const { data, error } = await supabase
      .from('customer_locations')
      .insert({ customer_id: Number(customerValue), name: newSiteName.trim(), address: newSiteAddress.trim() })
      .select('id, customer_id, name, address')
      .single();
    setSavingSite(false);
    if (error) { alert('Error creating site: ' + error.message); return; }
    const s = data as CustomerLocation;
    setAllSites(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
    setSiteValue(s.id.toString()); setSiteSearch(s.name);
    setAddingSite(false); setNewSiteName(''); setNewSiteAddress('');
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
    setDropoffValue(loc.id.toString()); setDropoffSearch(loc.name);
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
    setOutboundLocationValue(loc.id.toString()); setOutboundLocationSearch(loc.name);
    setAddingOutboundLocation(false); setNewOutboundLocationName(''); setNewOutboundLocationAddress('');
  };

  const handleSubmit = async (status: 'open' | 'completed') => {
    if (tripType === 'collection') {
      if (!vehicleValue) { alert('Vehicle is required.'); return; }
      if (!driverValue) { alert('Driver is required.'); return; }
      if (!dropoffValue) { alert('Delivery Location is required.'); return; }
    }
    if (isIssueBin) {
      if (!vehicleValue) { alert('Vehicle is required.'); return; }
      if (!driverValue) { alert('Driver is required.'); return; }
    }
    if (tripType === 'outbound') {
      if (!vehicleValue) { alert('Vehicle is required.'); return; }
      if (!driverValue) { alert('Driver is required.'); return; }
      if (!sourceValue) { alert('From Yard is required.'); return; }
      if (!outboundLocationValue) { alert('To (Destination) is required.'); return; }
      if (!loadForm.gross_weight || !loadForm.tare_weight) { alert('Load entry (Gross and Tare weights) is required for Outbound Goods.'); return; }
    }
    if (isDropoff) {
      if (!customerVehiclePlate.trim()) { alert('Customer vehicle plate is required.'); return; }
    }

    setSubmitting(true);

    const { data: tripData, error: tripError } = await supabase
      .from('trips')
      .insert({
        vehicle_number: isDropoff ? null : (vehicleValue || null),
        driver_id: isDropoff ? null : (driverValue || null),
        customer_id: customerValue ? Number(customerValue) : null,
        customer_location_id: (tripType === 'collection' || isIssueBin) && siteValue ? Number(siteValue) : null,
        dropoff_id: (tripType === 'collection' || isDropoff) && dropoffValue ? Number(dropoffValue) : null,
        source_location_id: sourceValue ? Number(sourceValue) : null,
        outbound_location_id: tripType === 'outbound' && outboundLocationValue ? Number(outboundLocationValue) : null,
        customer_vehicle_plate: isDropoff ? customerVehiclePlate.trim() : null,
        requester: requester || null,
        remarks: tripRemarks || null,
        trip_type: tripType,
        trip_date: tripDate || null,
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (tripError) { alert('Error: ' + tripError.message); setSubmitting(false); return; }
    const tripId = tripData.id;

    if (pendingBins.length > 0) {
      const { error: binsError } = await supabase.from('trip_bins').insert(
        pendingBins.map(b => ({ trip_id: tripId, bin_id: b.bin_id, action: b.action, location_override: b.location_override ?? false }))
      );
      if (binsError) { alert('Error adding bins: ' + binsError.message); setSubmitting(false); return; }

      if (status === 'completed') {
        const authClient = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const yardBins = pendingBins.filter(b => b.action === 'pickup' || b.action === 'roundtrip');
        const dropoffBins = pendingBins.filter(b => b.action === 'dropoff');
        const dropoffId = (tripType === 'collection' || isDropoff) && dropoffValue ? Number(dropoffValue) : null;
        const sourceId = tripType === 'outbound' && sourceValue ? Number(sourceValue) : null;
        const yardId = dropoffId ?? sourceId;
        const custLocId = (tripType === 'collection' || isIssueBin) && siteValue ? Number(siteValue) : null;
        const custId = customerValue ? Number(customerValue) : null;
        if (yardBins.length > 0 && yardId) {
          await authClient.from('bins').update({
            location_id: yardId,
            customer_id: null,
            customer_location_id: null,
          }).in('id', yardBins.map(b => b.bin_id));
        }
        if (dropoffBins.length > 0 && (custLocId || custId)) {
          await authClient.from('bins').update({
            customer_location_id: custLocId,
            customer_id: custLocId ? null : custId,
            location_id: null,
          }).in('id', dropoffBins.map(b => b.bin_id));
        }
      }
    }

    if (loadForm.gross_weight) {
      const gross = parseFloat(loadForm.gross_weight);
      const tare = loadForm.tare_weight ? parseFloat(loadForm.tare_weight) : null;
      const { error: loadError } = await supabase.from('weigh_bridge').insert({
        trip_id: tripId,
        vehicle_number: isDropoff ? null : (vehicleValue || null),
        driver_id: isDropoff ? null : (driverValue || null),
        material_type_ids: tripType !== 'outbound' ? loadForm.material_type_ids : null,
        outbound_material_type_ids: tripType === 'outbound' ? loadForm.outbound_material_type_ids : null,
        customer_id: isDropoff && customerValue ? Number(customerValue) : null,
        material_custom: loadForm.material_custom || null,
        gross_weight: gross,
        tare_weight: tare,
        rubbish_weight: loadForm.has_rubbish && loadForm.rubbish_weight ? parseFloat(loadForm.rubbish_weight) : null,
        foc_weight: loadForm.has_foc && loadForm.foc_weight ? parseFloat(loadForm.foc_weight) : null,
        remarks: loadForm.remarks || null,
        gross_time: loadForm.gross_time || null,
        tare_time: loadForm.tare_time || null,
      });
      if (loadError) { alert('Error saving load: ' + loadError.message); setSubmitting(false); return; }
    }

    setSubmitting(false);
    router.push(isDropoff ? `/trips/${tripId}` : '/trips');
  };

  return (
    <main className="w-full max-w-7xl mx-auto px-6 py-6 bg-white text-gray-900 min-h-screen">
      <button onClick={() => router.push('/trips')} className="text-base text-blue-600 hover:underline mb-4 font-medium">
        ← Back
      </button>
      <h1 className="text-2xl font-bold mb-5 text-gray-900">New Trip</h1>

      <div className="grid grid-cols-3 gap-6">

        {/* Left: Trip Details + Bins */}
        <div className="col-span-2 space-y-5">

          {/* Trip Type */}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setTripType('collection'); clearOutboundFields(); setCustomerVehiclePlate(''); }}
              className={`px-5 py-2.5 rounded-xl font-semibold text-base transition-colors border-2 ${tripType === 'collection' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              Collection
            </button>
            <button
              type="button"
              onClick={() => { setTripType('outbound'); clearCollectionFields(); setCustomerVehiclePlate(''); setCustomerSearch(''); setCustomerValue(''); }}
              className={`px-5 py-2.5 rounded-xl font-semibold text-base transition-colors border-2 ${tripType === 'outbound' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              Outbound Goods
            </button>
            <button
              type="button"
              onClick={() => { setTripType('customer_dropoff'); clearVehicleDriver(); clearOutboundFields(); clearCollectionFields(); setLoadForm(prev => ({ ...prev, outbound_material_type_ids: [] })); }}
              className={`px-5 py-2.5 rounded-xl font-semibold text-base transition-colors border-2 ${isDropoff ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              Customer Drop-off
            </button>
            <button
              type="button"
              onClick={() => { setTripType('issue_bin'); clearOutboundFields(); setCustomerVehiclePlate(''); setDropoffValue(''); setDropoffSearch(''); }}
              className={`px-5 py-2.5 rounded-xl font-semibold text-base transition-colors border-2 ${isIssueBin ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              Issue Bin
            </button>
          </div>

          {/* Trip Details */}
          <section className="border-2 border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">Trip Details</h2>
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Trip Date</label>
                <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className={inputCls} />
              </div>

              {!isDropoff && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Vehicle <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      value={vehicleSearch}
                      onChange={e => { setVehicleSearch(e.target.value); setVehicleValue(''); setShowVehicle(true); }}
                      onFocus={() => setShowVehicle(true)}
                      onBlur={() => setTimeout(() => setShowVehicle(false), 150)}
                      placeholder="Search plate…"
                      className={inputCls}
                    />
                    {showVehicle && (
                      <div className={dropdownCls}>
                        {vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).map(v => (
                          <button key={v.plate_number} type="button" onMouseDown={() => { setVehicleValue(v.plate_number); setVehicleSearch(v.plate_number); setShowVehicle(false); }} className={dropdownItemCls}>
                            {v.plate_number}
                          </button>
                        ))}
                        {vehicles.filter(v => v.plate_number.toLowerCase().includes(vehicleSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-2.5 text-base text-gray-500">No vehicles found</p>
                        )}
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
                    <input
                      value={driverSearch}
                      onChange={e => { setDriverSearch(e.target.value); setDriverValue(''); setShowDriver(true); }}
                      onFocus={() => setShowDriver(true)}
                      onBlur={() => setTimeout(() => setShowDriver(false), 150)}
                      placeholder="Search driver name…"
                      className={inputCls}
                    />
                    {showDriver && (
                      <div className={dropdownCls}>
                        {drivers.filter(d => `${d.name} ${d.employee_id}`.toLowerCase().includes(driverSearch.toLowerCase())).map(d => (
                          <button key={d.employee_id} type="button" onMouseDown={() => { setDriverValue(d.employee_id); setDriverSearch(`${d.name} (${d.employee_id})`); setShowDriver(false); }} className={dropdownItemCls}>
                            {d.name} <span className="text-gray-400 text-sm">({d.employee_id})</span>
                          </button>
                        ))}
                        {drivers.filter(d => `${d.name} ${d.employee_id}`.toLowerCase().includes(driverSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-2.5 text-base text-gray-500">No drivers found</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collection / Issue Bin: Customer → Site (cascaded) */}
              {(tripType === 'collection' || isIssueBin) && (
                <div className="grid grid-cols-2 gap-4">
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
                          <button type="button" onClick={handleCreateCustomer} disabled={!newCustomerName.trim() || savingCustomer} className={`${btnPrimary} py-2 text-sm`}>
                            {savingCustomer ? 'Saving...' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setAddingCustomer(false); setNewCustomerName(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={customerSearch}
                          onChange={e => { setCustomerSearch(e.target.value); setCustomerValue(''); setSiteSearch(''); setSiteValue(''); setShowCustomer(true); }}
                          onFocus={() => setShowCustomer(true)}
                          onBlur={() => setTimeout(() => setShowCustomer(false), 150)}
                          placeholder="Search customer…" className={inputCls} />
                        {showCustomer && (
                          <div className={dropdownCls}>
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                              <button key={c.customer_id} type="button" onMouseDown={() => { setCustomerValue(c.customer_id.toString()); setCustomerSearch(c.name); setSiteSearch(''); setSiteValue(''); setShowCustomer(false); }} className={dropdownItemCls}>
                                {c.name}
                              </button>
                            ))}
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                              <p className="px-4 py-2.5 text-base text-gray-500">No customers found</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-gray-700">Site</label>
                      {customerValue && !addingSite && (
                        <button type="button" onClick={() => { setAddingSite(true); setShowSite(false); }} className="text-xs text-blue-600 hover:underline font-medium">
                          + Add new
                        </button>
                      )}
                    </div>
                    {addingSite && customerValue ? (
                      <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                        <input value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="Site name" className={inputCls} autoFocus
                          onKeyDown={e => { if (e.key === 'Escape') { setAddingSite(false); setNewSiteName(''); setNewSiteAddress(''); } }} />
                        <input value={newSiteAddress} onChange={e => setNewSiteAddress(e.target.value)} placeholder="Address (required)" className={inputCls}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateSite(); }} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateSite} disabled={!newSiteName.trim() || !newSiteAddress.trim() || savingSite} className={`${btnPrimary} py-2 text-sm`}>
                            {savingSite ? 'Saving...' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setAddingSite(false); setNewSiteName(''); setNewSiteAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={siteSearch}
                          onChange={e => { setSiteSearch(e.target.value); setSiteValue(''); setShowSite(true); }}
                          onFocus={() => { if (customerValue) setShowSite(true); }}
                          onBlur={() => setTimeout(() => setShowSite(false), 150)}
                          placeholder={customerValue ? 'Search site…' : 'Select customer first'}
                          disabled={!customerValue} className={inputCls} />
                        {showSite && customerValue && (
                          <div className={dropdownCls}>
                            {sitesForCustomer.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase())).map(s => (
                              <button key={s.id} type="button" onMouseDown={() => { setSiteValue(s.id.toString()); setSiteSearch(s.name); setShowSite(false); }} className={dropdownItemCls}>
                                <div>{s.name}</div>
                                {s.address && <div className="text-xs text-gray-400 mt-0.5">{s.address}</div>}
                              </button>
                            ))}
                            {sitesForCustomer.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase())).length === 0 && (
                              <p className="px-4 py-2.5 text-base text-gray-500">No sites found</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Drop-off: Customer + Plate + Delivery Location */}
              {isDropoff && (
                <div className="grid grid-cols-2 gap-4">
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
                          <button type="button" onClick={handleCreateCustomer} disabled={!newCustomerName.trim() || savingCustomer} className={`${btnPrimary} py-2 text-sm`}>
                            {savingCustomer ? 'Saving...' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setAddingCustomer(false); setNewCustomerName(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={customerSearch}
                          onChange={e => { setCustomerSearch(e.target.value); setCustomerValue(''); setShowCustomer(true); }}
                          onFocus={() => setShowCustomer(true)}
                          onBlur={() => setTimeout(() => setShowCustomer(false), 150)}
                          placeholder="Search customer…" className={inputCls} />
                        {showCustomer && (
                          <div className={dropdownCls}>
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                              <button key={c.customer_id} type="button" onMouseDown={() => { setCustomerValue(c.customer_id.toString()); setCustomerSearch(c.name); setShowCustomer(false); }} className={dropdownItemCls}>
                                {c.name}
                              </button>
                            ))}
                            {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                              <p className="px-4 py-2.5 text-base text-gray-500">No customers found</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Customer Vehicle Plate <span className="text-red-500">*</span>
                    </label>
                    <input value={customerVehiclePlate} onChange={e => setCustomerVehiclePlate(e.target.value.toUpperCase())} placeholder="e.g. XYZ1234A" className={inputCls} />
                  </div>
                </div>
              )}
              {isDropoff && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">Delivery Location</label>
                    <button type="button" onClick={() => { setAddingDropoff(true); setShowDropoff(false); }} className="text-xs text-blue-600 hover:underline font-medium">
                      + Add new
                    </button>
                  </div>
                  {addingDropoff ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newDropoffName} onChange={e => setNewDropoffName(e.target.value)} placeholder="Location name" className={inputCls} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); if (e.key === 'Escape') { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); } }} />
                      <input value={newDropoffAddress} onChange={e => setNewDropoffAddress(e.target.value)} placeholder="Address (optional)" className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateDropoff} disabled={!newDropoffName.trim() || savingDropoff} className={`${btnPrimary} py-2 text-sm`}>
                          {savingDropoff ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={dropoffSearch}
                        onChange={e => { setDropoffSearch(e.target.value); setDropoffValue(''); setShowDropoff(true); }}
                        onFocus={() => setShowDropoff(true)}
                        onBlur={() => setTimeout(() => setShowDropoff(false), 150)}
                        placeholder="Search yard location…" className={inputCls} />
                      {showDropoff && (
                        <div className={dropdownCls}>
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setDropoffValue(l.id.toString()); setDropoffSearch(l.name + (l.location_type === 'port' ? ' — Export' : '')); setShowDropoff(false); }} className={dropdownItemCls}>
                              {l.name}{l.location_type === 'port' && <span className="ml-1 text-sm text-gray-400">— Export</span>}
                            </button>
                          ))}
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).length === 0 && (
                            <p className="px-4 py-2.5 text-base text-gray-500">No locations found</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outbound: From Yard */}
              {tripType === 'outbound' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    From Yard <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input value={sourceSearch}
                      onChange={e => { setSourceSearch(e.target.value); setSourceValue(''); setShowSource(true); }}
                      onFocus={() => setShowSource(true)}
                      onBlur={() => setTimeout(() => setShowSource(false), 150)}
                      placeholder="Search yard/location…" className={inputCls} />
                    {showSource && (
                      <div className={dropdownCls}>
                        {locations.filter(l => l.name.toLowerCase().includes(sourceSearch.toLowerCase())).map(l => (
                          <button key={l.id} type="button" onMouseDown={() => { setSourceValue(l.id.toString()); setSourceSearch(l.name); setShowSource(false); }} className={dropdownItemCls}>
                            {l.name}
                          </button>
                        ))}
                        {locations.filter(l => l.name.toLowerCase().includes(sourceSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-2.5 text-base text-gray-500">No locations found</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collection: Delivery Location */}
              {tripType === 'collection' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">
                      Delivery Location <span className="text-red-500">*</span>
                    </label>
                    <button type="button" onClick={() => { setAddingDropoff(true); setShowDropoff(false); }} className="text-xs text-blue-600 hover:underline font-medium">
                      + Add new
                    </button>
                  </div>
                  {addingDropoff ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newDropoffName} onChange={e => setNewDropoffName(e.target.value)} placeholder="Location name" className={inputCls} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); if (e.key === 'Escape') { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); } }} />
                      <input value={newDropoffAddress} onChange={e => setNewDropoffAddress(e.target.value)} placeholder="Address (optional)" className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDropoff(); }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateDropoff} disabled={!newDropoffName.trim() || savingDropoff} className={`${btnPrimary} py-2 text-sm`}>
                          {savingDropoff ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setAddingDropoff(false); setNewDropoffName(''); setNewDropoffAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={dropoffSearch}
                        onChange={e => { setDropoffSearch(e.target.value); setDropoffValue(''); setShowDropoff(true); }}
                        onFocus={() => setShowDropoff(true)}
                        onBlur={() => setTimeout(() => setShowDropoff(false), 150)}
                        placeholder="Search location…" className={inputCls} />
                      {showDropoff && (
                        <div className={dropdownCls}>
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setDropoffValue(l.id.toString()); setDropoffSearch(l.name + (l.location_type === 'port' ? ' — Export' : '')); setShowDropoff(false); }} className={dropdownItemCls}>
                              {l.name}{l.location_type === 'port' && <span className="ml-1 text-sm text-gray-400">— Export</span>}
                            </button>
                          ))}
                          {locations.filter(l => l.name.toLowerCase().includes(dropoffSearch.toLowerCase())).length === 0 && (
                            <p className="px-4 py-2.5 text-base text-gray-500">No locations found</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outbound: To (outbound_locations) */}
              {tripType === 'outbound' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">
                      To (Destination) <span className="text-red-500">*</span>
                    </label>
                    <button type="button" onClick={() => { setAddingOutboundLocation(true); setShowOutboundLocation(false); }} className="text-xs text-blue-600 hover:underline font-medium">
                      + Add new
                    </button>
                  </div>
                  {addingOutboundLocation ? (
                    <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
                      <input value={newOutboundLocationName} onChange={e => setNewOutboundLocationName(e.target.value)} placeholder="e.g. Container, Jurong Port" className={inputCls} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateOutboundLocation(); if (e.key === 'Escape') { setAddingOutboundLocation(false); setNewOutboundLocationName(''); setNewOutboundLocationAddress(''); } }} />
                      <input value={newOutboundLocationAddress} onChange={e => setNewOutboundLocationAddress(e.target.value)} placeholder="Address (optional)" className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateOutboundLocation(); }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCreateOutboundLocation} disabled={!newOutboundLocationName.trim() || savingOutboundLocation} className={`${btnPrimary} py-2 text-sm`}>
                          {savingOutboundLocation ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setAddingOutboundLocation(false); setNewOutboundLocationName(''); setNewOutboundLocationAddress(''); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg border-2 border-gray-200">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input value={outboundLocationSearch}
                        onChange={e => { setOutboundLocationSearch(e.target.value); setOutboundLocationValue(''); setShowOutboundLocation(true); }}
                        onFocus={() => setShowOutboundLocation(true)}
                        onBlur={() => setTimeout(() => setShowOutboundLocation(false), 150)}
                        placeholder="Search destination…" className={inputCls} />
                      {showOutboundLocation && (
                        <div className={dropdownCls}>
                          {outboundLocations.filter(l => l.name.toLowerCase().includes(outboundLocationSearch.toLowerCase())).map(l => (
                            <button key={l.id} type="button" onMouseDown={() => { setOutboundLocationValue(l.id.toString()); setOutboundLocationSearch(l.name); setShowOutboundLocation(false); }} className={dropdownItemCls}>
                              <div>{l.name}</div>
                              {l.address && <div className="text-xs text-gray-400 mt-0.5">{l.address}</div>}
                            </button>
                          ))}
                          {outboundLocations.filter(l => l.name.toLowerCase().includes(outboundLocationSearch.toLowerCase())).length === 0 && (
                            <p className="px-4 py-2.5 text-base text-gray-500">No destinations found</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Requester</label>
                <input value={requester} onChange={e => setRequester(e.target.value)} placeholder="Who placed this order" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Remarks</label>
                <input value={tripRemarks} onChange={e => setTripRemarks(e.target.value)} placeholder="Optional notes" className={inputCls} />
              </div>
            </div>
          </section>

          {/* Bins */}
          {!isDropoff && (
            <section className="border-2 border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3">Bins <span className="text-gray-400 font-normal normal-case">(optional)</span></h2>
              <div className="space-y-2">
                {pendingBins.map(pb => (
                  <div key={pb.bin_id} className="flex items-center gap-3 border-2 border-gray-100 rounded-xl px-4 py-3 bg-white">
                    <span className={`font-bold text-xl w-8 shrink-0 ${pb.action === 'dropoff' ? 'text-blue-600' : pb.action === 'pickup' ? 'text-orange-500' : 'text-purple-600'}`}>
                      {pb.action === 'dropoff' ? '↓' : pb.action === 'pickup' ? '↑' : '↕'}
                    </span>
                    <div className="flex-1">
                      <span className="font-bold text-gray-900">{pb.serial_number}</span>
                      <span className="ml-2 text-gray-600 text-sm">
                        {pb.action === 'dropoff' ? 'Issue bin' : pb.action === 'pickup' ? 'Collect bin' : 'Roundtrip'}
                      </span>
                    </div>
                    <button onClick={() => handleRemovePendingBin(pb.bin_id)} className="text-gray-400 hover:text-red-500 transition-colors text-2xl leading-none px-1">×</button>
                  </div>
                ))}

                <div className="space-y-2 mt-2">
                  <div className="flex gap-2 items-center">
                    {!isIssueBin && (
                      <select value={binAction} onChange={e => { setBinAction(e.target.value as 'pickup' | 'dropoff' | 'roundtrip'); setBinValue(''); setBinSearch(''); }}
                        className="border-2 border-gray-200 rounded-xl px-3 py-3 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0">
                        <option value="dropoff">Issue Bin</option>
                        <option value="pickup">Collect Bin</option>
                        <option value="roundtrip">Roundtrip</option>
                      </select>
                    )}
                    <div className="relative flex-1">
                      <input value={binSearch}
                        onChange={e => { setBinSearch(e.target.value); setBinValue(''); setShowBinDropdown(true); }}
                        onFocus={() => setShowBinDropdown(true)}
                        onBlur={() => setTimeout(() => setShowBinDropdown(false), 150)}
                        placeholder={binAction === 'pickup' && (siteValue || customerValue) ? `Bins at ${siteValue ? 'selected site' : 'selected customer'}…` : 'Search bin…'}
                        className={inputCls} />
                      {showBinDropdown && (
                        <div className={dropdownCls}>
                          {eligibleBins.length === 0
                            ? <p className="px-4 py-2.5 text-base text-gray-500">
                                {binAction === 'pickup' && (siteValue || customerValue) ? 'No bins at this location' : 'No bins found'}
                              </p>
                            : eligibleBins.map(b => {
                                const loc = binCurrentLocation(b);
                                return (
                                  <button key={b.id} type="button"
                                    onMouseDown={() => { setBinValue(b.id); setBinSearch(b.serial_number); setShowBinDropdown(false); }}
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
                    <button type="button" onClick={handleAddPendingBin} disabled={!binValue || !!binConflict} className={btnPrimary}>
                      Add
                    </button>
                  </div>
                  {selectedBin && binConflict && (
                    <p className="text-sm text-red-600 font-medium px-1">{binConflict}</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right: Load Entry + Submit (sticky) */}
        <div className="col-span-1 space-y-5 sticky top-6 self-start">

          {!isIssueBin && (
            <section className="border-2 border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">
                Load Entry{' '}
                <span className={`font-normal normal-case ${tripType === 'outbound' ? 'text-red-500' : 'text-gray-400'}`}>
                  {tripType === 'outbound' ? '(required)' : '(optional)'}
                </span>
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Material Type</label>
                  <div className="flex flex-wrap gap-2">
                    {displayMaterials.map(m => {
                      const selected = tripType === 'outbound'
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

                <div className="grid grid-cols-2 gap-3">
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Gross (kg) {tripType === 'outbound' && <span className="text-red-500">*</span>}
                    </label>
                    <input type="number" step="0.001" min="0"
                      value={loadForm.gross_weight}
                      onChange={e => setLoadForm(prev => ({ ...prev, gross_weight: e.target.value }))}
                      onWheel={e => e.currentTarget.blur()}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Tare (kg) {tripType === 'outbound' && <span className="text-red-500">*</span>}
                    </label>
                    <input type="number" step="0.001" min="0"
                      value={loadForm.tare_weight}
                      onChange={e => setLoadForm(prev => ({ ...prev, tare_weight: e.target.value }))}
                      onWheel={e => e.currentTarget.blur()}
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
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Load Remarks</label>
                  <input value={loadForm.remarks}
                    onChange={e => setLoadForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional notes" className={inputCls} />
                </div>
              </div>
            </section>
          )}

          <div className="space-y-3">
            <button type="button" onClick={() => handleSubmit('completed')} disabled={submitting}
              className="inline-flex items-center justify-center w-full rounded-lg font-semibold transition-colors disabled:opacity-50 bg-green-600 text-white hover:bg-green-700 py-3.5 text-base">
              {submitting ? 'Saving...' : 'Create & Mark Complete'}
            </button>
            <button type="button" onClick={() => handleSubmit('open')} disabled={submitting}
              className="inline-flex items-center justify-center w-full rounded-lg font-semibold transition-colors disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700 py-3.5 text-base">
              {submitting ? 'Saving...' : 'Create as Open'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function NewTripPageWrapper() {
  return (
    <Suspense>
      <NewTripPage />
    </Suspense>
  );
}
