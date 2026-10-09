import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const JS = ['js/simapo.js', 'js/simapo-ext.js', 'js/simapo-bast.js'];

// Rentang emoji yang dipakai skrip deemoji. U+2190-21FF (panah mis. "→") sengaja
// TIDAK termasuk: itu bukan ikon, dan U+2192 harus tetap utuh.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{23EA}-\u{23FA}]/u;

// Hanya rentang Aset di index.html; seluruh isi panel lain di luar scope.
function asetRange() {
  const lines = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => /id="panel-simapo"/.test(l));
  const end = lines.findIndex(l => /id="panel-admin"/.test(l));
  assert.ok(start >= 0 && end > start, 'anchor #panel-simapo / #panel-admin harus ada');
  return lines.slice(start, end).join('\n');
}

test('tidak ada emoji tersisa di markup Aset index.html', () => {
  const hits = asetRange().split('\n').map((l, i) => [i + 1, l])
    .filter(([, l]) => EMOJI.test(l));
  assert.deepEqual(hits.map(([n, l]) => n + ': ' + l.trim().slice(0, 90)), []);
});

for (const file of JS) {
  test('tidak ada emoji tersisa di ' + file, () => {
    const hits = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/)
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => EMOJI.test(l));
    assert.deepEqual(hits.map(([n, l]) => n + ': ' + l.trim().slice(0, 90)), []);
  });
}

test('setiap ikon Font Awesome yang dipakai Aset benar-benar ada di runeicons.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/lib/runeicons.css'), 'utf8');
  const used = new Set();
  for (const src of [asetRange(), ...JS.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))]) {
    // tangkap nama kelas lengkap (fa-xxx) supaya bisa dicek langsung ke bundle
    for (const m of src.matchAll(/class="[^"]*?\b(fa-[a-z0-9-]+)/g)) used.add(m[1]);
  }
  const missing = [...used].filter(i => !css.includes('.fas.' + i + ' '));
  assert.deepEqual(missing, [], 'ikon hilang dari css/lib/runeicons.css');
  assert.ok(used.size > 0, 'harus ada minimal satu ikon terpakai, kalau nol test ini tidak berarti');
});

test('tombol Kembali dari header grid Aset masih ada', () => {
  const html = asetRange();
  assert.match(html, /id="aset-screen-head"/);
  assert.match(html, /ASET_NAV\.showGrid\(\)/);
  assert.match(html, /Kembali/);
});