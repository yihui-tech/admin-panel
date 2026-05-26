'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Customer = {
  customer_id: number;
  name: string;
  contact_person: string | null;
  contact_number: string | null;
};

type CustomerLocation = {
  id: number;
  customer_id: number;
  name: string;
  address: string | null;
  contact_person: string | null;
  contact_number: string | null;
};

const emptyCustomerForm = { name: '', contact_person: '', contact_number: '' };
const emptyLocationForm = { name: '', address: '', contact_person: '', contact_number: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(emptyCustomerForm);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [locationsCustomer, setLocationsCustomer] = useState<Customer | null>(null);
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [editingLocation, setEditingLocation] = useState<CustomerLocation | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('customer_id, name, contact_person, contact_number').order('name');
    if (data) setCustomers(data);
  };

  const fetchLocations = async (customerId: number) => {
    setLocationsLoading(true);
    const { data } = await supabase
      .from('customer_locations')
      .select('id, customer_id, name, address, contact_person, contact_number')
      .eq('customer_id', customerId)
      .order('name');
    setLocationsLoading(false);
    if (data) setLocations(data);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingCustomer) return;
    setEditingCustomer({ ...editingCustomer, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    const { error } = await supabase.from('customers').insert(form);
    setLoading(false);
    if (!error) {
      setSuccess(true);
      setForm(emptyCustomerForm);
      fetchCustomers();
    } else {
      alert('Error adding customer: ' + error.message);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setEditLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .update({ name: editingCustomer.name, contact_person: editingCustomer.contact_person || null, contact_number: editingCustomer.contact_number || null })
      .eq('customer_id', editingCustomer.customer_id)
      .select();
    setEditLoading(false);
    if (error) {
      alert('Error updating customer: ' + error.message);
    } else if (!data || data.length === 0) {
      alert('Save failed — no rows updated. Check Supabase UPDATE policy on customers table.');
    } else {
      setEditingCustomer(null);
      fetchCustomers();
    }
  };

  const handleDelete = async (customerId: number, customerName: string) => {
    if (!confirm(`Delete customer "${customerName}"?`)) return;
    const { error } = await supabase.from('customers').delete().eq('customer_id', customerId);
    if (!error) fetchCustomers();
    else alert('Error deleting customer: ' + error.message);
  };

  const openLocations = (customer: Customer) => {
    setLocationsCustomer(customer);
    setLocations([]);
    setLocationForm(emptyLocationForm);
    setEditingLocation(null);
    fetchLocations(customer.customer_id);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationsCustomer) return;
    setSavingLocation(true);
    let error;
    if (editingLocation) {
      ({ error } = await supabase.from('customer_locations').update({
        name: locationForm.name,
        address: locationForm.address || null,
        contact_person: locationForm.contact_person || null,
        contact_number: locationForm.contact_number || null,
      }).eq('id', editingLocation.id));
    } else {
      ({ error } = await supabase.from('customer_locations').insert({
        customer_id: locationsCustomer.customer_id,
        name: locationForm.name,
        address: locationForm.address || null,
        contact_person: locationForm.contact_person || null,
        contact_number: locationForm.contact_number || null,
      }));
    }
    setSavingLocation(false);
    if (!error) {
      setLocationForm(emptyLocationForm);
      setEditingLocation(null);
      fetchLocations(locationsCustomer.customer_id);
    } else {
      alert('Error saving site: ' + error.message);
    }
  };

  const handleEditLocation = (loc: CustomerLocation) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name, address: loc.address ?? '', contact_person: loc.contact_person ?? '', contact_number: loc.contact_number ?? '' });
  };

  const handleDeleteLocation = async (id: number, name: string) => {
    if (!confirm(`Delete site "${name}"?`)) return;
    const { error } = await supabase.from('customer_locations').delete().eq('id', id);
    if (!error && locationsCustomer) fetchLocations(locationsCustomer.customer_id);
    else if (error) alert('Error deleting site: ' + error.message);
  };

  return (
    <main className="max-w-4xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Customers</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">New Customer</h2>
        {success && (
          <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">Customer added successfully!</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input name="name" value={form.name} onChange={handleChange} required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Person</label>
              <input name="contact_person" value={form.contact_person} onChange={handleChange} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Number</label>
              <input name="contact_number" value={form.contact_number} onChange={handleChange} className="w-full border rounded px-3 py-2" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Add Customer'}
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Company Name</th>
              <th className="text-left px-4 py-3 font-medium">Contact Person</th>
              <th className="text-left px-4 py-3 font-medium">Contact Number</th>
              <th className="text-left px-4 py-3 font-medium">Sites</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={5} className="text-center px-4 py-6 text-gray-400">No customers yet</td></tr>
            )}
            {customers.map(c => (
              <tr key={c.customer_id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.contact_person || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.contact_number || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openLocations(c)} className="text-sm text-blue-600 hover:underline">
                    Manage sites
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditingCustomer(c)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => handleDelete(c.customer_id, c.name)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit customer modal */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Edit Customer</h2>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Company Name</label>
                <input name="name" value={editingCustomer.name} onChange={handleEditChange} required className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Person</label>
                <input name="contact_person" value={editingCustomer.contact_person || ''} onChange={handleEditChange} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Number</label>
                <input name="contact_number" value={editingCustomer.contact_number || ''} onChange={handleEditChange} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editLoading} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditingCustomer(null)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sites management modal */}
      {locationsCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{locationsCustomer.name} — Sites</h2>
              <button onClick={() => { setLocationsCustomer(null); setEditingLocation(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSaveLocation} className="border rounded-lg p-4 mb-4 bg-gray-50 space-y-3 shrink-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{editingLocation ? 'Edit site' : 'Add site'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Site Name</label>
                  <input value={locationForm.name} onChange={e => setLocationForm(p => ({ ...p, name: e.target.value }))} required placeholder="e.g. Jurong Site" className="w-full border rounded px-3 py-2 bg-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <input value={locationForm.address} onChange={e => setLocationForm(p => ({ ...p, address: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Person</label>
                  <input value={locationForm.contact_person} onChange={e => setLocationForm(p => ({ ...p, contact_person: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Number</label>
                  <input value={locationForm.contact_number} onChange={e => setLocationForm(p => ({ ...p, contact_number: e.target.value }))} className="w-full border rounded px-3 py-2 bg-white text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingLocation || !locationForm.name.trim()} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingLocation ? 'Saving...' : editingLocation ? 'Save Changes' : 'Add Site'}
                </button>
                {editingLocation && (
                  <button type="button" onClick={() => { setEditingLocation(null); setLocationForm(emptyLocationForm); }} className="border px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="overflow-y-auto flex-1">
              {locationsLoading && <p className="text-sm text-gray-400 text-center py-4">Loading…</p>}
              {!locationsLoading && locations.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No sites added yet.</p>
              )}
              {!locationsLoading && locations.length > 0 && (
                <div className="space-y-2">
                  {locations.map(loc => (
                    <div key={loc.id} className="border rounded-lg px-4 py-3 flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{loc.name}</p>
                        {loc.address && <p className="text-xs text-gray-500 mt-0.5">{loc.address}</p>}
                        {(loc.contact_person || loc.contact_number) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {loc.contact_person}{loc.contact_person && loc.contact_number ? ' · ' : ''}{loc.contact_number}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-0.5 ml-4 shrink-0">
                        <button onClick={() => handleEditLocation(loc)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDeleteLocation(loc.id, loc.name)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
