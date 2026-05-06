import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';

// Organizations management — super_admin only.
//
// GET   list all orgs with member count.
// POST  create a new org. Body: { name }.
//
// Regular admins are scoped to their own org and don't need this endpoint —
// they can't see other orgs or create new ones.

async function requireSuperAdmin() {
  const s = await requireAdmin();
  if (s.role !== 'super_admin') {
    throw new Response('super_admin required', { status: 403 });
  }
  return s;
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const r = await query<{
    id: string;
    name: string;
    created_at: string;
    member_count: number;
    admin_count: number;
  }>(
    `SELECT o.id::text, o.name, o.created_at,
            COALESCE(c.member_count, 0)::int AS member_count,
            COALESCE(c.admin_count, 0)::int AS admin_count
       FROM organizations o
  LEFT JOIN (
       SELECT org_id,
              COUNT(*) AS member_count,
              COUNT(*) FILTER (WHERE role IN ('admin','super_admin')) AS admin_count
         FROM users
        WHERE org_id IS NOT NULL
     GROUP BY org_id
  ) c ON c.org_id = o.id
   ORDER BY o.created_at DESC`,
  );

  return NextResponse.json({ organizations: r.rows });
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 128) : '';
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const r = await query<{ id: string }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id::text`,
    [name],
  );
  return NextResponse.json({ id: r.rows[0].id, name });
}
