'use client';
import { useEffect, useState } from 'react';

// Tiny client island: reads the current [data-theme] from <html> on mount,
// flips it on click, and persists the choice via /api/theme so SSR picks it
// up on the next page load. We update the DOM optimistically so the swap
// feels instant; the cookie POST runs in the background.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light' || current === 'dark') setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      // Cookie write failed — DOM is updated, next reload will revert,
      // not worth surfacing an error UI for a theme preference.
    });
  }

  return (
    <button
      onClick={toggle}
      className="w-full rounded-md border border-app-border px-3 py-2 text-xs text-fg-muted hover:bg-surface-2"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
