import { NextRequest, NextResponse } from 'next/server';

// CORS for the extension ingest endpoint. Locked to extension origins only —
// chrome-extension:// and moz-extension:// — never `*`. Web pages cannot send
// extension events.
//
// Why this exists: Next.js' default response has no CORS headers. From a
// Chrome MV3 service worker, fetch() respects CORS, so the browser blocks
// the response and the extension sees "Failed to fetch" even though the
// server replied (typically with 401 from authenticateExtensionRequest).
function isExtensionOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!isExtensionOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}

// Preflight handler — every route that uses POST from an extension must export
// `export const OPTIONS = preflight` so the browser's preflight succeeds.
export function preflight(req: NextRequest): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
