'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Org = { id: string; name: string };

// Sidebar control visible only to super_admin. Lets them pick which org's
// data the rest of the admin pages should show. The selection is carried
// in the URL as `?org=<id>` (or `?org=all`), so it survives navigation,
// reloads, and shareable links — no server state, no cookie.
//
// On change we preserve the rest of the current querystring (e.g. ?view=hub,
// ?from=/?to=) so changing org doesn't reset filters the user already set.
export default function OrgSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('org') ?? 'all';

  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/organizations');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        setOrgs(j.organizations ?? []);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('org');
    else params.set('org', next);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}`);
  }

  return (
    <div className="px-3 py-2 mb-2 rounded-md border border-app-border bg-surface-2">
      <div className="text-xs text-fg-faint mb-1">Viewing organization</div>
      <select
        value={current}
        onChange={onChange}
        disabled={!orgs}
        className="w-full rounded border border-app-border bg-app px-2 py-1 text-sm text-fg disabled:opacity-50"
      >
        <option value="all">All organizations</option>
        {orgs?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[10px] text-red-400">Failed: {error}</p>}
    </div>
  );
}
