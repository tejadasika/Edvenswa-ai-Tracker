'use client';
// Stacked bar chart with hover tooltip. x = date bucket, y = total events,
// each segment colored by AI model. Hovering a bar reveals a panel with
// the per-model breakdown for that bucket.

import { useState } from 'react';

type Row = { bucket: string; model: string; events: number; seconds?: number };

function fmtSeconds(s: number): string {
  if (!s) return '0s';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

const MODEL_COLORS: Array<[RegExp, string]> = [
  [/^gpt-4o/, '#10b981'],
  [/^gpt-4/, '#059669'],
  [/^gpt-3/, '#34d399'],
  [/^o1/, '#84cc16'],
  [/^claude.*opus/, '#f59e0b'],
  [/^claude.*sonnet/, '#fb923c'],
  [/^claude.*haiku/, '#fbbf24'],
  [/^claude/, '#f97316'],
  [/^gemini.*pro/, '#3b82f6'],
  [/^gemini.*flash/, '#60a5fa'],
  [/^gemini/, '#2563eb'],
  [/^sonar/, '#a855f7'],
  [/^perplexity/, '#a855f7'],
  [/^deepseek/, '#ec4899'],
  [/^copilot/, '#06b6d4'],
  [/^llama/, '#14b8a6'],
  [/^unknown/, '#52525b'],
];
const FALLBACK_PALETTE = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#22d3ee', '#84cc16', '#f59e0b'];

function colorFor(model: string, fallbackIdx: number): string {
  const lc = model.toLowerCase();
  for (const [pat, hex] of MODEL_COLORS) if (pat.test(lc)) return hex;
  return FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];
}

