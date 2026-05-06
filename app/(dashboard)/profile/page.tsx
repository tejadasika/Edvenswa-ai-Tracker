import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import PasswordForm from './PasswordForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const s = await getSession();
  if (!s.userId) redirect('/');

  return (
    <div className="w-full max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-fg-faint">
          Account information and password.
        </p>
      </header>

      <section className="rounded-md border border-app-border bg-surface/50 p-4 space-y-2">
        <Field label="Email" value={s.email ?? ''} />
        <Field label="Name" value={s.name ?? '—'} />
        <Field label="Role" value={s.role ?? 'user'} />
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg mb-3">Change password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-fg-faint">{label}</span>
      <span className="text-fg font-medium">{value}</span>
    </div>
  );
}
