'use client';
// One line per AI model over time. SVG-only, no chart library.
// Hovering a legend item dims every other line so the selected model pops.
// Click toggles a "pin" so the highlight stays after the mouse moves away.
//
// Inputs are pre-aggregated rows from lib/stats.ts → getUserActivityByModel.
// Buckets are sorted lexicographically (ISO-format dates → chronological).

import { useState } from 'react';

type Row = { bucket: string; model: string; events: number };

const MODEL_COLORS: Array<[RegExp, string]> = [
  [/^gpt-4o/, '#10b981'],
  [/^gpt-4/,  '#059669'],
  [/^gpt-3/,  '#34d399'],
  [/^o1/,     '#84cc16'],
  [/^claude.*opus/,   '#f59e0b'],
  [/^claude.*sonnet/, '#fb923c'],
  [/^claude.*haiku/,  '#fbbf24'],
  [/^claude/,         '#f97316'],
  [/^gemini.*pro/,    '#3b82f6'],
  [/^gemini.*flash/,  '#60a5fa'],
  [/^gemini/,         '#2563eb'],
  [/^sonar/,          '#a855f7'],
  [/^perplexity/,     '#a855f7'],
  [/^deepseek/,       '#ec4899'],
  [/^copilot/,        '#06b6d4'],
  [/^llama/,          '#14b8a6'],
  [/^unknown/,        '#52525b'],
];
const FALLBACK_PALETTE = [
  '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#22d3ee', '#84cc16', '#f59e0b',
];

function colorFor(model: string, fallbackIdx: number): string {
  const lc = model.toLowerCase();
  for (const [pat, hex] of MODEL_COLORS) if (pat.test(lc)) return hex;
  return FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];
}

export default function ModelLineChart({
  rows,
  height = 260,
}: {
  rows: Row[];
  height?: number;
}) {
  // Pinned vs hovered: pinned survives mouseLeave; hover overrides while
  // active so the user sees instant feedback even before they decide to pin.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const selected = hovered ?? pinned;

  // Bucket axis: distinct, sorted ascending (ISO dates → chronological).
  const buckets = Array.from(new Set(rows.map((r) => r.bucket))).sort();
  const models = Array.from(new Set(rows.map((r) => r.model))).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a.localeCompare(b);
  });

  // Build [model][bucket] = events lookup. Missing cells default to 0 so
  // the line stays continuous instead of breaking on absent days.
  const events: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    events[r.model] ??= {};
    events[r.model][r.bucket] = (events[r.model][r.bucket] ?? 0) + r.events;
  }
  const max = rows.reduce((m, r) => Math.max(m, r.events), 0);

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

  const W = Math.max(620, buckets.length * 22);
  const H = height;
  const pad = { top: 12, right: 12, bottom: 28, left: 36 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  // x position for bucket index i; centers single-bucket charts.
  function x(i: number): number {
    if (buckets.length === 1) return pad.left + innerW / 2;
    return pad.left + (i / (buckets.length - 1)) * innerW;
  }
  function y(v: number): number {
    return pad.top + innerH - (v / max) * innerH;
  }

  const modelColor: Record<string, string> = {};
  models.forEach((m, i) => (modelColor[m] = colorFor(m, i)));

  // Reduce label density so x-axis doesn't overlap.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  // Y-axis ticks: 4 evenly spaced 0..max, rounded to integers.
  const ticks = [0, Math.round(max * 0.25), Math.round(max * 0.5), Math.round(max * 0.75), max];

  function pathFor(model: string): string {
    const series = buckets.map((b, i) => ({ x: x(i), y: y(events[model]?.[b] ?? 0) }));
    return series
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }

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
          {/* Y gridlines + ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
              <text
                x={pad.left - 6}
                y={y(t) + 3}
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.45"
                textAnchor="end"
              >
                {t}
              </text>
            </g>
          ))}

          {/* Lines. Render selected last so it draws on top of the others. */}
          {models
            .slice()
            .sort((a) => (a === selected ? 1 : -1))
            .map((model) => {
              const isSelected = selected === model;
              const dimmed = selected !== null && !isSelected;
              return (
                <g key={model}>
                  <path
                    d={pathFor(model)}
                    fill="none"
                    stroke={modelColor[model]}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeOpacity={dimmed ? 0.18 : 1}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* Data points only for the selected model — dot density
                      across all models would clutter the chart. */}
                  {isSelected &&
                    buckets.map((b, i) => {
                      const v = events[model]?.[b] ?? 0;
                      return (
                        <circle
                          key={b}
                          cx={x(i)}
                          cy={y(v)}
                          r={3}
                          fill={modelColor[model]}
                        >
                          <title>{`${b} · ${model}: ${v}`}</title>
                        </circle>
                      );
                    })}
                </g>
              );
            })}

          {/* X-axis labels */}
          {buckets.map((b, i) => {
            if (i % labelEvery !== 0 && i !== buckets.length - 1) return null;
            return (
              <text
                key={b}
                x={x(i)}
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
        </svg>
      </div>

      {/* Interactive legend. Hover dims others, click pins the highlight. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {models.map((m) => {
          const isSelected = selected === m;
          const dimmed = selected !== null && !isSelected;
          return (
            <button
              key={m}
              type="button"
              onMouseEnter={() => setHovered(m)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setPinned((cur) => (cur === m ? null : m))}
              className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition ${
                isSelected
                  ? 'bg-surface-2 text-fg'
                  : dimmed
                  ? 'opacity-40 text-fg-muted hover:opacity-100'
                  : 'text-fg-muted hover:text-fg'
              }`}
              title={pinned === m ? 'Click to unpin' : 'Click to pin'}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: modelColor[m] }}
              />
              <span className="font-mono text-[11px]">{m}</span>
            </button>
          );
        })}
        {pinned && (
          <button
            type="button"
            onClick={() => setPinned(null)}
            className="ml-auto text-[11px] text-fg-faint hover:text-fg-muted underline"
          >
            clear selection
          </button>
        )}
      </div>
    </div>
  );
}
