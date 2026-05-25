'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from './lib/supabase';

type ProjectCost = {
  id: string;
  name: string;
  status: string;
  totalCost: number;
};

type Bin = {
  id: string;
  serial_number: string;
  customer_id: number | null;
  location_id: number | null;
  customers: { name: string } | null;
  locations: { name: string } | null;
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

export default function HomePage() {
  const [projectCosts, setProjectCosts] = useState<ProjectCost[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [bins, setBins] = useState<Bin[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  const currentMonthLabel = new Date().toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });

  useEffect(() => {
    const fetchData = async () => {
      const [year, month] = currentMonth.split('-').map(Number);
      const workingDays = getWorkingDays(year, month - 1);
      const startDate = `${currentMonth}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const [
        { data: projects },
        { data: timesheets },
        { data: workers },
        { data: binsData },
      ] = await Promise.all([
        supabase.from('projects').select('id, name, status').eq('status', 'active').order('name'),
        supabase.from('timesheets').select('project_id, worker_id, regular_hours, ot_15_hours, ot_20_hours').gte('date', startDate).lte('date', endDate),
        supabase.from('workers').select('employee_id, monthly_rate'),
        supabase.from('bins').select('id, serial_number, customer_id, location_id, customers(name), locations(name)').order('serial_number'),
      ]);

      if (projects && timesheets && workers) {
        const workerRateMap: Record<string, number> = {};
        workers.forEach(w => { workerRateMap[w.employee_id] = w.monthly_rate; });

        const costMap: Record<string, number> = {};
        timesheets.forEach(t => {
          const monthlyRate = workerRateMap[t.worker_id] || 0;
          const dailyRate = monthlyRate / workingDays;
          const hourlyRate = dailyRate / 8;
          const regularCost = t.regular_hours > 4 ? dailyRate : (t.regular_hours / 8) * dailyRate;
          const ot15Cost = t.ot_15_hours * hourlyRate * 1.5;
          const ot20Cost = t.ot_20_hours * hourlyRate * 2;
          costMap[t.project_id] = (costMap[t.project_id] || 0) + regularCost + ot15Cost + ot20Cost;
        });

        const result: ProjectCost[] = projects.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          totalCost: costMap[p.id] || 0,
        })).sort((a, b) => b.totalCost - a.totalCost);

        setProjectCosts(result);
        setTotalCost(result.reduce((sum, p) => sum + p.totalCost, 0));
      }

      if (binsData) setBins(binsData as unknown as Bin[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  const binLocation = (bin: Bin) => {
    if (bin.customers) return { label: bin.customers.name, type: 'customer' as const };
    if (bin.locations) return { label: bin.locations.name, type: 'yard' as const };
    return { label: 'Unknown', type: 'unknown' as const };
  };

  const binsAtCustomer = bins.filter(b => b.customer_id);
  const binsAtYard = bins.filter(b => b.location_id);
  const binsUnknown = bins.filter(b => !b.customer_id && !b.location_id);

  return (
    <main className="max-w-7xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Cost Dashboard — 2/3 width */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Project Costs — {currentMonthLabel}</h2>
              <Link href="/cost" className="text-sm text-blue-600 hover:underline">Full dashboard →</Link>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 mb-4">
              <p className="text-sm text-blue-600 font-medium mb-1">Total This Month</p>
              <p className="text-3xl font-bold text-blue-900">
                ${totalCost.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Project</th>
                    <th className="text-right px-4 py-3 font-medium">Cost (SGD)</th>
                  </tr>
                </thead>
                <tbody>
                  {projectCosts.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center px-4 py-6 text-gray-400">No timesheet data this month</td>
                    </tr>
                  )}
                  {projectCosts.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {p.totalCost === 0
                          ? <span className="text-gray-300 font-normal">—</span>
                          : `$${p.totalCost.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bin Locations — 1/3 width */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Bin Locations</h2>
              <Link href="/bins" className="text-sm text-blue-600 hover:underline">Manage →</Link>
            </div>

            {bins.length === 0 ? (
              <div className="border rounded-lg p-6 text-center text-gray-400 text-sm">No bins registered</div>
            ) : (
              <div className="space-y-3">
                {binsAtCustomer.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-blue-50 border-b">
                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">At Customer Site</span>
                    </div>
                    {binsAtCustomer.map(bin => (
                      <div key={bin.id} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-gray-50">
                        <span className="font-medium text-sm">{bin.serial_number}</span>
                        <span className="text-xs text-gray-500">{binLocation(bin).label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {binsAtYard.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-green-50 border-b">
                      <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">At Yard</span>
                    </div>
                    {binsAtYard.map(bin => (
                      <div key={bin.id} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-gray-50">
                        <span className="font-medium text-sm">{bin.serial_number}</span>
                        <span className="text-xs text-gray-500">{binLocation(bin).label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {binsUnknown.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unknown Location</span>
                    </div>
                    {binsUnknown.map(bin => (
                      <div key={bin.id} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-gray-50">
                        <span className="font-medium text-sm">{bin.serial_number}</span>
                        <span className="text-xs text-gray-400">—</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </main>
  );
}
