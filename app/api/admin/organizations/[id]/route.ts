import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';

// DELETE /api/admin/organizations/[id] — remove an empty organization.
// Refused if the org has any members. super_admin only.

async function requireSuperAdmin() {
  const s = await requireAdmin();
  if (s.role !== 'super_admin') {
    throw new Response('super_admin required', { status: 403 });
  }
  return s;
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const { id } = await params;

  const m = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users WHERE org_id = $1`,
    [id],
  );
  if ((m.rows[0]?.n ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Organization still has members. Move or remove them first.' },
      { status: 400 },
    );
  }

  const r = await query(`DELETE FROM organizations WHERE id = $1`, [id]);
  if (r.rowCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
