import Link from 'next/link';
import { requireAdmin, resolveAdminScope } from '@/lib/session';
import { getOrgExtensionInstalls } from '@/lib/stats';
import RevokeButton from './RevokeButton';
import PaginatedTable from '@/components/PaginatedTable';

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

// "Active" = token is not revoked and has reported within the last 7 days.
// "Idle"   = token is not revoked but hasn't reported recently.
// "Revoked"= soft-deleted; kept for the audit trail.
function statusOf(install: {
  revokedAt: string | null;
  lastUsedAt: string | null;
}): 'active' | 'idle' | 'revoked' {
  if (install.revokedAt) return 'revoked';
  if (!install.lastUsedAt) return 'idle';
  const ageMs = Date.now() - new Date(install.lastUsedAt).getTime();
  return ageMs < 7 * 24 * 3600 * 1000 ? 'active' : 'idle';
}

export default async function AdminExtensions({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const s = await requireAdmin();
  const scope = resolveAdminScope(s, searchParams.org ?? null);
  if (!scope) return <p className="text-fg-muted">No organization on this account.</p>;

  const installs = await getOrgExtensionInstalls(scope);

  const active = installs.filter((i) => statusOf(i) === 'active').length;
  const idle = installs.filter((i) => statusOf(i) === 'idle').length;
  const revoked = installs.filter((i) => statusOf(i) === 'revoked').length;
  const distinctUsers = new Set(installs.filter((i) => !i.revokedAt).map((i) => i.userId)).size;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Browser extensions</h1>
          <p className="text-sm text-fg-faint">
            One row per extension token. Each user can have multiple tokens (one per browser).
          </p>
        </div>
        {'all' in scope && (
          <span className="rounded pill-warn px-2 py-1 text-xs">
            super_admin · viewing all organizations
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Users with extension" value={distinctUsers.toLocaleString()} />
        <Stat label="Active tokens" value={active.toLocaleString()} />
        <Stat label="Idle tokens" value={idle.toLocaleString()} />
        <Stat label="Revoked" value={revoked.toLocaleString()} />
      </div>

      <PaginatedTable
        pageSize={10}
        emptyColSpan={8}
        emptyMessage={
          <>
            No extension tokens have been issued yet. Users can issue one from{' '}
            <span className="font-mono text-xs">POST /api/extension/tokens</span>.
          </>
        }
        thead={
          <thead className="bg-surface text-fg-muted">
            <tr>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Label</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Last reported</th>
              <th className="text-right px-3 py-2">Sessions</th>
              <th className="text-right px-3 py-2">Time tracked</th>
              <th className="text-left px-3 py-2">Issued</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
        }
        rows={installs.map((i) => {
          const status = statusOf(i);
          return (
            <tr key={i.tokenId} className="border-t border-app-border hover:bg-surface/50">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/users/${i.userId}`}
                  className="text-indigo-300 hover:underline"
                >
                  {i.email}
                </Link>
                {i.name && <div className="text-xs text-fg-faint">{i.name}</div>}
              </td>
              <td className="px-3 py-2 text-fg-muted">{i.label}</td>
              <td className="px-3 py-2">
                <StatusPill status={status} />
              </td>
              <td className="px-3 py-2 text-fg-muted">{fmtRelative(i.lastUsedAt)}</td>
              <td className="px-3 py-2 text-right">{i.extSessions.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{fmtSeconds(i.extSeconds)}</td>
              <td className="px-3 py-2 text-fg-muted">
                {new Date(i.createdAt).toISOString().slice(0, 10)}
              </td>
              <td className="px-3 py-2">
                {status !== 'revoked' && <RevokeButton tokenId={i.tokenId} />}
                {status === 'revoked' && i.revokedAt && (
                  <span className="text-xs text-fg-faint">
                    {new Date(i.revokedAt).toISOString().slice(0, 10)}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      />

      <p className="text-xs text-fg-faint">
        Sessions and time tracked are aggregated across <em>all</em> of that user's extension
        events, not just events from this token. Per-token attribution would require recording
        token_id on every event.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-app-border bg-surface px-4 py-3">
      <div className="text-xs text-fg-faint">{label}</div>
      <div className="text-lg font-semibold text-fg">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: 'active' | 'idle' | 'revoked' }) {
  const cls =
    status === 'active'
      ? 'pill-success'
      : status === 'idle'
      ? 'pill-warn'
      : 'pill-neutral';
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}
