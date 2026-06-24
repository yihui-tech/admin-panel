'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FolderKanban, Truck, Package, ShieldCheck, BarChart2, ChevronDown } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

const sections = [
  {
    key: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    links: [
      { href: '/projects', label: 'Projects' },
      { href: '/assignments', label: 'Assignments' },
      { href: '/timesheets', label: 'Timesheets' },
    ],
  },
  {
    key: 'trips',
    label: 'Trips',
    icon: Truck,
    links: [
      { href: '/trips', label: 'Trips' },
      { href: '/reporting', label: 'Reporting' },
    ],
  },
  {
    key: 'bins',
    label: 'Bins',
    icon: Package,
    links: [
      { href: '/bins', label: 'Bins' },
      { href: '/missing-trips', label: 'Missing Trips' },
      { href: '/analytics', label: 'Analytics' },
    ],
  },
  {
    key: 'management',
    label: 'Reports',
    icon: BarChart2,
    links: [
      { href: '/management/cost', label: 'Project' },
      { href: '/management/driver-location', label: 'Driver Checkout' },
      { href: '/management/vehicle-costs', label: 'Vehicle Costs' },
      { href: '/management/bins-aging', label: 'Bin Aging' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    links: [
      { href: '/staff', label: 'Staff' },
      { href: '/customers', label: 'Customers' },
    ],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [modules, setModules] = useState<Set<string>>(new Set());

  const getDefaultOpen = () => {
    const open = new Set<string>();
    for (const s of sections) {
      if (s.links.some(l => pathname.startsWith(l.href))) open.add(s.key);
    }
    return open;
  };

  const [openSections, setOpenSections] = useState<Set<string>>(getDefaultOpen);

  useEffect(() => {
    setOpenSections(getDefaultOpen());
  }, [pathname]);

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

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleSections = sections.filter(s => modules.has(s.key));

  return (
    <nav className="w-52 shrink-0 bg-white border-r flex flex-col h-screen sticky top-0">
      <div className="px-4 py-4 border-b">
        <Link href="/">
          <Image src="/logo.png" alt="Yi Hui Tech" width={36} height={36} className="rounded" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          const isOpen = openSections.has(section.key);
          return (
            <div key={section.key}>
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-gray-400 group-hover:text-gray-600" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide group-hover:text-gray-700">
                    {section.label}
                  </span>
                </div>
                <ChevronDown
                  size={13}
                  className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="pb-1">
                  {section.links.map(({ href, label }) => {
                    const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center pl-9 pr-4 py-1.5 text-sm transition-colors ${
                          active
                            ? 'text-blue-600 bg-blue-50 font-medium border-r-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-4 border-t">
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
