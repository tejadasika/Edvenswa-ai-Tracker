'use client';
import { useState } from 'react';

export default function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch('/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'logout' }),
          });
        } finally {
          // Hard navigation so the cleared session is read fresh on /.
          location.href = '/';
        }
      }}
      className="w-full rounded-md border border-app-border px-3 py-2 text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
