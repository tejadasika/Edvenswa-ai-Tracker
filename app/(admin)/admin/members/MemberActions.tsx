'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'user' | 'admin' | 'super_admin';

// Per-row actions menu: change role between employee/admin and remove member.
// super_admin rows can't be touched from the UI — those are DB-grant only.
export default function MemberActions({
  userId,
  email,
  role,
}: {
  userId: string;
  email: string;
  role: Role;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role === 'super_admin') {
    return <span className="text-xs text-fg-faint">protected</span>;
  }

  async function setRole(next: 'user' | 'admin') {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!confirm(`Remove ${email}? Their account is deleted along with all their usage data.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      {role === 'user' ? (
        <button
          onClick={() => setRole('admin')}
          disabled={busy}
          className="rounded border border-app-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          title="Promote to admin"
        >
          Make admin
        </button>
      ) : (
        <button
          onClick={() => setRole('user')}
          disabled={busy}
          className="rounded border border-app-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          title="Demote to employee"
        >
          Make employee
        </button>
      )}
      <button
        onClick={remove}
        disabled={busy}
        className="rounded border border-red-900 bg-red-950/40 px-2 py-1 text-xs text-red-300 hover:bg-red-950/70 disabled:opacity-50"
      >
        Remove
      </button>
      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
    </div>
  );
}
