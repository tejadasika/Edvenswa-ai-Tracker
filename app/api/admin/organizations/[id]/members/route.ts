import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';

// GET /api/admin/organizations/[id]/members
// Returns the user list for one org. super_admin can request any org;
// regular admin can only request their own.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireAdmin();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await params;
  if (session.role !== 'super_admin' && session.orgId !== id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const r = await query<{
    id: string;
    email: string;
    name: string | null;
    role: 'user' | 'admin' | 'super_admin';
    created_at: string;
  }>(
    `SELECT id::text, email, name, role, created_at
       FROM users
      WHERE org_id = $1
   ORDER BY role DESC, created_at`,
    [id],
  );

  return NextResponse.json({ members: r.rows });
}
