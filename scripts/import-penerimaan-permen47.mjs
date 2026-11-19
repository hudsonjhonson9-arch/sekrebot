// ═══════════════════════════════════════════════════════════════
// Impor Laporan Pengadaan Permen 47 → "SIMAPO".penerimaan_barang.
//
// Sumber: sheet "Semester I 2026" pada file daftar pengadaan pakai habis.
// Kode + uraian rekening belanja disimpan PER BARIS di detail_penerimaan
// (bukan di master barang) supaya satu barang bisa muncul di banyak rekening.
//
// Cara pakai:
//   node --env-file=.env scripts/import-penerimaan-permen47.mjs --dry-run
//   node --env-file=.env scripts/import-penerimaan-permen47.mjs
//
// Catatan:
//   - Stok barang TIDAK diubah (data historis).
//   - Idempoten: grup (no_nota, tgl, penyedia) yang sudah ada dilewati.
//   - Hanya sheet Semester I 2026 (TW I/II sudah termasuk di dalamnya).
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import pg from 'pg';

const require = createRequire(import.meta.url);

const FILE = process.env.PERMEN47_XLSX
  || '/config/workspace/1. DAFTAR PENGADAAN PAKAI HABIS permen 47 OK.xlsx';
const SHEET = 'xl/worksheets/sheet5.xml'; // Semester I 2026 (rId5)
const INSTANSI = process.env.INSTANSI_ID || 'bapperida';
const DRY = process.argv.includes('--dry-run');

