'use client';
import { useState } from 'react';
import { Spinner } from '@/components/Spinner';

// Validate that a `next` param refers to a path within this app — not an
// external URL. Returning a same-origin redirect target avoids "open redirect"
// abuse where a phisher gets us to bounce users to attacker.com after login.
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}

export default function LandingForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, email, password, name }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? 'Failed');
        return;
      }
      // If we were sent here from a guarded route (e.g. /extension/connect),
      // honor the `?next=` param so the user lands back where they started.
      // Default to /extension-activity for normal sign-in.
      const nextParam =
        typeof window !== 'undefined'
          ? safeNext(new URLSearchParams(window.location.search).get('next'))
          : null;
      location.href = nextParam ?? '/extension-activity';
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-app text-fg">
      <div className="w-full max-w-sm rounded-lg border border-app-border bg-surface p-6 space-y-4">
        <h1 className="text-xl font-semibold">Edvenswa AI Tracker</h1>
        <div className="text-xs text-fg-faint">
          Track time and topics across third-party AI sites with the browser extension.
        </div>
        {mode === 'signup' && (
          <div className="rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-200/90">
            Signing up creates a new organization with you as the <strong>admin</strong>.
            To join an existing organization as an employee, ask your admin to add you
            from the Members page.
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text" placeholder="Your name" required
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-app border border-app-border rounded px-3 py-2 text-sm"
            />
          )}
          <input
            type="email" placeholder="Email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-app border border-app-border rounded px-3 py-2 text-sm"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password" required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-app border border-app-border rounded px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-fg-faint hover:text-fg"
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {err && <div className="text-rose-400 text-sm">{err}</div>}
          <button
            disabled={submitting}
            className="flex items-center justify-center gap-2 w-full rounded border border-app-border-strong hover:bg-surface-2 disabled:opacity-50 px-4 py-2 text-sm font-medium"
          >
            {submitting && <Spinner size={14} />}
            {submitting
              ? mode === 'login' ? 'Signing in…' : 'Creating account…'
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="w-full text-xs text-fg-muted hover:text-fg"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
