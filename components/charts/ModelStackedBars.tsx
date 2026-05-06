// Stacked bar chart: x = time bucket (day/week/month), y = total events,
// each segment colored by AI model. SVG-only, no chart library.
//
// Inputs are pre-aggregated rows from lib/stats.ts → getUserActivityByModel.
// The component does NOT do any DB lookups; it just lays out what it's given.

type Row = { bucket: string; model: string; events: number };

// Stable per-model color. Keys use lowercase prefixes so 'gpt-4', 'gpt-4o',
// 'gpt-4o-mini' all resolve to the same family color band. 'unknown' is
// neutral gray so it doesn't fight with real models for attention.
const MODEL_COLORS: Array<[RegExp, string]> = [
  [/^gpt-4o/, '#10b981'],     // emerald — newest OpenAI
  [/^gpt-4/,  '#059669'],     // emerald-darker
  [/^gpt-3/,  '#34d399'],     // emerald-light
  [/^o1/,     '#84cc16'],     // lime
  [/^claude.*opus/,  '#f59e0b'], // amber
  [/^claude.*sonnet/,'#fb923c'], // orange
  [/^claude.*haiku/, '#fbbf24'], // amber-light
  [/^claude/,        '#f97316'], // orange-default for any other claude
  [/^gemini.*pro/,   '#3b82f6'], // blue
  [/^gemini.*flash/, '#60a5fa'], // blue-light
  [/^gemini/,        '#2563eb'], // blue-default
  [/^sonar/,         '#a855f7'], // purple — Perplexity
  [/^perplexity/,    '#a855f7'],
  [/^deepseek/,      '#ec4899'], // pink
  [/^copilot/,       '#06b6d4'], // cyan
  [/^llama/,         '#14b8a6'], // teal
  [/^unknown/,       '#52525b'], // zinc-600
];

const FALLBACK_PALETTE = [
  '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#22d3ee', '#84cc16', '#f59e0b',
];

function colorFor(model: string, fallbackIdx: number): string {
  const lc = model.toLowerCase();
  for (const [pat, hex] of MODEL_COLORS) if (pat.test(lc)) return hex;
  return FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];
}

export default function ModelStackedBars({
  rows,
  height = 220,
}: {
  rows: Row[];
  height?: number;
}) {
  // Index rows by bucket → model → events.
  const buckets = Array.from(new Set(rows.map((r) => r.bucket))).sort();
  const models = Array.from(new Set(rows.map((r) => r.model))).sort((a, b) => {
    // 'unknown' last so it stacks visually on top of real-model segments.
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a.localeCompare(b);
  });
  const cellEvents: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    cellEvents[r.bucket] ??= {};
    cellEvents[r.bucket][r.model] = (cellEvents[r.bucket][r.model] ?? 0) + r.events;
  }
  const bucketTotals = buckets.map((b) =>
    Object.values(cellEvents[b] ?? {}).reduce((s, n) => s + n, 0),
  );
  const max = bucketTotals.reduce((m, n) => Math.max(m, n), 0);

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

  const W = Math.max(600, buckets.length * 18);
  const H = height;
  const pad = { top: 12, right: 8, bottom: 24, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const barGap = 2;
  const barW = (innerW - barGap * (buckets.length - 1)) / buckets.length;

  // Pre-compute model colors so the legend and bars match.
  const modelColor: Record<string, string> = {};
  models.forEach((m, i) => (modelColor[m] = colorFor(m, i)));

  // X-axis label sampling: show first, last, and a few in between depending
  // on bucket count. Avoids overlap when there are 365 daily buckets.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <div className="rounded-lg border border-app-border bg-app p-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width={W}
          style={{ height, minWidth: '100%' }}
          role="img"
          aria-label="AI model usage over time"
        >
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={H - pad.bottom}
            y2={H - pad.bottom}
            stroke="#27272a"
            strokeWidth="1"
          />
          {buckets.map((bucket, i) => {
            const x = pad.left + i * (barW + barGap);
            let y = H - pad.bottom;
            const cell = cellEvents[bucket] ?? {};
            return (
              <g key={bucket}>
                {models.map((model) => {
                  const v = cell[model] ?? 0;
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
                      rx={1}
                    >
                      <title>{`${bucket} · ${model}: ${v} ${v === 1 ? 'event' : 'events'}`}</title>
                    </rect>
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
                y={H - 8}
                fontSize="10"
                fill="#71717a"
                textAnchor="middle"
              >
                {b.length === 10 ? b.slice(5) : b}
              </text>
            );
          })}
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
