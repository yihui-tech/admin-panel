'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Project = {
  id: string;
  name: string;
  location: string;
  start_date: string;
  end_date: string | null;
  status: string;
};

type Estimate = {
  id: string;
  project_id: string;
  category: string;
  unit: string | null;
  estimated_qty: number;
  estimated_unit_cost: number | null;
  notes: string | null;
  created_at: string;
};

type Invoice = {
  id: string;
  project_id: string;
  estimate_id: string | null;
  date: string;
  description: string;
  vendor: string | null;
  qty: number | null;
  unit_cost: number | null;
  amount: number;
  invoice_ref: string | null;
  created_at: string;
};

type LabourRow = {
  worker_id: string;
  worker_name: string;
  mandays: number;
  cost: number;
};

const emptyInvoiceForm = {
  estimate_id: '',
  date: '',
  vendor: '',
  description: '',
  qty: '',
  unit_cost: '',
  amount: '',
  invoice_ref: '',
};

const emptyEstimateForm = {
  category: '',
  unit: '',
  estimated_qty: '',
  estimated_unit_cost: '',
  notes: '',
};

const getWorkingDays = (year: number, month: number): number => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let weekdays = 0;
  let saturdays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d).getDay();
    if (day >= 1 && day <= 5) weekdays++;
    if (day === 6) saturdays++;
  }
  return weekdays + saturdays * 0.5;
};

