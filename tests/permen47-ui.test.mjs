import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ext = read('js/simapo-ext.js');
const server = read('server/simapo.js');
const indexHtml = read('index.html');
const wwwIndexHtml = read('www/index.html');
const wwwExt = read('www/js/simapo-ext.js');

test('server mengirim laporan Permen 47 sebagai data.rows (kontrak)', () => {
  assert.ok(server.includes('rows: grouped.hierarchicalRows'), 'server harus mengirim data.rows berhirarki');
  assert.ok(ext.includes('Array.isArray(json.data.rows)'), 'frontend harus membaca json.data.rows dari server');
});

test('pratinjau memakai meta.total_nilai dan tidak menjumlahkan baris grup dua kali', () => {
  assert.ok(ext.includes('Number(meta.total_nilai)'), 'total footer harus dari meta.total_nilai');
  assert.ok(ext.includes('r.is_header ? s :'), 'subtotal baris grup tidak boleh ikut dijumlah');
});

test('filter default Permen 47 diisi dinamis dari periode/tahun berjalan', () => {
  assert.ok(ext.includes('window.initPermen47Filters'), 'fungsi initPermen47Filters harus ada');
  assert.ok(ext.includes('window._permen47FilterInit'), 'init harus berjalan hanya sekali');
  assert.ok(ext.includes("querySelector('option[value=\"TAHUNAN\"]')"), 'periode bawaan TAHUNAN');
  assert.match(ext, /const y = now\.getFullYear\(\)/, 'tahun bawaan diambil dari tahun berjalan');
  assert.ok(ext.includes('window.initPermen47Filters();'), 'loadLaporanPermen47 harus memanggil init');
});

test('pratinjau memakai 27 kolom template resmi Permen 47', () => {
  const label = [
    'Penggolongan dan Kodefikasi Barang', 'Spesifikasi Nama Barang', 'Merek', 'Jumlah Barang',
    'Satuan Barang', 'Harga Satuan', 'Total Nilai Barang', 'Total Biaya Atribusi',
    'Nilai Perolehan Barang', 'Harga Satuan Perolehan', 'Sub Kegiatan', 'Kode Sub Kegiatan',
    'Nama Sub Kegiatan', 'Kode Rekening', 'Uraian Belanja', 'Tanggal Perolehan',
    'Bentuk Kontrak', 'Nama Penyedia', 'Dokumen Sumber Perolehan', 'Ket.',
  ];
  for (const s of label) {
    assert.ok(ext.includes(s), 'label kolom template hilang di pratinjau: ' + s);
  }
  assert.ok(ext.includes('9 = 6 X 8') && ext.includes('11 = 9 + 10') && ext.includes('12 = 11 : 6'), 'baris nomor kolom 1..21 wajib ada');
  assert.ok(ext.includes('J U M L A H     T O T A L'), 'baris JUMLAH TOTAL wajib sama dengan template');
  assert.ok(ext.includes('min-width:1560px'), 'tabel 27 kolom harus bergulir horizontal');
  assert.ok(ext.includes('rowspan="3"') && ext.includes('colspan="7"'), 'header bertingkat seperti template');
});

test('pratinjau membaca kolom hasil enrich SQL (sub kegiatan, rekening, tanggal)', () => {
  assert.ok(ext.includes('r.nama_sub_kegiatan'), 'pratinjau harus menampilkan nama sub kegiatan');
  assert.ok(ext.includes('r.kode_rekening'), 'pratinjau harus menampilkan kode rekening');
  assert.ok(ext.includes('r.uraian_belanja'), 'pratinjau harus menampilkan uraian belanja');
  assert.ok(ext.includes('tglIndo'), 'tanggal perolehan diformat Indonesia seperti template');
  assert.ok(ext.includes('kode_parts'), 'baris grup memakai potongan kode barang per kolom');
});

test('index.html dan www/index.html identik + tag simapo-ext.js memakai versi yang sama', () => {
  assert.equal(indexHtml, wwwIndexHtml, 'index.html dan www/index.html harus identik');
  assert.equal(ext, wwwExt, 'js/simapo-ext.js dan www/js/simapo-ext.js harus identik');
  const tag = (s) => (s.match(/js\/simapo-ext\.js\?v=([\w-]+)/) || [])[1];
  assert.ok(tag(indexHtml), 'index.html harus memuat simapo-ext.js?v=');
  assert.equal(tag(indexHtml), tag(wwwIndexHtml), 'cache buster simapo-ext.js harus sama');
});
