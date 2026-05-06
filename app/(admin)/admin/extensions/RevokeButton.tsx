'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RevokeButton({ tokenId }: { tokenId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function revoke() {
    if (!confirm('Revoke this extension token? The browser using it will stop reporting.')) {
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/admin/extension-tokens/${tokenId}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) {
      setErr(`HTTP ${r.status}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={revoke}
        disabled={busy}
        className="rounded border border-red-900 bg-red-950/40 px-2 py-1 text-xs text-red-300 hover:bg-red-950/70 disabled:opacity-50"
      >
        {busy ? 'Revoking…' : 'Revoke'}
      </button>
      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  );
}
