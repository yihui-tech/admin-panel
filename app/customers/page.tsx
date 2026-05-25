'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Customer = {
  customer_id: string;
  name: string;
  contact_person: string;
  contact_number: string;
  address: string;
};

const emptyForm = {
  name: '',
  contact_person: '',
  contact_number: '',
  address: '',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('*').order('name');
    if (data) setCustomers(data);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

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
      setForm(emptyForm);
      fetchCustomers();
    } else {
      alert('Error adding customer: ' + error.message);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setLoading(true);
    const { error } = await supabase
      .from('customers')
      .update({
        name: editingCustomer.name,
        contact_person: editingCustomer.contact_person,
        contact_number: editingCustomer.contact_number,
        address: editingCustomer.address,
      })
      .eq('customer_id', editingCustomer.customer_id);
    setLoading(false);
    if (!error) {
      setEditingCustomer(null);
      fetchCustomers();
    } else {
      alert('Error updating customer: ' + error.message);
    }
  };

  const handleDelete = async (customerId: string, customerName: string) => {
    if (!confirm(`Delete customer "${customerName}"?`)) return;
    const { error } = await supabase.from('customers').delete().eq('customer_id', customerId);
    if (!error) {
      fetchCustomers();
    } else {
      alert('Error deleting customer: ' + error.message);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Customers</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">New Customer</h2>

        {success && (
          <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
            Customer added successfully!
          </div>
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
          <div>
            <label className="block text-sm font-medium mb-1">Address (Pickup Location)</label>
            <input name="address" value={form.address} onChange={handleChange} className="w-full border rounded px-3 py-2" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
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
              <th className="text-left px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center px-4 py-6 text-gray-400">No customers yet</td>
              </tr>
            )}
            {customers.map(c => (
              <tr key={c.customer_id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.contact_person || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.contact_number || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.address || '—'}</td>
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
              <div>
                <label className="block text-sm font-medium mb-1">Address (Pickup Location)</label>
                <input name="address" value={editingCustomer.address || ''} onChange={handleEditChange} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditingCustomer(null)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
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
