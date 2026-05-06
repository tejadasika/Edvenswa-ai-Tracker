import { NextRequest, NextResponse } from 'next/server';
import { authenticateExtensionRequest } from '@/lib/extension-auth';
import { preflight, withCors } from '@/lib/cors';

export const runtime = 'nodejs';
export const OPTIONS = preflight;

// POST /api/extension/ping
// Headers:  Authorization: Bearer <extension_token>
//
// Lightweight liveness check the extension calls on its 1-minute alarm when
// it has no events to flush. Lets the extension detect token revocation
// performed from another browser/window even while idle — without it, a
// revoked install stays "configured" until the user next visits an AI site.
//
// 200 → token still valid; 401 → background clears token and pauses.
export async function POST(req: NextRequest) {
  const auth = await authenticateExtensionRequest(req);
  if (!auth) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }
  return withCors(req, NextResponse.json({ ok: true }));
}
