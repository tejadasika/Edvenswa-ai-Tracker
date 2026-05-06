import { getSession } from '@/lib/session';
import {
  getExtensionActivity,
  getExtensionConversations,
  getLast30DaysExtensionDetail,
} from '@/lib/stats';
import { redirect } from 'next/navigation';
import Last30DaysExtensionTable from './Last30DaysExtensionTable';
import PaginatedTable from '@/components/PaginatedTable';

export const dynamic = 'force-dynamic';

function fmtSeconds(s: number) {
  if (!s) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

export default async function ExtensionActivityPage() {
  const s = await getSession();
  if (!s.userId) redirect('/');

  const [t, last30, conversations] = await Promise.all([
    getExtensionActivity(s.userId),
    getLast30DaysExtensionDetail(s.userId),
    getExtensionConversations(s.userId),
  ]);
  const avgSec = t.totalSessions ? t.totalSeconds / t.totalSessions : 0;
  const firstDay = t.byDay.length ? t.byDay[t.byDay.length - 1].day : null;
  const lastDay = t.byDay.length ? t.byDay[0].day : null;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Extension Activity</h1>
          <p className="text-sm text-fg-faint">
            Time spent on third-party AI sites, reported by the browser extension. Prompts and
            replies are never recorded.
          </p>
        </div>
        <div className="rounded-lg border border-app-border bg-surface px-4 py-3 text-right">
          <div className="text-xs text-fg-faint">Tracking for</div>
          <div className="text-sm font-medium text-fg">
            {s.name ?? s.email?.split('@')[0]}
          </div>
          <div className="text-xs text-fg-faint">{s.email}</div>
          {firstDay && (
            <div className="text-xs text-fg-faint mt-1">
              Active {firstDay} → {lastDay}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card label="Total time" value={fmtSeconds(t.totalSeconds)} />
        <Card label="Sessions" value={t.totalSessions.toLocaleString()} />
        <Card label="Avg / session" value={fmtSeconds(Math.round(avgSec))} />
      </div>

      <h2 className="text-lg font-medium mb-3">Time by AI platform</h2>
      <div className="mb-8">
        <PaginatedTable
          pageSize={10}
          emptyColSpan={5}
          emptyMessage="No extension activity yet. Issue a token from the Browser Extension tab and connect the extension to start tracking."
          className="w-full text-sm rounded-lg border border-app-border overflow-hidden"
          thead={
            <thead className="bg-surface text-left text-fg-muted">
              <tr>
                <th className="px-4 py-2">Platform</th>
                <th className="px-4 py-2">Sessions</th>
                <th className="px-4 py-2">Total time</th>
                <th className="px-4 py-2">Avg / session</th>
                <th className="px-4 py-2 w-1/3">Share</th>
              </tr>
            </thead>
          }
          rows={t.byPlatform.map((r) => {
            const pct = t.totalSeconds ? (r.totalSeconds / t.totalSeconds) * 100 : 0;
            return (
              <tr key={r.platform} className="border-t border-app-border">
                <td className="px-4 py-2 capitalize">{r.platform}</td>
                <td className="px-4 py-2">{r.sessions}</td>
                <td className="px-4 py-2">{fmtSeconds(r.totalSeconds)}</td>
                <td className="px-4 py-2">{fmtSeconds(Math.round(r.avgSeconds))}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded bg-surface-2 overflow-hidden">
                      <div
                        className="h-full bg-cyan-500"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="text-fg-faint text-xs w-12 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        />
      </div>

      <h2 className="text-lg font-medium mb-3">Time by AI model</h2>
      <div className="mb-8">
        <PaginatedTable
          pageSize={10}
          emptyColSpan={5}
          emptyMessage="No model data yet. Models are detected from each AI site's model picker."
          className="w-full text-sm rounded-lg border border-app-border overflow-hidden"
          thead={
            <thead className="bg-surface text-left text-fg-muted">
              <tr>
                <th className="px-4 py-2">Platform</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Sessions</th>
                <th className="px-4 py-2">Total time</th>
                <th className="px-4 py-2 w-1/3">Share</th>
              </tr>
            </thead>
          }
          rows={t.byModel.map((r) => {
            const pct = t.totalSeconds ? (r.totalSeconds / t.totalSeconds) * 100 : 0;
            return (
              <tr key={`${r.platform}:${r.model}`} className="border-t border-app-border">
                <td className="px-4 py-2 capitalize">{r.platform}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {r.model === 'unknown' ? (
                    <span className="text-fg-faint">unknown</span>
                  ) : (
                    r.model
                  )}
                </td>
                <td className="px-4 py-2">{r.sessions}</td>
                <td className="px-4 py-2">{fmtSeconds(r.totalSeconds)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded bg-surface-2 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="text-fg-faint text-xs w-12 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        />
        <p className="mt-2 text-xs text-fg-faint">
          Models are detected from the page's model selector. Sessions tagged
          <code className="mx-1 rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">unknown</code>
          mean the picker wasn't visible (e.g. a settings page or the picker was closed).
        </p>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-medium">Extension conversations</h2>
        <span className="text-xs text-fg-faint">
          Topics scraped from each AI site's tab title — separate from your hub conversations.
        </span>
      </div>
      <div className="mb-8">
        <PaginatedTable
          pageSize={10}
          emptyColSpan={6}
          emptyMessage="No extension conversations yet. Open a chat on ChatGPT, Claude, Gemini, or another supported site — once the tab title shows the chat name, it'll appear here."
          className="w-full text-sm rounded-lg border border-app-border overflow-hidden"
          thead={
            <thead className="bg-surface text-left text-fg-muted">
              <tr>
                <th className="px-4 py-2">Topic</th>
                <th className="px-4 py-2">Platform</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Events</th>
                <th className="px-4 py-2">Time spent</th>
                <th className="px-4 py-2">Last used</th>
              </tr>
            </thead>
          }
          rows={conversations.map((c) => (
            <tr key={c.id} className="border-t border-app-border">
              <td className="px-4 py-2 max-w-md truncate" title={c.topic}>
                {c.topic}
              </td>
              <td className="px-4 py-2 capitalize">{c.platform}</td>
              <td className="px-4 py-2 font-mono text-xs">
                {c.model ?? <span className="text-fg-faint">—</span>}
              </td>
              <td className="px-4 py-2">{c.eventCount.toLocaleString()}</td>
              <td className="px-4 py-2">{fmtSeconds(c.totalSeconds)}</td>
              <td className="px-4 py-2 text-fg-muted whitespace-nowrap">
                {new Date(c.lastSeenAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </td>
            </tr>
          ))}
        />
      </div>

      <h2 className="text-lg font-medium mb-3">Last 30 days</h2>
      <Last30DaysExtensionTable rows={last30} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app-border bg-surface p-4">
      <div className="text-xs text-fg-faint">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
