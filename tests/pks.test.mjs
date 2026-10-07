import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'js/simapo-ext.js'), 'utf8');
const wf = fs.readFileSync(path.join(ROOT, 'n8n/SIMAPO PKS — Program, Kegiatan, Subkegiatan.json'), 'utf8');

// pksOptionsHtml hanya butuh document.getElementById; stub minimal cukup.
globalThis.document = { getElementById: () => null, addEventListener: () => {} };
const win = {};
new Function('window', 'document', src)(win, globalThis.document);

const PROGRAMS = [
  { id: 18, kode: '5.01', nama: 'Peny|Perencanaan' },
  { id: 19, kode: '5.02', nama: 'Sumber Daya' }
];

test('dropdown custom pakai kelas CSS bawaan, bukan <select> native yang terlihat', () => {
  assert.match(html, /id="pksParentDropdown"[^>]*class="custom-search-dropdown"|class="custom-search-dropdown" id="pksParentDropdown"/);
  const wrap = html.slice(html.indexOf('id="pksParentDropdown"'), html.indexOf('id="pksParentDropdown"') + 200);
  assert.doesNotMatch(wrap, /<select class="form-input"/, 'native select tidak boleh tampil');
});

test('dropdown menghasilkan trigger+list+select tersembunyi, dan id integer jadi string', () => {
  const out = win.pksDropdownHtml('dd1', 'pksParentSelect', PROGRAMS, 18, { ph: 'cari...', empty: '-- Semua --' });
  assert.match(out, /class="dropdown-trigger"/);
  assert.match(out, /class="dropdown-list-wrap"/);
  assert.match(out, /<select id="pksParentSelect" style="display:none">/);
  assert.match(out, /<option value="18" selected>\[5\.01\] Peny\|Perencanaan<\/option>/);
  assert.match(out, /value="\[5\.01\] Peny\|Perencanaan"/, 'trigger menampilkan label pilihan');
});

test('pencarian dropdown menyaring kode dan nama, dan kosong -> "Tidak ditemukan"', () => {
  win.pksDropdownHtml('dd2', 'sel2', PROGRAMS, '', { ph: 'cari...', empty: '-- Semua --' });
  const hitKode = win.pksOptionsHtml('dd2', '5.02');
  assert.equal((hitKode.match(/class="dropdown-item/g) || []).length, 1);
  assert.match(hitKode, /Sumber Daya/);
  const hitNama = win.pksOptionsHtml('dd2', 'sumber');
  assert.equal((hitNama.match(/class="dropdown-item/g) || []).length, 1);
  assert.match(win.pksOptionsHtml('dd2', 'zzz'), /Tidak ditemukan/);
  assert.equal((win.pksOptionsHtml('dd2', '').match(/class="dropdown-item/g) || []).length, 2);
});

test('nama disescaped supaya tidak injecting markup ke option/label', () => {
  const out = win.pksDropdownHtml('dd3', 'sel3', [{ id: 1, kode: 'X', nama: '<img src=x onerror=alert(1)>' }], '', { ph: 'p', empty: 'e' });
  assert.doesNotMatch(out, /<img/, 'markup dari DB tidak boleh ikut ter-render');
  assert.match(out, /&lt;img/);
});

test('cari item pakai String() — id integer dari JSON vs id string dari onclick', () => {
  // id_aset/pks_* sekarang serial integer; onclick selalu mengirim string.
  assert.doesNotMatch(src, /find\(d => d\.id === id\)/, 'perbandingan ketat integer/string akan gagal');
  assert.equal((PROGRAMS.find(d => String(d.id) === String('18')) || {}).kode, '5.01');
});

test('form PKS memakai dropdown custom yang sama, nilai lewat select tersembunyi', () => {
  assert.match(src, /pksDropdownHtml\('pksFormParentDd', 'pksFormParent'/);
  assert.doesNotMatch(src, /<select id="pksFormParent" class="form-input"/, 'native select tidak boleh tampil di modal');
  assert.match(src, /document\.getElementById\('pksFormParent'\)\.value/, 'preConfirm masih membaca select tersembunyi');
});

test('dropdown di modal Swal dibuat position:relative agar tidak ter-clip', () => {
  assert.match(src, /opts\.static \? ' style="position:relative/, 'list absolut akan dipotong .swal2-popup{overflow:auto}');
  assert.match(src, /empty: '-- Pilih Parent --', static: true/);
});

test('tidak ada placeholder HTML mentah di markup', () => {
  assert.doesNotMatch(html, /placeholder="<i/, 'placeholder harus teks polos, bukan tag');
  assert.match(html, /id="pksSearch"[^>]*placeholder="Cari kode atau nama\.\.\."/);
  assert.match(html, /id="saSearchMaster"[^>]*placeholder="Cari nama atau kode aset\.\.\."/);
  assert.match(html, /id="shSearch"[^>]*placeholder="Cari barang atau harga\.\.\."/);
});

test('workflow PKS membaca & menulis tabel public, bukan schema SIMAPO yang kosong', () => {
  assert.doesNotMatch(wf, /"SIMAPO"\./, 'tabel SIMAPO program/kegiatan/subkegiatan kosong');
  assert.doesNotMatch(wf, /::uuid/, 'public.pks_* memakai serial integer');
  for (const t of ['pks_program', 'pks_kegiatan', 'pks_subkegiatan', 'pks_tahun']) {
    assert.match(wf, new RegExp('public\\.' + t), 'harus akses ' + t);
  }
  assert.doesNotMatch(wf, /ON CONFLICT \(kode\)/, 'unique constraint public adalah (kode, tahun)');
  assert.match(wf, /ON CONFLICT \(kode, tahun\)/);
});