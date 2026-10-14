// Generator kode aset unik (SINGKATAN-KATEGORI-TAHUN-HARGA) untuk:
//   1. Database produksi PostgreSQL (SIMAPO.unit_aset.kode_aset)
//   2. SQLite aset.db milik aplikasi referensi aset-bapperida (kolom aset.kode_aset)
//
// Pemakaian:
//   node --env-file=.env scripts/gen-kode-aset.mjs                # dry-run (produksi)
//   node --env-file=.env scripts/gen-kode-aset.mjs --apply-prod   # tulis ke produksi
//   node scripts/gen-kode-aset.mjs --sqlite                       # dry-run aset.db
//   node scripts/gen-kode-aset.mjs --sqlite --apply-sqlite        # tulis ke aset.db (+backup)
import { Client } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { buatKodeAset, beriUrutan } from '../server/kode-aset.js';

const SQLITE_PATH = '/config/workspace/aset-bapperida/aset-bapperida/data/aset.db';
const args = new Set(process.argv.slice(2));
const applyProd = args.has('--apply-prod');
const useSqlite = args.has('--sqlite');
const applySqlite = args.has('--apply-sqlite');

function finalisasikan(rows) {
  // rows: [{id, nama, kategori, kodeBarang, tahun, harga}]
  const dasar = rows.map(r => ({
    key: String(r.id),
    dasar: buatKodeAset({ nama: r.nama, kategori: r.kategori, kodeBarang: r.kodeBarang, tahun: r.tahun, harga: r.harga }),
  }));
  return { kodeMap: beriUrutan(dasar), dasar };
}

function laporan(namaSumber, rows, dasar, kodeMap) {
  const hitung = new Map();
  for (const d of dasar) hitung.set(d.dasar, (hitung.get(d.dasar) || 0) + 1);
  const ganda = [...hitung.values()].filter(n => n > 1).length;
  console.log(`[${namaSumber}] ${rows.length} baris → ${kodeMap.size} kode unik (${ganda} dasar tabrak diberi akhiran -N)`);
  for (const r of rows.slice(0, 8)) console.log('  ', String(r.id).padEnd(6), '→', kodeMap.get(String(r.id)));
  if (rows.length > 8) console.log('   ...');
}

async function prosesProd() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query(`SELECT ua.id, b.nama, b.kodebarang, ua.tahunperolehan, COALESCE(ua.nilaiperolehan, b.hargasatuan) harga
      FROM "SIMAPO".unit_aset ua JOIN "SIMAPO".barang b ON b.id = ua.barangid
      WHERE b.isactive = true ORDER BY ua.id`);
    const data = rows.map(r => ({ id: r.id, nama: r.nama, kodeBarang: r.kodebarang, tahun: r.tahunperolehan, harga: r.harga }));
    const { kodeMap, dasar } = finalisasikan(data);
    laporan('produksi', data, dasar, kodeMap);
    if (!applyProd) { console.log('Dry-run. Tambah --apply-prod untuk menulis.'); return; }
    await c.query(`ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS kode_aset TEXT`);
    for (const r of data) {
      await c.query(`UPDATE "SIMAPO".unit_aset SET kode_aset=$1 WHERE id=$2`, [kodeMap.get(String(r.id)), r.id]);
    }
    const done = await c.query(`SELECT count(*) n FROM "SIMAPO".unit_aset WHERE kode_aset IS NOT NULL`);
    console.log('Produksi diperbarui. unit_aset terisi kode_aset:', done.rows[0].n);
  } finally { await c.end(); }
}

function prosesSqlite() {
  const db = new DatabaseSync(SQLITE_PATH);
  try {
    const cols = db.prepare(`PRAGMA table_info(aset)`).all().map(c => c.name);
    const rows = db.prepare(`SELECT id, nama, kategori, kode_barang, tahun_pembelian, harga FROM aset ORDER BY id`).all()
      .map(r => ({ id: r.id, nama: r.nama, kategori: r.kategori, kodeBarang: r.kode_barang, tahun: r.tahun_pembelian, harga: r.harga }));
    const kodeMapData = finalisasikan(rows);
    const kodeMap = kodeMapData.kodeMap;
    laporan('aset.db', rows, kodeMapData.dasar, kodeMap);
    if (!applySqlite) { console.log('Dry-run. Tambah --apply-sqlite untuk menulis (+ backup).'); return; }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const backup = path.join(path.dirname(SQLITE_PATH), 'cadangan', `aset-${stamp}.db`);
    copyFileSync(SQLITE_PATH, backup);
    console.log('Backup:', backup);
    if (!cols.includes('kode_aset')) db.prepare(`ALTER TABLE aset ADD COLUMN kode_aset TEXT`).run();
    const upd = db.prepare(`UPDATE aset SET kode_aset=? WHERE id=?`);
    for (const r of rows) upd.run(kodeMap.get(String(r.id)), r.id);
    const n = db.prepare(`SELECT count(*) n FROM aset WHERE kode_aset IS NOT NULL`).get();
    console.log('aset.db diperbarui. baris terisi kode_aset:', n.n);
  } finally { db.close(); }
}

if (useSqlite) prosesSqlite();
else await prosesProd();
