import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateExtensionToken } from '@/lib/extension-auth';

export const runtime = 'nodejs';

// GET — list this user's extension tokens (metadata only; plaintext is never recoverable).
export async function GET() {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await query<{
    id: string;
    label: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>(
    `SELECT id::text, label, created_at, last_used_at, revoked_at
       FROM extension_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [s.userId],
  );
  return NextResponse.json({ tokens: r.rows });
}

// POST — issue a new token. Plaintext is returned ONCE in the response;
// the server stores only its sha256.
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === 'string' && body.label.trim()
    ? body.label.trim().slice(0, 64)
    : 'browser';

  const { plaintext, hash } = generateExtensionToken();
  const r = await query<{ id: string }>(
    `INSERT INTO extension_tokens (user_id, org_id, token_hash, label)
     VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [s.userId, s.orgId ?? null, hash, label],
  );

  return NextResponse.json({
    id: r.rows[0].id,
    label,
    token: plaintext,
    notice: 'Save this token now. It will not be shown again.',
  });
}

// DELETE ?id=<token_id> — revoke. Soft-delete via revoked_at so audit trail remains.
export async function DELETE(req: NextRequest) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const r = await query(
    `UPDATE extension_tokens
        SET revoked_at = now()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, s.userId],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
