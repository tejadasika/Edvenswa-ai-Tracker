import Link from 'next/link';
import { requireAdmin, resolveAdminScope } from '@/lib/session';
import { getOrgMembersByUsage } from '@/lib/stats';
import PaginatedTable from '@/components/PaginatedTable';
import AddMemberButton from './AddMemberButton';

export const dynamic = 'force-dynamic';

function fmtSeconds(s: number): string {
  if (!s) return '0s';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtRelative(ts: string | null): string {
  if (!ts) return 'never';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
function isActive(ts: string | null): boolean {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() < ACTIVE_WINDOW_MS;
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded pill-success px-2 py-0.5 text-xs">active</span>
  ) : (
    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">inactive</span>
  );
}

function RolePill({ role }: { role: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        role === 'admin' || role === 'super_admin' ? 'pill-warn' : 'pill-neutral'
      }`}
    >
      {role}
    </span>
  );
}

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const s = await requireAdmin();
  const scope = resolveAdminScope(s, searchParams.org ?? null);
  if (!scope) return <p className="text-fg-muted">No organization on this account.</p>;

  const all = await getOrgMembersByUsage(scope);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-fg-faint">
            {all.length} {all.length === 1 ? 'member' : 'members'}{' '}
            {'all' in scope ? 'across all organizations' : 'in your organization'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {'all' in scope && (
            <span className="rounded pill-warn px-2 py-1 text-xs">
              super_admin · viewing all organizations
            </span>
          )}
          {!('all' in scope) && <AddMemberButton />}
        </div>
      </header>

      <PaginatedTable
        pageSize={10}
        emptyColSpan={8}
        emptyMessage="No users in the database."
        thead={
          <thead className="bg-surface text-fg-muted">
            <tr>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Sessions</th>
              <th className="text-right px-3 py-2">Time tracked</th>
              <th className="text-left px-3 py-2">Last event</th>
              <th className="text-left px-3 py-2">Joined</th>
            </tr>
          </thead>
        }
        rows={all.map((m) => (
          <tr key={m.id} className="border-t border-app-border hover:bg-surface/50">
            <td className="px-3 py-2">
              <Link href={`/admin/users/${m.id}`} className="text-indigo-300 hover:underline">
                {m.email}
              </Link>
            </td>
            <td className="px-3 py-2 text-fg-muted">{m.name ?? '—'}</td>
            <td className="px-3 py-2">
              <RolePill role={m.role} />
            </td>
            <td className="px-3 py-2">
              <StatusPill active={isActive(m.extLast)} />
            </td>
            <td className="px-3 py-2 text-right">{m.extSessions.toLocaleString()}</td>
            <td className="px-3 py-2 text-right">{fmtSeconds(m.extSeconds)}</td>
            <td className="px-3 py-2 text-fg-muted">{fmtRelative(m.extLast)}</td>
            <td className="px-3 py-2 text-fg-muted">
              {new Date(m.createdAt).toISOString().slice(0, 10)}
            </td>
          </tr>
        ))}
      />
    </div>
  );
}
