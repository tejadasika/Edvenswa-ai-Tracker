import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';

// DELETE /api/admin/extension-tokens/:id
// Admin-scoped revoke. The token's owner must belong to the admin's org —
// the JOIN clause enforces that, so an admin can't revoke tokens in other orgs
// even if they guess a token UUID.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let s;
  try {
    s = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  // super_admin can revoke any token; regular admin only tokens in their own org.
  let r;
  if (s.role === 'super_admin') {
    r = await query(
      `UPDATE extension_tokens
          SET revoked_at = now()
        WHERE id = $1 AND revoked_at IS NULL`,
      [params.id],
    );
  } else {
    if (!s.orgId) {
      return NextResponse.json({ error: 'no organization' }, { status: 400 });
    }
    r = await query(
      `UPDATE extension_tokens et
          SET revoked_at = now()
         FROM users u
        WHERE et.id = $1
          AND et.user_id = u.id
          AND u.org_id  = $2
          AND et.revoked_at IS NULL`,
      [params.id, s.orgId],
    );
  }
  if (r.rowCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
