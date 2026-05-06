import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, pool } from '@/lib/db';
import { getLegacySession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { mode, email, password, name } = await req.json();
  const session = await getLegacySession();

  if (mode === 'logout') {
    session.destroy();
    return NextResponse.json({ ok: true });
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  if (mode === 'signup') {
    const hash = await bcrypt.hash(password, 10);
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    // Org + user are inserted in a single transaction. Without this, a
    // duplicate-email failure on the user insert would leave an orphaned
    // organization row behind on every retry.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const org = await client.query<{ id: string }>(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        [email],
      );
      const r = await client.query<{ id: string; name: string | null }>(
        `INSERT INTO users (email, name, password_hash, org_id, role)
         VALUES ($1, NULLIF($2,''), $3, $4, 'admin')
         RETURNING id, name`,
        [email, trimmedName, hash, org.rows[0].id],
      );
      await client.query('COMMIT');
      session.userId = r.rows[0].id;
      session.email = email;
      session.name = r.rows[0].name ?? undefined;
      session.orgId = org.rows[0].id;
      session.role = 'admin';
      await session.save();
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23505') {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
      }
      throw e;
    } finally {
      client.release();
    }
  }

  if (mode === 'login') {
    const r = await query<{
      id: string;
      name: string | null;
      password_hash: string | null;
      org_id: string | null;
      role: 'user' | 'admin' | 'super_admin' | null;
    }>(
      `SELECT id, name, password_hash, org_id, role FROM users WHERE email = $1`,
      [email],
    );
    if (
      r.rowCount === 0 ||
      !r.rows[0].password_hash ||
      !(await bcrypt.compare(password, r.rows[0].password_hash))
    ) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    session.userId = r.rows[0].id;
    session.email = email;
    session.name = r.rows[0].name ?? undefined;
    session.orgId = r.rows[0].org_id ?? undefined;
    session.role = r.rows[0].role ?? 'user';
    await session.save();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown mode' }, { status: 400 });
}
