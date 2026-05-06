'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PaginatedTable from '@/components/PaginatedTable';

type Org = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  admin_count: number;
};

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'super_admin';
  created_at: string;
};

export default function OrganizationsClient({ initial }: { initial: Org[] }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [addAdminFor, setAddAdminFor] = useState<Org | null>(null);

  // Expansion state: which org is open, and the cached member list per org.
  // We cache so collapsing/re-expanding doesn't refetch unnecessarily; click
  // an already-open row to collapse.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, Member[] | 'loading' | 'error'>>({});

  async function toggleExpand(o: Org) {
    if (expandedId === o.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(o.id);
    if (members[o.id] && members[o.id] !== 'error') return; // already loaded or loading
    setMembers((m) => ({ ...m, [o.id]: 'loading' }));
    try {
      const r = await fetch(`/api/admin/organizations/${o.id}/members`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setMembers((m) => ({ ...m, [o.id]: (j.members ?? []) as Member[] }));
    } catch {
      setMembers((m) => ({ ...m, [o.id]: 'error' }));
    }
  }

  async function refresh() {
    const r = await fetch('/api/admin/organizations');
    if (!r.ok) return;
    const j = await r.json();
    setOrgs(j.organizations ?? []);
    // Invalidate any cached member lists so re-expanding shows fresh data.
    setMembers({});
    router.refresh();
  }

  // Refetch one org's member list in place (used after a role change or
  // remove). Also refreshes the org list so member/admin counts update.
  async function reloadOrgMembers(o: Org) {
    setMembers((m) => ({ ...m, [o.id]: 'loading' }));
    try {
      const r = await fetch(`/api/admin/organizations/${o.id}/members`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setMembers((m) => ({ ...m, [o.id]: (j.members ?? []) as Member[] }));
    } catch {
      setMembers((m) => ({ ...m, [o.id]: 'error' }));
    }
    // Update the org row's member/admin counts in the outer table.
    const list = await fetch('/api/admin/organizations');
    if (list.ok) {
      const j = await list.json();
      setOrgs(j.organizations ?? []);
    }
    router.refresh();
  }

  async function deleteOrg(o: Org) {
    if (o.member_count > 0) {
      alert('Remove all members from this organization first.');
      return;
    }
    if (!confirm(`Delete organization "${o.name}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/organizations/${o.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to delete');
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create organization
        </button>
      </div>

      <PaginatedTable
        pageSize={20}
        emptyColSpan={5}
        emptyMessage="No organizations yet."
        thead={
          <thead className="bg-surface text-fg-muted">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-right px-3 py-2">Members</th>
              <th className="text-right px-3 py-2">Admins</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
        }
        rows={orgs.flatMap((o) => {
          const isOpen = expandedId === o.id;
          const memberState = members[o.id];
          const rows = [
            <tr
              key={o.id}
              className="border-t border-app-border hover:bg-surface/50 cursor-pointer"
              onClick={() => toggleExpand(o)}
            >
              <td className="px-3 py-2 text-fg">
                <span
                  className={`inline-block w-3 mr-2 text-fg-faint transition-transform ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                  aria-hidden
                >
                  ▶
                </span>
                <span className="text-indigo-300 hover:underline">{o.name}</span>
              </td>
              <td className="px-3 py-2 text-right">{o.member_count}</td>
              <td className="px-3 py-2 text-right">{o.admin_count}</td>
              <td className="px-3 py-2 text-fg-muted">
                {new Date(o.created_at).toISOString().slice(0, 10)}
              </td>
              <td
                className="px-3 py-2 text-right"
                onClick={(e) => e.stopPropagation() /* don't toggle expand */}
              >
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => setAddAdminFor(o)}
                    className="rounded border border-app-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-2"
                  >
                    Add admin
                  </button>
                  <button
                    onClick={() => deleteOrg(o)}
                    disabled={o.member_count > 0}
                    className="rounded border border-red-900 bg-red-950/40 px-2 py-1 text-xs text-red-300 hover:bg-red-950/70 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={o.member_count > 0 ? 'Has members — remove them first' : 'Delete'}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>,
          ];

          if (isOpen) {
            rows.push(
              <tr key={`${o.id}-members`} className="bg-surface/40">
                <td colSpan={5} className="px-3 py-3">
                  <MembersPanel
                    state={memberState}
                    onChanged={() => reloadOrgMembers(o)}
                  />
                </td>
              </tr>,
            );
          }

          return rows;
        })}
      />

      {createOpen && <CreateOrgModal onClose={() => setCreateOpen(false)} onCreated={refresh} />}
      {addAdminFor && (
        <AddAdminModal
          org={addAdminFor}
          onClose={() => setAddAdminFor(null)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

function MembersPanel({
  state,
  onChanged,
}: {
  state: Member[] | 'loading' | 'error' | undefined;
  onChanged: () => void;
}) {
  if (state === 'loading' || state === undefined) {
    return <p className="text-xs text-fg-muted">Loading members…</p>;
  }
  if (state === 'error') {
    return <p className="text-xs text-red-400">Could not load members.</p>;
  }
  if (state.length === 0) {
    return <p className="text-xs text-fg-muted">No members in this organization yet.</p>;
  }
  return (
    <div className="rounded border border-app-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-fg-muted">
          <tr>
            <th className="text-left px-3 py-1.5">Email</th>
            <th className="text-left px-3 py-1.5">Name</th>
            <th className="text-left px-3 py-1.5">Role</th>
            <th className="text-left px-3 py-1.5">Joined</th>
            <th className="px-3 py-1.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.map((m) => (
            <tr key={m.id} className="border-t border-app-border">
              <td className="px-3 py-1.5 text-fg">{m.email}</td>
              <td className="px-3 py-1.5 text-fg-muted">{m.name ?? '—'}</td>
              <td className="px-3 py-1.5">
                <RolePill role={m.role} />
              </td>
              <td className="px-3 py-1.5 text-fg-muted">
                {new Date(m.created_at).toISOString().slice(0, 10)}
              </td>
              <td className="px-3 py-1.5 text-right">
                <RowActions member={m} onChanged={onChanged} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // super_admin rows are protected from API mutation — they can only be
  // changed via direct DB grant. The PATCH/DELETE endpoints reject them,
  // and showing buttons that always fail would be misleading.
  if (member.role === 'super_admin') {
    return <span className="text-xs text-fg-faint">protected</span>;
  }

  async function setRole(next: 'user' | 'admin') {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (
      !confirm(
        `Remove ${member.email}? Their account is deleted along with all their usage data.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${member.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      {member.role === 'user' ? (
        <button
          onClick={() => setRole('admin')}
          disabled={busy}
          className="rounded border border-app-border px-2 py-0.5 text-xs text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          title="Promote to admin"
        >
          Make admin
        </button>
      ) : (
        <button
          onClick={() => setRole('user')}
          disabled={busy}
          className="rounded border border-app-border px-2 py-0.5 text-xs text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          title="Demote to employee"
        >
          Make employee
        </button>
      )}
      <button
        onClick={remove}
        disabled={busy}
        className="rounded border border-red-900 bg-red-950/40 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950/70 disabled:opacity-50"
      >
        Remove
      </button>
      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const cls =
    role === 'super_admin'
      ? 'bg-rose-900/40 text-rose-200'
      : role === 'admin'
      ? 'pill-warn'
      : 'pill-neutral';
  const label = role === 'user' ? 'employee' : role;
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

function CreateOrgModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm space-y-3 rounded-lg border border-app-border bg-surface p-5"
      >
        <h2 className="text-base font-semibold">Create organization</h2>
        <input
          required
          autoFocus
          maxLength={128}
          placeholder="Organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-app-border bg-app px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-app-border px-3 py-2 text-sm text-fg-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddAdminModal({
  org,
  onClose,
  onCreated,
}: {
  org: Org;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name,
          role: 'admin',
          org_id: org.id,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${r.status}`);
        return;
      }
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm space-y-3 rounded-lg border border-app-border bg-surface p-5"
      >
        <div>
          <h2 className="text-base font-semibold">Add admin to {org.name}</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Creates a new admin user inside this organization. They&apos;ll be able to add
            employees and manage members of {org.name}.
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
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-app-border px-3 py-2 text-sm text-fg-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Add admin'}
          </button>
        </div>
      </form>
    </div>
  );
}
