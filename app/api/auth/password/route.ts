import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

// POST /api/auth/password
// Body: { currentPassword: string, newPassword: string }
//
// Requires the caller to know their current password — this is a self-service
// password change, not an admin reset. (Admin reset path is the CLI script
// scripts/promote-admin.mjs --reset-password, which doesn't require knowing
// the current password since it runs against the DB directly.)
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!current || !next) {
    return NextResponse.json(
      { error: 'currentPassword and newPassword required' },
      { status: 400 },
    );
  }
  if (next.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters' },
      { status: 400 },
    );
  }
  if (next === current) {
    return NextResponse.json(
      { error: 'New password must differ from current password' },
      { status: 400 },
    );
  }

  const r = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [s.userId],
  );
  if (r.rowCount === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const ok = await bcrypt.compare(current, r.rows[0].password_hash);
  if (!ok) {
    // Generic 401 — don't leak whether the user exists vs the password is wrong.
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  const newHash = await bcrypt.hash(next, 10);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, s.userId]);

  return NextResponse.json({ ok: true });
}
