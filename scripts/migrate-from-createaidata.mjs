// One-shot migration: copy users, organizations, extension_tokens,
// extension_conversations, model_catalog, and extension-source rows of
// usage_analytics from CreateAIdata into ExtensionAI.
//
// Usage: node scripts/migrate-from-createaidata.mjs

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// Load .env without dotenv dependency.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { Client } = pg;

const SRC = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: 'CreateAIdata',
};
const DST = { ...SRC, database: process.env.PGDATABASE || 'ExtensionAI' };

async function copy(src, dst, table, columns) {
  const cols = columns.join(', ');
  const { rows } = await src.query(`SELECT ${cols} FROM ${table}`);
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  for (const row of rows) {
    await dst.query(sql, columns.map((c) => row[c]));
  }
  console.log(`  ${table}: ${rows.length} rows`);
  return rows.length;
}

async function main() {
  const src = new Client(SRC);
  const dst = new Client(DST);
  await src.connect();
  await dst.connect();
  console.log(`Source: ${SRC.database}  Destination: ${DST.database}`);

  console.log('Migrating organizations…');
  await copy(src, dst, 'organizations', ['id', 'name', 'created_at']);

  console.log('Migrating users…');
  await copy(src, dst, 'users', [
    'id', 'email', 'name', 'password_hash', 'org_id', 'role', 'created_at',
  ]);

  console.log('Migrating extension_tokens…');
  await copy(src, dst, 'extension_tokens', [
    'id', 'user_id', 'org_id', 'token_hash', 'label', 'last_used_at', 'revoked_at', 'created_at',
  ]);

  console.log('Migrating extension_conversations…');
  await copy(src, dst, 'extension_conversations', [
    'id', 'user_id', 'org_id', 'ai_platform', 'topic', 'model',
    'total_active_seconds', 'event_count', 'first_seen_at', 'last_seen_at',
  ]);

  console.log('Migrating model_catalog…');
  const { rows: mc } = await src.query(`SELECT model, provider, request_count, input_per_1k, output_per_1k, first_seen_at, last_seen_at FROM model_catalog`);
  for (const r of mc) {
    await dst.query(
      `INSERT INTO model_catalog (model, provider, request_count, input_per_1k, output_per_1k, first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (model) DO NOTHING`,
      [r.model, r.provider, r.request_count, r.input_per_1k, r.output_per_1k, r.first_seen_at, r.last_seen_at],
    );
  }
  console.log(`  model_catalog: ${mc.length} rows`);

  console.log('Migrating usage_analytics (extension only)…');
  const { rows: ua } = await src.query(
    `SELECT user_id, org_id, provider, model, prompt_tokens, completion_tokens,
            estimated_cost_usd, latency_ms, status, error_message, active_seconds,
            ai_platform, browser, device_hash, topic, created_at
       FROM usage_analytics WHERE source = 'extension'`,
  );
  for (const r of ua) {
    await dst.query(
      `INSERT INTO usage_analytics
        (user_id, org_id, provider, model, prompt_tokens, completion_tokens,
         estimated_cost_usd, latency_ms, status, error_message, active_seconds,
         ai_platform, browser, device_hash, topic, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        r.user_id, r.org_id, r.provider, r.model, r.prompt_tokens, r.completion_tokens,
        r.estimated_cost_usd, r.latency_ms, r.status, r.error_message, r.active_seconds,
        r.ai_platform, r.browser, r.device_hash, r.topic, r.created_at,
      ],
    );
  }
  console.log(`  usage_analytics: ${ua.length} rows`);

  await src.end();
  await dst.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
