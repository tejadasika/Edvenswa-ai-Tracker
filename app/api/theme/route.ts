import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// POST /api/theme  body: { theme: 'light' | 'dark' }
// Stores the chosen theme in a cookie. Read server-side in app/layout.tsx
// so SSR renders the right [data-theme] without flashing the wrong colors.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const theme = body?.theme === 'light' ? 'light' : 'dark';
  const res = NextResponse.json({ ok: true, theme });
  res.cookies.set('theme', theme, {
    path: '/',
    httpOnly: false,             // client may read it for instant toggling
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,  // 1 year
  });
  return res;
}
