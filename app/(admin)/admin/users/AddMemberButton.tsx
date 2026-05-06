'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Modal-based form for an admin to add a new member to their org.
// Posts to /api/admin/users; on success refreshes the page so the new row
// shows up in the listing without a manual reload.
export default function AddMemberButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail('');
    setName('');
    setPassword('');
    setRole('user');
    setError(null);
    setSubmitting(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, password, role }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `Failed (HTTP ${r.status})`);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Add member
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-sm space-y-3 rounded-lg border border-app-border bg-surface p-5"
          >
            <div>
              <h2 className="text-base font-semibold">Add member to your organization</h2>
              <p className="mt-1 text-xs text-fg-muted">
                Creates a new account in your org. Choose a role:
                <strong className="text-fg"> Employee</strong> for normal users,
                <strong className="text-fg"> Admin</strong> for co-admins who can manage members.
              </p>
            </div>

            <input
              type="email"
              required
              placeholder="email@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-app-border bg-app px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-app-border bg-app px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Initial password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-app-border bg-app px-3 py-2 text-sm"
            />

            <div className="flex gap-2">
              <label
                className={`flex-1 cursor-pointer rounded border px-3 py-2 text-sm ${
                  role === 'user'
                    ? 'border-indigo-500 bg-indigo-950/30 text-fg'
                    : 'border-app-border text-fg-muted'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="user"
                  checked={role === 'user'}
                  onChange={() => setRole('user')}
                  className="mr-2"
                />
                Employee
              </label>
              <label
                className={`flex-1 cursor-pointer rounded border px-3 py-2 text-sm ${
                  role === 'admin'
                    ? 'border-indigo-500 bg-indigo-950/30 text-fg'
                    : 'border-app-border text-fg-muted'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={role === 'admin'}
                  onChange={() => setRole('admin')}
                  className="mr-2"
                />
                Admin
              </label>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                disabled={submitting}
                className="rounded border border-app-border px-3 py-2 text-sm text-fg-muted hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
