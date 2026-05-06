import { requireAdmin, resolveAdminScope } from '@/lib/session';
import { query } from '@/lib/db';
import PaginatedTable from '@/components/PaginatedTable';
import AddMemberButton from '../users/AddMemberButton';
import MemberActions from './MemberActions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'super_admin';
  created_at: string;
  org_name: string | null;
};

// Members management page. Distinct from /admin/users (which is usage-focused
// analytics). This page is a clean roster: who's
// in your org, what role, when they joined, and admin actions to add / change
// role / remove. super_admins see members across every org with the org name
// inline so they can tell tenants apart.
export default async function AdminMembers({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const s = await requireAdmin();
  const scope = resolveAdminScope(s, searchParams.org ?? null);
  if (!scope) return <p className="text-fg-muted">No organization on this account.</p>;

  const isAll = 'all' in scope;
  const r = await query<Row>(
    isAll
      ? `SELECT u.id::text, u.email, u.name, u.role, u.created_at,
                o.name AS org_name
           FROM users u
      LEFT JOIN organizations o ON o.id = u.org_id
       ORDER BY o.name NULLS LAST, u.created_at`
      : `SELECT u.id::text, u.email, u.name, u.role, u.created_at,
                NULL::text AS org_name
           FROM users u
          WHERE u.org_id = $1
       ORDER BY u.created_at`,
    isAll ? [] : [scope.orgId],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-fg-faint">
            {r.rowCount} {r.rowCount === 1 ? 'member' : 'members'}
            {isAll ? ' across all organizations' : ' in your organization'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAll && (
            <span className="rounded pill-warn px-2 py-1 text-xs">
              super_admin · viewing all organizations
            </span>
          )}
          {!isAll && <AddMemberButton />}
        </div>
      </header>

      <PaginatedTable
        pageSize={20}
        emptyColSpan={isAll ? 6 : 5}
        emptyMessage="No members yet."
        thead={
          <thead className="bg-surface text-fg-muted">
            <tr>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Role</th>
              {isAll && <th className="text-left px-3 py-2">Organization</th>}
              <th className="text-left px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
        }
        rows={r.rows.map((m) => {
          const isSelf = m.id === s.userId;
          return (
            <tr key={m.id} className="border-t border-app-border hover:bg-surface/50">
              <td className="px-3 py-2 text-fg">
                {m.email}
                {isSelf && <span className="ml-2 text-xs text-fg-faint">(you)</span>}
              </td>
              <td className="px-3 py-2 text-fg-muted">{m.name ?? '—'}</td>
              <td className="px-3 py-2">
                <RolePill role={m.role} />
              </td>
              {isAll && (
                <td className="px-3 py-2 text-fg-muted">{m.org_name ?? '—'}</td>
              )}
              <td className="px-3 py-2 text-fg-muted">
                {new Date(m.created_at).toISOString().slice(0, 10)}
              </td>
              <td className="px-3 py-2 text-right">
                {isSelf ? (
                  <span className="text-xs text-fg-faint">—</span>
                ) : (
                  <MemberActions userId={m.id} email={m.email} role={m.role} />
                )}
              </td>
            </tr>
          );
        })}
      />
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        role === 'super_admin'
          ? 'bg-rose-900/40 text-rose-200'
          : role === 'admin'
          ? 'pill-warn'
          : 'pill-neutral'
      }`}
    >
      {role === 'user' ? 'employee' : role}
    </span>
  );
}
