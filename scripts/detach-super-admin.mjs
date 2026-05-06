// Set the super_admin's org_id to NULL so they no longer appear inside any
// organization's member list. super_admin scope is role-based, not org-based,
// so this has no effect on what they can see — just cleans up the picture.

import { readFileSync } from 'node:fs';
import pg from 'pg';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch {}

const email = process.argv[2] ?? 'admin@edvenswatech.com';

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
  const r = await c.query(
    `UPDATE users SET org_id = NULL
      WHERE email = $1 AND role = 'super_admin'
  RETURNING id`,
    [email],
  );
  if (r.rowCount === 0) {
    console.error(`No super_admin row matched ${email}.`);
    process.exit(1);
  }
  console.log(`${email} detached from any organization (org_id = NULL).`);
} finally {
  await c.end();
}
