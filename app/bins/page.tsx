'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Bin = {
  id: string;
  serial_number: string;
  customer_id: number | null;
  customer_location_id: number | null;
  location_id: number | null;
  created_at: string;
  type: string | null;
  size: string | null;
  status: string | null;
  customers: { name: string } | null;
  customer_locations: { customer_id: number; name: string; customers: { name: string } | null } | null;
  locations: { name: string } | null;
  last_dropoff_at: string | null;
};

type CustomerOption = { customer_id: number; name: string };
type CustomerLocationOption = { id: number; customer_id: number; name: string };
type LocationOption = { id: number; name: string };

type BinForm = {
  serial_number: string;
  locationType: '' | 'customer' | 'location';
  customer_id: string;
  customer_location_id: string;
  location_id: string;
  type: string;
  size: string;
  status: string;
};


const emptyForm: BinForm = {
  serial_number: '',
  locationType: '',
  customer_id: '',
  customer_location_id: '',
  location_id: '',
  type: '',
  size: '',
  status: 'active',
};

function binToForm(bin: Bin): BinForm {
  const atCustomer = !!(bin.customer_location_id || bin.customer_id);
  return {
    serial_number: bin.serial_number,
    locationType: atCustomer ? 'customer' : bin.location_id ? 'location' : '',
    customer_id: bin.customer_location_id
      ? String(bin.customer_locations?.customer_id ?? '')
      : bin.customer_id ? String(bin.customer_id) : '',
    customer_location_id: bin.customer_location_id ? String(bin.customer_location_id) : '',
    location_id: bin.location_id ? String(bin.location_id) : '',
    type: bin.type ?? '',
    size: bin.size ?? '',
    status: bin.status ?? 'active',
  };
}

function formToPayload(form: BinForm) {
  return {
    serial_number: form.serial_number,
    customer_location_id: form.locationType === 'customer' && form.customer_location_id ? parseInt(form.customer_location_id, 10) : null,
    customer_id: null,
    location_id: form.locationType === 'location' && form.location_id ? parseInt(form.location_id, 10) : null,
    status: form.status || 'active',
    type: form.type || null,
    size: form.size || null,
  };
}

