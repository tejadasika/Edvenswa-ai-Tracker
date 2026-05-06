import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminScope, requireAdmin } from '@/lib/session';
import {
  getOrgMember,
  getUserBreakdown,
  getUserActivityByModel,
  getUserRecentEvents,
  getUserBrowsers,
  getExtensionConversations,
} from '@/lib/stats';
import PlatformDonut from '@/components/charts/PlatformDonut';
import ModelBarChart from '@/components/charts/ModelBarChart';
import PaginatedTable from '@/components/PaginatedTable';
import DateRangePicker from '../../DateRangePicker';

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

export default async function AdminUserDetail({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: { from?: string; to?: string };
}) {
  const s = await requireAdmin();
  const scope = adminScope(s);
  if (!scope) return <p className="text-fg-muted">No organization on this account.</p>;

  const member = await getOrgMember(scope, params.userId);
  if (!member) notFound();

  const def = defaultRange();
  const from = isoDateOrNull(searchParams.from) ?? def.from;
  const to = isoDateOrNull(searchParams.to) ?? def.to;

  const [data, modelActivity, recent, browsers, extConversations] = await Promise.all([
    getUserBreakdown(member.id, from, to),
    getUserActivityByModel(member.id, from, to),
    getUserRecentEvents(member.id, 200, from, to),
    getUserBrowsers(member.id, from, to),
    getExtensionConversations(member.id),
  ]);

  const lastSeen = recent[0]?.createdAt ?? null;

  const platformSlices = data.byPlatform.map((p) => ({
    label: p.platform,
    value: p.seconds || p.sessions,
  }));

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/users" className="text-xs text-fg-faint hover:text-fg-muted">
          ← All users
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{member.email}</h1>
            <p className="text-sm text-fg-faint">
              {member.name ?? 'No display name'} · role {member.role} · joined{' '}
              {new Date(member.createdAt).toISOString().slice(0, 10)}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-app-border pb-3">
        <DateRangePicker from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Sessions" value={data.extension.sessions.toLocaleString()} />
        <Stat label="Last active" value={lastSeen ? fmtRelative(lastSeen) : 'never'} />
        <Stat label="Time on AI sites" value={fmtSeconds(data.extension.seconds)} />
        <Stat label="Browsers" value={String(browsers.length)} />
      </div>

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">
          AI model usage over time
        </h2>
        <ModelBarChart rows={modelActivity} unit="sessions" metric="seconds" />
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">Time by AI platform</h2>
        <PlatformDonut slices={platformSlices} unit="sec" />
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">By model</h2>
        <PaginatedTable
          pageSize={10}
          emptyColSpan={3}
          emptyMessage="No activity in this range."
          thead={
            <thead className="bg-surface text-fg-muted">
              <tr>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-right px-3 py-2">Sessions</th>
                <th className="text-right px-3 py-2">Time</th>
              </tr>
            </thead>
          }
          rows={data.byModel.map((r, i) => (
            <tr key={`${r.model}-${i}`} className="border-t border-app-border">
              <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
              <td className="px-3 py-2 text-right">{r.sessions.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{fmtSeconds(r.seconds)}</td>
            </tr>
          ))}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-medium text-fg-muted">Extension conversations</h2>
          <span className="text-xs text-fg-faint">
            Topics scraped from third-party AI tab titles.
          </span>
        </div>
        <PaginatedTable
          pageSize={10}
          emptyColSpan={6}
          emptyMessage="No extension conversations yet for this user."
          thead={
            <thead className="bg-surface text-fg-muted">
              <tr>
                <th className="text-left px-3 py-2">Topic</th>
                <th className="text-left px-3 py-2">Platform</th>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-right px-3 py-2">Events</th>
                <th className="text-right px-3 py-2">Time spent</th>
                <th className="text-left px-3 py-2">Last used</th>
              </tr>
            </thead>
          }
          rows={extConversations.map((c) => (
            <tr key={c.id} className="border-t border-app-border">
              <td className="px-3 py-2 truncate max-w-md" title={c.topic}>
                {c.topic}
              </td>
              <td className="px-3 py-2 capitalize">{c.platform}</td>
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                {c.model ?? <span className="text-fg-faint">—</span>}
              </td>
              <td className="px-3 py-2 text-right">{c.eventCount.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{fmtSeconds(c.totalSeconds)}</td>
              <td className="px-3 py-2 text-fg-muted whitespace-nowrap">
                {fmtRelative(c.lastSeenAt)}
              </td>
            </tr>
          ))}
        />
      </section>

      {browsers.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-fg-muted mb-2">Browsers</h2>
          <PaginatedTable
            pageSize={10}
            emptyColSpan={4}
            emptyMessage="No browsers reported."
            thead={
              <thead className="bg-surface text-fg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Browser</th>
                  <th className="text-right px-3 py-2">Sessions</th>
                  <th className="text-right px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Last seen</th>
                </tr>
              </thead>
            }
            rows={browsers.map((b) => (
              <tr key={b.browser} className="border-t border-app-border">
                <td className="px-3 py-2 capitalize">{b.browser}</td>
                <td className="px-3 py-2 text-right">{b.sessions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{fmtSeconds(b.seconds)}</td>
                <td className="px-3 py-2 text-fg-muted">{fmtRelative(b.lastSeen)}</td>
              </tr>
            ))}
          />
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">Recent activity</h2>
        <PaginatedTable
          pageSize={10}
          emptyColSpan={5}
          emptyMessage="No activity in this range."
          thead={
            <thead className="bg-surface text-fg-muted">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Platform</th>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-left px-3 py-2">Topic</th>
                <th className="text-left px-3 py-2">Browser</th>
                <th className="text-right px-3 py-2">Time</th>
              </tr>
            </thead>
          }
          rows={recent.map((e) => (
            <tr key={e.id} className="border-t border-app-border">
              <td className="px-3 py-2 text-fg-muted whitespace-nowrap">
                {fmtRelative(e.createdAt)}
              </td>
              <td className="px-3 py-2 capitalize">{e.platform}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {e.model ?? <span className="text-fg-faint">—</span>}
              </td>
              <td className="px-3 py-2 max-w-xs truncate" title={e.topic ?? undefined}>
                {e.topic ?? <span className="text-fg-faint">—</span>}
              </td>
              <td className="px-3 py-2 text-fg-muted capitalize">
                {e.browser ?? <span className="text-fg-faint">—</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {e.seconds !== null && e.seconds > 0 ? (
                  fmtSeconds(e.seconds)
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
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
