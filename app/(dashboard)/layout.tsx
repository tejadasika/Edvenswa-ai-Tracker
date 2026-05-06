import Sidebar from '@/components/Sidebar';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s.userId) redirect('/');

  if (s.role === 'admin' || s.role === 'super_admin') {
    redirect('/admin');
  }

  return (
    <div className="flex min-h-screen bg-app text-fg">
      <Sidebar
        name={s.name ?? s.email?.split('@')[0] ?? null}
        email={s.email ?? null}
        isAdmin={false}
      />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