export default function BinsPage() {
  const [bins, setBins] = useState<Bin[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerLocationOptions, setCustomerLocationOptions] = useState<CustomerLocationOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBin, setEditingBin] = useState<Bin | null>(null);
  const [form, setForm] = useState<BinForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState<'all' | 'customer' | 'yard' | 'unknown'>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [sortDays, setSortDays] = useState<'asc' | 'desc' | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'retired'>('active');

  const router = useRouter();

  const fetchBins = async () => {
    const { data: rawBins } = await supabase
      .from('bins')
      .select('id, serial_number, customer_id, customer_location_id, location_id, created_at, type, size, status, customers(name), customer_locations(customer_id, name, customers(name)), locations(name)')
      .order('serial_number');
    if (!rawBins) return;

    // For bins currently at a customer, look up the most recent completed dropoff
    const customerBinIds = rawBins.filter(b => b.customer_location_id || b.customer_id).map(b => b.id);
    const lastDropoffMap: Record<string, string> = {};
    if (customerBinIds.length > 0) {
      const { data: dropoffs } = await supabase
        .from('trip_bins')
        .select('bin_id, trips!inner(completed_at, trip_date)')
        .eq('action', 'dropoff')
        .eq('trips.status', 'completed')
        .in('bin_id', customerBinIds)
        .order('trips(completed_at)', { ascending: false });
      if (dropoffs) {
        for (const row of dropoffs as unknown as { bin_id: string; trips: { completed_at: string | null; trip_date: string | null } }[]) {
          if (!lastDropoffMap[row.bin_id]) {
            const ref = row.trips?.trip_date ?? row.trips?.completed_at;
            if (ref) lastDropoffMap[row.bin_id] = ref;
          }
        }
      }
    }

    setBins(rawBins.map(b => ({ ...b, last_dropoff_at: lastDropoffMap[b.id] ?? null })) as unknown as Bin[]);
  };

  useEffect(() => {
    const fetchLookups = async () => {
      const [c, cl, l] = await Promise.all([
        supabase.from('customers').select('customer_id, name').order('name'),
        supabase.from('customer_locations').select('id, customer_id, name').order('name'),
        supabase.from('locations').select('id, name').order('name'),
      ]);
      if (c.data) setCustomerOptions(c.data);
      if (cl.data) setCustomerLocationOptions(cl.data);
      if (l.data) setLocationOptions(l.data);
    };
    fetchBins();
    fetchLookups();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingBin(null);
    setShowModal(true);
  };

  const openEdit = (bin: Bin) => {
    setForm(binToForm(bin));
    setEditingBin(bin);
    setShowModal(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'customer_id') {
      setForm(prev => ({ ...prev, customer_id: value, customer_location_id: '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = formToPayload(form);
    let error;
    if (editingBin) {
      ({ error } = await supabase.from('bins').update(payload).eq('id', editingBin.id));
    } else {
      ({ error } = await supabase.from('bins').insert(payload));
    }
    setLoading(false);
    if (!error) {
      setShowModal(false);
      fetchBins();
    } else {
      alert('Error saving bin: ' + error.message);
    }
  };

  const handleDelete = async (id: string, serial: string) => {
    if (!confirm(`Delete bin "${serial}"?`)) return;
    const { error } = await supabase.from('bins').delete().eq('id', id);
    if (!error) fetchBins();
    else alert('Error deleting bin: ' + error.message);
  };

  const tabCounts = {
    all: bins.length,
    customer: bins.filter(b => b.customer_id || b.customer_location_id).length,
    yard: bins.filter(b => !b.customer_id && !b.customer_location_id && b.location_id).length,
    unknown: bins.filter(b => !b.customer_id && !b.customer_location_id && !b.location_id).length,
  };

  const typeOptions = Array.from(new Set(bins.map(b => b.type).filter(Boolean))) as string[];
  const sizeOptions = Array.from(new Set(bins.map(b => b.size).filter(Boolean))) as string[];

  const daysAtSiteNum = (bin: Bin): number | null => {
    if (!bin.customer_location_id && !bin.customer_id) return null;
    if (!bin.last_dropoff_at) return null;
    return Math.floor((Date.now() - new Date(bin.last_dropoff_at).getTime()) / 86_400_000);
  };

  const daysAtSite = (bin: Bin): string | null => {
    const days = daysAtSiteNum(bin);
    if (days === null) return null;
    return days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
  };

  const filteredBins = bins.filter(bin => {
    if (locationFilter === 'customer' && !bin.customer_id && !bin.customer_location_id) return false;
    if (locationFilter === 'yard' && !bin.location_id) return false;
    if (locationFilter === 'unknown' && (bin.customer_id || bin.customer_location_id || bin.location_id)) return false;
    if (typeFilter && bin.type !== typeFilter) return false;
    if (sizeFilter && bin.size !== sizeFilter) return false;
    if (statusFilter === 'active' && bin.status === 'retired') return false;
    if (statusFilter === 'retired' && bin.status !== 'retired') return false;
    return true;
  }).sort((a, b) => {
    if (!sortDays) return 0;
    const da = daysAtSiteNum(a) ?? -1;
    const db = daysAtSiteNum(b) ?? -1;
    return sortDays === 'asc' ? da - db : db - da;
  });

  const currentLocation = (bin: Bin) => {
    if (bin.customer_locations) {
      const siteName = `${bin.customer_locations.customers?.name ?? ''} · ${bin.customer_locations.name}`;
      return { label: 'At customer', value: siteName, color: 'text-blue-700 bg-blue-50' };
    }
    if (bin.customers) return { label: 'At customer', value: bin.customers.name, color: 'text-blue-700 bg-blue-50' };
    if (bin.locations) return { label: 'At yard', value: bin.locations.name, color: 'text-green-700 bg-green-50' };
    // Fallback to raw IDs when FK joins return null (e.g. missing FK constraint in DB)
    if (bin.customer_location_id || bin.customer_id) return { label: 'At customer', value: '—', color: 'text-blue-700 bg-blue-50' };
    if (bin.location_id) return { label: 'At yard', value: '—', color: 'text-green-700 bg-green-50' };
    return { label: 'Unknown', value: '—', color: 'text-gray-500 bg-gray-50' };
  };


  return (
    <main className="max-w-4xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Bins</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">
          + New Bin
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex border rounded overflow-hidden">
          {([['all', 'All'], ['customer', 'At Customer'], ['yard', 'At Yard'], ['unknown', 'Unknown']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setLocationFilter(val)}
              className={`px-4 py-2 text-sm font-medium ${locationFilter === val ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {label} <span className={`ml-1 text-xs font-normal ${locationFilter === val ? 'text-blue-200' : 'text-gray-400'}`}>({tabCounts[val]})</span>
            </button>
          ))}
        </div>

        {typeOptions.length > 0 && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm text-gray-700"
          >
            <option value="">All Types</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {sizeOptions.length > 0 && (
          <select
            value={sizeFilter}
            onChange={e => setSizeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm text-gray-700"
          >
            <option value="">All Sizes</option>
            {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'retired')}
          className="border rounded px-3 py-2 text-sm text-gray-700"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Bin No.</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Size</th>
              <th className="text-left px-4 py-3 font-medium">Current Location</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <button
                  onClick={() => setSortDays(s => s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Days at Site
                  <span className="text-gray-400 text-xs">{sortDays === 'asc' ? '↑' : sortDays === 'desc' ? '↓' : '↕'}</span>
                </button>
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredBins.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center px-4 py-6 text-gray-400">
                  {bins.length === 0 ? 'No bins registered' : 'No bins match this filter'}
                </td>
              </tr>
            )}
            {filteredBins.map(bin => {
              const loc = currentLocation(bin);
              const days = daysAtSite(bin);
              return (
                <tr key={bin.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{bin.serial_number}</td>
                  <td className="px-4 py-3 text-gray-600">{bin.type ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{bin.size ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${loc.color}`}>
                      <span className="text-gray-400 font-normal">{loc.label}:</span>
                      {loc.value}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${bin.status === 'retired' ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}`}>
                      {bin.status === 'retired' ? 'Retired' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {days ? (
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        days === 'Today' ? 'bg-green-50 text-green-700' :
                        parseInt(days) >= 14 ? 'bg-red-50 text-red-700' :
                        parseInt(days) >= 7 ? 'bg-orange-50 text-orange-700' :
                        'bg-gray-50 text-gray-600'
                      }`}>{days}</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => router.push(`/bins/${bin.id}`)} title="History" className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded mr-1">
                      <Clock size={14} />
                    </button>
                    <button onClick={() => openEdit(bin)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(bin.id, bin.serial_number)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editingBin ? 'Edit Bin' : 'New Bin'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Serial Number</label>
                <input
                  name="serial_number"
                  value={form.serial_number}
                  onChange={handleChange}
                  required
                  placeholder="e.g. H1232"
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <input
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    placeholder="e.g. Skip, Hookbin"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Size</label>
                  <input
                    name="size"
                    value={form.size}
                    onChange={handleChange}
                    placeholder="e.g. 5m³, 10m³"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Currently at</label>
                <select name="locationType" value={form.locationType} onChange={handleChange} className="w-full border rounded px-3 py-2">
                  <option value="">— Unknown —</option>
                  <option value="customer">At customer site</option>
                  <option value="location">At yard / location</option>
                </select>
              </div>

              {form.locationType === 'customer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Customer</label>
                    <select name="customer_id" value={form.customer_id} onChange={handleChange} required className="w-full border rounded px-3 py-2">
                      <option value="">Select customer</option>
                      {customerOptions.map(c => <option key={c.customer_id} value={String(c.customer_id)}>{c.name}</option>)}
                    </select>
                  </div>
                  {form.customer_id && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Site</label>
                      <select name="customer_location_id" value={form.customer_location_id} onChange={handleChange} required className="w-full border rounded px-3 py-2">
                        <option value="">Select site</option>
                        {customerLocationOptions
                          .filter(l => String(l.customer_id) === form.customer_id)
                          .map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

              {form.locationType === 'location' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Yard / Location</label>
                  <select name="location_id" value={form.location_id} onChange={handleChange} required className="w-full border rounded px-3 py-2">
                    <option value="">Select location</option>
                    {locationOptions.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="w-full border rounded px-3 py-2">
                  <option value="active">Active</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Saving...' : editingBin ? 'Save Changes' : 'Create Bin'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
