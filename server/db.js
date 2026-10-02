import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    pool.on('error', (e) => console.error('[db] idle client error', e.message));
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}