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
