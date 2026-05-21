'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Timesheet = {
  id: string;
  worker_id: string;
  project_id: string;
  date: string;
  regular_hours: number;
  ot_15_hours: number;
  ot_20_hours: number;
  source: string;
};

type Worker = { employee_id: string; name: string };
type Project = { id: string; name: string };

type EditState = {
  regular_hours: number;
  ot_15_hours: number;
  ot_20_hours: number;
};

export default function TimesheetsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    const fetchLookups = async () => {
      const [w, p] = await Promise.all([
        supabase.from('workers').select('employee_id, name').eq('active', true).order('name'),
        supabase.from('projects').select('id, name').order('name'),
      ]);
      if (w.data) setWorkers(w.data);
      if (p.data) setProjects(p.data);
    };
    fetchLookups();
  }, []);

  useEffect(() => {
    const fetchTimesheets = async () => {
      const { data } = await supabase
        .from('timesheets')
        .select('id, worker_id, project_id, date, regular_hours, ot_15_hours, ot_20_hours, source')
        .eq('date', date)
        .order('worker_id');

      if (data) {
        setTimesheets(data);
        const editMap: Record<string, EditState> = {};
        data.forEach(r => {
          editMap[r.id] = {
            regular_hours: r.regular_hours,
            ot_15_hours: r.ot_15_hours,
            ot_20_hours: r.ot_20_hours,
          };
        });
        setEditing(editMap);
      }
    };
    fetchTimesheets();
  }, [date, refreshKey]);

  const workerName = (id: string) => workers.find(w => w.employee_id === id)?.name ?? id;
  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? id;

  const saveRow = async (id: string) => {
    setSaving(prev => ({ ...prev, [id]: true }));
    setSaveErrors(prev => ({ ...prev, [id]: '' }));
    const e = editing[id];
    const { data, error } = await supabase
      .from('timesheets')
      .update({ regular_hours: e.regular_hours, ot_15_hours: e.ot_15_hours, ot_20_hours: e.ot_20_hours, source: 'manual' })
      .eq('id', id)
      .select();
    setSaving(prev => ({ ...prev, [id]: false }));
    if (error) {
      setSaveErrors(prev => ({ ...prev, [id]: error.message }));
    } else if (!data || data.length === 0) {
      setSaveErrors(prev => ({ ...prev, [id]: 'Save blocked — add an UPDATE policy for the timesheets table in Supabase.' }));
    } else {
      refresh();
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Timesheets</h1>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">Select Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Worker</th>
              <th className="text-left px-4 py-3 font-medium">Project</th>
              <th className="text-left px-4 py-3 font-medium">Regular hrs</th>
              <th className="text-left px-4 py-3 font-medium">OT 1.5×</th>
              <th className="text-left px-4 py-3 font-medium">OT 2.0×</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {timesheets.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-6 text-gray-400">
                  No timesheet entries for this date. Create assignments first.
                </td>
              </tr>
            )}
            {timesheets.map(row => {
              const e = editing[row.id] ?? {
                regular_hours: row.regular_hours,
                ot_15_hours: row.ot_15_hours,
                ot_20_hours: row.ot_20_hours,
              };
              return (
                <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{workerName(row.worker_id)}</td>
                  <td className="px-4 py-3 text-gray-600">{projectName(row.project_id)}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number" min={0} max={24} step={0.5}
                      value={e.regular_hours}
                      onChange={ev => setEditing(prev => ({ ...prev, [row.id]: { ...e, regular_hours: parseFloat(ev.target.value) || 0 } }))}
                      className="border rounded px-2 py-1 w-16 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number" min={0} max={24} step={0.5}
                      value={e.ot_15_hours}
                      onChange={ev => setEditing(prev => ({ ...prev, [row.id]: { ...e, ot_15_hours: parseFloat(ev.target.value) || 0 } }))}
                      className="border rounded px-2 py-1 w-16 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number" min={0} max={24} step={0.5}
                      value={e.ot_20_hours}
                      onChange={ev => setEditing(prev => ({ ...prev, [row.id]: { ...e, ot_20_hours: parseFloat(ev.target.value) || 0 } }))}
                      className="border rounded px-2 py-1 w-16 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => saveRow(row.id)}
                        disabled={saving[row.id]}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving[row.id] ? 'Saving...' : 'Save'}
                      </button>
                      {saveErrors[row.id] && (
                        <span className="text-xs text-red-600">{saveErrors[row.id]}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}