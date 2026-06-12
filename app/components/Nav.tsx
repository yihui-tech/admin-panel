'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FolderKanban, Truck, Package, ShieldCheck, BarChart2 } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

const projectsLinks = [
  { href: '/projects', label: 'Projects' },
  { href: '/assignments', label: 'Assignments' },
  { href: '/timesheets', label: 'Timesheets' },
];

const tripsLinks = [
  { href: '/trips', label: 'Trips' },
  { href: '/reporting', label: 'Reporting' },
];

const binsLinks = [
  { href: '/bins', label: 'Bins' },
  { href: '/analytics', label: 'Analytics' },
];

const reportsLinks = [
  { href: '/management/cost', label: 'Project' },
  { href: '/management/driver-location', label: 'Driver Checkout' },
  { href: '/management/vehicle-costs', label: 'Vehicle Costs' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [modules, setModules] = useState<Set<string>>(new Set());

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchModules = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setModules(new Set()); return; }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_superadmin')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        await supabase.from('user_profiles').insert({
          user_id: user.id,
          email: user.email!,
          is_superadmin: false,
        });
      }

      const { data: perms } = await supabase
        .from('user_module_permissions')
        .select('module')
        .eq('user_id', user.id);

      setModules(new Set(perms?.map(p => p.module) ?? []));
    };

    fetchModules();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setModules(new Set());
      else fetchModules();
    });

    return () => subscription.unsubscribe();
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`text-sm font-medium px-1 py-0.5 rounded transition-colors ${
        pathname === href
          ? 'text-blue-600 border-b-2 border-blue-600 pb-0.5 rounded-none'
          : 'text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-white border-b px-8 py-3 flex items-center gap-5">
      <Link href="/" className="mr-2 flex-shrink-0">
        <Image src="/logo.jpg" alt="Yi Hui Tech" width={36} height={36} className="rounded" />
      </Link>

      {modules.has('projects') && (
        <>
          <div className="flex items-center gap-1.5">
            <FolderKanban size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Projects</span>
          </div>
          {projectsLinks.map(l => navLink(l.href, l.label))}
        </>
      )}

      {modules.has('trips') && (
        <>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <Truck size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trips</span>
          </div>
          {tripsLinks.map(l => navLink(l.href, l.label))}
        </>
      )}

      {modules.has('bins') && (
        <>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bins</span>
          </div>
          {binsLinks.map(l => navLink(l.href, l.label))}
        </>
      )}

      {modules.has('management') && (
        <>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <BarChart2 size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reports</span>
          </div>
          {reportsLinks.map(l => navLink(l.href, l.label))}
        </>
      )}

      {modules.has('admin') && (
        <>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Admin</span>
          </div>
          {navLink('/staff', 'Staff')}
          {navLink('/customers', 'Customers')}
        </>
      )}

      <div className="ml-auto">
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