const fmt = (n: number) =>
  n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const varianceClass = (v: number) => {
  if (v > 0) return 'text-red-600 font-semibold';
  if (v < 0) return 'text-green-600 font-semibold';
  return 'text-gray-500';
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [labourTotal, setLabourTotal] = useState(0);
  const [mandays, setMandays] = useState(0);
  const [activeTab, setActiveTab] = useState<'invoices' | 'estimates' | 'summary'>('summary');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Invoice form
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);

  // Estimate form
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<Estimate | null>(null);
  const [estimateForm, setEstimateForm] = useState(emptyEstimateForm);

  useEffect(() => { fetchAll(); }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: p }, { data: est }, { data: inv }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_estimates').select('*').eq('project_id', id).order('created_at'),
      supabase.from('project_invoices').select('*').eq('project_id', id).order('date', { ascending: false }),
    ]);
    if (p) setProject(p);
    if (est) setEstimates(est);
    if (inv) setInvoices(inv);
    await fetchLabour();
    setLoading(false);
  };

  const fetchLabour = async () => {
    const [{ data: timesheets }, { data: assignments }] = await Promise.all([
      supabase.from('timesheets').select('worker_id, regular_hours, ot_15_hours, ot_20_hours, date').eq('project_id', id),
      supabase.from('assignments').select('worker_id, shift').eq('project_id', id),
    ]);

    const mdMap: Record<string, number> = {};
    (assignments || []).forEach(a => {
      mdMap[a.worker_id] = (mdMap[a.worker_id] || 0) + (a.shift === 'full_day' ? 1 : 0.5);
    });

    if (!timesheets || timesheets.length === 0) {
      setLabourRows([]);
      setLabourTotal(0);
      setMandays(Object.values(mdMap).reduce((s, v) => s + v, 0));
      return;
    }

    const workerIds = [...new Set(timesheets.map(t => t.worker_id))];
    const { data: workers } = await supabase
      .from('workers').select('employee_id, name, monthly_rate').in('employee_id', workerIds);

    const rateMap: Record<string, number> = {};
    const nameMap: Record<string, string> = {};
    (workers || []).forEach(w => { rateMap[w.employee_id] = w.monthly_rate; nameMap[w.employee_id] = w.name; });

    const costByWorker: Record<string, number> = {};
    timesheets.forEach(t => {
      const d = new Date(t.date);
      const dailyRate = (rateMap[t.worker_id] || 0) / getWorkingDays(d.getFullYear(), d.getMonth());
      const hourlyRate = dailyRate / 8;
      const cost = (t.regular_hours > 4 ? dailyRate : (t.regular_hours / 8) * dailyRate)
        + (t.ot_15_hours || 0) * hourlyRate * 1.5
        + (t.ot_20_hours || 0) * hourlyRate * 2;
      costByWorker[t.worker_id] = (costByWorker[t.worker_id] || 0) + cost;
    });

    const rows: LabourRow[] = Object.entries(costByWorker).map(([wid, cost]) => ({
      worker_id: wid, worker_name: nameMap[wid] || wid, mandays: mdMap[wid] || 0, cost,
    }));
    rows.sort((a, b) => b.cost - a.cost);
    setLabourRows(rows);
    setLabourTotal(rows.reduce((s, r) => s + r.cost, 0));
    setMandays(Object.values(mdMap).reduce((s, v) => s + v, 0));
  };

  // ─── Invoice handlers ──────────────────────────────────────────────────────

  const handleInvoiceFieldChange = (field: string, value: string) => {
    setInvoiceForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-compute amount from qty × unit_cost
      const q = field === 'qty' ? value : next.qty;
      const uc = field === 'unit_cost' ? value : next.unit_cost;
      if (q && uc) {
        const computed = parseFloat(q) * parseFloat(uc);
        if (!isNaN(computed)) next.amount = computed.toFixed(2);
      }
      return next;
    });
  };

  const openNewInvoice = () => {
    setEditingInvoice(null);
    setInvoiceForm({ ...emptyInvoiceForm, date: new Date().toISOString().slice(0, 10) });
    setShowInvoiceForm(true);
  };

  const openEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setInvoiceForm({
      estimate_id: inv.estimate_id || '',
      date: inv.date,
      vendor: inv.vendor || '',
      description: inv.description,
      qty: inv.qty != null ? String(inv.qty) : '',
      unit_cost: inv.unit_cost != null ? String(inv.unit_cost) : '',
      amount: String(inv.amount),
      invoice_ref: inv.invoice_ref || '',
    });
    setShowInvoiceForm(true);
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      project_id: id,
      estimate_id: invoiceForm.estimate_id || null,
      date: invoiceForm.date,
      vendor: invoiceForm.vendor || null,
      description: invoiceForm.description,
      qty: invoiceForm.qty !== '' ? parseFloat(invoiceForm.qty) : null,
      unit_cost: invoiceForm.unit_cost !== '' ? parseFloat(invoiceForm.unit_cost) : null,
      amount: parseFloat(invoiceForm.amount),
      invoice_ref: invoiceForm.invoice_ref || null,
    };
    const { error } = editingInvoice
      ? await supabase.from('project_invoices').update(payload).eq('id', editingInvoice.id)
      : await supabase.from('project_invoices').insert(payload);
    setSaving(false);
    if (error) { alert('Error saving invoice: ' + error.message); return; }
    setShowInvoiceForm(false);
    const { data } = await supabase.from('project_invoices').select('*').eq('project_id', id).order('date', { ascending: false });
    if (data) setInvoices(data);
  };

  const handleDeleteInvoice = async (invId: string) => {
    if (!confirm('Delete this invoice?')) return;
    const { error } = await supabase.from('project_invoices').delete().eq('id', invId);
    if (error) { alert('Error: ' + error.message); return; }
    setInvoices(prev => prev.filter(i => i.id !== invId));
  };

  // ─── Estimate handlers ─────────────────────────────────────────────────────

  const openNewEstimate = () => {
    setEditingEstimate(null);
    setEstimateForm(emptyEstimateForm);
    setShowEstimateForm(true);
  };

  const openEditEstimate = (est: Estimate) => {
    setEditingEstimate(est);
    setEstimateForm({
      category: est.category,
      unit: est.unit || '',
      estimated_qty: String(est.estimated_qty),
      estimated_unit_cost: est.estimated_unit_cost != null ? String(est.estimated_unit_cost) : '',
      notes: est.notes || '',
    });
    setShowEstimateForm(true);
  };

  const handleSaveEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      project_id: id,
      category: estimateForm.category,
      unit: estimateForm.unit || null,
      estimated_qty: parseFloat(estimateForm.estimated_qty),
      estimated_unit_cost: estimateForm.estimated_unit_cost !== '' ? parseFloat(estimateForm.estimated_unit_cost) : null,
      notes: estimateForm.notes || null,
    };
    const { error } = editingEstimate
      ? await supabase.from('project_estimates').update(payload).eq('id', editingEstimate.id)
      : await supabase.from('project_estimates').insert(payload);
    setSaving(false);
    if (error) { alert('Error saving estimate: ' + error.message); return; }
    setShowEstimateForm(false);
    const { data } = await supabase.from('project_estimates').select('*').eq('project_id', id).order('created_at');
    if (data) setEstimates(data);
  };

  const handleDeleteEstimate = async (estId: string) => {
    const linkedCount = invoices.filter(i => i.estimate_id === estId).length;
    const msg = linkedCount > 0
      ? `This estimate has ${linkedCount} linked invoice(s). Deleting it will unlink them. Continue?`
      : 'Delete this estimate line?';
    if (!confirm(msg)) return;
    const { error } = await supabase.from('project_estimates').delete().eq('id', estId);
    if (error) { alert('Error: ' + error.message); return; }
    setEstimates(prev => prev.filter(e => e.id !== estId));
  };

  // ─── Derived totals ────────────────────────────────────────────────────────

  const totalInvoices = invoices.reduce((s, i) => s + i.amount, 0);
  const grandTotal = labourTotal + totalInvoices;

  // Invoice amounts grouped by estimate_id
  const actualByEstimate: Record<string, number> = {};
  invoices.forEach(inv => {
    if (inv.estimate_id) {
      actualByEstimate[inv.estimate_id] = (actualByEstimate[inv.estimate_id] || 0) + inv.amount;
    }
  });

  const totalEstimated = estimates.reduce((s, e) => s + (e.estimated_qty || 0) * (e.estimated_unit_cost || 0), 0);
  const totalActualLinked = estimates.reduce((s, e) => s + (actualByEstimate[e.id] || 0), 0);

  const estimateMap: Record<string, Estimate> = {};
  estimates.forEach(e => { estimateMap[e.id] = e; });

  const statusBadge = (status: string) => {
    const c: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      'on-hold': 'bg-yellow-100 text-yellow-800',
    };
    return `px-2 py-1 rounded text-xs font-medium ${c[status] || ''}`;
  };

  if (loading) return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="text-center py-16 text-gray-400">Loading...</div>
    </main>
  );

  if (!project) return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <div className="text-center py-16 text-gray-400">Project not found.</div>
    </main>
  );

  // Linked estimate for the currently selected invoice form
  const selectedEstimate = invoiceForm.estimate_id ? estimateMap[invoiceForm.estimate_id] : null;

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">

      {/* Back + header */}
      <button onClick={() => router.push('/projects')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={14} /> Back to Projects
      </button>
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <span className={statusBadge(project.status)}>{project.status}</span>
      </div>
      <div className="flex gap-6 text-sm text-gray-500 mb-6">
        <span>{project.location}</span>
        <span>{project.start_date} → {project.end_date || 'ongoing'}</span>
        {mandays > 0 && <span>{mandays} mandays</span>}
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Labour Cost</p>
          <p className="text-xl font-bold">${fmt(labourTotal)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Invoice Total</p>
          <p className="text-xl font-bold">${fmt(totalInvoices)}</p>
        </div>
        <div className="bg-gray-50 border rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Grand Total</p>
          <p className="text-xl font-bold">${fmt(grandTotal)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {(['summary', 'invoices', 'estimates'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {tab === 'estimates' ? 'Estimates & Actuals' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Invoices Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Invoices / Actual Costs</h2>
              <p className="text-xs text-gray-500 mt-0.5">Link each invoice to an estimate line to track variance.</p>
            </div>
            <button onClick={openNewInvoice} className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">
              <Plus size={14} /> Add Invoice
            </button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Estimate</th>
                  <th className="text-left px-4 py-3 font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  <th className="text-right px-4 py-3 font-medium">Qty</th>
                  <th className="text-right px-4 py-3 font-medium">$/Unit</th>
                  <th className="text-right px-4 py-3 font-medium">Amount (SGD)</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && (
                  <tr><td colSpan={8} className="text-center px-4 py-8 text-gray-400">No invoices yet</td></tr>
                )}
                {invoices.map(inv => {
                  const est = inv.estimate_id ? estimateMap[inv.estimate_id] : null;
                  return (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{inv.date}</td>
                      <td className="px-4 py-3">
                        {est
                          ? <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">{est.category}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.vendor || '—'}</td>
                      <td className="px-4 py-3">{inv.description}
                        {inv.invoice_ref && <span className="ml-2 text-xs text-gray-400">{inv.invoice_ref}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {inv.qty != null ? `${inv.qty}${est?.unit ? ' ' + est.unit : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {inv.unit_cost != null ? `$${fmt(inv.unit_cost)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">${fmt(inv.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditInvoice(inv)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={14} /></button>
                          <button onClick={() => handleDeleteInvoice(inv.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {invoices.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-bold">${fmt(totalInvoices)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Estimates & Actuals Tab ───────────────────────────────────────────── */}
      {activeTab === 'estimates' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Estimates &amp; Actuals</h2>
              <p className="text-xs text-gray-500 mt-0.5">Actuals are drawn from linked invoices. Add estimate lines first, then link invoices to them.</p>
            </div>
            <button onClick={openNewEstimate} className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">
              <Plus size={14} /> Add Line
            </button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
                  <th className="text-right px-4 py-3 font-medium">Est Qty</th>
                  <th className="text-right px-4 py-3 font-medium">Est $/Unit</th>
                  <th className="text-right px-4 py-3 font-medium">Est Total</th>
                  <th className="text-right px-4 py-3 font-medium">Actual (Invoices)</th>
                  <th className="text-right px-4 py-3 font-medium">Variance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {estimates.length === 0 && (
                  <tr><td colSpan={8} className="text-center px-4 py-8 text-gray-400">No estimate lines yet</td></tr>
                )}
                {estimates.map(est => {
                  const estTotal = (est.estimated_qty || 0) * (est.estimated_unit_cost || 0);
                  const actual = actualByEstimate[est.id] || 0;
                  const variance = actual > 0 ? actual - estTotal : null;
                  const linkedInvoices = invoices.filter(i => i.estimate_id === est.id);

                  return (
                    <tr key={est.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        {est.category}
                        {est.notes && <p className="text-xs text-gray-400 font-normal mt-0.5">{est.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{est.unit || '—'}</td>
                      <td className="px-4 py-3 text-right">{est.estimated_qty}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {est.estimated_unit_cost != null ? `$${fmt(est.estimated_unit_cost)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">{estTotal > 0 ? `$${fmt(estTotal)}` : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {actual > 0
                          ? <span className="font-medium">${fmt(actual)} <span className="text-xs font-normal text-gray-400">({linkedInvoices.length} inv)</span></span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {variance != null
                          ? <span className={varianceClass(variance)}>{variance > 0 ? '+' : ''}${fmt(Math.abs(variance))} {variance > 0 ? '▲' : '▼'}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditEstimate(est)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={14} /></button>
                          <button onClick={() => handleDeleteEstimate(est.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {estimates.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-bold">{totalEstimated > 0 ? `$${fmt(totalEstimated)}` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">{totalActualLinked > 0 ? `$${fmt(totalActualLinked)}` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {totalEstimated > 0 && totalActualLinked > 0
                        ? <span className={varianceClass(totalActualLinked - totalEstimated)}>
                            {totalActualLinked - totalEstimated > 0 ? '+' : ''}${fmt(Math.abs(totalActualLinked - totalEstimated))}
                          </span>
                        : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Summary Tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Labour */}
          <div>
            <h2 className="text-base font-semibold mb-3">Labour (from Timesheets)</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Worker</th>
                    <th className="text-right px-4 py-3 font-medium">Mandays</th>
                    <th className="text-right px-4 py-3 font-medium">Cost (SGD)</th>
                  </tr>
                </thead>
                <tbody>
                  {labourRows.length === 0
                    ? <tr><td colSpan={3} className="text-center px-4 py-6 text-gray-400">No timesheet data for this project</td></tr>
                    : labourRows.map(row => (
                      <tr key={row.worker_id} className="border-b last:border-0">
                        <td className="px-4 py-3">{row.worker_name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{row.mandays > 0 ? row.mandays : '—'}</td>
                        <td className="px-4 py-3 text-right">${fmt(row.cost)}</td>
                      </tr>
                    ))}
                </tbody>
                {labourRows.length > 0 && (
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td className="px-4 py-3 font-semibold">Total Labour</td>
                      <td className="px-4 py-3 text-right font-semibold">{mandays}</td>
                      <td className="px-4 py-3 text-right font-bold">${fmt(labourTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* All invoices — flat list */}
          <div>
            <h2 className="text-base font-semibold mb-3">All Invoices</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Estimate</th>
                    <th className="text-left px-4 py-3 font-medium">Vendor</th>
                    <th className="text-left px-4 py-3 font-medium">Description</th>
                    <th className="text-right px-4 py-3 font-medium">Qty</th>
                    <th className="text-right px-4 py-3 font-medium">$/Unit</th>
                    <th className="text-right px-4 py-3 font-medium">Amount (SGD)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && (
                    <tr><td colSpan={7} className="text-center px-4 py-6 text-gray-400">No invoices recorded</td></tr>
                  )}
                  {invoices.map(inv => {
                    const est = inv.estimate_id ? estimateMap[inv.estimate_id] : null;
                    return (
                      <tr key={inv.id} className="border-b last:border-0">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{inv.date}</td>
                        <td className="px-4 py-3">
                          {est
                            ? <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">{est.category}</span>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{inv.vendor || '—'}</td>
                        <td className="px-4 py-3">{inv.description}
                          {inv.invoice_ref && <span className="ml-2 text-xs text-gray-400">{inv.invoice_ref}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {inv.qty != null ? `${inv.qty}${est?.unit ? ' ' + est.unit : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {inv.unit_cost != null ? `$${fmt(inv.unit_cost)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">${fmt(inv.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {invoices.length > 0 && (
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 font-semibold">Total Invoices</td>
                      <td className="px-4 py-3 text-right font-bold">${fmt(totalInvoices)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>


          {/* Grand total */}
          <div>
            <h2 className="text-base font-semibold mb-3">Grand Total</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b"><td className="px-4 py-3 text-gray-600">Labour Cost</td><td className="px-4 py-3 text-right">${fmt(labourTotal)}</td></tr>
                  <tr className="border-b"><td className="px-4 py-3 text-gray-600">Invoice Total</td><td className="px-4 py-3 text-right">${fmt(totalInvoices)}</td></tr>
                  <tr className="bg-gray-50"><td className="px-4 py-3 font-bold">Grand Total</td><td className="px-4 py-3 text-right font-bold">${fmt(grandTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Modal ─────────────────────────────────────────────────────── */}
      {showInvoiceForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-screen overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingInvoice ? 'Edit Invoice' : 'Add Invoice'}</h2>
            <form onSubmit={handleSaveInvoice} className="space-y-4">

              {/* Link to estimate */}
              <div>
                <label className="block text-sm font-medium mb-1">Link to Estimate <span className="text-gray-400 font-normal">(optional)</span></label>
                <select
                  value={invoiceForm.estimate_id}
                  onChange={e => handleInvoiceFieldChange('estimate_id', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">— Unlinked / Miscellaneous —</option>
                  {estimates.map(est => (
                    <option key={est.id} value={est.id}>
                      {est.category}{est.unit ? ` (${est.unit})` : ''}
                      {est.estimated_unit_cost ? ` — est $${fmt(est.estimated_unit_cost)}/${est.unit || 'unit'}` : ''}
                    </option>
                  ))}
                </select>
                {selectedEstimate && (
                  <p className="text-xs text-blue-600 mt-1">
                    Estimate: {selectedEstimate.estimated_qty} {selectedEstimate.unit || 'units'}
                    {selectedEstimate.estimated_unit_cost ? ` × $${fmt(selectedEstimate.estimated_unit_cost)} = $${fmt(selectedEstimate.estimated_qty * selectedEstimate.estimated_unit_cost)}` : ''}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input type="date" required value={invoiceForm.date}
                    onChange={e => handleInvoiceFieldChange('date', e.target.value)}
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Vendor</label>
                  <input value={invoiceForm.vendor}
                    onChange={e => handleInvoiceFieldChange('vendor', e.target.value)}
                    placeholder="e.g. Crane Co."
                    className="w-full border rounded px-3 py-2" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input required value={invoiceForm.description}
                  onChange={e => handleInvoiceFieldChange('description', e.target.value)}
                  placeholder="e.g. Crane rental week 1, 50T crawler crane"
                  className="w-full border rounded px-3 py-2" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Qty {selectedEstimate?.unit && <span className="text-gray-400 font-normal">({selectedEstimate.unit})</span>}
                  </label>
                  <input type="number" step="0.5" min="0" value={invoiceForm.qty}
                    onChange={e => handleInvoiceFieldChange('qty', e.target.value)}
                    placeholder="e.g. 3"
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit Cost (SGD)</label>
                  <input type="number" step="0.01" min="0" value={invoiceForm.unit_cost}
                    onChange={e => handleInvoiceFieldChange('unit_cost', e.target.value)}
                    placeholder={selectedEstimate?.estimated_unit_cost ? `est $${fmt(selectedEstimate.estimated_unit_cost)}` : 'e.g. 2000'}
                    className="w-full border rounded px-3 py-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Total Amount (SGD)
                    {invoiceForm.qty && invoiceForm.unit_cost && (
                      <span className="text-gray-400 font-normal ml-1">— auto-computed</span>
                    )}
                  </label>
                  <input type="number" step="0.01" min="0" required value={invoiceForm.amount}
                    onChange={e => handleInvoiceFieldChange('amount', e.target.value)}
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Invoice Ref</label>
                  <input value={invoiceForm.invoice_ref}
                    onChange={e => handleInvoiceFieldChange('invoice_ref', e.target.value)}
                    placeholder="e.g. INV-2026-001"
                    className="w-full border rounded px-3 py-2" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowInvoiceForm(false)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Estimate Modal ────────────────────────────────────────────────────── */}
      {showEstimateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">{editingEstimate ? 'Edit Estimate Line' : 'Add Estimate Line'}</h2>
            <form onSubmit={handleSaveEstimate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input required value={estimateForm.category}
                    onChange={e => setEstimateForm({ ...estimateForm, category: e.target.value })}
                    placeholder="e.g. Crane Operations"
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit</label>
                  <input value={estimateForm.unit}
                    onChange={e => setEstimateForm({ ...estimateForm, unit: e.target.value })}
                    placeholder="e.g. days, hours, trips"
                    className="w-full border rounded px-3 py-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Estimated Qty</label>
                  <input type="number" step="0.5" min="0" required value={estimateForm.estimated_qty}
                    onChange={e => setEstimateForm({ ...estimateForm, estimated_qty: e.target.value })}
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Estimated Cost / Unit (SGD)</label>
                  <input type="number" step="0.01" min="0" value={estimateForm.estimated_unit_cost}
                    onChange={e => setEstimateForm({ ...estimateForm, estimated_unit_cost: e.target.value })}
                    placeholder="Optional"
                    className="w-full border rounded px-3 py-2" />
                </div>
              </div>
              {estimateForm.estimated_qty && estimateForm.estimated_unit_cost && (
                <p className="text-sm text-gray-500">
                  Estimated total: ${fmt(parseFloat(estimateForm.estimated_qty) * parseFloat(estimateForm.estimated_unit_cost))}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <input value={estimateForm.notes}
                  onChange={e => setEstimateForm({ ...estimateForm, notes: e.target.value })}
                  placeholder="Optional"
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowEstimateForm(false)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
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
