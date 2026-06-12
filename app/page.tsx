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
  customer_location_id: number | null;
  location_id: number | null;
  customers: { name: string } | null;
  customer_locations: { name: string } | null;
  locations: { name: string } | null;
};

const PAGE_SIZE = 10;

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

function BinSection({
  bins,
  headerClass,
  labelClass,
  label,
}: {
  bins: Bin[];
  headerClass: string;
  labelClass: string;
  label: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? bins : bins.slice(0, PAGE_SIZE);
  const remaining = bins.length - PAGE_SIZE;

  const locationLabel = (bin: Bin) => {
    if (bin.customer_locations) return bin.customer_locations.name;
    if (bin.customers) return bin.customers.name;
    if (bin.locations) return bin.locations.name;
    return '—';
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className={`px-4 py-2 border-b flex items-center justify-between ${headerClass}`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>{label}</span>
        <span className={`text-xs ${labelClass} opacity-70`}>{bins.length}</span>
      </div>
      {visible.map(bin => (
        <div key={bin.id} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-gray-50">
          <span className="font-medium text-sm">{bin.serial_number}</span>
          <span className="text-xs text-gray-500">{locationLabel(bin)}</span>
        </div>
      ))}
      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 text-left"
        >
          Show {remaining} more
        </button>
      )}
      {showAll && bins.length > PAGE_SIZE && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full px-4 py-2 text-xs text-gray-400 hover:bg-gray-50 text-left"
        >
          Show less
        </button>
      )}
    </div>
  );
}

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
        supabase.from('bins').select('id, serial_number, customer_id, customer_location_id, location_id, customers(name), customer_locations(name), locations(name)').order('serial_number'),
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

  const binsAtCustomer = bins.filter(b => b.customer_location_id || b.customer_id);
  const binsAtYard = bins.filter(b => !b.customer_location_id && !b.customer_id && b.location_id);
  const binsUnknown = bins.filter(b => !b.customer_location_id && !b.customer_id && !b.location_id);

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
              <Link href="/management/cost" className="text-sm text-blue-600 hover:underline">Full dashboard →</Link>
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
                  <BinSection
                    bins={binsAtCustomer}
                    headerClass="bg-blue-50"
                    labelClass="text-blue-700"
                    label="At Customer Site"
                  />
                )}
                {binsAtYard.length > 0 && (
                  <BinSection
                    bins={binsAtYard}
                    headerClass="bg-green-50"
                    labelClass="text-green-700"
                    label="At Yard"
                  />
                )}
                {binsUnknown.length > 0 && (
                  <BinSection
                    bins={binsUnknown}
                    headerClass="bg-gray-50"
                    labelClass="text-gray-500"
                    label="Unknown Location"
                  />
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </main>
  );
}
