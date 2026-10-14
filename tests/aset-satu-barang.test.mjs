// Kebijakan 1:1 — semua aset tetap = 1 barang = 1 unit. Tidak ada konsep
// "unit pertama/kedua/ketiga": setiap penambahan aset membuat barang BARU sendiri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extraSrc = readFileSync('server/simapo-native-extra.js', 'utf8');
const bastSrc = readFileSync('js/simapo-bast.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const splitSrc = readFileSync('scripts/split-unit-aset.mjs', 'utf8');

const section = (src, start, end) => {
  const i = src.indexOf(start);
  assert.ok(i > -1, `penanda awal ada: ${start}`);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > -1, `penanda akhir ada: ${end}`);
  return src.slice(i, j);
};

test('server: bast-import-unit selalu buat barang+unit baru (tanpa merge kode+nama)', () => {
  const fn = section(extraSrc, "r.post('/bast-import-unit'", "r.post('/unit-delete'");
  assert.doesNotMatch(fn, /WHERE NOT EXISTS\(SELECT 1 FROM bid\)/, 'tidak ada merge ke barang existing');
  assert.doesNotMatch(fn, /bid2 AS/, 'tidak ada jalur union bid lama');
  assert.match(fn, /WITH ins AS\(INSERT INTO "SIMAPO"\.barang/, 'langsung INSERT barang baru');
  assert.match(fn, /FROM ins RETURNING id,nomorinventaris/, 'unit menempel ke barang baru');
});

test('server: bulkAsset aset (punya nomor inventaris) buat barang baru; dobel inv dilewati', () => {
  const fn = section(extraSrc, 'const bulkAsset = async (req,res) => {', "r.post('/aset-massal'");
  assert.match(fn, /jenis\.includes\('aset'\)&&inv/, 'cabang 1:1 untuk aset');
  assert.match(fn, /ua\.nomorinventaris=\$1 AND b\.instansi_id=\$2/, 'idempoten lewat cek nomor inventaris');
  assert.doesNotMatch(fn, /SELECT id FROM "SIMAPO"\.barang WHERE kodebarang=\$1 AND nama=\$2 AND instansi_id=\$3 LIMIT 1[\s\S]{0,80}if\(!bid\)\{const z=await c\.query\(`INSERT INTO "SIMAPO"\.barang[\s\S]{0,40}gen_random_uuid\(\),\$1,\$2,\$3,\$4,\$5,\$6,\$7,0,/,
    'barang aset tidak lagi di-merge per kode+nama');
  assert.match(fn, /dilewati/, 'menghitung baris dilewati (duplikat)');
});

test('server: import-bapperida satu baris aset = satu barang (tanpa grup kode+nama)', () => {
  const fn = section(extraSrc, "r.post('/import-bapperida'", 'return res.json({ok:true,data:out});');
  assert.doesNotMatch(fn, /barangMap/, 'tidak ada grouping barangMap');
  assert.match(fn, /SATU BARIS ASET = SATU BARANG \+ SATU UNIT/);
  assert.match(fn, /barang_baru\+\+/, 'tiap baris aset = 1 barang baru');
});

test('script: split-unit-aset dry-run default, apply harus --apply-prod', () => {
  assert.match(splitSrc, /const APPLY = process\.argv\.includes\('--apply-prod'\)/);
  assert.match(splitSrc, /if \(!APPLY\)/, 'tanpa flag: hanya lapor + backup');
  assert.match(splitSrc, /--apply-prod/);
});

test('client: label pakai "Tambah Aset" (bukan "Tambah Unit"); cache-buster di-bump', () => {
  assert.match(bastSrc, /Tambah Aset ke Pegawai/);
  assert.match(bastSrc, /Tambah Aset Baru/);
  assert.match(bastSrc, /atau tambah aset baru/);
  assert.doesNotMatch(bastSrc, /Buat Unit Baru|Tambah Unit ke Pegawai/);
  assert.match(html, /Tidak ada aset\. Klik|Tambah Aset<\/button>/);
  assert.match(html, /js\/simapo-bast\.js\?v=\d{8}[a-z]?/);
});
