// ═══════════════════════════════════════════════════════════════
// IMPOR DATA BAST dari aset.db (aset-bapperida) ke SIMAPO (n8n).
//
// Cara pakai:
//   node scripts/import-bast-data.js [--dry-run]
//
// Yang dilakukan:
//   1. Upsert daftar ruangan dari aset.db -> SIMAPO.ruangan (webhook simapo-bast-ruangan).
//   2. Untuk setiap aset di aset.db, impor ke SIMAPO.unit_aset secara idempoten
//      (barang + unit dibuat bila belum ada) via webhook simapo-bast-import-unit,
//      sekaligus mengisi pemegang tetap (pegawai by NIP), ruangan, dan kolom
//      identitas (no_polisi, no_rangka, no_mesin, roda, merk_type, model_jenis,
//      warna, tahun_pembuatan).
// ═══════════════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.BAST_BASE || 'https://mindcloud.my.id';
const API_KEY = process.env.BAST_API_KEY || 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u';
const ASET_DB = process.env.ASET_DB || path.join(__dirname, '../../aset-bapperida/data/aset.db');
const DRY = process.argv.includes('--dry-run');
// --limit=N untuk smoke-test sebagian sebelum impor penuh
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;

const HDR = { 'x-bast-key': API_KEY, 'Content-Type': 'application/json' };

