// Make exactly ONE user the system super_admin and demote everyone else to
// 'user'. Idempotent — safe to re-run.
//
// Usage:
//   node scripts/set-sole-admin.mjs <email>
//   npm run admin:sole -- <email>
//
// If <email> doesn't exist yet, the script aborts and tells you to run
// admin:promote first (which will prompt for a password). This script never
// touches passwords — it's role-only — so credentials never enter the chat,
// argv, or shell history.

import { readFileSync } from 'node:fs';
import pg from 'pg';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch {}

const email = process.argv[2];
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: node scripts/set-sole-admin.mjs <email>');
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
  const exists = await c.query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rowCount === 0) {
    console.error(
      `ERROR: ${email} does not exist. Create it first:\n` +
        `  npm run admin:promote -- ${email}\n` +
        `(That script will prompt for a password.)`,
    );
    process.exit(1);
  }

  await c.query('BEGIN');
  // Demote everyone else first, then promote the target. Order matters: if
  // we promoted first and the demote query failed, we'd briefly have two
  // super_admins; the other direction is safe (zero super_admins is fine).
  const demoted = await c.query(
    `UPDATE users SET role = 'user' WHERE email <> $1 AND role <> 'user'`,
    [email],
  );
  const promoted = await c.query(
    `UPDATE users SET role = 'super_admin' WHERE email = $1 AND role <> 'super_admin'`,
    [email],
  );
  await c.query('COMMIT');

  console.log(`OK: roles set.`);
  console.log(`    ${email} -> super_admin (${promoted.rowCount === 0 ? 'no change' : 'updated'})`);
  console.log(`    other users demoted to 'user': ${demoted.rowCount}`);

  // Print the resulting role table so the operator can sanity-check.
  const all = await c.query(`SELECT email, role FROM users ORDER BY role DESC, email`);
  console.log('\nCurrent role table:');
  for (const row of all.rows) console.log(`    ${row.role.padEnd(12)} ${row.email}`);
  console.log(
    `\nIMPORTANT: anyone currently signed in still has their OLD role baked into their session cookie. ` +
      `They must log out and log back in to pick up the new role.`,
  );
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  await c.end();
}
