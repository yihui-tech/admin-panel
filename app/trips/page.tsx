'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Trip = {
  id: string;
  vehicle_number: string;
  driver_id: string | null;
  customer_id: string | null;
  dropoff_id: string | null;
  requester: string | null;
  remarks: string | null;
  status: string;
  created_at: string;
  customers: { name: string; address: string | null; contact_person: string | null; contact_number: string | null } | null;
  locations: { name: string; address: string | null } | null;
  weigh_bridge: { net_weight: number }[];
  trip_bins: { id: string; bin_id: string; action: string; bins: { serial_number: string } | null }[];
};

type Vehicle = { plate_number: string };
type Driver = { employee_id: string; name: string };
type CustomerOption = { customer_id: number; name: string; address: string | null };
type LocationOption = { id: number; name: string; address: string | null };
type BinOption = { id: string; serial_number: string; customer_id: number | null; location_id: number | null };
type BinAction = { bin_id: string; action: 'dropoff' | 'pickup' };

const emptyForm = {
  vehicle_number: '',
  driver_id: '',
  customer_id: '',
  dropoff_id: '',
  requester: '',
  remarks: '',
};

const emptyCustomerForm = { name: '', contact_person: '', contact_number: '', address: '' };

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
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

  const fetchTrips = async () => {
    const { data } = await supabase
      .from('trips')
      .select('id, vehicle_number, driver_id, customer_id, dropoff_id, requester, remarks, status, created_at, customers(name, address, contact_person, contact_number), locations(name, address), weigh_bridge(net_weight), trip_bins(id, bin_id, action, bins(serial_number))')
      .order('created_at', { ascending: false });
    if (data) setTrips(data as unknown as Trip[]);
  };

  const fetchLookups = async () => {
    const [v, d, c, l, b] = await Promise.all([
      supabase.from('vehicles').select('plate_number').order('plate_number'),
      supabase.from('drivers').select('employee_id, name').order('name'),
      supabase.from('customers').select('customer_id, name, address').order('name'),
      supabase.from('locations').select('id, name, address').order('name'),
      supabase.from('bins').select('id, serial_number, customer_id, location_id').order('serial_number'),
    ]);
    if (v.data) setVehicles(v.data);
    if (d.data) setDrivers(d.data);
    if (c.data) setCustomerOptions(c.data);
    if (l.data) setLocationOptions(l.data);
    if (b.data) setBinOptions(b.data);
  };

  useEffect(() => {
    fetchTrips();
    fetchLookups();
  }, []);

  const selectedCustomerAddress = customerOptions.find(c => String(c.customer_id) === form.customer_id)?.address ?? '';
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
      dropoff_id: trip.dropoff_id != null ? String(trip.dropoff_id) : '',
      requester: trip.requester ?? '',
      remarks: trip.remarks ?? '',
    });
    setBinActions(trip.trip_bins.map(tb => ({ bin_id: tb.bin_id, action: tb.action as 'dropoff' | 'pickup' })));
    setEditingTrip(trip);
    setShowNewCustomer(false);
    setNewCustomerForm(emptyCustomerForm);
    setShowModal(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'customer_id' && value === '__new__') {
      setShowNewCustomer(true);
      setForm(prev => ({ ...prev, customer_id: '' }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      vehicle_number: form.vehicle_number,
      driver_id: form.driver_id || null,
      customer_id: form.customer_id ? parseInt(form.customer_id, 10) : null,
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
    const { error } = await supabase.from('trips').update({ status: 'completed' }).eq('id', id);
    if (error) { alert('Error updating trip: ' + error.message); return; }

    for (const tb of trip.trip_bins) {
      if (tb.action === 'pickup') {
        await supabase.from('bins').update({
          location_id: trip.dropoff_id ? Number(trip.dropoff_id) : null,
          customer_id: null,
        }).eq('id', tb.bin_id);
      } else if (tb.action === 'dropoff') {
        await supabase.from('bins').update({
          customer_id: trip.customer_id ? Number(trip.customer_id) : null,
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
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (!error) fetchTrips();
    else alert('Error deleting trip: ' + error.message);
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

  const generateMessage = (t: Trip) => {
    const date = new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const lines = [
      `Date : ${date}`,
      ``,
      `Order placed by - ${t.requester ?? ''}`,
      ``,
      `Collect from - ${t.customers?.name ?? ''}`,
      `Collection address - ${t.customers?.address ?? ''}`,
      `Person in charge - ${t.customers?.contact_person ?? ''}`,
      `Contact no. - ${t.customers?.contact_number ?? ''}`,
      ``,
      `Sent to - ${t.locations?.name ?? ''}`,
      `Address - ${t.locations?.address ?? ''}`,
      `Person in charge - `,
      `Contact no. - `,
      ``,
      `Remarks: ${t.remarks ?? ''}`,
    ];

    t.trip_bins.forEach(tb => {
      const label = tb.action === 'dropoff' ? 'Bin drop off' : 'Bin pick up';
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

  const totalNetWeight = (trip: Trip) =>
    trip.weigh_bridge.reduce((sum, w) => sum + w.net_weight, 0);

  return (
    <main className="max-w-7xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Trips</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">
          + New Trip
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Vehicle</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Dropoff</th>
              <th className="text-left px-4 py-3 font-medium">Net Weight</th>
              <th className="text-left px-4 py-3 font-medium">Requester</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {trips.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center px-4 py-6 text-gray-400">No trips yet</td>
              </tr>
            )}
            {trips.map(t => {
              const netWeight = totalNetWeight(t);
              return (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{t.vehicle_number}</td>
                  <td className="px-4 py-3 text-gray-600">{t.customers?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.locations?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {t.weigh_bridge.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : t.weigh_bridge.length === 1 ? (
                      <span className="text-gray-700 text-sm">{t.weigh_bridge[0].net_weight.toFixed(3)} kg</span>
                    ) : (
                      <div className="text-xs space-y-0.5">
                        {t.weigh_bridge.map((w, i) => (
                          <div key={i} className="text-gray-500">Load {i + 1}: {w.net_weight.toFixed(3)} kg</div>
                        ))}
                        <div className="font-semibold text-gray-800 border-t pt-0.5 mt-0.5">{netWeight.toFixed(3)} kg</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.requester ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={statusBadge(t.status)}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {t.status === 'open' && (
                        <div className="flex gap-1.5">
                          <button onClick={() => handleMarkComplete(t.id)} className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">
                            Complete
                          </button>
                          <button onClick={() => handleCancel(t.id)} className="px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200">
                            Cancel
                          </button>
                        </div>
                      )}
                      <div className="flex gap-0.5">
                        <button onClick={() => { setPreviewTrip(t); setCopied(false); }} title="Preview WhatsApp message" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button onClick={() => openEdit(t)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(t.id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

                {!showNewCustomer && selectedCustomerAddress && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 border rounded text-sm text-gray-600">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-2">Pickup</span>
                    {selectedCustomerAddress}
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
                      <label className="block text-sm font-medium mb-1">Address (Pickup Location)</label>
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
                <label className="block text-sm font-medium mb-1">Dropoff Location</label>
                <select name="dropoff_id" value={form.dropoff_id} onChange={handleChange} className="w-full border rounded px-3 py-2">
                  <option value="">— No dropoff —</option>
                  {locationOptions.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                </select>

                {selectedDropoffAddress && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 border rounded text-sm text-gray-600">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-2">Address</span>
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
                  {binActions.map((ba, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={ba.bin_id}
                        onChange={e => {
                          const bin = binOptions.find(b => b.id === e.target.value);
                          const action = bin?.location_id ? 'dropoff' : bin?.customer_id ? 'pickup' : ba.action;
                          setBinActions(prev => prev.map((a, j) => j === i ? { ...a, bin_id: e.target.value, action } : a));
                        }}
                        className="flex-1 border rounded px-3 py-2 text-sm"
                      >
                        <option value="">Select bin</option>
                        {binOptions.map(b => <option key={b.id} value={b.id}>{b.serial_number}</option>)}
                      </select>
                      <select
                        value={ba.action}
                        onChange={e => setBinActions(prev => prev.map((a, j) => j === i ? { ...a, action: e.target.value as 'dropoff' | 'pickup' } : a))}
                        className="border rounded px-3 py-2 text-sm"
                      >
                        <option value="dropoff">Drop off</option>
                        <option value="pickup">Pick up</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setBinActions(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-500 hover:text-red-700 px-1 text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
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

      {previewTrip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">WhatsApp Message</h2>
              <button onClick={() => setPreviewTrip(null)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
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
