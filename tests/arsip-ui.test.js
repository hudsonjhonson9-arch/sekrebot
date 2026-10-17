import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Uji SUMBER SEBENARNYA: jalankan js/arsip-ui.js sebagai script klasik di window palsu,
// supaya salinan di test tidak bisa "lolos" padahal implementasinya beda.
const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'arsip-ui.js'), 'utf8');
const win = {};
new Function('window', src)(win);
const UI = win.ArsipUI;

test('driveEmbedUrl: /file/d/<id>/view -> /preview', () => {
  assert.equal(
    UI.driveEmbedUrl('https://drive.google.com/file/d/ABCdef_123-xy/view'),
    'https://drive.google.com/file/d/ABCdef_123-xy/preview'
  );
  assert.equal(
    UI.driveEmbedUrl('https://drive.google.com/uc?export=view&id=ABCdef_123-xy'),
    'https://drive.google.com/file/d/ABCdef_123-xy/preview'
  );
});

test('driveEmbedUrl: non-Drive / kosong -> null', () => {
  assert.equal(UI.driveEmbedUrl('https://example.com/a.pdf'), null);
  assert.equal(UI.driveEmbedUrl(''), null);
  assert.equal(UI.driveEmbedUrl(null), null);
});

test('driveThumbUrl: pakai window.driveImgUrl bila ada, fallback sendiri bila tidak', () => {
  const win2 = { driveImgUrl: (u, s) => 'THUMB:' + u + ':' + s };
  new Function('window', src)(win2);
  assert.equal(win2.ArsipUI.driveThumbUrl('https://x/y.pdf'), 'THUMB:https://x/y.pdf:400');
  assert.equal(win2.ArsipUI.driveThumbUrl('https://x/y.pdf', 1000), 'THUMB:https://x/y.pdf:1000');

  assert.equal(
    UI.driveThumbUrl('https://drive.google.com/file/d/ABC/view', 400),
    'https://drive.google.com/thumbnail?id=ABC&sz=w400'
  );
  assert.equal(UI.driveThumbUrl('https://example.com/a.png'), 'https://example.com/a.png');
});

test('extOf & jenisFile', () => {
  assert.equal(UI.extOf({ title: 'Laporan 2026.PDF' }), 'pdf');
  assert.equal(UI.extOf({ title: 'Tanpa ekstensi' }), '');
  assert.equal(UI.extOf({ url: 'https://drive.google.com/file/d/ABC/view' }), '');
  assert.equal(UI.jenisFile({ title: 'a.pdf' }), 'pdf');
  assert.equal(UI.jenisFile({ title: 'a.jpeg' }), 'gambar');
  assert.equal(UI.jenisFile({ title: 'a.docx' }), 'lain');
});

test('extOf: url dipakai kalau judul tidak punya ekstensi', () => {
  // Dulu url tidak pernah dilihat selama judul terisi -> PDF Drive berjudul
  // "Laporan 2026" dikira 'lain' dan tidak pernah di-preview.
  assert.equal(UI.extOf({ title: 'Laporan 2026', url: 'https://x/laporan.pdf' }), 'pdf');
  assert.equal(UI.extOf({ title: 'Laporan 2026', url: 'https://drive.google.com/file/d/ABC/view' }), '');
  assert.equal(UI.extOf({ title: 'SK 2026.pdf', url: 'https://x/laporan.docx' }), 'pdf');
  assert.equal(UI.jenisFile({ title: 'Laporan 2026', url: 'https://x/laporan.jpeg' }), 'gambar');
});

