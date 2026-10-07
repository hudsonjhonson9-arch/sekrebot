import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const navSrc = fs.readFileSync(path.join(ROOT, 'js/aset-nav.js'), 'utf8');
const screensSrc = fs.readFileSync(path.join(ROOT, 'js/aset-screens.js'), 'utf8');

function load({ role = 'user', isAdminFlag = false, isSuperAdmin = false, profileRole = '', loaders = {} } = {}) {
  const store = { MY_ROLE: role };
  const win = {
    IS_ADMIN: isAdminFlag,
    userProfile: { role: profileRole },
    localStorage: { getItem: k => (k in store ? store[k] : null) },
  };
  win._isSuperAdmin = () => isSuperAdmin;
  Object.assign(win, loaders);
  const document = { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} };
  new Function('window', 'localStorage', 'document', screensSrc + '\n' + navSrc)(win, win.localStorage, document);
  return win;
}

test('isAdmin false untuk role biasa', () => {
  assert.equal(load({ role: 'operator' }).ASET_NAV.isAdmin(), false);
  assert.equal(load({ role: '' }).ASET_NAV.isAdmin(), false);
});

test('isAdmin true dari keempat sumber yang sudah dipakai app', () => {
  assert.equal(load({ role: 'admin' }).ASET_NAV.isAdmin(), true, 'MY_ROLE');
  assert.equal(load({ role: 'ADMIN_ASET' }).ASET_NAV.isAdmin(), true, 'MY_ROLE case-insensitive');
  assert.equal(load({ isSuperAdmin: true }).ASET_NAV.isAdmin(), true, '_isSuperAdmin()');
  assert.equal(load({ isAdminFlag: true }).ASET_NAV.isAdmin(), true, 'window.IS_ADMIN');
  assert.equal(load({ profileRole: 'Admin' }).ASET_NAV.isAdmin(), true, 'userProfile.role');
});

test('visibleScreens: 3 kartu untuk user biasa, 16 untuk admin', () => {
  assert.equal(load().ASET_NAV.visibleScreens().length, 3);
  assert.equal(load({ role: 'admin' }).ASET_NAV.visibleScreens().length, 16);
  assert.equal(load({ isSuperAdmin: true }).ASET_NAV.visibleScreens().length, 16);
});

test('visibleScreens tidak pernah membocorkan kartu admin ke non-admin', () => {
  const keys = load().ASET_NAV.visibleScreens().map(s => s.key);
  assert.deepEqual(keys, ['katalog', 'pinjaman-saya', 'tiket-saya']);
});

test('loaderCalls menutupi argumen dan melewati fungsi yang hilang', async () => {
  let seen = null;
  const win = load({ role: 'admin', loaders: { loadSimapoKategori: (...a) => { seen = a; } } });
  const nav = win.ASET_NAV;
  const kat = nav.visibleScreens().find(s => s.key === 'kat');
  const calls = nav.loaderCalls(kat);
  for (const c of calls) c();
  assert.deepEqual(seen, [true, false], 'loadSimapoKategori(isAdmin=true, force=false)');

  const opname = nav.visibleScreens().find(s => s.key === 'opname');
  const missing = nav.loaderCalls(opname); // loadOpnameForm sengaja tidak di-inject
  assert.doesNotThrow(() => missing.forEach(c => c()), 'fungsi hilang harus dilewati, bukan error');
});

test('loaderCalls(force) mengubah argumen terakhir, bukan argumen pertama', () => {
  let seen = null;
  const win = load({ role: 'admin', loaders: { loadSimapoKategori: (...a) => { seen = a; } } });
  const kat = win.ASET_NAV.visibleScreens().find(s => s.key === 'kat');
  win.ASET_NAV.loaderCalls(kat, true).forEach(c => c());
  // flag isAdmin (argumen pertama) harus tetap true; hanya force yang berubah.
  assert.deepEqual(seen, [true, true], 'loadSimapoKategori(isAdmin=true, force=true)');

  const master = win.ASET_NAV.visibleScreens().find(s => s.key === 'master');
  win.ASET_NAV.loaderCalls(master, true).forEach(c => c());
  assert.ok(seen !== null);

  const opname = win.ASET_NAV.visibleScreens().find(s => s.key === 'opname');
  assert.doesNotThrow(
    () => win.ASET_NAV.loaderCalls(opname, true).forEach(c => c()),
    'entri tanpa argumen + force harus jadi satu argumen true, bukan error'
  );
});

test('eagerLoad menjalankan loader yang ada dan menandai selesai', async () => {
  const calls = [];
  const win = load({
    role: 'admin',
    loaders: {
      loadAdminSimapoMaster: () => { calls.push('master'); },
      loadAdminBast: () => { calls.push('bast'); },
    },
  });
  const res = await win.ASET_NAV.eagerLoad();
  assert.ok(calls.includes('master'));
  assert.equal(res.filter(r => r.ok).length, res.length, 'semua loader yang ada harus selesai tanpa error');
  assert.equal(win._asetEagerDone, true, 'flag eager load terpasang');
});

test('eagerLoad menandai gagal tanpa melempar error', async () => {
  const win = load({
    role: 'admin',
    loaders: { loadAdminSimapoMaster: () => { throw new Error('boom'); } },
  });
  const res = await win.ASET_NAV.eagerLoad();
  const master = res.find(r => r.key === 'master');
  assert.equal(master.ok, false, 'layar yang gagal ditandai, bukan Exception');
  assert.match(String(master.error), /boom/);
});

test('eagerLoad hanya berjalan sekali per sesi', async () => {
  let n = 0;
  const win = load({ role: 'admin', loaders: { loadAdminSimapoMaster: () => { n++; } } });
  await win.ASET_NAV.eagerLoad();
  const second = await win.ASET_NAV.eagerLoad();
  assert.equal(n, 1, 'loader tidak boleh dipanggil dua kali');
  assert.deepEqual(second, [], 'panggilan kedua mengembalikan hasil kosong');
});