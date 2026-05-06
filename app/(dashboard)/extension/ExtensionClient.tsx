'use client';
import { useState } from 'react';
import PaginatedTable from '@/components/PaginatedTable';

type Token = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function fmtRelative(ts: string | null): string {
  if (!ts) return 'never';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function ExtensionClient({
  initialTokens,
  browserSummary,
}: {
  initialTokens: Token[];
  browserSummary: string[];
}) {
  const [tokens, setTokens] = useState<Token[]>(initialTokens);
  const [label, setLabel] = useState('my browser');
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The plaintext token returned from POST is held in state ONLY for this
  // render. As soon as the user dismisses the reveal panel it's gone. We
  // never persist it client-side and never re-fetch it (the server can't
  // recover it either — only sha256 is stored).
  const [revealed, setRevealed] = useState<{ token: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const r = await fetch('/api/extension/tokens');
    if (!r.ok) return;
    const j = await r.json();
    setTokens(
      (j.tokens ?? []).map((t: any) => ({
        id: t.id,
        label: t.label,
        createdAt: t.created_at,
        lastUsedAt: t.last_used_at,
        revokedAt: t.revoked_at,
      })),
    );
  }

  async function issue() {
    setIssuing(true);
    setError(null);
    try {
      const r = await fetch('/api/extension/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || 'my browser' }),
      });
      if (!r.ok) {
        setError(`Failed (HTTP ${r.status})`);
        return;
      }
      const j = await r.json();
      setRevealed({ token: j.token, label: j.label });
      setCopied(false);
      await refresh();
    } finally {
      setIssuing(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard blocked — select the token and copy manually.');
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? The browser using it will stop reporting.')) return;
    const r = await fetch(`/api/extension/tokens?id=${id}`, { method: 'DELETE' });
    if (!r.ok) {
      setError(`Revoke failed (HTTP ${r.status})`);
      return;
    }
    await refresh();
  }

  function browserFromLabel(label: string): string | null {
    const match = label.match(/^auto:[0-9a-f]+(?::([a-z0-9_-]+))?$/i);
    return match?.[1] ?? null;
  }

  function formatTokenLabel(label: string): string {
    return /^auto:[0-9a-f]+(?::[a-z0-9_-]+)?$/i.test(label) ? 'Auto token' : label;
  }

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/edven-image.png"
            alt="Edven logo"
            className="h-10 w-10 rounded-full object-cover"
          />
          <div>
            <h1 className="text-2xl font-semibold">Browser Extension</h1>
            <p className="text-sm text-fg-faint">
              Install the Edvenswa AI Tracker extension, then click the switch in the extension
              popup to connect — no token copy-paste needed.
            </p>
          </div>
        </div>
        {browserSummary.length > 0 ? (
          <p className="text-sm text-fg-muted">
            Browsers reporting: {browserSummary.map((b) => b.toLowerCase()).join(', ')}
          </p>
        ) : null}
      </header>

      <section className="rounded-md border border-app-border bg-surface/40 p-4 text-xs text-fg-muted space-y-1">
        <p className="font-medium text-fg-muted">How to connect</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Install the Edvenswa AI Tracker extension.</li>
          <li>Make sure you&apos;re signed in here on this browser.</li>
          <li>Click the extension&apos;s toolbar icon and flip <strong>Tracking</strong> on.</li>
        </ol>
        <p className="pt-1">
          The extension opens a one-time tab here, this page issues a token, hands it to the
          extension, and closes itself. You never see the token.
        </p>
      </section>

      <section className="rounded-md border border-app-border bg-surface/50 p-4">
        <h2 className="text-sm font-medium text-fg mb-1">Manual token (advanced)</h2>
        <p className="text-xs text-fg-muted mb-3">
          For browsers where the popup switch can&apos;t reach this site (Firefox, or a different
          machine). Issue a token, then paste it into the extension&apos;s Options page.
        </p>
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. work laptop)"
            maxLength={64}
            className="flex-1 rounded-md border border-app-border bg-app px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-indigo-700"
          />
          <button
            onClick={issue}
            disabled={issuing}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {issuing ? 'Issuing…' : 'Issue token'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </section>

      {revealed && (
        <section className="rounded-md border border-amber-900/60 bg-amber-950/20 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-amber-200">
                Copy your token now
              </h2>
              <p className="mt-1 text-xs text-amber-300/80">
                This is the only time it will be shown. We store only its hash —
                if you lose it, issue a new one.
              </p>
            </div>
            <button
              onClick={() => setRevealed(null)}
              className="text-xs text-amber-400/70 hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <code className="flex-1 select-all rounded bg-app border border-app-border px-3 py-2 text-xs font-mono text-amber-200 break-all">
              {revealed.token}
            </code>
            <button
              onClick={copy}
              className="rounded-md border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-950/70"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <ol className="mt-4 text-xs text-amber-200/80 list-decimal pl-4 space-y-1">
            <li>Open the Edvenswa AI Tracker extension&apos;s Options page (right-click the toolbar icon → Options).</li>
            <li>Set Server URL to <code className="rounded bg-black/40 px-1">{typeof window !== 'undefined' ? window.location.origin : ''}</code>.</li>
            <li>Paste the token above into the Extension token field and click Save.</li>
          </ol>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-fg-muted mb-2">Your tokens</h2>
        <PaginatedTable
          pageSize={10}
          emptyColSpan={6}
          emptyMessage="No tokens yet. Connect from the extension popup or issue one above."
          thead={
            <thead className="bg-surface text-fg-muted">
              <tr>
                <th className="text-left px-3 py-2">Label</th>
                <th className="text-left px-3 py-2">Browser</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Last reported</th>
                <th className="text-left px-3 py-2">Issued</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
          }
          rows={tokens.map((t) => {
            const isRevoked = Boolean(t.revokedAt);
            const browser = browserFromLabel(t.label);
            return (
              <tr key={t.id} className="border-t border-app-border">
                <td className="px-3 py-2 text-fg">{formatTokenLabel(t.label)}</td>
                <td className="px-3 py-2 text-fg-muted capitalize">
                  {browser ?? <span className="text-fg-faint">—</span>}
                </td>
                <td className="px-3 py-2">
                  {isRevoked ? (
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                      revoked
                    </span>
                  ) : t.lastUsedAt ? (
                    <span className="rounded pill-success px-2 py-0.5 text-xs">
                      active
                    </span>
                  ) : (
                    <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">
                      not connected
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-fg-muted">{fmtRelative(t.lastUsedAt)}</td>
                <td className="px-3 py-2 text-fg-muted">
                  {new Date(t.createdAt).toISOString().slice(0, 10)}
                </td>
                <td className="px-3 py-2 text-right">
                  {!isRevoked && (
                    <button
                      onClick={() => revoke(t.id)}
                      className="rounded border border-red-900 bg-red-950/40 px-2 py-1 text-xs text-red-300 hover:bg-red-950/70"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        />
      </section>

      <section className="rounded-md border border-app-border bg-surface/40 p-4 text-xs text-fg-muted space-y-1">
        <p className="font-medium text-fg-muted">How tracking works</p>
        <p>
          The extension records foreground time on supported AI sites (ChatGPT, Claude, Gemini,
          Perplexity, Copilot, DeepSeek). It never reads your prompts or page content.
        </p>
        <p>
          You can pause tracking from the extension&apos;s toolbar popup at any time, or revoke the
          token here to stop reporting entirely.
        </p>
      </section>
    </div>
  );
}
