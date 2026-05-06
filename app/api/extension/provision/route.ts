import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateExtensionToken } from '@/lib/extension-auth';
import { preflight, withCors } from '@/lib/cors';

export const runtime = 'nodejs';
export const OPTIONS = preflight;

// Auto-provisioning endpoint used by the dashboard's tracking switch.
//
// Distinct from /api/extension/tokens (manual issuance for power users).
// One auto-provisioned token PER device per user. The token is labeled
// `auto:<deviceHash>` so connecting browser B doesn't revoke browser A's
// token. If no deviceHash is provided (older extension build), we fall back
// to the legacy single-slot label so existing installs keep working.

const LEGACY_LABEL = 'auto-provisioned';

function labelPrefix(deviceHash: string | null): string {
  if (!deviceHash) return LEGACY_LABEL;
  return `auto:${deviceHash}`;
}

function labelFor(deviceHash: string | null, browser: string | null): string {
  if (!deviceHash) return LEGACY_LABEL;
  if (!browser) return `auto:${deviceHash}`;
  return `auto:${deviceHash}:${browser}`;
}

function asDeviceHash(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, 128);
}

function sanitizeBrowser(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const normalized = v.trim().toLowerCase();
  if (!normalized) return null;
  // Allow lowercase letters, numbers, underscore, and hyphen
  if (!/^[a-z0-9_\-]{1,32}$/.test(normalized)) {
    console.log(`[sanitizeBrowser] rejected: "${normalized}"`);
    return null;
  }
  return normalized;
}

async function readProvisionBody(req: NextRequest): Promise<{
  deviceHash: string | null;
  browser: string | null;
}> {
  try {
    const body = await req.json();
    console.log(`[readProvisionBody] raw body:`, JSON.stringify(body));
    const deviceHash = asDeviceHash(body?.deviceHash);
    const browser = sanitizeBrowser(body?.browser);
    console.log(`[readProvisionBody] parsed deviceHash=${deviceHash} browser=${browser}`);
    return { deviceHash, browser };
  } catch (err) {
    console.error(`[readProvisionBody] error parsing body:`, err);
    return { deviceHash: null, browser: null };
  }
}

// POST — revoke this device's existing auto token (if any), issue a new one,
// return plaintext. The dashboard immediately ships this to the extension.
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { deviceHash, browser } = await readProvisionBody(req);
  console.log(`[provision] user=${s.userId} deviceHash=${deviceHash} browser=${browser}`);
  const label = labelFor(deviceHash, browser);
  console.log(`[provision] label="${label}"`);
  const revokeFilter = deviceHash ? `${labelPrefix(deviceHash)}%` : label;
  console.log(`[provision] revoking with filter="${revokeFilter}"`);

  const revokeResult = await query(
    `UPDATE extension_tokens
        SET revoked_at = now()
      WHERE user_id = $1 AND label LIKE $2 AND revoked_at IS NULL`,
    [s.userId, revokeFilter],
  );
  console.log(`[provision] revoked ${revokeResult.rowCount ?? 0} tokens`);

  const { plaintext, hash } = generateExtensionToken();
  const r = await query<{ id: string }>(
    `INSERT INTO extension_tokens (user_id, org_id, token_hash, label)
     VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [s.userId, s.orgId ?? null, hash, label],
  );
  console.log(`[provision] created token id=${r.rows[0].id} label="${label}"`);

  const proto = (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_ORIGIN) || '';
  const serverUrl = host || `${proto}://localhost:3000`;

  const response = NextResponse.json({
    id: r.rows[0].id,
    token: plaintext,
    serverUrl,
  });
  return withCors(req, response);
}

// DELETE — revoke this device's auto-provisioned token only. Other devices'
// tokens, and any manually-issued tokens (other labels), are not touched.
export async function DELETE(req: NextRequest) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { deviceHash } = await readProvisionBody(req);
  const revokeFilter = deviceHash ? `${labelPrefix(deviceHash)}%` : LEGACY_LABEL;

  const r = await query(
    `UPDATE extension_tokens
        SET revoked_at = now()
      WHERE user_id = $1 AND label LIKE $2 AND revoked_at IS NULL`,
    [s.userId, revokeFilter],
  );
  const response = NextResponse.json({ ok: true, revoked: r.rowCount ?? 0 });
  return withCors(req, response);
}

// GET — does this user have ANY active auto-provisioned token (any device)?
// Used by the dashboard to render the switch's initial position. Per-device
// state isn't surfaced here yet; the switch reflects "tracking is on somewhere."
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await query<{ id: string; last_used_at: string | null }>(
    `SELECT id::text, last_used_at FROM extension_tokens
      WHERE user_id = $1
        AND (label = $2 OR label LIKE 'auto:%')
        AND revoked_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [s.userId, LEGACY_LABEL],
  );
  if (r.rowCount === 0) return NextResponse.json({ active: false });
  const response = NextResponse.json({
    active: true,
    lastUsedAt: r.rows[0].last_used_at,
  });
  return withCors(req, response);
}
