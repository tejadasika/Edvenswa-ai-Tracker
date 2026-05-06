import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { adminScope, requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';

// PATCH /api/admin/users/[id] — change a member's role.
//   Body: { role: 'user' | 'admin' }
// DELETE /api/admin/users/[id] — remove a member from the org.
//
// Tenant guard: a regular admin can only act on members whose org_id matches
// their own. super_admin can act on anyone (except other super_admins).
// Self-modification is rejected — admins must use a separate flow if they
// want to demote/remove themselves, to avoid accidentally locking out the
// last admin in an org.

async function authorize(req: NextRequest, targetId: string) {
  const session = await requireAdmin();
  const scope = adminScope(session);
  if (!scope) {
    return { error: NextResponse.json({ error: 'No org on this account' }, { status: 400 }) };
  }
  if (targetId === session.userId) {
    return {
      error: NextResponse.json(
        { error: "You can't modify your own account from here." },
        { status: 400 },
      ),
    };
  }

  const r = await query<{ id: string; role: string; org_id: string | null }>(
    'SELECT id::text, role, org_id::text FROM users WHERE id = $1',
    [targetId],
  );
  if (r.rowCount === 0) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }
  const target = r.rows[0];

  // super_admin records are off-limits from the API (DB-grant only).
  if (target.role === 'super_admin') {
    return {
      error: NextResponse.json(
        { error: 'super_admin accounts cannot be modified here.' },
        { status: 403 },
      ),
    };
  }

  if (!('all' in scope)) {
    if (target.org_id !== scope.orgId) {
      return { error: NextResponse.json({ error: 'Not in your organization' }, { status: 404 }) };
    }
  }

  return { session, target };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req, id);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const role = body?.role;
  if (role !== 'user' && role !== 'admin') {
    return NextResponse.json({ error: 'role must be "user" or "admin"' }, { status: 400 });
  }

  await query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
  return NextResponse.json({ ok: true, role });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req, id);
  if ('error' in auth) return auth.error;

  // ON DELETE CASCADE on users → deletes all their usage_analytics and
  // extension_tokens. This is destructive — confirmed via UI prompt before
  // reaching here.
  await query(`DELETE FROM users WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
