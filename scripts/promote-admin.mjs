// One-shot CLI: promote an existing user to super_admin, or create a new
// super_admin user, or reset the password on an existing user. Password is
// read from stdin via readline so it is never passed as argv (which would
// land in shell history) and never appears in any source file.
//
// Usage:
//   node scripts/promote-admin.mjs <email>             # promote existing OR create new
//   node scripts/promote-admin.mjs <email> --reset-password  # reset existing user's password
//
// If the email exists  -> sets role='super_admin' (keeps password unless
//                         --reset-password is passed, in which case prompts
//                         for a new password).
// If the email is new  -> prompts for a password, creates the user, creates
//                         a personal organization, sets role='super_admin'.
//
// super_admin is the same as admin in the current code (see lib/session.ts
// requireAdmin). It exists so future code can grant cross-org visibility
// without rewriting the role check.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import pg from 'pg';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch {}

const email = process.argv[2];
const resetPassword = process.argv.includes('--reset-password');
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: node scripts/promote-admin.mjs <email> [--reset-password]');
  process.exit(2);
}

function prompt(question, { silent = false } = {}) {
  const rl = createInterface({ input, output, terminal: true });
  return new Promise((resolve) => {
    if (silent) {
      // Mute echoed characters while still allowing backspace/enter.
      const onData = (char) => {
        const c = char.toString('utf8');
        if (c === '\n' || c === '\r' || c === '') input.removeListener('data', onData);
        else output.write('*');
      };
      input.on('data', onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (silent) output.write('\n');
      resolve(answer);
    });
  });
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
  const existing = await c.query('SELECT id, role, org_id FROM users WHERE email = $1', [email]);

  if (existing.rowCount > 0) {
    const u = existing.rows[0];

    if (resetPassword) {
      const pw1 = await prompt('New password (input hidden): ', { silent: true });
      const pw2 = await prompt('Confirm password (input hidden):  ', { silent: true });
      if (!pw1 || pw1 !== pw2) {
        console.error('ERROR: passwords did not match or were empty. Aborting.');
        process.exit(1);
      }
      if (pw1.length < 8) {
        console.error('ERROR: password must be at least 8 characters.');
        process.exit(1);
      }
      const hash = await bcrypt.hash(pw1, 10);
      await c.query(
        `UPDATE users SET password_hash = $1, role = 'super_admin' WHERE id = $2`,
        [hash, u.id],
      );
      console.log(`OK: password reset and ${email} promoted to super_admin.`);
    } else {
      await c.query(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [u.id]);
      console.log(`OK: existing user ${email} promoted to super_admin.`);
      console.log(`    Sign in with the password you already use.`);
      console.log(`    (If you've forgotten it, rerun with --reset-password.)`);
    }
    console.log(`    user_id = ${u.id}`);
    console.log(`    org_id  = ${u.org_id}`);
    console.log(`    Sign in at http://localhost:3000`);
  } else {
    console.log(`User ${email} does not exist — creating.`);
    const pw1 = await prompt('Choose a password (input hidden): ', { silent: true });
    const pw2 = await prompt('Confirm password (input hidden):  ', { silent: true });
    if (!pw1 || pw1 !== pw2) {
      console.error('ERROR: passwords did not match or were empty. Aborting.');
      process.exit(1);
    }
    if (pw1.length < 8) {
      console.error('ERROR: password must be at least 8 characters.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(pw1, 10);

    await c.query('BEGIN');
    const org = await c.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [email],
    );
    const u = await c.query(
      `INSERT INTO users (email, password_hash, org_id, role)
       VALUES ($1, $2, $3, 'super_admin') RETURNING id`,
      [email, hash, org.rows[0].id],
    );
    await c.query('COMMIT');

    console.log(`OK: created super_admin ${email}.`);
    console.log(`    user_id = ${u.rows[0].id}`);
    console.log(`    org_id  = ${org.rows[0].id}`);
    console.log(`    Sign in at http://localhost:3000 with the password you just set.`);
  }
} finally {
  await c.end();
}