// Parser xlsx minimal (tanpa dependensi eksternal selain pizzip milik repo).
function parseXlsxFallback(buf) {
  const PizZip = require('pizzip');
  const zip = new PizZip(buf);
  const unesc = (s) => String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const shared = [];
  if (zip.file('xl/sharedStrings.xml')) {
    for (const si of zip.file('xl/sharedStrings.xml').asText().split('<si>').slice(1)) {
      const body = si.split('</si>')[0];
      shared.push(unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
    }
  }
  const sheets = {};
  for (const f of Object.keys(zip.files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))) {
    const xml = zip.file(f).asText();
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = {};
      for (const cm of rm[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
        const attrs = cm[1] || cm[3] || '';
        const inner = cm[2] || '';
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
        if (!ref) continue;
        const t = (attrs.match(/t="([^"]+)"/) || [])[1];
        let v = '';
        if (t === 'inlineStr') v = unesc([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
        else {
          const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (raw === undefined) continue;
          v = t === 's' ? (shared[Number(raw)] ?? '') : unesc(raw);
        }
        cells[ref] = v;
      }
      rows.push({ r: Number(rm[1]), cells });
    }
    sheets[f] = { rows, merges: [] };
  }
  return sheets;
}

const colLetter = (n) => {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};
const pick = (cells, idx) => String(cells[colLetter(idx)] ?? '').trim();

// ── normalisasi ──
const BULAN = {
  januari: 1, januri: 1, jan: 1,
  pebruari: 2, februari: 2, feb: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, juni: 6, juli: 7,
  agustus: 8, agu: 8, september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12,
};

function parseTanggal(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4,6}$/.test(s)) {
    // serial Excel (epoch 1899-12-30)
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  // "03 JULI 2026", "03JULI 2026", "114 Agustus 2026" (day typo → 14)
  const m = s.match(/^(\d{1,3})\s*([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return '';
  const bln = BULAN[m[2].toLowerCase()];
  if (!bln) return '';
  let hari = Number(m[1]);
  if (hari > 31) {
    const ekor = Number(String(hari).slice(-2));
    if (ekor >= 1 && ekor <= 31) hari = ekor;
  }
  if (hari < 1 || hari > 31) return '';
  return `${m[3]}-${String(bln).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
}

// Kode rekening Excel kotor: koma, titik ganda, spasi, "51.02" tanpa titik.
function normKodeRekening(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  s = s.replace(/,/g, '.').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
  // 51.02... → 5.1.02...
  if (/^51\./.test(s)) s = `5.1.${s.slice(3)}`;
  // 5.05.1.02... bentuk cacat → 5.05.01.02... (biarkan apa adanya bila sudah 6+ bagian benar)
  return s;
}

function normSubKode(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/,/g, '.').replace(/\s+/g, '.').replace(/\.{2,}/g, '.').replace(/[.,]+$/g, '');
  return s;
}

function normQty(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, '');
  if (!s) return '';
  const n = Number(s.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : '';
}

const dedupeKey = (r) => [r.tgl, r.penyedia, r.noNota, r.nama, r.qty, r.harga]
  .join('|').toLowerCase().replace(/\s+/g, ' ');

function bacaSheet() {
  const buf = fs.readFileSync(FILE);
  const sheets = parseXlsxFallback(buf);
  const sheet = sheets[SHEET];
  if (!sheet) throw new Error(`sheet ${SHEET} tidak ditemukan di ${FILE}`);
  const items = [];
  for (const r of sheet.rows) {
    if (r.r < 12) continue;
    const nama = pick(r.cells, 9);
    const qtyRaw = pick(r.cells, 10) || pick(r.cells, 12) || pick(r.cells, 11);
    const sk = pick(r.cells, 19);
    if (!nama || !qtyRaw || !sk) continue;
    const qty = normQty(qtyRaw);
    if (qty === '' || qty <= 0) continue;
    const tgl = parseTanggal(pick(r.cells, 23));
    if (!tgl) {
      console.warn(`  [skip] baris ${r.r}: tanggal tidak terbaca → ${JSON.stringify(pick(r.cells, 23))}`);
      continue;
    }
    items.push({
      row: r.r,
      nama,
      qty,
      satuan: pick(r.cells, 13) || 'Unit',
      harga: normQty(pick(r.cells, 14)) || 0,
      subKode: normSubKode(sk),
      subUraian: pick(r.cells, 20),
      kodeRek: normKodeRekening(pick(r.cells, 21)),
      uraianRek: pick(r.cells, 22),
      tgl,
      penyedia: pick(r.cells, 25),
      noNota: pick(r.cells, 26),
      dokumen: pick(r.cells, 24),
    });
  }
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    const k = dedupeKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(it);
  }
  return { semua: items, unik: uniq };
}

function grupNota(rows) {
  // Sub kegiatan ikut kunci grup: satu BKU bisa punya beberapa sub kegiatan
  // di Excel, dan kolom sub di penerimaan bersifat per nota.
  const map = new Map();
  for (const r of rows) {
    const key = `${r.noNota}||${r.tgl}||${r.penyedia}||${r.subKode}`;
    if (!map.has(key)) {
      map.set(key, {
        noNota: r.noNota, tgl: r.tgl, penyedia: r.penyedia,
        subKode: r.subKode, subUraian: r.subUraian, items: [],
      });
    }
    map.get(key).items.push(r);
  }
  return [...map.values()];
}

async function main() {
  if (!fs.existsSync(FILE)) throw new Error(`file tidak ada: ${FILE}`);
  const { semua, unik } = bacaSheet();
  const grup = grupNota(unik);
  const totalNilai = unik.reduce((s, r) => s + r.qty * r.harga, 0);
  console.log(`[source] ${path.basename(FILE)} sheet=Semester I 2026`);
  console.log(`[rows] mentah=${semua.length} unik=${unik.length} nota=${grup.length} total=${totalNilai}`);
  const reks = [...new Set(unik.map((r) => r.kodeRek).filter(Boolean))];
  console.log(`[rekening] ${reks.length} kode unik`);
  reks.forEach((k) => console.log('  -', k));

  if (DRY) {
    console.log('[DRY-RUN] tidak menulis apa pun.');
    for (const g of grup.slice(0, 5)) {
      console.log(`  nota ${g.noNota} | ${g.tgl} | ${g.penyedia} | items=${g.items.length}`);
    }
    return;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await client.connect();
  try {
    await client.query('BEGIN');

    // master rekening_belanja (idx non-unique → cek dulu)
    let rekBaru = 0;
    for (const g of grup) {
      for (const it of g.items) {
        if (!it.kodeRek || !it.uraianRek) continue;
        const { rows } = await client.query(
          'SELECT 1 FROM "SIMAPO".rekening_belanja WHERE kode = $1 LIMIT 1',
          [it.kodeRek],
        );
        if (!rows.length) {
          await client.query(
            'INSERT INTO "SIMAPO".rekening_belanja (id, kode, uraian, jenis, created_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW())',
            [it.kodeRek, it.uraianRek, 'belanja'],
          );
          rekBaru++;
        }
      }
    }

    let notaBaru = 0, detailBaru = 0, dilewati = 0, barangBaru = 0;
    const cacheBarang = new Map();

    for (const g of grup) {
      const { rows: ada } = await client.query(
        `SELECT id FROM "SIMAPO".penerimaan_barang
          WHERE instansi_id = $1 AND no_nota = $2 AND tgl_nota = $3::date
            AND penyedia = $4 AND sub_kegiatan = $5
          LIMIT 1`,
        [INSTANSI, g.noNota, g.tgl, g.penyedia, g.subKode],
      );
      if (ada.length) { dilewati++; continue; }

      const total = g.items.reduce((s, r) => s + r.qty * r.harga, 0);
      const { rows: nota } = await client.query(
        `INSERT INTO "SIMAPO".penerimaan_barang
           (instansi_id, no_nota, tgl_nota, penyedia, total_nilai, no_sp2d, kontrak,
            sub_kegiatan, sub_kegiatan_uraian, status_spj, created_by)
         VALUES ($1, $2, $3::date, $4, $5, '', '', $6, $7, 'sudah_di_map', 'import-permen47')
         RETURNING id`,
        [INSTANSI, g.noNota || `IMPOR-${g.tgl}`, g.tgl, g.penyedia || '-', total, g.subKode, g.subUraian],
      );
      const notaId = nota[0].id;
      notaBaru++;

      for (const it of g.items) {
        let barangId = cacheBarang.get(it.nama);
        if (!barangId) {
          const { rows: byNama } = await client.query(
            `SELECT id FROM "SIMAPO".barang
              WHERE instansi_id = $1 AND nama = $2
              ORDER BY createdat DESC LIMIT 1`,
            [INSTANSI, it.nama],
          );
          if (byNama.length) {
            barangId = byNama[0].id;
          } else {
            const { rows: baru } = await client.query(
              `INSERT INTO "SIMAPO".barang
                 (id, kodebarang, nama, jenisbarang, satuan, spesifikasi, foto,
                  stok_saat_ini, minimumstok, hargasatuan, kategoriid, isactive,
                  createdat, updatedat, instansi_id)
               VALUES (gen_random_uuid()::text, $1, $2, 'Habis Pakai', $3, '', '',
                       0, 0, $4, NULL, true, NOW(), NOW(), $5)
               RETURNING id`,
              [`HP-IMPOR-${String(barangBaru + 1).padStart(4, '0')}`, it.nama, it.satuan, it.harga, INSTANSI],
            );
            barangId = baru[0].id;
            barangBaru++;
          }
          cacheBarang.set(it.nama, barangId);
        }

        await client.query(
          `INSERT INTO "SIMAPO".detail_penerimaan
             (penerimaan_id, barang_id, volume, harga_satuan, total_harga, kode_rekening, uraian_belanja)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
          [notaId, barangId, it.qty, it.harga, it.qty * it.harga, it.kodeRek, it.uraianRek],
        );
        detailBaru++;
      }
    }

    await client.query('COMMIT');
    console.log(`[OK] rekening_baru=${rekBaru} nota_baru=${notaBaru} detail_baru=${detailBaru} dilewati=${dilewati} barang_baru=${barangBaru}`);
    console.log('[OK] stok tidak diubah.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('GAGAL:', e);
  process.exit(1);
});
