'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type StaffProfile = {
  user_id: string;
  email: string;
  location_id: number | null;
  is_superadmin: boolean;
  locations: { id: number; name: string } | null;
};

type Location = { id: number; name: string };

export default function StaffPage() {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const [profilesRes, locsRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('user_id, email, location_id, is_superadmin, locations(id, name)')
          .order('email'),
        supabase.from('locations').select('id, name').order('name'),
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data as unknown as StaffProfile[]);
      if (locsRes.data) setLocations(locsRes.data);
      setLoading(false);
    };
    init();
  }, []);

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

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <p className="text-sm text-gray-500 mt-1">
          Assign each staff member to their yard. Create accounts in the Supabase dashboard — they appear here after their first login.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : profiles.length === 0 ? (
        <p className="text-gray-500 text-sm">No staff profiles yet. Staff appear here after their first login.</p>
      ) : (
        <div className="space-y-2">
          {profiles.map(p => (
            <div
              key={p.user_id}
              className="flex items-center gap-4 border-2 border-gray-200 rounded-xl px-4 py-3 bg-white"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm truncate">{p.email}</span>
                  {p.is_superadmin && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                      Admin
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
