// snapshot-prod.mjs — tarik data produksi (READ-ONLY, SELECT saja) → Postgres lokal harness.
// Jalankan: node scripts/snapshot-prod.mjs
// Produksi: .env DATABASE_URL. Lokal: LOCAL_DATABASE_URL (default absensi-local-pg:5433/absensi).
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';

const { Pool } = pg;
const prod = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, ssl: process.env.PGSSL === 'disable' ? false : undefined });
const local = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/absensi', max: 2 });

// Guard: koneksi produksi HANYA boleh SELECT.
async function q(pool, sql, params = []) {
  if (!/^\s*select/i.test(sql)) throw new Error('Non-SELECT diblokir: ' + sql.slice(0, 60));
  return pool.query(sql, params);
}

const TABLES = [
  'instansi_list', 'bidang_list', 'user_list', 'tanda_tangan', 'admin_list',
  'lokasiabsen', 'jam_absen', 'jam_periode', 'libur_nasional', 'pengaturan',
  'statistik_pegawai', 'Log_Absen',
];

const ident = (c) => `"${c.replace(/"/g, '""')}"`;

async function colsOf(pool, table) {
  const { rows } = await q(pool, `SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return rows.map(r => r.column_name);
}

async function snapshotOne(table) {
  const [pCols, lCols] = await Promise.all([colsOf(prod, table), colsOf(local, table)]);
  const shared = pCols.filter(c => lCols.includes(c));
  if (!shared.length) throw new Error(`Tidak ada kolom bersama: ${table}`);
  const dropped = pCols.filter(c => !lCols.includes(c));
  const { rows } = await q(prod, `SELECT ${shared.map(ident).join(', ')} FROM ${ident(table)}`);
  await local.query(`TRUNCATE ${ident(table)}`);
  if (rows.length) {
    const params = [];
    const ph = rows.map(r => '(' + shared.map(c => { params.push(r[c]); return `$${params.length}`; }).join(', ') + ')');
    await local.query(`INSERT INTO ${ident(table)} (${shared.map(ident).join(', ')}) VALUES ${ph.join(',')}`, params);
  }
  console.log(`${table}: ${rows.length} baris${dropped.length ? ' (kolom dilewati: ' + dropped.join(', ') + ')' : ''}`);
}

for (const t of TABLES) {
  try { await snapshotOne(t); }
  catch (e) { console.error(`GAGAL ${t}: ${e.message}`); process.exitCode = 1; }
}
await prod.end(); await local.end();
console.log('Selesai.');