'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/projects', label: 'Projects' },
  { href: '/assignments', label: 'Assignments' },
  { href: '/timesheets', label: 'Timesheets' },
  { href: '/cost', label: 'Cost Dashboard' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b px-8 py-4 flex items-center gap-6">
      <span className="font-bold text-gray-900 mr-4">Worker Manager</span>
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className={`text-sm font-medium ${
            pathname === link.href
              ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}