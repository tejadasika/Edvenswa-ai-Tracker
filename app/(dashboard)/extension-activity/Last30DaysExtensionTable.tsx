'use client';
import { useMemo, useState } from 'react';
import PaginatedTable from '@/components/PaginatedTable';

type Row = {
  id: string;
  createdAt: string;
  platform: string;
  model: string | null;
  browser: string | null;
  topic: string | null;
  activeSeconds: number;
};

function fmtSeconds(s: number) {
  if (!s) return '0s';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(today) - startOfDay(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: today.getFullYear() === y ? undefined : 'numeric',
  });
}

export default function Last30DaysExtensionTable({ rows }: { rows: Row[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = dayKey(r.createdAt);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, items]) => {
        const totalSeconds = items.reduce((s, r) => s + r.activeSeconds, 0);
        const platforms = Array.from(new Set(items.map((r) => r.platform)));
        return { day, items, totalSeconds, platforms };
      });
  }, [rows]);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-app-border px-4 py-6 text-center text-sm text-fg-faint">
        No extension activity in the last 30 days. Install the extension and
        connect it with a token from the Browser Extension tab.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-app-border overflow-hidden divide-y divide-app-border">
      {groups.map((g) => {
        const isOpen = !!open[g.day];
        return (
          <div key={g.day}>
            <button
              onClick={() => setOpen((s) => ({ ...s, [g.day]: !s[g.day] }))}
              className="w-full flex items-center justify-between px-4 py-3 text-sm bg-surface hover:bg-surface-2/70"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-3">
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`text-fg-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="font-medium text-fg">{dayLabel(g.day)}</span>
                <span className="text-xs text-fg-faint">{g.day}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-fg-muted">
                <span>{g.items.length} {g.items.length === 1 ? 'session' : 'sessions'}</span>
                <span>{g.platforms.length} {g.platforms.length === 1 ? 'platform' : 'platforms'}</span>
                <span>{fmtSeconds(g.totalSeconds)}</span>
              </div>
            </button>
            {isOpen && (
              <div className="bg-app p-3">
                <PaginatedTable
                  pageSize={10}
                  emptyColSpan={6}
                  emptyMessage="No sessions on this day."
                  className="w-full text-sm"
                  thead={
                    <thead className="text-left text-fg-faint">
                      <tr>
                        <th className="px-4 py-2 font-normal">Time</th>
                        <th className="px-4 py-2 font-normal">Platform</th>
                        <th className="px-4 py-2 font-normal">Model</th>
                        <th className="px-4 py-2 font-normal">Topic</th>
                        <th className="px-4 py-2 font-normal">Browser</th>
                        <th className="px-4 py-2 font-normal">Active time</th>
                      </tr>
                    </thead>
                  }
                  rows={g.items.map((r) => (
                    <tr key={r.id} className="border-t border-app-border">
                      <td className="px-4 py-2 text-fg-faint whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2 capitalize">{r.platform}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {r.model ?? <span className="text-fg-faint">—</span>}
                      </td>
                      <td className="px-4 py-2 max-w-xs truncate" title={r.topic ?? undefined}>
                        {r.topic ?? <span className="text-fg-faint">—</span>}
                      </td>
                      <td className="px-4 py-2 text-fg-muted capitalize">
                        {r.browser ?? <span className="text-fg-faint">—</span>}
                      </td>
                      <td className="px-4 py-2">{fmtSeconds(r.activeSeconds)}</td>
                    </tr>
                  ))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
