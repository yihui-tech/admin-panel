'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const projectsLinks = [
  { href: '/projects', label: 'Projects' },
  { href: '/assignments', label: 'Assignments' },
  { href: '/timesheets', label: 'Timesheets' },
  { href: '/cost', label: 'Cost Dashboard' },
];

const tripsLinks = [
  { href: '/trips', label: 'Trips' },
  { href: '/bins', label: 'Bins' },
  { href: '/customers', label: 'Customers' },
  { href: '/analytics', label: 'Analytics' },
];

export default function Nav() {
  const pathname = usePathname();

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`text-sm font-medium ${
        pathname === href
          ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
          : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-white border-b px-8 py-3 flex items-center gap-6">
      <Link href="/" className="mr-2 flex-shrink-0">
        <Image src="/logo.jpg" alt="Yi Hui Tech" width={40} height={40} className="rounded" />
      </Link>

      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Projects</span>
      {projectsLinks.map(l => navLink(l.href, l.label))}

      <span className="text-gray-300 select-none">|</span>

      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trips</span>
      {tripsLinks.map(l => navLink(l.href, l.label))}
    </nav>
  );
}
