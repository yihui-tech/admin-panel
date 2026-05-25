'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Bin = {
  id: string;
  serial_number: string;
  customer_id: number | null;
  location_id: number | null;
  created_at: string;
  customers: { name: string } | null;
  locations: { name: string } | null;
};

type CustomerOption = { customer_id: number; name: string };
type LocationOption = { id: number; name: string };

type BinForm = {
  serial_number: string;
  locationType: '' | 'customer' | 'location';
  customer_id: string;
  location_id: string;
};

const emptyForm: BinForm = {
  serial_number: '',
  locationType: '',
  customer_id: '',
  location_id: '',
};

function binToForm(bin: Bin): BinForm {
  return {
    serial_number: bin.serial_number,
    locationType: bin.customer_id ? 'customer' : bin.location_id ? 'location' : '',
    customer_id: bin.customer_id ? String(bin.customer_id) : '',
    location_id: bin.location_id ? String(bin.location_id) : '',
  };
}

function formToPayload(form: BinForm) {
  return {
    serial_number: form.serial_number,
    customer_id: form.locationType === 'customer' && form.customer_id ? parseInt(form.customer_id, 10) : null,
    location_id: form.locationType === 'location' && form.location_id ? parseInt(form.location_id, 10) : null,
  };
}

export default function BinsPage() {
  const [bins, setBins] = useState<Bin[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBin, setEditingBin] = useState<Bin | null>(null);
  const [form, setForm] = useState<BinForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState<'all' | 'customer' | 'yard' | 'unknown'>('all');

  const fetchBins = async () => {
    const { data } = await supabase
      .from('bins')
      .select('id, serial_number, customer_id, location_id, created_at, customers(name), locations(name)')
      .order('serial_number');
    if (data) setBins(data as unknown as Bin[]);
  };

  useEffect(() => {
    const fetchLookups = async () => {
      const [c, l] = await Promise.all([
        supabase.from('customers').select('customer_id, name').order('name'),
        supabase.from('locations').select('id, name').order('name'),
      ]);
      if (c.data) setCustomerOptions(c.data);
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
    setForm(prev => ({ ...prev, [name]: value }));
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

  const filteredBins = bins.filter(bin => {
    if (locationFilter === 'customer') return !!bin.customer_id;
    if (locationFilter === 'yard') return !!bin.location_id;
    if (locationFilter === 'unknown') return !bin.customer_id && !bin.location_id;
    return true;
  });

  const currentLocation = (bin: Bin) => {
    if (bin.customers) return { label: 'At customer', value: bin.customers.name, color: 'text-blue-700 bg-blue-50' };
    if (bin.locations) return { label: 'At yard', value: bin.locations.name, color: 'text-green-700 bg-green-50' };
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

      <div className="flex border rounded overflow-hidden w-fit mb-6">
        {([['all', 'All'], ['customer', 'At Customer'], ['yard', 'At Yard'], ['unknown', 'Unknown']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setLocationFilter(val)}
            className={`px-4 py-2 text-sm font-medium ${locationFilter === val ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Serial Number</th>
              <th className="text-left px-4 py-3 font-medium">Current Location</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredBins.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center px-4 py-6 text-gray-400">
                  {bins.length === 0 ? 'No bins registered' : 'No bins match this filter'}
                </td>
              </tr>
            )}
            {filteredBins.map(bin => {
              const loc = currentLocation(bin);
              return (
                <tr key={bin.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{bin.serial_number}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${loc.color}`}>
                      <span className="text-gray-400 font-normal">{loc.label}:</span>
                      {loc.value}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(bin)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => handleDelete(bin.id, bin.serial_number)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

              <div>
                <label className="block text-sm font-medium mb-1">Currently at</label>
                <select name="locationType" value={form.locationType} onChange={handleChange} className="w-full border rounded px-3 py-2">
                  <option value="">— Unknown —</option>
                  <option value="customer">At customer site</option>
                  <option value="location">At yard / location</option>
                </select>
              </div>

              {form.locationType === 'customer' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Customer</label>
                  <select name="customer_id" value={form.customer_id} onChange={handleChange} required className="w-full border rounded px-3 py-2">
                    <option value="">Select customer</option>
                    {customerOptions.map(c => <option key={c.customer_id} value={String(c.customer_id)}>{c.name}</option>)}
                  </select>
                </div>
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