export default function ModelBarChart({
  rows,
  unit = 'events',
  metric = 'events',
  height = 280,
}: {
  rows: Row[];
  unit?: string;
  // Which value drives bar height. 'seconds' formats axes/totals as time.
  metric?: 'events' | 'seconds';
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const buckets = Array.from(new Set(rows.map((r) => r.bucket))).sort();
  const models = Array.from(new Set(rows.map((r) => r.model))).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a.localeCompare(b);
  });
  // Track both metrics per bucket/model so the tooltip can show count *and*
  // time-on-platform regardless of which one drives bar height.
  const cell: Record<string, Record<string, number>> = {};
  const cellSeconds: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    cell[r.bucket] ??= {};
    cellSeconds[r.bucket] ??= {};
    cell[r.bucket][r.model] = (cell[r.bucket][r.model] ?? 0) + r.events;
    cellSeconds[r.bucket][r.model] =
      (cellSeconds[r.bucket][r.model] ?? 0) + (r.seconds ?? 0);
  }
  const sourceCell = metric === 'seconds' ? cellSeconds : cell;
  const totals = buckets.map((b) =>
    Object.values(sourceCell[b] ?? {}).reduce((s, n) => s + n, 0),
  );
  const max = totals.reduce((m, n) => Math.max(m, n), 0);
  const fmtAxis = (v: number) => (metric === 'seconds' ? fmtSeconds(v) : String(v));

  if (max === 0 || buckets.length === 0) {
    return (
      <div
        className="rounded-lg border border-app-border px-4 flex items-center justify-center text-sm text-fg-faint"
        style={{ height }}
      >
        No activity in this range.
      </div>
    );
  }

  const W = Math.max(620, buckets.length * 36);
  const H = height;
  const pad = { top: 12, right: 12, bottom: 28, left: 36 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const barGap = Math.max(2, Math.min(10, Math.floor(innerW / buckets.length / 4)));
  const barW = (innerW - barGap * (buckets.length - 1)) / buckets.length;

  const modelColor: Record<string, string> = {};
  models.forEach((m, i) => (modelColor[m] = colorFor(m, i)));

  const labelEvery = Math.max(1, Math.ceil(buckets.length / 10));
  const ticks = [0, Math.round(max * 0.25), Math.round(max * 0.5), Math.round(max * 0.75), max];

  // Find hovered bucket for the tooltip panel.
  const hoveredIdx = hovered ? buckets.indexOf(hovered) : -1;
  const hoveredEvents = hovered ? cell[hovered] ?? {} : {};
  const hoveredSeconds = hovered ? cellSeconds[hovered] ?? {} : {};
  const hoveredTotalEvents = hovered
    ? Object.values(hoveredEvents).reduce((s, n) => s + n, 0)
    : 0;
  const hoveredTotalSeconds = hovered
    ? Object.values(hoveredSeconds).reduce((s, n) => s + n, 0)
    : 0;
  const hasSeconds = hoveredTotalSeconds > 0;
  // Position tooltip; flip to left side of bar when near the right edge.
  const tooltipX =
    hoveredIdx >= 0
      ? pad.left + hoveredIdx * (barW + barGap) + (hoveredIdx > buckets.length / 2 ? -8 : barW + 8)
      : 0;
  const tooltipAnchor: 'start' | 'end' = hoveredIdx > buckets.length / 2 ? 'end' : 'start';

  return (
    <div className="rounded-lg border border-app-border bg-app p-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          style={{ height, minWidth: '100%' }}
          role="img"
          aria-label="AI model usage over time"
        >
          {ticks.map((v) => {
            const ty = pad.top + innerH - (v / max) * innerH;
            return (
              <g key={v}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={ty}
                  y2={ty}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                />
                <text
                  x={pad.left - 6}
                  y={ty + 3}
                  fontSize="10"
                  fill="currentColor"
                  fillOpacity="0.45"
                  textAnchor="end"
                >
                  {fmtAxis(v)}
                </text>
              </g>
            );
          })}

          {buckets.map((bucket, i) => {
            const x = pad.left + i * (barW + barGap);
            let y = pad.top + innerH;
            const c = sourceCell[bucket] ?? {};
            const isHovered = hovered === bucket;
            return (
              <g
                key={bucket}
                onMouseEnter={() => setHovered(bucket)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Hit area covering the full column so the gap between bar
                    top and chart top still triggers hover. */}
                <rect
                  x={x}
                  y={pad.top}
                  width={barW}
                  height={innerH}
                  fill="transparent"
                />
                {models.map((model) => {
                  const v = c[model] ?? 0;
                  if (!v) return null;
                  const h = (v / max) * innerH;
                  y -= h;
                  return (
                    <rect
                      key={model}
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      fill={modelColor[model]}
                      fillOpacity={hovered === null || isHovered ? 1 : 0.35}
                      rx={1}
                      style={{ pointerEvents: 'none' }}
                    />
                  );
                })}
              </g>
            );
          })}

          {buckets.map((b, i) => {
            if (i % labelEvery !== 0 && i !== buckets.length - 1) return null;
            return (
              <text
                key={b}
                x={pad.left + i * (barW + barGap) + barW / 2}
                y={H - 10}
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.45"
                textAnchor="middle"
              >
                {b.length === 10 ? b.slice(5) : b}
              </text>
            );
          })}

          {/* Tooltip overlay rendered as foreignObject so we can use real HTML
              for nicer layout. Width clamps so it can't bleed off the chart. */}
          {hovered && (
            <foreignObject
              x={Math.max(pad.left, Math.min(W - pad.right - 200, tooltipAnchor === 'end' ? tooltipX - 200 : tooltipX))}
              y={pad.top}
              width={200}
              height={innerH}
              style={{ pointerEvents: 'none' }}
            >
              <div className="rounded-md border border-app-border bg-surface px-3 py-2 text-xs shadow-lg">
                <div className="font-medium text-fg">{hovered}</div>
                <div className="text-fg-faint mb-1.5">
                  {hoveredTotalEvents.toLocaleString()} {unit}
                  {hasSeconds && ` · ${fmtSeconds(hoveredTotalSeconds)}`}
                </div>
                <div className="space-y-1">
                  {models
                    .filter((m) => (hoveredEvents[m] ?? 0) > 0 || (hoveredSeconds[m] ?? 0) > 0)
                    .sort((a, b) => {
                      const av = metric === 'seconds'
                        ? (hoveredSeconds[a] ?? 0)
                        : (hoveredEvents[a] ?? 0);
                      const bv = metric === 'seconds'
                        ? (hoveredSeconds[b] ?? 0)
                        : (hoveredEvents[b] ?? 0);
                      return bv - av;
                    })
                    .map((m) => (
                      <div key={m} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: modelColor[m] }}
                        />
                        <span className="font-mono text-[11px] text-fg-muted truncate flex-1">
                          {m}
                        </span>
                        <span className="text-fg tabular-nums whitespace-nowrap">
                          {(hoveredEvents[m] ?? 0).toLocaleString()}
                          {hasSeconds && (
                            <span className="text-fg-faint ml-1">
                              · {fmtSeconds(hoveredSeconds[m] ?? 0)}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </foreignObject>
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        {models.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: modelColor[m] }}
            />
            <span className="font-mono text-[11px]">{m}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
