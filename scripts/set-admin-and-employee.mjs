// One-shot: make `<adminEmail>` an admin (with an org), then move
// `<employeeEmail>` into that admin's org as role='user'.
//
// Usage:
//   node scripts/set-admin-and-employee.mjs <adminEmail> <employeeEmail>
//
// Both users must already exist (they should sign up first via the UI).
// Idempotent: re-running produces the same end state.

import { readFileSync } from 'node:fs';
import pg from 'pg';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch {}

const adminEmail = process.argv[2];
const employeeEmail = process.argv[3];
if (!adminEmail || !employeeEmail) {
  console.error('Usage: node scripts/set-admin-and-employee.mjs <adminEmail> <employeeEmail>');
  process.exit(2);
}

const c = new pg.Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      },
);
await c.connect();

try {
  await c.query('BEGIN');

  const adminRow = await c.query(
    'SELECT id, org_id FROM users WHERE email = $1',
    [adminEmail],
  );
  if (adminRow.rowCount === 0) {
    throw new Error(`Admin user not found: ${adminEmail}. Have them sign up at /, then re-run.`);
  }
  let { id: adminId, org_id: orgId } = adminRow.rows[0];

  // Ensure the admin has an org. If not, create one named after their email.
  if (!orgId) {
    const o = await c.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [adminEmail],
    );
    orgId = o.rows[0].id;
    await c.query(`UPDATE users SET org_id = $1 WHERE id = $2`, [orgId, adminId]);
    console.log(`Created org for ${adminEmail}: ${orgId}`);
  }

  await c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);
  console.log(`Set ${adminEmail} → role=admin (org=${orgId})`);

  const empRow = await c.query(
    'SELECT id, org_id FROM users WHERE email = $1',
    [employeeEmail],
  );
  if (empRow.rowCount === 0) {
    throw new Error(
      `Employee user not found: ${employeeEmail}. Have them sign up at /, then re-run.`,
    );
  }
  const { id: empId, org_id: prevOrg } = empRow.rows[0];

  await c.query(
    `UPDATE users SET role = 'user', org_id = $1 WHERE id = $2`,
    [orgId, empId],
  );
  console.log(`Set ${employeeEmail} → role=user, org=${orgId} (was ${prevOrg ?? 'null'})`);

  // If the employee was the sole owner of an org that no longer has any
  // members, that org becomes orphaned. Leave it in place — it might be
  // referenced by historical usage_analytics rows. We don't delete data.

  await c.query('COMMIT');
  console.log('Done.');
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await c.end();
}
