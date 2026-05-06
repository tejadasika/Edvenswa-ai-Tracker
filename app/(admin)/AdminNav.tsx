'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'admin' | 'super_admin' | undefined;

const baseLinks = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/users', label: 'Users' },
];

const superAdminLinks = [{ href: '/admin/organizations', label: 'Organizations' }];

export default function AdminNav({ role }: { role?: Role }) {
  const pathname = usePathname();
  const links = role === 'super_admin' ? [...baseLinks, ...superAdminLinks] : baseLinks;

  // /admin is the index — match it exactly. Everything else matches as a
  // path prefix so /admin/users/[id] keeps "Users" highlighted.
  function isActive(href: string) {
    if (!pathname) return false;
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      {links.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative rounded-md px-3 py-2 text-sm transition ${
              active
                ? 'bg-accent-soft text-fg font-medium pl-4 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-accent'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
