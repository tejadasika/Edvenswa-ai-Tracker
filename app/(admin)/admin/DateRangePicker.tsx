'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

// Two date inputs + Apply. On submit, navigates with ?from=YYYY-MM-DD&to=YYYY-MM-DD
// and preserves any other existing search params (e.g. tab).
export default function DateRangePicker({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function apply(nextF: string, nextT: string) {
    const sp = new URLSearchParams(params?.toString() ?? '');
    sp.set('from', nextF);
    sp.set('to', nextT);
    router.push(`?${sp.toString()}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const nextF = start.toISOString().slice(0, 10);
    const nextT = end.toISOString().slice(0, 10);
    setF(nextF);
    setT(nextT);
    apply(nextF, nextT);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply(f, t);
      }}
    >
      <div className="flex items-center gap-1 text-xs text-fg-muted">
        <label htmlFor="from" className="sr-only">From</label>
        <input
          id="from"
          type="date"
          value={f}
          max={t}
          onChange={(e) => setF(e.target.value)}
          className="rounded border border-app-border bg-surface px-2 py-1 text-xs text-fg"
        />
        <span>→</span>
        <label htmlFor="to" className="sr-only">To</label>
        <input
          id="to"
          type="date"
          value={t}
          min={f}
          onChange={(e) => setT(e.target.value)}
          className="rounded border border-app-border bg-surface px-2 py-1 text-xs text-fg"
        />
      </div>
      <button
        type="submit"
        className="rounded border border-app-border bg-surface px-2.5 py-1 text-xs text-fg hover:bg-surface-2"
      >
        Apply
      </button>
      <div className="flex gap-1 ml-1">
        {[
          { label: '7d', days: 7 },
          { label: '30d', days: 30 },
          { label: '90d', days: 90 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => preset(p.days)}
            className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface hover:text-fg"
          >
            {p.label}
          </button>
        ))}
      </div>
    </form>
  );
}
