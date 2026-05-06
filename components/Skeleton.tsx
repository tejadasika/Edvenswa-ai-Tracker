// Skeleton building blocks. The base <Skeleton/> is a single pulsing block
// styled in theme tokens (so it works in both dark and light themes without
// extra CSS). Page-level layouts compose it into shapes that approximate the
// real content — the goal isn't pixel-perfect, just "this region will become
// a card / a chart / a row" so the user sees stable layout, not a spinner.

export function Skeleton({
  className = '',
  height,
  width,
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
}) {
  const style: React.CSSProperties = {};
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-surface-2 ${className}`}
      style={style}
    />
  );
}

// A horizontal row of cards, used by the dashboard summary block.
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-app-border bg-surface px-4 py-3">
          <Skeleton height={12} width="40%" className="mb-2" />
          <Skeleton height={20} width="65%" />
        </div>
      ))}
    </div>
  );
}

// A table-shaped skeleton for list pages (ledger, users, etc.).
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-md border border-app-border overflow-hidden">
      <div className="bg-surface px-3 py-2 grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={12} className="opacity-60" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="border-t border-app-border px-3 py-3 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '70%' : '55%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Approximation of a chart card — a header row + a tall block.
export function SkeletonChart({ height = 220 }: { height?: number }) {
  return (
    <div className="rounded-md border border-app-border bg-surface p-3 space-y-3">
      <Skeleton height={12} width="35%" />
      <Skeleton height={height} />
    </div>
  );
}

// Generic page-shell skeleton: header + cards + chart + table.
// Used by the route-level loading.tsx files so navigations show a stable
// skeleton until the server-rendered page streams in.
export function PageSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <Skeleton height={28} width={220} />
        <Skeleton height={14} width={360} />
      </div>
      <SkeletonStatCards count={4} />
      <SkeletonChart height={200} />
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
