import { readFileSync } from 'node:fs';
import pg from 'pg';

// Minimal .env loader (no dotenv dep) — populates process.env from ./.env
try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch { /* no .env file — rely on shell env */ }

function clientConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  };
}

const target = process.env.PGDATABASE || 'mytestai';

// 1. Connect to the maintenance "postgres" DB and CREATE DATABASE if needed.
{
  const c = new pg.Client({ ...clientConfig(), database: 'postgres' });
  await c.connect();
  const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [target]);
  if (r.rowCount === 0) {
    await c.query(`CREATE DATABASE "${target}"`);
    console.log(`Created database "${target}".`);
  } else {
    console.log(`Database "${target}" already exists.`);
  }
  await c.end();
}

// 2. Apply schema to the target DB.
{
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const c = new pg.Client(clientConfig());
  await c.connect();
  await c.query(sql);
  await c.end();
  console.log('Schema applied.');
}