test('modePreview: gambar->img, Drive->embed (semua jenis), sisanya->luar', () => {
  assert.equal(UI.modePreview({ title: 'foto.jpg', url: 'https://x/f.jpg' }), 'gambar');
  // Inti laporan "preview dokumen masih gagal": docx/xlsx di Drive tidak pernah
  // masuk cabang embed karena ekstensinya 'lain'.
  assert.equal(UI.modePreview({ title: 'Kajian 2024', url: 'https://drive.google.com/file/d/ABC/view' }), 'embed');
  assert.equal(UI.modePreview({ title: 'Kajian 2024.docx', url: 'https://drive.google.com/file/d/ABC/view' }), 'embed');
  assert.equal(UI.modePreview({ url: 'https://drive.google.com/uc?export=view&id=ABC' }), 'embed');
  // Foto di Drive tetap lewat <img> (lebih ringan), bukan iframe.
  assert.equal(UI.modePreview({ title: 'x.png', url: 'https://drive.google.com/file/d/ABC/view' }), 'gambar');
  // Tautan non-Drive memang tidak bisa di-embed.
  assert.equal(UI.modePreview({ title: 'a.docx', url: 'https://example.com/a.docx' }), 'luar');
  assert.equal(UI.modePreview({ title: 'a.docx' }), 'luar');
  assert.equal(UI.modePreview(null), 'luar');
});

test('warnaFile & ikonFile berubah per jenis', () => {
  assert.match(UI.warnaFile({ title: 'a.pdf' }), /^#/);
  assert.notEqual(UI.warnaFile({ title: 'a.pdf' }), UI.warnaFile({ title: 'a.xlsx' }));
  // Nama ikon harus terdaftar di css/lib/runeicons.css (lihat test markup);
  // doc/ppt/zip berbagi fa-file-alt karena tidak punya glyph sendiri.
  assert.equal(UI.ikonFile({ title: 'a.pdf' }), 'fa-file-pdf');
  assert.equal(UI.ikonFile({ title: 'a.jpg' }), 'fa-image');
  assert.equal(UI.ikonFile({ title: 'a.xlsx' }), 'fa-file-excel');
  assert.equal(UI.ikonFile({ title: 'a.doc' }), 'fa-file-alt');
  assert.equal(UI.ikonFile({ title: 'a.pptx' }), 'fa-file-alt');
  assert.equal(UI.ikonFile({ title: 'a.zip' }), 'fa-file-alt');
});

test('nav: tile membuka view, state lain direset', () => {
  assert.deepEqual(UI.nav({ view: 'home', folder: 'A', detail: '1' }, 'tile:dokumen'), {
    view: 'dokumen', folder: null, detail: null,
  });
  assert.equal(UI.nav({ view: 'home' }, 'tile:kk').view, 'kk');
  assert.equal(UI.nav({ view: 'home' }, 'tile:bd').view, 'bd');
  assert.equal(UI.nav({ view: 'home' }, 'tile:app').view, 'app');
  assert.equal(UI.nav({ view: 'home' }, 'tile:tidak-ada').view, 'home');
});

test('nav: back selalu ke grid beranda; detail-close tetap di daftar', () => {
  let s = UI.nav({ view: 'home', folder: null, detail: null }, 'folder:Bapperida');
  assert.deepEqual(s, { view: 'dokumen', folder: 'Bapperida', detail: null });
  s = UI.nav(s, 'detail:abc');
  assert.equal(s.detail, 'abc');

  // "Tutup" di detail: tutup overlay-nya saja, folder tetap terbuka.
  assert.deepEqual(UI.nav(s, 'detail-close'), { view: 'dokumen', folder: 'Bapperida', detail: null });

  // "Kembali": langsung ke grid, tidak menaik satu per satu.
  assert.deepEqual(UI.nav(s, 'back'), { view: 'home', folder: null, detail: null });
  assert.deepEqual(
    UI.nav({ view: 'dokumen', folder: null, detail: null }, 'back'),
    { view: 'home', folder: null, detail: null }
  );
});

test('nav: back dari kk/bd/app kembali ke beranda', () => {
  for (const v of ['kk', 'bd', 'app']) {
    assert.deepEqual(UI.nav({ view: v }, 'back'), { view: 'home', folder: null, detail: null });
  }
});

test('skeleton & empty menghasilkan HTML aman', () => {
  assert.equal((UI.skeleton('list', 3).match(/arsip-skel/g) || []).length, 3);
  assert.equal((UI.skeleton('list', 99).match(/arsip-skel/g) || []).length, 8);
  assert.match(UI.empty('Tidak ada <b>dokumen</b>'), /&lt;b&gt;/);
});
