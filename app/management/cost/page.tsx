'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

type ProjectCost = {
  id: string;
  name: string;
  location: string;
  status: string;
  totalCost: number;
  workerCount: number;
  mandays: number;
};

const getWorkingDays = (year: number, month: number, phSet: Set<string>): number => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let total = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d).getDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (day >= 1 && day <= 5) total += phSet.has(dateStr) ? 0 : 1;
    else if (day === 6) total += phSet.has(dateStr) ? 0 : 0.5;
  }

  return total;
};

export default function CostPage() {
  const router = useRouter();
  const [projectCosts, setProjectCosts] = useState<ProjectCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [view, setView] = useState<'month' | 'alltime'>('month');
  const [statusFilter, setStatusFilter] = useState<'active' | 'completed' | 'on-hold' | 'all'>('all');

  useEffect(() => {
    const fetchCosts = async () => {
      setLoading(true);

      const [year, month] = selectedMonth.split('-').map(Number);

      const { data: holidays } = await supabase.from('public_holidays').select('date');
      const phSet = new Set((holidays || []).map((h: { date: string }) => h.date));

      const workingDays = getWorkingDays(year, month - 1, phSet);

      let projectQuery = supabase
        .from('projects')
        .select('id, name, location, status')
        .order('name');

      if (statusFilter !== 'all') {
        projectQuery = projectQuery.eq('status', statusFilter);
      }

      const { data: projects } = await projectQuery;

      if (!projects) return;

      let timesheetQuery = supabase
        .from('timesheets')
        .select('project_id, worker_id, regular_hours, ot_15_hours, ot_20_hours, date');
      let assignmentQuery = supabase
        .from('assignments')
        .select('project_id, shift');

      if (view === 'month') {
        const startDate = `${selectedMonth}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        timesheetQuery = timesheetQuery.gte('date', startDate).lte('date', endDate);
        assignmentQuery = assignmentQuery.gte('assigned_date', startDate).lte('assigned_date', endDate);
      }

      const [{ data: timesheets }, { data: assignments }] = await Promise.all([timesheetQuery, assignmentQuery]);

      const { data: workers } = await supabase
        .from('workers')
        .select('employee_id, monthly_rate, "ot_1.5", "ot_2.0"');

      if (!workers || !timesheets) return;

      const workerRateMap: Record<string, number> = {};
      const workerOtMap: Record<string, { ot_1_5: number | null; ot_2_0: number | null }> = {};
      (workers as unknown as Record<string, number>[]).forEach(w => {
        workerRateMap[w.employee_id] = w.monthly_rate;
        workerOtMap[w.employee_id] = { ot_1_5: w['ot_1.5'] ?? null, ot_2_0: w['ot_2.0'] ?? null };
      });

      const mandayMap: Record<string, number> = {};
      (assignments || []).forEach(a => {
        mandayMap[a.project_id] = (mandayMap[a.project_id] || 0) + (a.shift === 'full_day' ? 1 : 0.5);
      });

      const costMap: Record<string, { total: number; workers: Set<string> }> = {};

      timesheets.forEach(t => {
        const monthlyRate = workerRateMap[t.worker_id] || 0;

        const entryDate = new Date(t.date);
        const entryWorkingDays = view === 'alltime'
          ? getWorkingDays(entryDate.getFullYear(), entryDate.getMonth(), phSet)
          : workingDays;

        const dailyRate = monthlyRate / entryWorkingDays;
        const hourlyRate = dailyRate / 8;

        const otRates = workerOtMap[t.worker_id];
        const regularCost = t.regular_hours > 4 ? dailyRate : (t.regular_hours / 8) * dailyRate;
        const ot15Cost = (t.ot_15_hours || 0) * (otRates?.ot_1_5 ?? hourlyRate * 1.5);
        const ot20Cost = (t.ot_20_hours || 0) * (otRates?.ot_2_0 ?? hourlyRate * 2);
        const totalCost = regularCost + ot15Cost + ot20Cost;

        if (!costMap[t.project_id]) {
          costMap[t.project_id] = { total: 0, workers: new Set() };
        }
        costMap[t.project_id].total += totalCost;
        costMap[t.project_id].workers.add(t.worker_id);
      });

      const result: ProjectCost[] = projects.map(p => ({
        id: p.id,
        name: p.name,
        location: p.location,
        status: p.status,
        totalCost: costMap[p.id]?.total || 0,
        workerCount: costMap[p.id]?.workers.size || 0,
        mandays: mandayMap[p.id] || 0,
      }));

      result.sort((a, b) => b.totalCost - a.totalCost);
      setProjectCosts(result);
      setLoading(false);
    };

    fetchCosts();
  }, [selectedMonth, view, statusFilter]);

  const totalAllProjects = projectCosts.reduce((sum, p) => sum + p.totalCost, 0);

  const statusBadge = (status: string) => {
    const colours: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      'on-hold': 'bg-yellow-100 text-yellow-800',
    };
    return `px-2 py-1 rounded text-xs font-medium ${colours[status] || ''}`;
  };

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Project</h1>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex border rounded overflow-hidden">
          <button
            onClick={() => setView('month')}
            className={`px-4 py-2 text-sm font-medium ${view === 'month' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            This Month
          </button>
          <button
            onClick={() => setView('alltime')}
            className={`px-4 py-2 text-sm font-medium ${view === 'alltime' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            All Time
          </button>
        </div>

        {view === 'month' && (
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        )}

        <div className="flex border rounded overflow-hidden">
          {(['all', 'active', 'completed', 'on-hold'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-medium capitalize ${statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 mb-6">
        <p className="text-sm text-blue-600 font-medium mb-1">Total Cost Across All Projects</p>
        <p className="text-3xl font-bold text-blue-900">
          ${totalAllProjects.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {/* Projects Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Project</th>
                <th className="text-left px-4 py-3 font-medium">Location</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Workers</th>
                <th className="text-right px-4 py-3 font-medium">Mandays</th>
                <th className="text-right px-4 py-3 font-medium">Total Cost (SGD)</th>
              </tr>
            </thead>
            <tbody>
              {projectCosts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center px-4 py-6 text-gray-400">
                    No timesheet data found for this period
                  </td>
                </tr>
              )}
              {projectCosts.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => router.push(`/projects/${p.id}`)} className="hover:text-blue-600 hover:underline text-left">
                      {p.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.location}</td>
                  <td className="px-4 py-3">
                    <span className={statusBadge(p.status)}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{p.workerCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {p.mandays === 0 ? <span className="text-gray-300">—</span> : p.mandays.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {p.totalCost === 0
                      ? <span className="text-gray-300">—</span>
                      : `$${p.totalCost.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            {projectCosts.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-bold">
                    ${totalAllProjects.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </main>
  );
}
