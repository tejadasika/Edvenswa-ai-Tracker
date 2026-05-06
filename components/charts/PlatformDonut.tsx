// Donut chart for "share of activity by AI platform". Pure SVG.
// Inputs are arbitrary buckets (any unit — requests, seconds, whatever),
// caller decides what numerator/denominator semantically mean.

type Slice = { label: string; value: number };

const PALETTE = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
];

export default function PlatformDonut({
  slices,
  size = 180,
  thickness = 28,
  unit = '',
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  unit?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);

  if (total === 0) {
    return (
      <div
        className="rounded-lg border border-app-border flex items-center justify-center text-sm text-fg-faint"
        style={{ height: size + 32, width: size + 200 }}
      >
        No data yet.
      </div>
    );
  }

  const r = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  let offset = 0;
  const segments = slices.map((s, i) => {
    const frac = s.value / total;
    const len = frac * C;
    const seg = {
      ...s,
      color: PALETTE[i % PALETTE.length],
      // strokeDasharray with two values: visible length, then a gap of
      // (C - visible). strokeDashoffset rotates each segment to its slot.
      dasharray: `${len} ${C - len}`,
      dashoffset: -offset,
      pct: frac * 100,
    };
    offset += len;
    return seg;
  });

  return (
    <div className="rounded-lg border border-app-border bg-app p-3 flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#1f1f23"
          strokeWidth={thickness}
        />
        {/* rotate -90deg so the first segment starts at 12 o'clock */}
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {segments.map((seg) => (
            <circle
              key={seg.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={seg.dasharray}
              strokeDashoffset={seg.dashoffset}
            >
              <title>
                {seg.label}: {seg.value.toLocaleString()}
                {unit && ` ${unit}`} ({seg.pct.toFixed(1)}%)
              </title>
            </circle>
          ))}
        </g>
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="10"
          fill="#71717a"
        >
          total
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          fill="#e4e4e7"
        >
          {total.toLocaleString()}
        </text>
      </svg>
      <ul className="text-xs space-y-1.5">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-fg capitalize">{seg.label}</span>
            <span className="text-fg-faint">
              {seg.value.toLocaleString()}
              {unit && ` ${unit}`}
            </span>
            <span className="text-fg-faint">· {seg.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
