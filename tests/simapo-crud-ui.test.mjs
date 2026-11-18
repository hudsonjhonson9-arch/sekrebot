import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const indexHtml = read('index.html');
const wwwIndexHtml = read('www/index.html');
const ext = read('js/simapo-ext.js');
const wwwExt = read('www/js/simapo-ext.js');
const cfg = read('js/config.js');
const wwwCfg = read('www/js/config.js');

const vtag = (src, file) => (src.match(new RegExp('js/' + file + '\\?v=([\\w-]+)')) || [])[1];

test('salinan www/ tersinkronisasi untuk file yang diubah', () => {
  assert.equal(indexHtml, wwwIndexHtml, 'index.html dan www/index.html harus identik');
  assert.equal(ext, wwwExt, 'js/simapo-ext.js dan www/js/simapo-ext.js harus identik');
  assert.equal(cfg, wwwCfg, 'js/config.js dan www/js/config.js harus identik');
});

test('cache buster simapo-ext.js & config.js sama di index.html dan www/index.html', () => {
  for (const f of ['simapo-ext.js', 'config.js']) {
    assert.ok(vtag(indexHtml, f), `index.html harus memuat js/${f}?v=`);
    assert.equal(vtag(indexHtml, f), vtag(wwwIndexHtml, f), `versi js/${f} harus sama`);
  }
});

test('endpoint CRUD penerimaan & pemeliharaan terdaftar di config', () => {
  for (const key of ['simapoPenerimaanUpdate', 'simapoPenerimaanDelete', 'simapoPemeliharaanUpdate', 'simapoPemeliharaanDelete']) {
    assert.ok(cfg.includes(key + ':'), `config.js harus memuat ${key}`);
  }
  assert.ok(cfg.includes("simapoPenerimaanUpdate: '/api/simapo/penerimaan-update'"));
  assert.ok(cfg.includes("simapoPenerimaanDelete: '/api/simapo/penerimaan-delete'"));
  assert.ok(cfg.includes("simapoPemeliharaanUpdate: '/api/simapo/pemeliharaan-update'"));
  assert.ok(cfg.includes("simapoPemeliharaanDelete: '/api/simapo/pemeliharaan-delete'"));
});

test('form penerimaan & pemeliharaan punya elemen judul dan tombol simpan yang diberi id', () => {
  for (const id of ['penerimaanFormTitle', 'btnSavePenerimaan', 'pemeliharaanFormTitle', 'btnSavePemeliharaan']) {
    assert.ok(indexHtml.includes(`id="${id}"`), `index.html harus memuat id="${id}"`);
  }
  // Tombol simpan tetap memanggil handler yang sama di mode tambah maupun ubah.
  assert.ok(indexHtml.includes('onclick="savePenerimaan()"'));
  assert.ok(indexHtml.includes('onclick="savePemeliharaan()"'));
});

test('daftar penerimaan & kartu pemeliharaan menampilkan tombol Ubah/Hapus', () => {
  assert.ok(ext.includes('onclick="window.editPenerimaan('), 'kartu penerimaan harus punya tombol ubah');
  assert.ok(ext.includes('onclick="window.deletePenerimaan('), 'kartu penerimaan harus punya tombol hapus');
  assert.ok(ext.includes('onclick="window.editPemeliharaan('), 'baris kartu pemeliharaan harus punya tombol ubah');
  assert.ok(ext.includes('onclick="window.deletePemeliharaan('), 'baris kartu pemeliharaan harus punya tombol hapus');
  assert.ok(ext.includes('TOTAL BIAYA:') && ext.includes('colspan="4"'), 'footer kartu menyesuaikan kolom Aksi');
});

test('mode edit memakai endpoint update dan me-reset mode setelah simpan/tutup', () => {
  assert.ok(ext.includes('P.simapoPenerimaanUpdate'), 'save penerimaan harus bisa memakai endpoint update');
  assert.ok(ext.includes('P.simapoPemeliharaanUpdate'), 'save pemeliharaan harus bisa memakai endpoint update');
  assert.ok(ext.includes('window.setModePenerimaan(null)'), 'mode edit penerimaan harus bisa direset');
  assert.ok(ext.includes('window.setModePemeliharaan(null)'), 'mode edit pemeliharaan harus bisa direset');
  assert.ok(ext.includes('window._penerimaanEditId'), 'id nota yang diedit harus disimpan');
  assert.ok(ext.includes('window._pemeliharaanEditId'), 'id baris yang diedit harus disimpan');
});

test('daftar nota penerimaan tampil (permukaan Ubah/Hapus) di kartu Laporan Pengadaan', () => {
  // display:none membuat tombol Ubah/Hapus mustahil ditemukan: layar penerimaan
  // tidak pernah menyalakan div ini, sehingga CRUD terasa "belum bisa".
  const baris = (indexHtml.match(/<div id="adminPenerimaanList"[^>]*>/) || [])[0];
  assert.ok(baris, 'index.html harus memuat <div id="adminPenerimaanList">');
  assert.doesNotMatch(baris, /display:\s*none/, 'daftar nota tidak boleh tersembunyi');
  assert.match(baris, /display:\s*block/, 'daftar nota harus tampil');
  assert.match(indexHtml, /Daftar Nota Penerimaan — Ubah \/ Hapus/, 'butuh judul penanda permukaan CRUD');
});

test('tombol Ubah/Hapus hanya dirender untuk role berhak (SUPERADMIN/ADMIN/BENDAHARA BARANG)', () => {
  assert.ok(ext.includes('window.simapoBolehUbah = function'), 'helper hak ubah harus ada');
  for (const role of ['superadmin', 'admin', 'bendaharabarang']) {
    assert.ok(ext.includes(`r === '${role}'`), `helper harus mengizinkan role ${role}`);
  }
  const dipakai = ext.split('window.simapoBolehUbah()').length - 1;
  assert.ok(dipakai >= 2, 'kartu penerimaan dan baris pemeliharaan harus sama-sama memakai helper');
});

