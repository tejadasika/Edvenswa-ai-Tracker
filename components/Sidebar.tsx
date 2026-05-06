'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Spinner } from '@/components/Spinner';
import ThemeToggle from '@/components/ThemeToggle';

const tabs = [
  { href: '/extension', label: 'Browser Extension', desc: 'Install & tokens' },
  { href: '/extension-activity', label: 'Extension Activity', desc: 'Time on AI sites' },
  { href: '/profile', label: 'Profile', desc: 'Account & password' },
];

export default function Sidebar({
  name,
  email,
  isAdmin,
}: {
  name?: string | null;
  email?: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  function isActive(href: string) {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(href + '/');
  }

  function navigate(href: string) {
    if (isActive(href)) return;
    setNavTarget(href);
    startTransition(() => router.push(href));
  }

  return (
    <aside className="w-64 shrink-0 border-r border-app-border bg-surface p-4 flex flex-col gap-1">
      <div className="px-2 py-3 mb-2">
        <div className="text-lg font-semibold text-fg">Edvenswa AI Tracker</div>
        <div className="text-xs text-fg-faint">Browser extension analytics</div>
      </div>
      {name && (
        <div className="px-3 py-2 mb-2 rounded-md border border-app-border bg-surface-2">
          <div className="text-xs text-fg-faint">Signed in as</div>
          <div className="text-sm font-medium text-fg truncate">{name}</div>
          {email && <div className="text-xs text-fg-faint truncate">{email}</div>}
        </div>
      )}
      {tabs.map((t) => {
        const active = isActive(t.href);
        const loading = isPending && navTarget === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={(e) => {
              e.preventDefault();
              navigate(t.href);
            }}
            className={`relative rounded-md px-3 py-2 text-sm transition ${
              active
                ? 'bg-accent-soft text-fg font-medium pl-4 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-accent'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t.label}</span>
              {loading && <Spinner size={12} />}
            </div>
            <div className="text-xs text-fg-faint">{t.desc}</div>
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            navigate('/admin');
          }}
          className="mt-2 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn hover:bg-warn/20"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Admin console</span>
            {isPending && navTarget === '/admin' && <Spinner size={12} />}
          </div>
          <div className="text-xs opacity-80">Org overview & members</div>
        </Link>
      )}
      <div className="mt-auto pt-4 flex flex-col gap-2">
        <ThemeToggle />
        <button
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await fetch('/api/auth', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ mode: 'logout' }),
              });
            } finally {
              location.href = '/';
            }
          }}
          className="flex items-center justify-center gap-2 w-full rounded-md border border-app-border px-3 py-2 text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
        >
          {signingOut && <Spinner size={12} />}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
