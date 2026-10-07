import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    // Fail-fast di sini, bukan di import: test suite meng-import modul tanpa DATABASE_URL.
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
      max: 5,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
    });
    pool.on('error', (e) => console.error('[db] idle client error', e.message));
  }
  return pool;
}

// N-2: async supaya guard DATABASE_URL muncul sebagai rejected Promise, bukan throw sinkron
// yang lolos dari `query(...).catch(...)` milik pemanggil.
export async function query(text, params) {
  return getPool().query(text, params);
}

// Penyimpanan nota penerimaan butuh tiga statement (nota, detail, update stok) yang
// harus bonus atau gagal bersama. Tanpa ROLLBACK, nota yang tersimpan lalu detail
// yang gagal meninggalkan baris yatim: n8n lama persis begitu, karena tiap node
// postgres punya koneksi sendiri. fn menerima client (punya .query) supaya semua
// statement memakai satu koneksi.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    // Rollback gagal (koneksi putus) tidak boleh menutupi error asli.
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}