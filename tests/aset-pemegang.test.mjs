import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Daftar aset (master) harus menampilkan pemegang unit apa adanya.
// unit_aset.pegawai_id menyimpan user_list.id (telegram id), BUKAN NIP —
// join lama u2."NIP"=ua.pegawai_id tidak pernah cocok sehingga nama_pemegang
// selalu kosong dan pemegang tak bisa diverifikasi dari layar.

const ROOT = path.resolve(import.meta.dirname, '..');
const extraSrc = fs.readFileSync(path.join(ROOT, 'server', 'simapo-native-extra.js'), 'utf8');
const extSrc = fs.readFileSync(path.join(ROOT, 'js', 'simapo-ext.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function endpointSrc(name) {
  const i = extraSrc.indexOf(`'/${name}'`);
  assert.ok(i > -1, `endpoint /${name} ada di simapo-native-extra.js`);
  return extraSrc.slice(i, i + 2200);
}

test('server: unit-list-all mengirim nama_pemegang lewat join user_list.id (bukan NIP)', () => {
  const sql = endpointSrc('unit-list-all');
  assert.match(sql, /ua\.pegawai_id,COALESCE\(u2\."username",''\) nama_pemegang/,
    'unit-list-all memilih pegawai_id + nama_pemegang');
  assert.match(sql, /LEFT JOIN public\.user_list u2 ON u2\.id::text=ua\.pegawai_id/,
    'join pemegang memakai user_list.id = unit_aset.pegawai_id');
  assert.ok(!/u2\."NIP"=ua\.pegawai_id/.test(sql), 'join NIP lama tidak boleh dipakai');
});

test('server: unit-list (per barang) join pemegang juga by id, bukan NIP', () => {
  const sql = endpointSrc('unit-list');
  assert.match(sql, /LEFT JOIN public\.user_list u2 ON u2\.id::text=ua\.pegawai_id/);
  assert.ok(!/u2\."NIP"=ua\.pegawai_id/.test(sql), 'join NIP lama tidak boleh dipakai');
  assert.match(sql, /COALESCE\(u2\."username",''\) nama_pemegang/);
});

test('client: kartu Daftar Aset menampilkan Pemegang dan bisa dicari', () => {
  assert.match(extSrc, /Pemegang: \$\{u\.nama_pemegang \|\| '—'\}/,
    'kartu master menampilkan nama_pemegang (atau —)');
  assert.match(extSrc, /u\.nama_pemegang && u\.nama_pemegang\.toLowerCase\(\)\.includes\(q\)/,
    'filter daftar aset mencakup nama pemegang');
});

test('client: cache-buster simapo-ext ikut di-bump', () => {
  assert.match(html, /js\/simapo-ext\.js\?v=\d{8}[a-z]?/);
});

test('client: filter dropdown Daftar Aset (Kategori · Pemegang · Tahun) + tombol reset', () => {
  assert.match(extSrc, /window\._fillMasterFilters = function/);
  assert.match(extSrc, /window\._applyMasterFilters = function/);
  assert.match(extSrc, /window\.resetSAMasterFilter = function/);
  assert.match(extSrc, /document\.getElementById\('saFilterKat'\)/);
  assert.match(extSrc, /document\.getElementById\('saFilterPeg'\)/);
  assert.match(extSrc, /document\.getElementById\('saFilterTahun'\)/);
  assert.match(html, /id="saFilterKat"[\s\S]*id="saFilterPeg"[\s\S]*id="saFilterTahun"/);
  assert.match(extSrc, /window\._fillMasterFilters\(\);\s*\n\s*window\._applyMasterFilters\(\);/,
    'setelah load: isi opsi filter lalu terapkan (pilihan lama dipertahankan)');
  assert.match(html, /oninput="filterSAMaster\(\)"/, 'search memakai apply gabungan');
});

// Satu barang bisa dimiliki banyak unit dengan nilai perolehan berbeda
// (mis. 2 PC bekas pakai, satu 8.702.400 satu 11.523.680). Daftar & modal
// harus menampilkan data UNIT yang diklik, bukan harga/unit pertama barang.

test('server: unit-list-all kirim nilai perolehan unit, bukan harga satuan barang', () => {
  const sql = endpointSrc('unit-list-all');
  assert.match(sql, /COALESCE\(ua\.nilaiperolehan,b\.hargasatuan\) hargasatuan/,
    'kolom hargasatuan = nilai perolehan unit (fallback harga barang)');
  assert.match(sql, /COALESCE\(k\.nama,''\) kategori/,
    'unit-list-all ikut kirim nama kategori untuk dropdown filter');
  assert.match(sql, /LEFT JOIN "SIMAPO"\.kategori_barang k ON k\.id=b\.kategoriid/);
});

test('client: kartu daftar memakai hargasatuan (sudah nilai unit dari server)', () => {
  assert.match(extSrc, /fmt\(u\.hargasatuan \|\| 0\)/);
});

test('client: tombol Edit kartu membawa id unit; modal pakai unit itu, bukan unit pertama', () => {
  assert.match(extSrc, /showSimapoMasterForm\('\$\{u\.barangid\}', '\$\{u\.id\}'\)/,
    'Edit diklik dari kartu unit → kirim unit id');
  const fn = fnBody(extSrc, 'window.showSimapoMasterForm = async function', 'window.closeSimapoMasterForm');
  assert.match(fn, /function\(id = null, unitId = null\)/);
  assert.match(fn, /\(unitId && units\.find\(x => String\(x\.id\) === String\(unitId\)\)\) \|\| units\[0\]/,
    'cari unit yang diklik dulu; unit pertama hanya fallback');
});

function fnBody(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i > -1, `penanda awal ada: ${startMarker}`);
  const j = src.indexOf(endMarker, i + startMarker.length);
  assert.ok(j > -1, `penanda akhir ada: ${endMarker}`);
  return src.slice(i, j);
}
