import type { Config } from 'tailwindcss';

// Tokenized colors. Components use semantic class names (bg-app, text-fg,
// border-app, etc.) which resolve to the CSS variables defined in
// app/globals.css. Theme switching is just toggling [data-theme] on <html>.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'var(--color-app-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'app-border': 'var(--color-border)',
        'app-border-strong': 'var(--color-border-strong)',
        fg: 'var(--color-fg)',
        'fg-muted': 'var(--color-fg-muted)',
        'fg-faint': 'var(--color-fg-faint)',
        accent: 'var(--color-accent)',
        'accent-fg': 'var(--color-accent-fg)',
        'accent-soft': 'var(--color-accent-soft)',
        success: 'var(--color-success-fg)',
        warn: 'var(--color-warn-fg)',
        danger: 'var(--color-danger-fg)',
      },
      fontFamily: {
        sans: ['Consolas', '"Courier New"', 'monospace'],
        mono: ['Consolas', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
