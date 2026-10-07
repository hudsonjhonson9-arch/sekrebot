import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lines = html.split(/\r?\n/);
const screensSrc = fs.readFileSync(path.join(ROOT, 'js/aset-screens.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(ROOT, 'js/aset-nav.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');

const win = {};
new Function('window', screensSrc)(win);
const SCREENS = win.ASET_SCREENS;

const jsAll = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');

test('16 layar, masing-masing punya section unik di markup', () => {
  assert.equal(SCREENS.length, 16);
  const ids = [...html.matchAll(/id="aset-sect-([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.slice().sort(), SCREENS.map(s => s.key).sort());
  assert.equal(new Set(ids).size, 16, 'tidak boleh ada section ganda');
});

test('semua loader di ASET_SCREENS benar-benar terdefinisi (ASET_NAV resolve via window[name])', () => {
  assert.match(navSrc, /typeof window\[name\] === 'function'/);
  const missing = [];
  for (const s of SCREENS) {
    for (const [fn] of s.load) {
      const re = new RegExp('(function\\s+' + fn + '\\b|\\b' + fn + '\\s*=\\s*(async\\s*)?function|window\\.' + fn + '\\s*=)');
      if (!re.test(jsAll)) missing.push(s.key + ' -> ' + fn);
    }
  }
  assert.deepEqual(missing, []);
});

test('13 payload admin menjadi saudara #simapoInstansiSection, bukan anak Panel Admin', () => {
  const inst = lines.findIndex(l => /id="simapoInstansiSection"/.test(l));
  const panelAdmin = lines.findIndex(l => /id="panel-admin"/.test(l));
  const admin = SCREENS.filter(s => s.role === 'admin').map(s => lines.findIndex(l => l.includes('id="aset-sect-' + s.key + '"')));
  assert.equal(SCREENS.filter(s => s.role === 'admin').length, 13);
  for (const i of admin) {
    assert.ok(i > inst, 'harus setelah #simapoInstansiSection');
    assert.ok(i < panelAdmin, 'harus sebelum #panel-admin');
  }
});

test('grid + header Kembali mendahului SEMUA 16 section, termasuk 3 layar user', () => {
  // Regresi: 3 section user pernah mendahului #aset-screen-head, jadi tombol
  // Kembali + judul tampil DI BAWAH konten untuk user biasa.
  const grid = lines.findIndex(l => l.includes('id="aset-grid"'));
  const head = lines.findIndex(l => l.includes('id="aset-screen-head"'));
  assert.ok(grid > 0 && head > 0, 'grid dan header harus ada');
  assert.ok(grid < head, 'grid harus sebelum header');
  const user = SCREENS.filter(s => s.role === 'user').map(s => s.key);
  assert.ok(user.length > 0, 'harus ada layar user');
  for (const s of SCREENS) {
    const i = lines.findIndex(l => l.includes('id="aset-sect-' + s.key + '"'));
    assert.ok(i > head, s.key + ' harus setelah #aset-screen-head');
  }
});

test('grid 4/3/2 responsif dan .aset-sect tersembunyi secara default', () => {
  assert.match(html, /\.aset-grid\{display:grid;grid-template-columns:repeat\(4,1fr\)/);
  assert.match(html, /max-width:1100px\)\{\.aset-grid\{grid-template-columns:repeat\(3,1fr\)/);
  assert.match(html, /max-width:720px\)\{\.aset-grid\{grid-template-columns:repeat\(2,1fr\)/);
  assert.match(html, /\.aset-sect\{display:none\}/);
});

test('aset-screens/aset-nav dimuat sebelum file yang memakainya', () => {
  const at = f => lines.findIndex(l => l.includes('src="js/' + f));
  const iScreens = at('aset-screens.js'), iNav = at('aset-nav.js');
  assert.ok(iScreens > 0 && iNav > 0, 'kedua script harus ikut dimuat');
  assert.ok(iScreens < iNav, 'aset-screens.js harus mendahului aset-nav.js');
  assert.ok(iNav < at('simapo-ext.js'), 'aset-nav.js harus mendahului simapo-ext.js');
  assert.ok(iNav < at('simapo.js'), 'aset-nav.js harus mendahului simapo.js');
});

test('sidebar Aset membuka grid, bukan langsung Katalog', () => {
  assert.match(html, /onclick="switchTab\('simapo', true\)" data-tab="simapo"/);
  assert.match(uiSrc, /switchSimapoSection\('grid'\)/);
  assert.doesNotMatch(uiSrc, /switchSimapoSection\('katalog'\)/);
});

test('ADMIN GUDANG tidak pernah terjebak di Panel Admin', () => {
  assert.match(uiSrc, /localStorage\.removeItem\('absen_last_admin_section'\)/);
  assert.match(uiSrc, /switchTab\('simapo', true\)/);
  assert.match(uiSrc, /!\$\('admin-section-' \+ sectionId\)/, 'section basi -> fallback ops');
});

test('setiap section yang dipanggil switchAdminSection benar-benar ada', () => {
  // switchAdminSection jatuh ke 'ops' bila targetnya hilang; kalau 'ops' sendiri
  // hilang, panel admin jadi dead-end (semua section tersembunyi).
  const called = [...new Set([...html.matchAll(/switchAdminSection\('([a-z-]+)'\)/g)].map(m => m[1]))];
  assert.ok(called.length > 0, 'harus ada pemanggilan switchAdminSection');
  const hilang = called.filter(id => !html.includes('id="admin-section-' + id + '"'));
  assert.deepEqual(hilang, []);
  assert.ok(html.includes('id="admin-section-ops"'), 'fallback "ops" harus ada');
});

test('tidak ada referensi ke ID/tab strip lama di source', () => {
  for (const re of [/admin-section-simapo-admin/, /btn-nav-simapo-admin/, /\bsa-sect-/, /\bsa-tab-/, /\bsa-group-/, /simapo-section-/]) {
    assert.doesNotMatch(html, re, 'index.html masih punya ' + re);
  }
  assert.doesNotMatch(navSrc + fs.readFileSync(path.join(ROOT, 'js/simapo-ext.js'), 'utf8'), /switchSAGroup/);
});

test('landmark grid & header Kembali ada', () => {
  assert.match(html, /id="aset-grid"/);
  assert.match(html, /id="aset-screen-head"/);
  assert.match(html, /ASET_NAV\.showGrid\(\)/);
  assert.match(html, /Kembali/);
});