// Stacked daily bar chart. Pure SVG, no chart library dependency.
//
// Renders 30 daily buckets along x. Each bucket has two stacked bars:
// one for proxy (hub) requests, one for extension sessions. Heights are
// normalized to the tallest bucket so users can read distribution at a glance.
// Hover tooltips are rendered as <title> elements (browser native).

type DailyPoint = {
  day: string;            // 'YYYY-MM-DD'
  proxyRequests: number;
  extSessions: number;
};

export default function DailyBarChart({
  data,
  height = 180,
  proxyColor = '#6366f1',  // indigo-500
  extColor = '#06b6d4',    // cyan-500
}: {
  data: DailyPoint[];
  height?: number;
  proxyColor?: string;
  extColor?: string;
}) {
  // Always show a 30-day window even if some days have no data — gives a
  // stable axis instead of stretching when data is sparse.
  const days = buildLast30(data);
  const max = days.reduce(
    (m, d) => Math.max(m, d.proxyRequests + d.extSessions),
    0,
  );

  if (max === 0) {
    return (
      <div
        className="rounded-lg border border-app-border px-4 flex items-center justify-center text-sm text-fg-faint"
        style={{ height }}
      >
        No activity in the last 30 days.
      </div>
    );
  }

  const W = 600;
  const H = height;
  const pad = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const barGap = 2;
  const barW = (innerW - barGap * (days.length - 1)) / days.length;

  return (
    <div className="rounded-lg border border-app-border bg-app p-3 overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Daily activity for the last 30 days"
      >
        {/* baseline */}
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={H - pad.bottom}
          y2={H - pad.bottom}
          stroke="#27272a"
          strokeWidth="1"
        />
        {days.map((d, i) => {
          const total = d.proxyRequests + d.extSessions;
          const totalH = (total / max) * innerH;
          const proxyH = (d.proxyRequests / max) * innerH;
          const extH = (d.extSessions / max) * innerH;
          const x = pad.left + i * (barW + barGap);
          const yTop = H - pad.bottom - totalH;
          return (
            <g key={d.day}>
              {/* extension on bottom, proxy stacked on top */}
              {d.extSessions > 0 && (
                <rect
                  x={x}
                  y={H - pad.bottom - extH}
                  width={barW}
                  height={extH}
                  fill={extColor}
                  rx={1}
                >
                  <title>
                    {d.day}: {d.extSessions} extension session
                    {d.extSessions === 1 ? '' : 's'}
                  </title>
                </rect>
              )}
              {d.proxyRequests > 0 && (
                <rect
                  x={x}
                  y={yTop}
                  width={barW}
                  height={proxyH}
                  fill={proxyColor}
                  rx={1}
                >
                  <title>
                    {d.day}: {d.proxyRequests} hub request
                    {d.proxyRequests === 1 ? '' : 's'}
                  </title>
                </rect>
              )}
            </g>
          );
        })}
        {/* x-axis labels: first, middle, last */}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text
            key={i}
            x={pad.left + i * (barW + barGap) + barW / 2}
            y={H - 6}
            fontSize="10"
            fill="#71717a"
            textAnchor="middle"
          >
            {days[i].day.slice(5)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-fg-muted">
        <Legend color={proxyColor} label="Hub requests" />
        <Legend color={extColor} label="Extension sessions" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function buildLast30(data: DailyPoint[]): DailyPoint[] {
  const byDay = new Map(data.map((d) => [d.day, d]));
  const out: DailyPoint[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(key) ?? { day: key, proxyRequests: 0, extSessions: 0 });
  }
  return out;
}
