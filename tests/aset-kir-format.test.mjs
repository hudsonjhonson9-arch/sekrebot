import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const bastSrc = fs.readFileSync(path.join(ROOT, 'js', 'simapo-bast.js'), 'utf8');
const extraSrc = fs.readFileSync(path.join(ROOT, 'server', 'simapo-native-extra.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function fnBody(name) {
  const start = bastSrc.indexOf('window.' + name + ' =');
  assert.ok(start >= 0, name + ' harus ada di js/simapo-bast.js');
  const next = bastSrc.indexOf('\nwindow.', start + 1);
  return bastSrc.slice(start, next > 0 ? next : start + 9000);
}

test('KIR mengikuti format resmi: kop, info, 14 kolom, jumlah, 2 tanda tangan', () => {
  const body = fnBody('cetakKIR');
  assert.match(body, /PEMERINTAH KABUPATEN /, 'kop pemerintah');
  assert.match(body, /KARTU INVENTARIS RUANGAN \(KIR\)/);
  assert.match(body, /<b>Provinsi<\/b>/, 'blok info provinsi');
  assert.match(body, /<b>Ruangan<\/b>/, 'blok info ruangan');
  // kolom mengikuti aplikasi aset-bapperida referensi
  for (const h of ['Nama Barang', 'Merk / Model', 'No. Seri / Ukuran', 'Bahan', 'Tahun',
    'Kode Barang', 'No. Register', 'Jumlah', 'Harga Perolehan (Rp)', 'Keterangan']) {
    assert.ok(body.includes(h), 'kolom ' + h + ' harus ada');
  }
  assert.match(body, /Keadaan Barang/, 'grouping Keadaan Barang');
  assert.match(body, /Kurang Baik[\s\S]*Rusak Berat/);
  assert.match(body, /JUMLAH/, 'footer jumlah');
  assert.match(body, /@page\{size:A4 landscape/, 'cetak lanskap');
});

test('KIR: kepala = Kepala Badan, PJ = penanggung ruangan (nama + NIP)', () => {
  const body = fnBody('cetakKIR');
  assert.match(body, /\/\^Kepala Badan\/i\.test/, 'kepala otomatis dari jabatan Kepala Badan');
  assert.match(body, /Mengetahui,/);
  assert.match(body, /Penanggung Jawab Ruangan/);
  assert.match(body, /penanggung_nama/, 'PJ diambil dari baris ruangan');
  assert.match(body, /NIP\. /, 'kedua blok tanda tangan memuat NIP');
  assert.match(body, /Waikabubak/, 'kota pada blok PJ');
});

test('layar Ruangan: tombol PJ + form penanggung jawab tersimpan via bast-ruangan', () => {
  assert.match(bastSrc, /window\.aturPenanggungJawab = async function/);
  assert.match(bastSrc, /P\.simapoBastRuangan/, 'menyimpan lewat endpoint bast-ruangan');
  assert.match(bastSrc, /aturPenanggungJawab\(/, 'tombol PJ tertanam di baris ruangan');
  assert.match(bastSrc, /penanggung_id: p \? p\.id : ''/);
  assert.match(html, /js\/simapo-bast\.js\?v=\d{8}[a-z]?/,
    'cache-buster simapo-bast.js harus ada di index.html');
});

test('server: kolom penanggung di ruangan + bast-ruangan mode ubah + kolom KIR di bast-list', () => {
  assert.match(extraSrc, /ruangan ADD COLUMN IF NOT EXISTS penanggung_id TEXT/,
    'bast-init menyiapkan kolom penanggung');
  assert.match(extraSrc, /UPDATE "SIMAPO"\.ruangan SET penanggung_id=\$2/,
    'bast-ruangan mendukung mode ubah (kirim id)');
  assert.match(extraSrc, /ua\.no_register,''\) no_register,COALESCE\(ua\.bahan,''\) bahan,COALESCE\(ua\.ukuran,''\) ukuran/,
    'bast-list mengirim kolom KIR: no_register, bahan, ukuran');
  assert.match(extraSrc, /ua\.keterangan,''\) keterangan/,
    'bast-list mengirim keterangan');
});
