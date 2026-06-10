'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FolderKanban, Truck, Package, ShieldCheck } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

const projectsLinks = [
  { href: '/projects', label: 'Projects' },
  { href: '/assignments', label: 'Assignments' },
  { href: '/timesheets', label: 'Timesheets' },
  { href: '/cost', label: 'Cost Dashboard' },
];

const tripsLinks = [
  { href: '/trips', label: 'Trips' },
  { href: '/customers', label: 'Customers' },
  { href: '/reporting', label: 'Reporting' },
];

const binsLinks = [
  { href: '/bins', label: 'Bins' },
  { href: '/analytics', label: 'Analytics' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSuper, setIsSuper] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
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
      setIsSuper(profile?.is_superadmin ?? false);
    };
    init();
  }, []);

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

      <div className="flex items-center gap-1.5">
        <FolderKanban size={13} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Projects</span>
      </div>
      {projectsLinks.map(l => navLink(l.href, l.label))}

      <div className="w-px h-5 bg-gray-200 mx-1" />

      <div className="flex items-center gap-1.5">
        <Truck size={13} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trips</span>
      </div>
      {tripsLinks.map(l => navLink(l.href, l.label))}

      <div className="w-px h-5 bg-gray-200 mx-1" />

      <div className="flex items-center gap-1.5">
        <Package size={13} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bins</span>
      </div>
      {binsLinks.map(l => navLink(l.href, l.label))}

      {isSuper && (
        <>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Admin</span>
          </div>
          {navLink('/staff', 'Staff')}
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
