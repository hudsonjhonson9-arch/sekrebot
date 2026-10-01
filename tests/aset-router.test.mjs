import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Ambil satu deklarasi function dari source (scan kedalaman kurung kurawal),
// lalu eval-nya di sandbox supaya bisa diuji tanpa menarik seluruh file.
function extract(src, startRe) {
  const start = src.search(startRe);
  if (start < 0) throw new Error('deklarasi tidak ditemukan: ' + startRe);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('kurung kurawal tidak tertutup');
}

const userSrc = extract(fs.readFileSync(path.join(ROOT, 'js/simapo.js'), 'utf8'),
  /^function switchSimapoSection\(/m);
const adminSrc = extract(fs.readFileSync(path.join(ROOT, 'js/simapo-ext.js'), 'utf8'),
  /^window\.switchSATab = function\(/m);

function sandbox() {
  const calls = [];
  const win = {
    ASET_NAV: {
      open: (...a) => calls.push(['open', ...a]),
      showGrid: () => calls.push(['showGrid']),
      eagerLoad: () => ({ then: (fn) => { calls.push(['eagerLoad']); fn(); return {}; } }),
      renderGrid: () => calls.push(['renderGrid']),
    },
  };
  const load = new Function('window', userSrc + '\n' + adminSrc + '\nreturn switchSimapoSection;');
  return { win, calls, switchSimapoSection: load(win), switchSATab: win.switchSATab };
}

function sandboxTanpaNav() {
  const win = {};
  const load = new Function('window', userSrc + '\n' + adminSrc + '\nreturn switchSimapoSection;');
  return { win, switchSimapoSection: load(win), switchSATab: win.switchSATab };
}

test('router lama memetakan key markup lama ke key ASET_SCREENS', () => {
  const { switchSimapoSection: go, calls } = sandbox();
  go('katalog');
  go('pinjam');
  go('tiket');
  go('standar-harga');
  assert.deepEqual(calls, [
    ['open', 'katalog', false],
    ['open', 'pinjaman-saya', false],
    ['open', 'tiket-saya', false],
    ['open', 'standar-harga', false],
  ]);
});

test('force diteruskan ke open()', () => {
  const { switchSimapoSection: go, calls } = sandbox();
  go('pinjam', true);
  assert.deepEqual(calls, [['open', 'pinjaman-saya', true]]);
});

test("'grid' membuka grid lalu eager load — bukan open() layar mana pun", () => {
  const { switchSimapoSection: go, calls } = sandbox();
  go('grid');
  assert.deepEqual(calls, [['showGrid'], ['eagerLoad'], ['renderGrid']]);
});

test('router lama tidak melempar saat ASET_NAV belum termuat', () => {
  const { switchSimapoSection: go } = sandboxTanpaNav();
  assert.doesNotThrow(() => go('katalog'));
  assert.doesNotThrow(() => go('grid'));
});

test('switchSATab mendelegasikan nama tab admin apa adanya ke ASET_NAV', () => {
  const { switchSATab, calls } = sandbox();
  switchSATab('master');
  switchSATab('bast');
  assert.deepEqual(calls, [['open', 'master', false], ['open', 'bast', false]]);
});

test('switchSATab menormalkan alias pinjam-admin lalu meneruskan force', () => {
  const { switchSATab, calls } = sandbox();
  switchSATab('pinjam-admin', true);
  assert.deepEqual(calls, [['open', 'pinjam', true]]);
});

test('switchSATab tidak melempar saat ASET_NAV belum termuat', () => {
  const { switchSATab } = sandboxTanpaNav();
  assert.doesNotThrow(() => switchSATab('master'));
});