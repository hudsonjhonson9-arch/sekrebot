import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/aset-screens.js'), 'utf8');
const win = {};
new Function('window', src)(win);
const SCREENS = win.ASET_SCREENS;

const USER_KEYS = ['katalog', 'pinjaman-saya', 'tiket-saya'];
const ADMIN_KEYS = ['master', 'kat', 'mutasi', 'opname', 'standar-harga', 'bast', 'pinjam',
  'tiket', 'penerimaan', 'pemeliharaan', 'bku', 'pks', 'pengaturan'];

test('tepat 16 layar: 3 user + 13 admin', () => {
  assert.equal(SCREENS.length, 16);
  assert.equal(SCREENS.filter(s => s.role === 'user').length, 3);
  assert.equal(SCREENS.filter(s => s.role === 'admin').length, 13);
});

test('key unik dan sesuai daftar yang_DISEPAKATI', () => {
  const keys = SCREENS.map(s => s.key);
  assert.equal(new Set(keys).size, 16, 'key duplikat');
  assert.deepEqual(keys.filter(k => k.endsWith('-saya') || k === 'katalog'), USER_KEYS);
  assert.deepEqual(keys.filter(k => !USER_KEYS.includes(k)), ADMIN_KEYS);
});

test('semua entri punya label, ikon, dan load berupa pasangan [fn, ...args]', () => {
  for (const s of SCREENS) {
    assert.equal(typeof s.label, 'string');
    assert.ok(s.label.trim().length > 0, `${s.key}: label kosong`);
    assert.match(s.icon, /^fa-[a-z0-9-]+$/, `${s.key}: format ikon`);
    assert.ok(Array.isArray(s.load), `${s.key}: load harus array`);
    for (const call of s.load) {
      assert.ok(Array.isArray(call) && typeof call[0] === 'string', `${s.key}: load harus [fn, ...args]`);
    }
  }
});

test('semua ikon benar-benar ada di bundle FontAwesome lokal', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/lib/font-awesome.min.css'), 'utf8');
  for (const s of SCREENS) {
    assert.ok(css.includes('.' + s.icon + ':before') || css.includes('.' + s.icon + '::before'),
      `${s.key}: ikon ${s.icon} tidak ada di font-awesome.min.css`);
  }
  for (const needed of ['fa-exclamation-triangle', 'fa-arrow-left']) {
    assert.ok(css.includes('.' + needed + ':before') || css.includes('.' + needed + '::before'),
      `ikon pendukung ${needed} tidak ada`);
  }
});

test('semua loader ada sebagai fungsi di file JS aplikasi', () => {
  const jsFiles = ['js/simapo.js', 'js/simapo-ext.js', 'js/simapo-bast.js', 'js/config.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const missing = new Set();
  for (const s of SCREENS) {
    for (const [fn] of s.load) {
      // aplikasi mendeklarasikan loader sebagai `window.fn = ...` (titik, bukan spasi)
      const declared = new RegExp(`(\\bfunction\\s+${fn}\\s*\\(|\\b${fn}\\s*=)`).test(jsFiles);
      if (!declared) missing.add(`${s.key}:${fn}`);
    }
  }
  assert.deepEqual([...missing], [], 'loader tidak ditemukan: ' + [...missing].join(', '));
});