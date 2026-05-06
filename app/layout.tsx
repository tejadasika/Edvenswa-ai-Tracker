import './globals.css';
import { cookies } from 'next/headers';

export const metadata = {
  title: 'Edvenswa AI Tracker',
  description: 'Track time and topics across third-party AI sites with the browser extension.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme is sticky via the 'theme' cookie. Reading it server-side here
  // means the rendered HTML already has the right [data-theme] attribute,
  // so there's no flash of the wrong theme on first paint.
  const theme = cookies().get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang="en" data-theme={theme}>
      <body className="bg-app text-fg antialiased">{children}</body>
    </html>
  );
}
