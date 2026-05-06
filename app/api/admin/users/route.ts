import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';

// POST /api/admin/users
// Admin-only endpoint to add an employee/user to the admin's own organization.
// Distinct from POST /api/auth (signup), which always creates a NEW org with
// the signing-up user as its admin owner.
//
// Body: { email, password, name?, role? }
//   role defaults to 'user' (employee). 'admin' is allowed so an admin can
//   promote a co-admin in their own org. 'super_admin' is rejected — that's
//   reserved for direct DB grants.
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const requestedRole = typeof body?.role === 'string' ? body.role : 'user';
  const requestedOrgId = typeof body?.org_id === 'string' ? body.org_id : null;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }
  if (requestedRole !== 'user' && requestedRole !== 'admin') {
    return NextResponse.json({ error: 'role must be "user" or "admin"' }, { status: 400 });
  }

  // Tenant scoping for the target org:
  //  - regular admin   → must add into their own org; org_id in body is ignored.
  //  - super_admin     → may target any org via body.org_id; falls back to
  //                      their own org if they happen to belong to one.
  let targetOrgId: string | null;
  if (session.role === 'super_admin') {
    targetOrgId = requestedOrgId ?? session.orgId ?? null;
    if (!targetOrgId) {
      return NextResponse.json(
        { error: 'org_id required when super_admin has no personal org' },
        { status: 400 },
      );
    }
    // Verify the target org actually exists. Without this, a typo'd UUID
    // would silently create an orphan user with a dangling org_id.
    const o = await query(`SELECT 1 FROM organizations WHERE id = $1`, [targetOrgId]);
    if (o.rowCount === 0) {
      return NextResponse.json({ error: 'organization not found' }, { status: 404 });
    }
  } else {
    if (!session.orgId) {
      return NextResponse.json(
        { error: 'Your account has no organization, cannot add members.' },
        { status: 400 },
      );
    }
    targetOrgId = session.orgId;
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const r = await query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, org_id, role)
       VALUES ($1, NULLIF($2,''), $3, $4, $5)
       RETURNING id::text`,
      [email, name, hash, targetOrgId, requestedRole],
    );
    return NextResponse.json({ id: r.rows[0].id, email, role: requestedRole, org_id: targetOrgId });
  } catch (e: any) {
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    throw e;
  }
}
