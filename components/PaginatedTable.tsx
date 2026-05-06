'use client';
// Wraps a table with client-side pagination. Caller passes pre-rendered
// <thead> and an array of pre-rendered <tr> rows so the existing column
// markup stays intact — we just slice and add prev/next controls.

import { ReactElement, ReactNode, useState } from 'react';

export default function PaginatedTable({
  thead,
  rows,
  pageSize = 10,
  emptyColSpan,
  emptyMessage = 'No data.',
  className = 'w-full text-sm border border-app-border rounded-md overflow-hidden',
}: {
  thead: ReactNode;
  rows: ReactElement[];
  pageSize?: number;
  emptyColSpan: number;
  emptyMessage?: ReactNode;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const slice = rows.slice(start, start + pageSize);

  return (
    <div>
      <table className={className}>
        {thead}
        <tbody>
          {total === 0 ? (
            <tr>
              <td colSpan={emptyColSpan} className="px-3 py-8 text-center text-fg-faint">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            slice
          )}
        </tbody>
      </table>
      {total > pageSize && (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-fg-muted">
          <span>
            {start + 1}–{Math.min(start + pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="rounded border border-app-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
              aria-label="First page"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded border border-app-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="px-2 tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded border border-app-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
              aria-label="Next page"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setPage(pageCount - 1)}
              disabled={safePage >= pageCount - 1}
              className="rounded border border-app-border bg-surface px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
              aria-label="Last page"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
