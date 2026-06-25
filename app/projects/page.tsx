'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Project = {
  id: string;
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  status: string;
};

const emptyForm = {
  name: '',
  location: '',
  start_date: '',
  end_date: '',
  status: 'active',
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [mandayMap, setMandayMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const fetchProjects = async () => {
    const [{ data: projects }, { data: assignments }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('assignments').select('project_id, shift'),
    ]);
    if (projects) setProjects(projects);
    if (assignments) {
      const map: Record<string, number> = {};
      assignments.forEach(a => {
        map[a.project_id] = (map[a.project_id] || 0) + (a.shift === 'full_day' ? 1 : 0.5);
      });
      setMandayMap(map);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!editingProject) return;
    setEditingProject({ ...editingProject, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    const { error } = await supabase.from('projects').insert({
      ...form,
      end_date: form.end_date || null,
    });

    setLoading(false);
    if (!error) {
      setSuccess(true);
      setForm(emptyForm);
      fetchProjects();
    } else {
      alert('Error saving project: ' + error.message);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setLoading(true);

    const { error } = await supabase
      .from('projects')
      .update({
        name: editingProject.name,
        location: editingProject.location,
        start_date: editingProject.start_date,
        end_date: editingProject.end_date || null,
        status: editingProject.status,
      })
      .eq('id', editingProject.id);

    setLoading(false);
    if (!error) {
      setEditingProject(null);
      fetchProjects();
    } else {
      alert('Error updating project: ' + error.message);
    }
  };

  const statusBadge = (status: string) => {
    const colours: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      'on-hold': 'bg-yellow-100 text-yellow-800',
    };
    return `px-2 py-1 rounded text-xs font-medium ${colours[status] || ''}`;
  };

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-8 py-4 md:py-8 bg-white text-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Projects</h1>

      {/* Create Form */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">New Project</h2>

        {success && (
          <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
            Project created successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Project Name</label>
              <input name="name" value={form.name} onChange={handleChange} required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input name="location" value={form.location} onChange={handleChange} required className="w-full border rounded px-3 py-2" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input name="start_date" type="date" value={form.start_date} onChange={handleChange} required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input name="end_date" type="date" value={form.end_date} onChange={handleChange} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className="w-full border rounded px-3 py-2">
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On Hold</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Create Project'}
          </button>
        </form>
      </div>

      {/* Projects List */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Project</th>
              <th className="text-left px-4 py-3 font-medium">Location</th>
              <th className="text-left px-4 py-3 font-medium">Start Date</th>
              <th className="text-left px-4 py-3 font-medium">End Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Mandays</th>
              <th className="text-left px-4 py-3 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center px-4 py-6 text-gray-400">No projects yet</td>
              </tr>
            )}
            {projects.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.location}</td>
                <td className="px-4 py-3 text-gray-600">{p.start_date}</td>
                <td className="px-4 py-3 text-gray-600">{p.end_date || '—'}</td>
                <td className="px-4 py-3">
                  <span className={statusBadge(p.status)}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {mandayMap[p.id] ? mandayMap[p.id].toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => router.push(`/projects/${p.id}`)}
                      title="View costing"
                      className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button onClick={() => setEditingProject(p)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg font-semibold mb-4">Edit Project</h2>

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Project Name</label>
                <input name="name" value={editingProject.name} onChange={handleEditChange} required className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input name="location" value={editingProject.location} onChange={handleEditChange} required className="w-full border rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date</label>
                  <input name="start_date" type="date" value={editingProject.start_date} onChange={handleEditChange} required className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input name="end_date" type="date" value={editingProject.end_date || ''} onChange={handleEditChange} className="w-full border rounded px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select name="status" value={editingProject.status} onChange={handleEditChange} className="w-full border rounded px-3 py-2">
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On Hold</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditingProject(null)} className="border px-6 py-2 rounded font-medium hover:bg-gray-50">
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