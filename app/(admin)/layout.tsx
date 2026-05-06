import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import AdminLogoutButton from './AdminLogoutButton';
import AdminNav from './AdminNav';
import OrgSelector from './OrgSelector';
import ThemeToggle from '@/components/ThemeToggle';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s.userId) redirect('/');
  if (s.role !== 'admin' && s.role !== 'super_admin') redirect('/');

  return (
    <div className="flex min-h-screen bg-app text-fg">
      <aside className="w-64 shrink-0 border-r border-app-border bg-surface p-4 flex flex-col gap-1">
        <div className="px-2 py-3 mb-2">
          <div className="text-lg font-semibold text-fg">Edvenswa AI Tracker</div>
          <div className="text-xs text-warn">Admin console</div>
        </div>
        {s.email && (
          <div className="px-3 py-2 mb-2 rounded-md border border-app-border bg-surface-2">
            <div className="text-xs text-fg-faint">Signed in as</div>
            <div className="text-sm font-medium text-fg truncate">
              {s.name ?? s.email.split('@')[0]}
            </div>
            <div className="text-xs text-fg-faint truncate">{s.email}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-warn">
              {s.role}
            </div>
          </div>
        )}
        {s.role === 'super_admin' && <OrgSelector />}
        <AdminNav role={s.role} />
        <div className="mt-auto pt-4 flex flex-col gap-2">
          <ThemeToggle />
          <AdminLogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