async function call(pathName, body) {
  const res = await fetch(BASE + '/webhook/' + pathName, {
    method: 'POST',
    headers: HDR,
    body: JSON.stringify(body || {})
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) {
    throw new Error(`[${pathName}] HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return (json && json.data) || json || {};
}

async function callGet(pathName, query) {
  const qs = new URLSearchParams(query || {});
  const res = await fetch(BASE + '/webhook/' + pathName + (qs.toString() ? '?' + qs : ''));
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) {
    throw new Error(`[${pathName}] HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return (json && json.data) || json || {};
}

async function main() {
  const db = new DatabaseSync(ASET_DB);
  const asetRows = db.prepare('SELECT * FROM aset').all();
  const pegawaiRows = db.prepare('SELECT * FROM pegawai').all();
  const ruangRows = db.prepare('SELECT * FROM ruangan').all();
  console.log(`[aset.db] aset=${asetRows.length}, pegawai=${pegawaiRows.length}, ruangan=${ruangRows.length}`);

  if (DRY) console.log('[DRY-RUN] Tidak ada perubahan yang dikirim.');

  // Ambil data SIMAPO saat ini (unit_aset + ruangan + pegawai)
  console.log('[SIMAPO] Menarik data existing (simapo-bast-list)...');
  const listData = await callGet('simapo-bast-list');
  const simAset = listData.aset || [];
  const simRuang = listData.ruangan || [];
  const simPegawai = listData.pegawai || [];
  console.log(`[SIMAPO] unit_aset=${simAset.length}, ruangan=${simRuang.length}, pegawai=${simPegawai.length}`);

  // kategori: aset.db -> SIMAPO.kategori_barang
  const kategoriList = await callGet('simapo-kategori-list', { instansi_id: 'bapperida' }).catch(() => []);
  const kategoriSim = Array.isArray(kategoriList) ? kategoriList : (kategoriList && kategoriList.data) || [];
  const kategoriByNama = {};
  kategoriSim.forEach(k => { kategoriByNama[k.nama] = k.id; });

  // ── 1. UPSERT RUANGAN ──
  console.log('\n=== RUANGAN ===');
  const ruangMap = {}; // aset.db ruangan.id -> SIMAPO ruangan uuid
  for (const r of ruangRows) {
    const existing = simRuang.find(sr => String(sr.kode || '') === String(r.kode));
    if (existing) {
      ruangMap[r.id] = existing.id;
      continue;
    }
    if (DRY) continue;
    const saved = await call('simapo-bast-ruangan', {
      kode: r.kode || '', nama: r.nama || '', keterangan: r.keterangan || ''
    });
    const id = (Array.isArray(saved) ? saved[0] : saved).id;
    ruangMap[r.id] = id;
    console.log(`  + ruangan '${r.nama}' -> ${id}`);
  }
  console.log(`  terpetakan ${Object.keys(ruangMap).length}/${ruangRows.length} ruangan`);

  // ── 2. IMPOR ASET (barang + unit) + PEMEGANG + IDENTITAS ──
  console.log('\n=== ASET (impor unit + pemegang + identitas) ===');
  const norm = s => String(s || '').replace(/\s+/g, '');
  // NIP aset.db -> NIP user_list SIMAPO (agar penulisan NIP konsisten dgn SIMAPO)
  const simNipMap = {};
  simPegawai.forEach(p => { simNipMap[norm(p.nip)] = p.nip; });
  const simNipById = {};
  pegawaiRows.forEach(p => {
    const u = simNipMap[norm(p.nip)];
    simNipById[p.id] = u || norm(p.nip); // fallback: NIP ternormalisasi
  });

  // kategori: aset.db -> SIMAPO.kategori_barang
  const mapKategori = (kategori, roda) => {
    const n = String(kategori || '');
    if (/kendaraan/i.test(n)) {
      const rodaN = parseInt(String(roda || '0'), 10);
      if (rodaN > 2) return kategoriByNama['Kendaraan Roda 4'] || kategoriByNama['Kendaraan Roda 2'];
      return kategoriByNama['Kendaraan Roda 2'] || kategoriByNama['Kendaraan Roda 4'];
    }
    return kategoriByNama[n] || kategoriByNama['Aset Tetap'] || kategoriSim[0] && kategoriSim[0].id;
  };

  let imported = 0, skipped = 0;

  for (const a of asetRows.slice(0, LIMIT)) {
    const kategoriid = mapKategori(a.kategori, a.roda);
    if (!kategoriid) {
      console.warn(`  ⚠️ kategori '${a.kategori}' tidak ditemukan di SIMAPO; skip ${a.kode_barang}`);
      skipped++;
      continue;
    }
    const payload = {
      kodebarang: a.kode_barang || '',
      nama: a.nama || '',
      hargasatuan: a.harga != null ? Number(a.harga) : 0,
      nilaiperolehan: a.harga != null ? Number(a.harga) : null,
      tahunperolehan: a.tahun_pembelian ? Number(a.tahun_pembelian) : null,
      kategoriid,
      instansi_id: 'bapperida',
      nomorinventaris: 'INV-' + String(a.kode_barang || '') + '-' + String(a.id).padStart(3, '0'),
      kondisi: a.kondisi || 'Baik',
      pegawai_id: simNipById[a.pegawai_id] || null,
      ruangan_id: ruangMap[a.ruangan_id] || null,
      no_polisi: a.no_polisi || '',
      no_rangka: a.no_rangka || '',
      no_mesin: a.no_mesin || '',
      roda: a.roda != null ? String(a.roda) : '2',
      merk_type: a.merk_type || '',
      model_jenis: a.model_jenis || '',
      warna: a.warna || '',
      tahun_pembuatan: a.tahun_pembuatan != null ? String(a.tahun_pembuatan) : ''
    };
    if (DRY) {
      const peg = payload.pegawai_id || '-';
      console.log(`  [dry] ${payload.kodebarang} (${payload.nomorinventaris}) | kategori=${payload.kategoriid} | pemegang=${peg} | ruang=${a.ruangan_id || '-'}`);
      imported++;
      continue;
    }
    const saved = await call('simapo-bast-import-unit', payload);
    const isNew = !!(saved && saved.unit_id);
    console.log(`  ${isNew ? '✓ impor baru' : '• sudah ada'} ${payload.kodebarang} (${payload.nomorinventaris}) -> pemegang=${payload.pegawai_id || '-'}, ruang=${a.ruangan_id || '-'}${saved && saved.unit_id ? ' [' + saved.unit_id + ']' : ''}`);
    imported++;
  }

  console.log(`\nSelesai. ${DRY ? '[dry] ' : ''}diproses=${imported}, skipped=${skipped}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('\nGAGAL:', e.message, e.stack); process.exit(1); });