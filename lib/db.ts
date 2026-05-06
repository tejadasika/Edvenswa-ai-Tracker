import { Pool, PoolConfig, QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, max: 10 };
  }
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 10,
  };
}

export const pool: Pool = global.__pgPool ?? new Pool(buildConfig());

if (process.env.NODE_ENV !== 'production') global.__pgPool = pool;

export async function query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}
