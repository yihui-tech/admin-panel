'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Worker = {
  employee_id: string;
  name: string;
  role: string;
};

type Project = {
  id: string;
  name: string;
  location: string;
  status: string;
};

type ShiftAssignment = {
  project_id: string;
  assignment_id?: string;
};

type WorkerAssignment = {
  mode: 'full_day' | 'split';
  full_day: ShiftAssignment;
  morning: ShiftAssignment;
  afternoon: ShiftAssignment;
};

type AssignmentMap = Record<string, WorkerAssignment>;
type NotesMap = Record<string, string>; // project_id → notes text

const emptyShift = (): ShiftAssignment => ({ project_id: '' });

const emptyAssignment = (): WorkerAssignment => ({
  mode: 'full_day',
  full_day: emptyShift(),
  morning: emptyShift(),
  afternoon: emptyShift(),
});

export default function AssignmentsPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<AssignmentMap>({});
  const [notes, setNotes] = useState<NotesMap>({});
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [w, p] = await Promise.all([
        supabase.from('workers').select('employee_id, name, role').eq('active', true).order('name'),
        supabase.from('projects').select('id, name, location, status').order('name'),
      ]);
      if (w.data) setWorkers(w.data);
      if (p.data) setProjects(p.data);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchAssignments = async () => {
      const [{ data: aData }, { data: nData }] = await Promise.all([
        supabase.from('assignments').select('id, worker_id, project_id, shift').eq('assigned_date', date),
        supabase.from('project_daily_notes').select('project_id, notes').eq('date', date),
      ]);

      const map: AssignmentMap = {};
      if (aData) {
        aData.forEach(a => {
          if (!map[a.worker_id]) map[a.worker_id] = emptyAssignment();
          if (a.shift === 'full_day') {
            map[a.worker_id].mode = 'full_day';
            map[a.worker_id].full_day = { project_id: a.project_id, assignment_id: a.id };
          } else if (a.shift === 'morning') {
            map[a.worker_id].mode = 'split';
            map[a.worker_id].morning = { project_id: a.project_id, assignment_id: a.id };
          } else if (a.shift === 'afternoon') {
            map[a.worker_id].mode = 'split';
            map[a.worker_id].afternoon = { project_id: a.project_id, assignment_id: a.id };
          }
        });
      }

      const notesMap: NotesMap = {};
      if (nData) {
        nData.forEach(n => { notesMap[n.project_id] = n.notes ?? ''; });
      }

      setAssignments(map);
      setNotes(notesMap);
    };
    fetchAssignments();
  }, [date]);

  const getAssignment = (workerId: string): WorkerAssignment => {
    return assignments[workerId] || emptyAssignment();
  };

  const updateAssignment = (workerId: string, updates: Partial<WorkerAssignment>) => {
    setAssignments(prev => ({
      ...prev,
      [workerId]: { ...getAssignment(workerId), ...updates },
    }));
  };

  const toggleSplit = (workerId: string) => {
    const current = getAssignment(workerId);
    updateAssignment(workerId, {
      mode: current.mode === 'full_day' ? 'split' : 'full_day',
    });
  };

  const upsertShift = async (
    workerId: string,
    shift: 'full_day' | 'morning' | 'afternoon',
    projectId: string,
    assignmentId?: string
  ) => {
    if (!projectId) return;
    if (assignmentId) {
      await supabase.from('assignments').update({ project_id: projectId }).eq('id', assignmentId);
    } else {
      await supabase.from('assignments').insert({
        worker_id: workerId,
        project_id: projectId,
        assigned_date: date,
        shift,
      });
    }
  };

  const deleteShift = async (assignmentId?: string) => {
    if (assignmentId) {
      await supabase.from('assignments').delete().eq('id', assignmentId);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccess(false);

    for (const [workerId, a] of Object.entries(assignments)) {
      if (a.mode === 'full_day') {
        await upsertShift(workerId, 'full_day', a.full_day.project_id, a.full_day.assignment_id);
        await deleteShift(a.morning.assignment_id);
        await deleteShift(a.afternoon.assignment_id);
      } else {
        await upsertShift(workerId, 'morning', a.morning.project_id, a.morning.assignment_id);
        await upsertShift(workerId, 'afternoon', a.afternoon.project_id, a.afternoon.assignment_id);
        await deleteShift(a.full_day.assignment_id);
      }
    }

    // Auto-create timesheet stubs for all saved assignments.
    // ignoreDuplicates: true ensures we never overwrite manual supervisor edits.
    const timesheetInserts: {
      worker_id: string;
      project_id: string;
      date: string;
      regular_hours: number;
      ot_15_hours: number;
      ot_20_hours: number;
      source: string;
    }[] = [];

    for (const [workerId, a] of Object.entries(assignments)) {
      if (a.mode === 'full_day' && a.full_day.project_id) {
        timesheetInserts.push({
          worker_id: workerId,
          project_id: a.full_day.project_id,
          date,
          regular_hours: 8,
          ot_15_hours: 0,
          ot_20_hours: 0,
          source: 'assignment',
        });
      } else if (a.mode === 'split') {
        if (a.morning.project_id) {
          timesheetInserts.push({
            worker_id: workerId,
            project_id: a.morning.project_id,
            date,
            regular_hours: 4,
            ot_15_hours: 0,
            ot_20_hours: 0,
            source: 'assignment',
          });
        }
        if (a.afternoon.project_id) {
          timesheetInserts.push({
            worker_id: workerId,
            project_id: a.afternoon.project_id,
            date,
            regular_hours: 4,
            ot_15_hours: 0,
            ot_20_hours: 0,
            source: 'assignment',
          });
        }
      }
    }

    // Build a map of which projects each worker is now assigned to on this date.
    const currentProjectsByWorker: Record<string, Set<string>> = {};
    for (const insert of timesheetInserts) {
      if (!currentProjectsByWorker[insert.worker_id]) {
        currentProjectsByWorker[insert.worker_id] = new Set();
      }
      currentProjectsByWorker[insert.worker_id].add(insert.project_id);
    }

    const workerIds = Object.keys(currentProjectsByWorker);
    if (workerIds.length > 0) {
      const { data: existing } = await supabase
        .from('timesheets')
        .select('id, worker_id, project_id, regular_hours, source')
        .eq('date', date)
        .in('worker_id', workerIds);

      const existingRows = existing || [];
      const existingMap = new Map(existingRows.map(t => [`${t.worker_id}__${t.project_id}`, t]));

      // Delete timesheets for projects the worker is no longer assigned to (any source).
      // If an assignment changes, the old project entry is stale — supervisor re-enters OT on the new entry.
      const toDelete = existingRows
        .filter(t => !currentProjectsByWorker[t.worker_id]?.has(t.project_id))
        .map(t => t.id);

      if (toDelete.length > 0) {
        await supabase.from('timesheets').delete().in('id', toDelete);
      }

      const toInsert = [];
      const toUpdate: { id: string; regular_hours: number }[] = [];

      for (const t of timesheetInserts) {
        const row = existingMap.get(`${t.worker_id}__${t.project_id}`);
        if (!row) {
          toInsert.push(t);
        } else if (row.regular_hours !== t.regular_hours) {
          // Shift type changed (full-day ↔ split) — update regular_hours. OT fields are untouched.
          toUpdate.push({ id: row.id, regular_hours: t.regular_hours });
        }
      }

      if (toInsert.length > 0) {
        await supabase.from('timesheets').insert(toInsert);
      }
      for (const u of toUpdate) {
        await supabase.from('timesheets').update({ regular_hours: u.regular_hours }).eq('id', u.id);
      }
    }

    // Save project daily notes (upsert non-empty, delete cleared ones)
    for (const [projectId, text] of Object.entries(notes)) {
      if (text.trim()) {
        await supabase.from('project_daily_notes').upsert(
          { project_id: projectId, date, notes: text.trim() },
          { onConflict: 'project_id,date' }
        );
      } else {
        await supabase.from('project_daily_notes').delete()
          .eq('project_id', projectId).eq('date', date);
      }
    }

    setLoading(false);
    setSuccess(true);
  };

  const assignedCount = Object.values(assignments).filter(a =>
    a.mode === 'full_day' ? a.full_day.project_id : a.morning.project_id || a.afternoon.project_id
  ).length;

  // Active projects for notes section — always visible so notes can be entered before/after assigning workers
  const activeProjects = projects.filter(p => p.status === 'active');

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Daily Assignments</h1>

      <div className="flex items-center gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Select Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="mt-5 text-sm text-gray-500">
          {assignedCount} of {workers.length} workers assigned
        </div>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
          Assignments saved successfully!
        </div>
      )}

      <div className="border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Worker</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Assignment</th>
              <th className="text-left px-4 py-3 font-medium">Split</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center px-4 py-6 text-gray-400">
                  No workers found
                </td>
              </tr>
            )}
            {workers.map(w => {
              const a = getAssignment(w.employee_id);
              return (
                <tr key={w.employee_id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{w.name}</td>
                  <td className="px-4 py-3 text-gray-500">{w.role || '—'}</td>
                  <td className="px-4 py-3">
                    {a.mode === 'full_day' ? (
                      <select
                        value={a.full_day.project_id}
                        onChange={e => updateAssignment(w.employee_id, {
                          full_day: { ...a.full_day, project_id: e.target.value }
                        })}
                        className="border rounded px-3 py-1.5 text-sm w-full max-w-xs"
                      >
                        <option value="">— Not assigned —</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id} disabled={p.status !== 'active'}>
                            {p.name} — {p.location}{p.status !== 'active' ? ` (${p.status})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-16">Morning</span>
                          <select
                            value={a.morning.project_id}
                            onChange={e => updateAssignment(w.employee_id, {
                              morning: { ...a.morning, project_id: e.target.value }
                            })}
                            className="border rounded px-3 py-1.5 text-sm w-full max-w-xs"
                          >
                            <option value="">— Not assigned —</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name} — {p.location}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-16">Afternoon</span>
                          <select
                            value={a.afternoon.project_id}
                            onChange={e => updateAssignment(w.employee_id, {
                              afternoon: { ...a.afternoon, project_id: e.target.value }
                            })}
                            className="border rounded px-3 py-1.5 text-sm w-full max-w-xs"
                          >
                            <option value="">— Not assigned —</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name} — {p.location}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleSplit(w.employee_id)}
                      className={`text-xs px-3 py-1.5 rounded border font-medium ${
                        a.mode === 'split'
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {a.mode === 'split' ? 'Split ✓' : 'Split'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeProjects.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-3">Project Notes</h2>
          <div className="space-y-4">
            {activeProjects.map(p => (
              <div key={p.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {p.name}{p.location ? ` — ${p.location}` : ''}
                </label>
                <textarea
                  rows={3}
                  placeholder={'One note per line, e.g.\ndismantling works\ngas cutting works'}
                  value={notes[p.id] ?? ''}
                  onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                  className="w-full max-w-lg border rounded px-3 py-2 text-sm resize-y"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save Assignments'}
      </button>
    </main>
  );
}