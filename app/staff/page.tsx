'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MODULES = ['projects', 'trips', 'bins', 'management', 'admin'] as const;
type Module = typeof MODULES[number];

const MODULE_LABELS: Record<Module, string> = {
  projects: 'Projects',
  trips: 'Trips',
  bins: 'Bins',
  management: 'Reports',
  admin: 'Admin',
};

type StaffProfile = {
  user_id: string;
  email: string;
  location_id: number | null;
  is_superadmin: boolean;
  locations: { id: number; name: string } | null;
  modules: Set<Module>;
};

type Location = { id: number; name: string };

export default function StaffPage() {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const [profilesRes, locsRes, permsRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('user_id, email, location_id, is_superadmin, locations(id, name)')
          .order('email'),
        supabase.from('locations').select('id, name').order('name'),
        supabase.from('user_module_permissions').select('user_id, module'),
      ]);

      const permsMap: Record<string, Set<Module>> = {};
      (permsRes.data ?? []).forEach(p => {
        if (!permsMap[p.user_id]) permsMap[p.user_id] = new Set();
        permsMap[p.user_id].add(p.module as Module);
      });

      if (profilesRes.data) {
        const data = profilesRes.data as unknown as Omit<StaffProfile, 'modules'>[];
        setProfiles(data.map(p => ({ ...p, modules: permsMap[p.user_id] ?? new Set<Module>() })));
      }
      if (locsRes.data) setLocations(locsRes.data);
      setLoading(false);
    };
    init();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) return;
    setCreating(true);
    setCreateMessage(null);

    const res = await fetch('/api/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), password: newPassword.trim() }),
    });
    const json = await res.json();

    if (!res.ok) {
      setCreateMessage({ type: 'error', text: json.error ?? 'Failed to create user' });
    } else {
      setCreateMessage({ type: 'success', text: `Account created for ${newEmail.trim()}.` });
      setProfiles(prev => [...prev, {
        user_id: json.user.id,
        email: newEmail.trim(),
        location_id: null,
        is_superadmin: false,
        locations: null,
        modules: new Set<Module>(),
      }].sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail('');
      setNewPassword('');
    }
    setCreating(false);
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email} from the platform? This cannot be undone.`)) return;
    const res = await fetch('/api/delete-user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json();
    if (!res.ok) { alert('Error: ' + (json.error ?? 'Failed to delete user')); return; }
    setProfiles(prev => prev.filter(p => p.user_id !== userId));
  };

  const handleYardChange = async (userId: string, locationId: string) => {
    const newId = locationId ? Number(locationId) : null;
    const { error } = await supabase
      .from('user_profiles')
      .update({ location_id: newId })
      .eq('user_id', userId);
    if (error) { alert('Error: ' + error.message); return; }
    setProfiles(prev => prev.map(p =>
      p.user_id === userId
        ? { ...p, location_id: newId, locations: locations.find(l => l.id === newId) ?? null }
        : p
    ));
  };

  const handleModuleToggle = async (userId: string, mod: Module, grant: boolean) => {
    if (grant) {
      const { error } = await supabase
        .from('user_module_permissions')
        .insert({ user_id: userId, module: mod });
      if (error) { alert('Error: ' + error.message); return; }
    } else {
      const { error } = await supabase
        .from('user_module_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('module', mod);
      if (error) { alert('Error: ' + error.message); return; }
    }
    setProfiles(prev => prev.map(p => {
      if (p.user_id !== userId) return p;
      const next = new Set(p.modules);
      grant ? next.add(mod) : next.delete(mod);
      return { ...p, modules: next };
    }));
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <p className="text-sm text-gray-500 mt-1">
          Invite staff, assign yards, and control module access.
        </p>
      </div>

      {/* Create user form */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-2">
        <input
          type="email"
          placeholder="Email"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <input
          type="text"
          placeholder="Password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-40 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <button
          type="submit"
          disabled={creating}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>
      {createMessage && (
        <p className={`text-sm mb-4 ${createMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {createMessage.text}
          {createMessage.type === 'success' && ' They will appear here after their first login.'}
        </p>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm mt-6">Loading...</p>
      ) : profiles.length === 0 ? (
        <p className="text-gray-500 text-sm mt-6">No staff profiles yet. Invite someone above.</p>
      ) : (
        <div className="space-y-2 mt-4">
          {profiles.map(p => (
            <div
              key={p.user_id}
              className="border-2 border-gray-200 rounded-xl px-4 py-3 bg-white"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm truncate">{p.email}</span>
                    {p.is_superadmin && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                        Superadmin
                      </span>
                    )}
                  </div>
                </div>
                <select
                  value={p.location_id?.toString() ?? ''}
                  onChange={e => handleYardChange(p.user_id, e.target.value)}
                  className="shrink-0 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— No yard —</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleDelete(p.user_id, p.email)}
                  className="p-1.5 text-gray-400 rounded hover:text-red-600 hover:bg-red-50"
                  title="Remove user"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex items-center gap-1.5 mt-2.5">
                {MODULES.map(mod => {
                  const granted = p.modules.has(mod);
                  return (
                    <button
                      key={mod}
                      onClick={() => handleModuleToggle(p.user_id, mod, !granted)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        granted
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {MODULE_LABELS[mod]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
