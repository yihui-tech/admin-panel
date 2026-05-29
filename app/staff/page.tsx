'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { supabase } from '../lib/supabase';

type StaffProfile = {
  user_id: string;
  email: string;
  location_id: number | null;
  is_superadmin: boolean;
  locations: { id: number; name: string } | null;
};

type Location = { id: number; name: string };

const inputCls = 'w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const btnPrimary = 'inline-flex items-center justify-center rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 text-sm disabled:opacity-50 transition-colors';

export default function StaffPage() {
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newLocationId, setNewLocationId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Inline reset password state: user_id → new password input
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadProfiles = async () => {
    const res = await fetch('/api/staff');
    if (res.ok) setProfiles(await res.json());
  };

  useEffect(() => {
    const init = async () => {
      const authClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) { setIsSuper(false); setLoading(false); return; }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_superadmin')
        .eq('user_id', user.id)
        .single();

      setIsSuper(profile?.is_superadmin ?? false);

      if (profile?.is_superadmin) {
        const [locsRes] = await Promise.all([
          supabase.from('locations').select('id, name').order('name'),
          loadProfiles(),
        ]);
        if (locsRes.data) setLocations(locsRes.data);
      }
      setLoading(false);
    };
    init();
  }, []);

  const handleCreate = async () => {
    setCreateError('');
    setCreateSuccess('');
    if (!newEmail.trim() || !newPassword.trim()) {
      setCreateError('Email and password are required.');
      return;
    }
    setCreating(true);
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newEmail.trim(),
        password: newPassword.trim(),
        location_id: newLocationId ? Number(newLocationId) : null,
      }),
    });
    setCreating(false);
    const body = await res.json();
    if (!res.ok) { setCreateError(body.error); return; }
    setCreateSuccess(`Account created for ${newEmail.trim()}.`);
    setNewEmail('');
    setNewPassword('');
    setNewLocationId('');
    loadProfiles();
  };

  const handleYardChange = async (userId: string, locationId: string) => {
    await fetch('/api/staff', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, location_id: locationId ? Number(locationId) : null }),
    });
    loadProfiles();
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPassword.trim()) return;
    setResetting(true);
    const res = await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, password: resetPassword.trim() }),
    });
    setResetting(false);
    if (res.ok) {
      setResetTarget(null);
      setResetPassword('');
    } else {
      const body = await res.json();
      alert('Error: ' + body.error);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Permanently delete account for ${email}? This cannot be undone.`)) return;
    const res = await fetch('/api/staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) loadProfiles();
    else alert('Error deleting account.');
  };

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!isSuper) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-gray-500">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create accounts, assign yard locations, and reset passwords.
        </p>
      </div>

      {/* Create account */}
      <section className="border-2 border-gray-200 rounded-xl p-5 mb-6 bg-white">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">Create Account</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="staff@yihui.sg"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Set initial password"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Yard Location</label>
            <select value={newLocationId} onChange={e => setNewLocationId(e.target.value)} className={inputCls}>
              <option value="">— Select yard —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {createError && <p className="text-sm text-red-600 font-medium">{createError}</p>}
          {createSuccess && <p className="text-sm text-green-700 font-medium">{createSuccess}</p>}
          <button onClick={handleCreate} disabled={creating} className={btnPrimary}>
            {creating ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </section>

      {/* Staff list */}
      <section>
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3">All Staff</h2>
        {profiles.length === 0 ? (
          <p className="text-gray-500 text-sm">No accounts yet.</p>
        ) : (
          <div className="space-y-3">
            {profiles.map(p => (
              <div key={p.user_id} className="border-2 border-gray-200 rounded-xl p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900 text-sm">{p.email}</span>
                    {p.is_superadmin && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                        Superadmin
                      </span>
                    )}
                  </div>
                  {!p.is_superadmin && (
                    <button
                      onClick={() => handleDelete(p.user_id, p.email)}
                      className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Yard selector */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-gray-600 shrink-0">Yard</label>
                  <select
                    value={p.location_id?.toString() ?? ''}
                    onChange={e => handleYardChange(p.user_id, e.target.value)}
                    disabled={p.is_superadmin}
                    className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">— No yard assigned —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>

                {/* Reset password */}
                {!p.is_superadmin && (
                  resetTarget === p.user_id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        placeholder="New password"
                        className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleResetPassword(p.user_id);
                          if (e.key === 'Escape') { setResetTarget(null); setResetPassword(''); }
                        }}
                      />
                      <button onClick={() => handleResetPassword(p.user_id)} disabled={resetting || !resetPassword.trim()} className={btnPrimary}>
                        {resetting ? '...' : 'Save'}
                      </button>
                      <button onClick={() => { setResetTarget(null); setResetPassword(''); }} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-2">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setResetTarget(p.user_id); setResetPassword(''); }}
                      className="text-sm text-blue-600 hover:underline font-medium"
                    >
                      Reset password
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
