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

test('index.html dan www/index.html identik + tag simapo-ext.js memakai versi yang sama', () => {
  assert.equal(indexHtml, wwwIndexHtml, 'index.html dan www/index.html harus identik');
  assert.equal(ext, wwwExt, 'js/simapo-ext.js dan www/js/simapo-ext.js harus identik');
  const tag = (s) => (s.match(/js\/simapo-ext\.js\?v=([\w-]+)/) || [])[1];
  assert.ok(tag(indexHtml), 'index.html harus memuat simapo-ext.js?v=');
  assert.equal(tag(indexHtml), tag(wwwIndexHtml), 'cache buster simapo-ext.js harus sama');
});
