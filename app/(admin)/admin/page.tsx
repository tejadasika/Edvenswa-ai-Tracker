import { requireAdmin, resolveAdminScope } from '@/lib/session';
import { getOrgOverview, getOrgActivityByModel } from '@/lib/stats';
import ModelBarChart from '@/components/charts/ModelBarChart';
import PaginatedTable from '@/components/PaginatedTable';
import DateRangePicker from './DateRangePicker';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoDateOrNull(s: string | undefined): string | null {
  return s && ISO_DATE.test(s) ? s : null;
}
function defaultRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function fmtSeconds(s: number): string {
  if (!s) return '0s';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; org?: string }>;
}) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const scope = resolveAdminScope(s, sp.org ?? null);
  if (!scope) {
    return <p className="text-fg-muted">No organization on this account.</p>;
  }
  const def = defaultRange();
  const from = isoDateOrNull(sp.from) ?? def.from;
  const to = isoDateOrNull(sp.to) ?? def.to;

  const [o, modelActivity] = await Promise.all([
    getOrgOverview(scope, from, to),
    getOrgActivityByModel(scope, from, to),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Organization overview</h1>
          <p className="text-sm text-fg-faint">
            Activity captured by the browser extension.
          </p>
        </div>
        {'all' in scope && (
          <span className="rounded pill-warn px-2 py-1 text-xs">
            super_admin · viewing all organizations
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-app-border pb-3">
        <DateRangePicker from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Members" value={o.members.toLocaleString()} />
        <Stat label="Sessions" value={o.totalSessions.toLocaleString()} />
        <Stat label="Time tracked" value={fmtSeconds(o.totalSeconds)} />
      </div>

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">
          AI model usage over time
        </h2>
        <ModelBarChart rows={modelActivity} unit="sessions" metric="seconds" />
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">Top AI platforms</h2>
        <PaginatedTable
          pageSize={10}
          emptyColSpan={3}
          emptyMessage="No activity in this range."
          thead={
            <thead className="bg-surface text-fg-muted">
              <tr>
                <th className="text-left px-3 py-2">Platform</th>
                <th className="text-right px-3 py-2">Sessions</th>
                <th className="text-right px-3 py-2">Time</th>
              </tr>
            </thead>
          }
          rows={o.byPlatform.map((p) => (
            <tr key={p.platform} className="border-t border-app-border">
              <td className="px-3 py-2">{p.platform}</td>
              <td className="px-3 py-2 text-right">{p.sessions.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{fmtSeconds(p.seconds)}</td>
            </tr>
          ))}
        />
      </section>
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
