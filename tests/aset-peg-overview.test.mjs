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
  return bastSrc.slice(start, next > 0 ? next : start + 8000);
}

test('aset pegawai: tanpa pilihan → overview pemegang aset langsung tampil', () => {
  const body = fnBody('renderAsetPegList');
  assert.doesNotMatch(body, /Pilih pegawai untuk melihat/, 'pesan "pilih dulu" diganti overview');
  assert.match(body, /<details open/, 'grup per pemegang pakai <details open> — tampil langsung');
  assert.match(body, /pemegang<\/b>/, 'ada ringkasan jumlah pemegang + unit');
  assert.match(body, /Pegawai tidak terdaftar/, 'unit dengan pegawai_id yatim tetap tampil');
});

test('aset pegawai: mode 1 pegawai (head + Export Excel) tetap berfungsi', () => {
  const body = fnBody('renderAsetPegList');
  assert.match(body, /if \(pe\) \{/, 'filter per pegawai tidak dihapus');
  assert.match(body, /asetPegExportExcel/);
  assert.match(body, /function card\(a\)/, 'kartu aset dipakai ulang di kedua mode');
});

test('bast-list mengirim tahunperolehan; cache-buster simapo-bast di-bump', () => {
  assert.match(extraSrc, /ua\.tahunperolehan,b\.nama nama_barang/,
    'bast-list harus memilih tahunperolehan agar chip Tahun tampil');
  assert.match(html, /js\/simapo-bast\.js\?v=20261014/);
});

test('bast-list: id pegawai = user_list.id, bukan NIP (regresi pemetaan aset)', () => {
  // unit_aset.pegawai_id menyimpan user_list.id (mis. 8005983102). Kalau daftar
  // pegawai memakai NIP sebagai id, 0 unit cocok → layar "Aset Pegawai" kosong.
  assert.match(extraSrc, /u\.id::text id,COALESCE\(u\."NIP",''\) nip,u\.username nama/);
});
