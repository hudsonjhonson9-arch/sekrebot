# Konsolidasi Menu Aset (16 Kartu) Implementation Plan

> **Status: DONE (2026-10-02).** Task 1–4 selesai, Task 5 Step 1–4 terverifikasi (`node --test` → **41 pass, 0 fail**). Step 5 (penjaga backend) ditunda ke milestone 2 — butuh `N8N_TOKEN` dan tidak ada perubahan backend di plan ini.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua 16 fitur aset (3 user + 13 admin)-Berada di satu grid di dalam sidebar Aset, dengan role gate, eager load fail-soft, dan navigasi bolak-balik grid↔layar.

**Architecture:** Satu konstanta data `window.ASET_SCREENS` (`js/aset-screens.js`) menjadi sumber kebenaran untuk grid, router, dan eager load. Satu modul perilaku `window.ASET_NAV` (`js/aset-nav.js`) menangani gate role, render grid, routing `openAsetScreen`, dan orkestrasi eager load. Router lama (`switchSimapoSection`, `switchSATab`, `switchSAGroup`) dibungkus/dipecah agar tidak ada pemanggil yatim. Markup 13 `.sa-sect` admin dipindahkan dari `#panel-admin` ke `#simapoInstansiSection` di `#panel-simapo`, dengan id diratakan ke `aset-sect-*`.

**Tech Stack:** HTML statis + JavaScript classic script (window global), CSS inline di `index.html`, FontAwesome lokal. Test: `node:test` bawaan Node 22 (tanpa dependensi baru).

## Global Constraints

- **Nol perubahan database/API.** Tidak menyentuh n8n workflow, webhook, SQL, atau kontrak endpoint.
- **Tanpa dependensi baru.** Tidak ada npm install, tidak ada test framework, tidak ada icon CDN.
- File yang boleh dibuat: `js/aset-screens.js`, `js/aset-nav.js`, `tests/aset-screens.test.mjs`, `tests/aset-nav.test.mjs`, `tests/aset-emoji.test.mjs`. Selain itu hanya modifikasi `index.html`, `js/simapo.js`, `js/simapo-ext.js`, `js/simapo-bast.js`.
- `npm run lint` **tidak boleh dipakai sebagai gate** — baseline repo gagal 16.107 error `no-undef`. Gate syntax: `node --check <file>`.
- Jangan sentuh `www/` (salinan) dan jangan sentuh `css/styles.css` / `css/styles 1.css`.
- Emoji hanya boleh dihapus di markup yang dipindah (16 layar Aset) dan di `js/simapo.js`, `js/simapo-ext.js`, `js/simapo-bast.js`. Emoji di area lain (absen, profile, PDF, rekap, AI) **tetap**.
- Semua ikon harus sudah ada di `css/lib/font-awesome.min.css`. `fa-ticket` tidak ada → `fa-ticket-alt`.
- Loader harus memakai fungsi global yang sudah ada. **Dilarang** menambah loader/endpoint baru.
- Satu task = satu commit.
- Idempoten: setiap langkah_idempoten boleh diulang setelah gagal tanpa merusak state.

---

## File Structure

| File | Tanggung jawab | Status |
|---|---|---|
| `js/aset-screens.js` | Data 16 layar: `key`, `label`, `icon`, `role`, `load` (pasangan `[fn, ...args]`). Tanpa DOM. | Create |
| `js/aset-nav.js` | Perilaku navigasi: `isAdmin`, `visibleScreens`, `loaderCalls`, `renderGrid`, `open`, `eagerLoad`, `showGrid`. Satu file, satu tujuan. | Create |
| `js/simapo.js` | Loader user + pembungkus `switchSimapoSection` (router lama jadi tipis). | Modify |
| `js/simapo-ext.js` | Loader admin + pembungkus `switchSATab`; `switchSAGroup` dihapus. | Modify |
| `js/simapo-bast.js` | Loader BAST; hanya emoji→ikon. Logika tidak diubah. | Modify |
| `index.html` | Grid + 16 markup kartu + CSS `.aset-grid`/`.aset-card`; nav Inventaris, group bar, tab bar, dan tab strip user dihapus. | Modify |
| `tests/aset-screens.test.mjs` | Invarian data: 16 entri, key unik, ikon ada, loader ada. | Create |
| `tests/aset-nav.test.mjs` | Logika murni: `isAdmin` (4 sumber role), filter role, resolusi loader. | Create |
| `tests/aset-emoji.test.mjs` | Gate: nol emoji di markup Aset + 3 file `simapo*.js`. | Create |

Anchor faktual di `index.html` (HEAD `1fb947b`, bergeser setelah tiap edit — selalu verifikasi ulang dengan grep sebelum memotong):

| Anchor | Baris |
|---|---|
| `#panel-simapo` | 1331 |
| `#simapoInstansiSection` | 1337 (tutup di 1493) |
| 3 tombol `.simapo-tab-btn` | 1348, 1351, 1354 (baris 1345–1357) |
| `<style>` `.simapo-tab-btn` | 1358–1407 |
| `#simapo-section-katalog` | 1410 |
| `#simapo-section-pinjam` | 1424 |
| `#simapo-section-tiket` | 1474 (tutup 1492) |
| `#panel-admin` | 1497 |
| `#btn-nav-simapo-admin` (nav Inventaris) | 1518 |
| `#admin-section-simapo-admin` | 1522–1972 |
| group selector `sa-group-*` | 1533–1538 |
| tab bar `sa-tab-*` + `<style>` | 1540–1570 |
| `.sa-sect` pertama `#sa-sect-master` | 1611 |
| `.sa-sect` terakhir `#sa-sect-bast` | 1918 (blok BAST + Riwayat BAST sampai 1971) |
| `<script>` `js/simapo-ext.js` | 3209 |
| `<script>` `js/simapo-bast.js` | 3210 |
| `<script>` `js/simapo.js` | 3219 |

Router lama punya pemanggil internal yang wajib dijaga:
- `switchSimapoSection` — 13 pemanggil di `index.html` (tombol tab yang dihapus di Task 3) + **7 di `js/simapo.js`** (dipanggil setelah save/refresh).
- `switchSATab` — 13 pemanggil di `index.html` (tab bar yang dihapus di Task 3) + 2 di `js/simapo-ext.js`.
- `switchSAGroup` — hanya 3 pemanggil (group button, dihapus di Task 3) + definisi di `js/simapo-ext.js:898`. Tidak ada pemanggil lain → boleh dihapus.

---

### Task 1: Konstanta data 16 layar

**Files:**
- Create: `js/aset-screens.js`
- Test: `tests/aset-screens.test.mjs`

**Interfaces:**
- Consumes: `css/lib/font-awesome.min.css`, `js/simapo.js`, `js/simapo-ext.js`, `js/simapo-bast.js`, `js/config.js` (hanya dibaca oleh test).
- Produces: `window.ASET_SCREENS` — `Array<{key: string, label: string, icon: string, role: 'user'|'admin', load: Array<[string, ...any[]]>}>`, panjang 16, 3 `role:'user'`, 13 `role:'admin'`.

- [x] **Step 1: Tulis test yang gagal**

Buat `tests/aset-screens.test.mjs`:

```javascript
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
      const declared = new RegExp(`(function\\s+${fn}\\s*\\(|(?:window|let|const|var)\\s+${fn}\\s*=)`)
        .test(jsFiles);
      if (!declared) missing.add(`${s.key}:${fn}`);
    }
  }
  assert.deepEqual([...missing], [], 'loader tidak ditemukan: ' + [...missing].join(', '));
});
```

- [x] **Step 2: Jalankan test, pastikan gagal**

Run: `node --test tests/aset-screens.test.mjs`
Expected: FAIL dengan `ENOENT: no such file or directory ... js\aset-screens.js`.

- [x] **Step 3: Buat `js/aset-screens.js`**

```javascript
/* Data 16 layar Aset — sumber kebenaran grid, router, dan eager load.
   load: [namaFungsiGlobal, ...argumen]. Fungsi yang hilang dilewati tanpa error. */
window.ASET_SCREENS = [
  { key: 'master',        label: 'Aset',                icon: 'fa-cubes',           role: 'admin', load: [['loadAdminSimapoMaster', false]] },
  { key: 'kat',           label: 'Kategori',            icon: 'fa-tags',            role: 'admin', load: [['loadSimapoKategori', true, false]] },
  { key: 'mutasi',        label: 'Mutasi',              icon: 'fa-exchange-alt',    role: 'admin', load: [['loadMutasiRiwayat', false], ['populateMutasiBarangSelect']] },
  { key: 'opname',        label: 'Opname',              icon: 'fa-clipboard-check', role: 'admin', load: [['loadOpnameForm']] },
  { key: 'standar-harga', label: 'Standar Harga',       icon: 'fa-money-bill-wave', role: 'admin', load: [['loadStandarHarga', false]] },
  { key: 'bast',          label: 'Serah Terima (BAST)', icon: 'fa-file-signature',  role: 'admin', load: [['loadAdminBast', false], ['loadBastHistory', false]] },
  { key: 'pinjam',        label: 'Pinjaman',            icon: 'fa-clipboard-list',  role: 'admin', load: [['loadAdminSimapoPinjam', false]] },
  { key: 'tiket',         label: 'Tiket',               icon: 'fa-inbox',           role: 'admin', load: [['loadAdminSimapoTiket', false]] },
  { key: 'penerimaan',    label: 'Penerimaan',          icon: 'fa-truck',           role: 'admin', load: [['loadAdminPenerimaan', false], ['populateStandarHargaDatalist']] },
  { key: 'pemeliharaan',  label: 'Pemeliharaan',        icon: 'fa-tools',           role: 'admin', load: [['loadAdminPemeliharaan', false], ['populatePemeliharaanBarang']] },
  { key: 'bku',           label: 'Buku Kas Umum',       icon: 'fa-book',            role: 'admin', load: [['loadAdminBKU', false]] },
  { key: 'pks',           label: 'PKS',                 icon: 'fa-file-contract',   role: 'admin', load: [['loadAdminPKS', false]] },
  { key: 'pengaturan',    label: 'Pengaturan',          icon: 'fa-cog',             role: 'admin', load: [['loadSAPengaturan']] },
  { key: 'katalog',       label: 'Katalog Aset',        icon: 'fa-box-open',        role: 'user',  load: [['loadSimapoKatalog', false], ['loadSimapoKategori', false, false]] },
  { key: 'pinjaman-saya', label: 'Pinjaman Saya',       icon: 'fa-handshake',       role: 'user',  load: [['populateSimapoPinjamSelect'], ['loadSimapoRiwayatPinjam', false]] },
  { key: 'tiket-saya',    label: 'Tiket Kerusakan',     icon: 'fa-ticket-alt',      role: 'user',  load: [] },
];
```

`fa-handshake` sudah dipakai di markup lama (`index.html:1352`) sehingga pasti ada di bundle; test Task 1 yang memastikannya.

- [x] **Step 4: Jalankan test, harus hijau**

Run: `node --test tests/aset-screens.test.mjs`
Expected: PASS — `# pass 5`, `# fail 0`.

Kalau gagal dengan daftar `loader tidak ditemukan`, perbaiki nama di `load` agar persis sama
dengan nama fungsi di app (jangan menambah fungsi baru).

- [x] **Step 5: Syntax check + commit**

```bash
node --check js/aset-screens.js
git add js/aset-screens.js tests/aset-screens.test.mjs
git commit -m "feat(aset): konstanta ASET_SCREENS 16 layar + test invarian"
```

---

### Task 2: Logika navigasi (gate role, filter, resolusi loader)

**Files:**
- Create: `js/aset-nav.js`
- Test: `tests/aset-nav.test.mjs`

**Interfaces:**
- Consumes: `window.ASET_SCREENS` (Task 1).
- Produces: `window.ASET_NAV` dengan:
  - `isAdmin(): boolean`
  - `visibleScreens(screens?): Array<screen>` — default `window.ASET_SCREENS`, difilter `role === 'user' || isAdmin()`.
  - `loaderCalls(screen, force?): Array<() => any>` — satu closure per pasangan di `load`; argumen `force` berada pada indeks 1 (`0` untuk `populate*` tanpa force). Closure memanggil `window[fn](...args)` hanya bila `typeof window[fn] === 'function'`.
  - `eagerLoad(): Promise<Array<{key, ok, error?}>>` — `Promise.allSettled` untuk `visibleScreens()`; penandaan pada `window._asetEagerDone` setelah selesai.
  - `renderGrid(): void`, `open(key, force?): void`, `showGrid(): void` — butuh DOM, hanya diuji manual (Task 5).

- [x] **Step 1: Tulis test yang gagal**

Buat `tests/aset-nav.test.mjs`:

```javascript
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
```

- [x] **Step 2: Jalankan test, pastikan gagal**

Run: `node --test tests/aset-nav.test.mjs`
Expected: FAIL dengan `ENOENT ... js\aset-nav.js`.

- [x] **Step 3: Buat `js/aset-nav.js`**

Bagian data murni + orkestrasi (tanpa DOM), lalu bagian DOM. Tulis file lengkap berikut:

```javascript
/* Navigasi Aset: gate role, grid, routing, eager load.
   Semua data layar datang dari window.ASET_SCREENS (js/aset-screens.js). */
(function () {
  function screens() {
    return Array.isArray(window.ASET_SCREENS) ? window.ASET_SCREENS : [];
  }

  function isAdmin() {
    if (window.IS_ADMIN) return true;
    if (typeof window._isSuperAdmin === 'function' && window._isSuperAdmin()) return true;
    const role = String(localStorage.getItem('MY_ROLE') || '').toLowerCase();
    if (role.includes('admin')) return true;
    return String((window.userProfile || {}).role || '').toLowerCase().includes('admin');
  }

  function visibleScreens(list) {
    const all = list || screens();
    const admin = isAdmin();
    return all.filter(s => s.role === 'user' || admin);
  }

  /* Konvensi force: pada entri `load`, argumen TERAKHIR adalah flag force
     (mis. ['loadSimapoKategori', true, false] → flag-nya `false`). Jadi force
     cukup mengubah argumen terakhir menjadi true; entri tanpa argumen
     mendapat satu argumen true. Argumen lain (mis. flag isAdmin) tidak
     pernah disentuh — inilah alasan konvensi ini dipilih, bukan menyuntik
     argumen boolean pertama yang bisa merusak loadSimapoKategori(isAdmin, force). */
  function loaderCalls(screen, force) {
    return (screen.load || []).map(function (call) {
      const name = call[0];
      const args = call.slice(1).slice();
      if (force) {
        if (args.length) args[args.length - 1] = true;
        else args.push(true);
      }
      return function () {
        if (typeof window[name] === 'function') return window[name].apply(window, args);
        return undefined; // loader belum ada di halaman ini — dilewati
      };
    });
  }

  // Menutup throw sinkron: loader yang melempar sebelum mengembalikan Promise harus
  // jadi rejected value, bukan exception yang lolos keluar dari map().
  function safe(fn) {
    try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
  }

  function eagerLoad() {
    if (window._asetEagerDone) return Promise.resolve([]);
    const jobs = visibleScreens().map(function (screen) {
      return Promise.allSettled(loaderCalls(screen).map(safe)).then(function (out) {
        const bad = out.filter(r => r.status === 'rejected');
        window._asetFailed = window._asetFailed || {};
        window._asetFailed[screen.key] = bad.length ? String(bad[0].reason) : '';
        return { key: screen.key, ok: bad.length === 0, error: bad.length ? String(bad[0].reason) : null };
      });
    });
    return Promise.all(jobs).then(function (results) {
      window._asetEagerDone = true;
      return results;
    });
  }

  /* ---------- bagian DOM (dibutuhkan browser, diuji manual di Task 5) ---------- */

  function gridEl() { return document.getElementById('aset-grid'); }
  function screenEl(key) { return document.getElementById('aset-sect-' + key); }

  function renderGrid() {
    const grid = gridEl();
    if (!grid) return;
    grid.innerHTML = '';
    visibleScreens().forEach(function (s) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'aset-card';
      card.setAttribute('data-key', s.key);
      const icon = document.createElement('i');
      icon.className = 'fas ' + s.icon;
      const label = document.createElement('span');
      label.className = 'aset-card-label';
      label.textContent = s.label;
      card.appendChild(icon);
      card.appendChild(label);
      const failed = (window._asetFailed || {})[s.key];
      if (failed) {
        // ponytail: pesan error lewat .title (properti DOM), bukan innerHTML —
        // tanpa perlu escape dan tidak pernah jadi markup.
        const warn = document.createElement('i');
        warn.className = 'fas fa-exclamation-triangle aset-card-warn';
        warn.title = 'Gagal dimuat: ' + failed;
        card.appendChild(warn);
      }
      card.addEventListener('click', function () { open(s.key, true); });
      grid.appendChild(card);
    });
  }

  function showGrid() {
    screens().forEach(function (s) {
      const el = screenEl(s.key);
      if (el) el.style.display = 'none';
    });
    const grid = gridEl();
    if (grid) grid.style.display = '';
    const head = document.getElementById('aset-screen-head');
    if (head) head.style.display = 'none';
    renderGrid();
  }

  function open(key, force) {
    const screen = screens().find(function (s) { return s.key === key; });
    if (!screen) return;
    if (screen.role === 'admin' && !isAdmin()) { showGrid(); return; }
    const grid = gridEl();
    if (grid) grid.style.display = 'none';
    screens().forEach(function (s) {
      const el = screenEl(s.key);
      if (el) el.style.display = s.key === key ? 'block' : 'none';
    });
    const head = document.getElementById('aset-screen-head');
    if (head) {
      head.style.display = 'flex';
      const title = document.getElementById('aset-screen-title');
      if (title) title.textContent = screen.label;
    }
    // Navigasi tidak boleh gagal total: loader yang melempar hanya boleh
    // tercatat di _asetFailed, layar tetap terbuka.
    loaderCalls(screen, force).forEach(function (fn) { safe(fn); });
  }

  window.ASET_NAV = {
    isAdmin: isAdmin,
    visibleScreens: visibleScreens,
    loaderCalls: loaderCalls,
    eagerLoad: eagerLoad,
    renderGrid: renderGrid,
    showGrid: showGrid,
    open: open,
  };
})();
```

Catatan implementasi: `loaderCalls(screen, true)` mengubah **argumen terakhir** entri `load`
menjadi `true`, jadi `['loadSimapoKategori', true, false]` → `loadSimapoKategori(true, true)`
(flag isAdmin utuh, force aktif) dan `['loadOpnameForm']` → `loadOpnameForm(true)`. Klik kartu
selalu memakai `force=true` supaya loader yang sudah ter-`initialized` oleh eager load tetap
memuat ulang data. `eagerLoad()` memakai `force=false` dan tidak menyuntik apa pun.

- [x] **Step 4: Jalankan test, harus hijau**

Run: `node --test tests/aset-nav.test.mjs`
Expected: PASS — `# pass 8`, `# fail 0`.

- [x] **Step 5: Jalankan dua test bersama**

Run: `node --test tests/`
Expected: 13 pass, 0 fail (5 dari Task 1 + 8 dari Task 2).

- [x] **Step 6: Syntax check + commit**

```bash
node --check js/aset-nav.js
git add js/aset-nav.js tests/aset-nav.test.mjs
git commit -m "feat(aset): ASET_NAV - gate role, filter layar, resolusi loader, eager load fail-soft"
```

---

### Task 3: Pindahkan 13 layar admin ke section Aset + pasang grid

**Files:**
- Modify: `index.html` (anchor di tabel "File Structure"; hapus blok yang disebut di Step 2, pindahkan blok di Step 3, tambahkan di Step 4–6)
- Modify: `js/simapo.js:11` (`switchSimapoSection` → pembungkus)
- Modify: `js/simapo-ext.js:115` (`switchSATab` → pembungkus), `js/simapo-ext.js:898` (`switchSAGroup` → dihapus)

**Interfaces:**
- Consumes: `window.ASET_SCREENS`, `window.ASET_NAV.open/showGrid/eagerLoad` (Task 1–2).
- Produces: `window.switchSimapoSection(section, force)` dan `window.switchSATab(name, force)` sebagai pembungkus satu baris; elemen `#aset-grid`, `#aset-screen-head`, `#aset-sect-*` × 16. Semua referensi `sa-sect-*`, `sa-tab-*`, `sa-group-*`, `simapo-section-*` di repo menjadi nol.

- [x] **Step 1: Snapshot baseline**

```bash
git stash list
node --check js/simapo.js; node --check js/simapo-ext.js
node --test tests/
```

Expected: dua `node --check` tanpa output (sukses), `node --test tests/` → 13 pass.
Working tree harus bersih selain file yang sudah di-commit Task 1–2:

```bash
git status --short
```

- [x] **Step 2: Ubah `js/simapo.js` — router lama jadi pembungkus**

Ganti seluruh fungsi `switchSimapoSection` (baris 11–40) dengan:

```javascript
/* Router lama (Katalog/Pinjaman/Tiket) → delegation ke ASET_NAV.
   Dipakai oleh switchTab('simapo'), tombol dalam markup, dan pemanggil internal. */
function switchSimapoSection(section, force = false) {
  const map = { katalog: 'katalog', pinjam: 'pinjaman-saya', tiket: 'tiket-saya' };
  const key = map[section] || section;
  if (typeof window.ASET_NAV !== 'object') return;
  window.ASET_NAV.open(key, force);
}
```

Perilaku lama yang harus tetap ada: `populateSimapoInstansiSelect()` dipanggil setiap kali
section Aset dibuka. Tambahkan pemanggilan itu di `openAsetSection` pada Task 3 Step 5, atau
— lebih sederhana — di dalam wrapper di atas:

```javascript
function switchSimapoSection(section, force = false) {
  const map = { katalog: 'katalog', pinjam: 'pinjaman-saya', tiket: 'tiket-saya' };
  const key = map[section] || section;
  if (typeof populateSimapoInstansiSelect === 'function') populateSimapoInstansiSelect();
  if (typeof window.ASET_NAV !== 'object') return;
  window.ASET_NAV.open(key, force);
}
```

- [x] **Step 3: Ubah `js/simapo-ext.js` — router admin jadi pembungkus, group dihapus**

Ganti fungsi `window.switchSATab` (baris 115–~135) dengan:

```javascript
/* Router lama tab admin → delegation ke ASET_NAV. */
window.switchSATab = function (name, force = false) {
  if (typeof window.ASET_NAV !== 'object') return;
  const key = (name === 'pinjam-admin') ? 'pinjam' : name;
  window.ASET_NAV.open(key, force);
};
```

Hapus seluruh fungsi `window.switchSAGroup` (baris 898–sekitar 920) beserta seluruh blok.
Tidak ada pemanggil lain: hanya 3 group button di markup yang dihapus pada Step 4.

Jangan hapus loader admin (`loadAdminSimapoMaster`, `loadSimapoKategori`, dst.).

- [x] **Step 4: Pindahkan markup dengan skrip satu-off (16 edit manual rawan salah)**

Buat `C:\Users\Agil\AppData\Local\Temp\opencode\move-aset-markup.mjs`:

Skrip di bawah sudah dijalankan pada salinan `index.html` dan lolos 7 pemeriksaan
(balance div, 16 id unik, grid di dalam panel, payload sibling instSection, nol sisa
markup lama, style berpasangan, 16 section berisi). Jangan diubah tanpa diuji ulang.

```javascript
import fs from 'node:fs';
const P = process.argv[2];
const lines = fs.readFileSync(P, 'utf8').split(/\r?\n/);
const at = (re, from = 0) => {
  const i = lines.findIndex((l, n) => n >= from && re.test(l));
  if (i < 0) throw new Error('anchor tidak ditemukan: ' + re);
  return i;
};

// ---- 1. hitung SEMUA anchor lebih dulu (0-based), belum mengubah apa pun ----
// Nav "Inventaris" ada di baris 1518, DI DALAM <div class="admin-nav"> yang dibuka di 1514
// dan ditutup di 1519. Kalau pembuangan mulai dari tombol saja, </div> penutup ikut
// terhapus tapi <div pembukanya tidak → satu div yatim. Jadi mulai dari comment pembuka blok.
const navBtn = at(/id="btn-nav-simapo-admin"/);
const navBlock = (() => {
  for (let i = navBtn; i >= 0; i--) if (/<!-- Sub-Navigation Admin -->/.test(lines[i])) return i;
  throw new Error('comment Sub-Navigation Admin tidak ditemukan');
})();
const adminHead = Math.min(navBlock, at(/<!-- SECTION: ADMIN SIMAPO/));
const adminOpen = at(/id="admin-section-simapo-admin"/);
const opsOpen = at(/id="admin-section-ops"/);
// tutup admin-section lewat depth tracking, bukan tebakan baris "</div> terakhir"
let depth = 0, adminClose = -1;
for (let i = adminOpen; i < opsOpen; i++) {
  depth += (lines[i].match(/<div\b/g) || []).length - (lines[i].match(/<\/div>/g) || []).length;
  if (depth === 0 && i > adminOpen) { adminClose = i; break; }
}
if (adminClose < 0) throw new Error('penutup admin-section tidak ditemukan');
const sectFirst = at(/id="sa-sect-/, adminOpen);
const tabStart = at(/<!-- Sub-Navigation SIMAPO \(Segmented Control\) -->/);
let tabStyleEnd = -1;
for (let i = tabStart; i < tabStart + 80; i++) if (/<\/style>/.test(lines[i])) { tabStyleEnd = i; break; }
if (tabStyleEnd < 0) throw new Error('penutup <style> tab strip tidak ditemukan');
const panelAdmin = at(/id="panel-admin"/);
let panelSimapoClose = -1;
for (let i = panelAdmin - 1; i >= 0; i--) if (/^\s*<\/div>\s*$/.test(lines[i])) { panelSimapoClose = i; break; }
if (panelSimapoClose < 0) throw new Error('penutup #panel-simapo tidak ditemukan');

// urut dari indeks TERBESAR ke terkecil supaya tidak ada indeks bergeser
if (!(tabStart < panelSimapoClose && panelSimapoClose < adminHead && adminHead < sectFirst && sectFirst <= adminClose && adminClose < opsOpen)) {
  throw new Error('urutan anchor tidak sesuai harapan: ' + JSON.stringify({ tabStart, panelSimapoClose, adminHead, sectFirst, adminClose, opsOpen }));
}

// ---- 2. lift payload 13 layar admin, rename + normalisasi visibility di tempatnya ----
// Normalisasi WAJIB: 12 section punya inline display:none (menimpa CSS), sedangkan
// sa-sect-pinjam sama sekali tanpa inline display (jadi ikut terlihat kalau CSS belum
// dimuat). Buang SEMUA inline display dari .aset-sect supaya visibility 100% dikontrol
// kelas .active di CSS — satu sumber kebenaran.
// Bentrok id: admin sudah punya sa-sect-pinjam dan sa-sect-tiket, jadi 3 layar user WAJIB
// memakai nama berbeda. Rename polos akan menghasilkan id dobel.
const RENAME_SECT = { pinjam: 'pinjaman-saya', tiket: 'tiket-saya', katalog: 'katalog' };
const payload = lines.slice(sectFirst, adminClose).join('\n')
  .replace(/id="sa-sect-([a-z-]+)"/g, 'id="aset-sect-$1"')
  .replace(/(<div id="aset-sect-[a-z-]+" class="aset-sect")\s*style="[^"]*"/g, '$1')
  .replace(/class="sa-sect"/g, 'class="aset-sect"');

// ---- 3. splice dari belakang ke depan ----
// 3a. hapus nav Inventaris + seluruh blok admin (header + group bar + 13 section + pembungkus).
//     Berhenti tepat sebelum <div id="admin-section-ops"> supaya section Operasional utuh.
lines.splice(adminHead, opsOpen - adminHead);
// 3b. sisipkan grid + payload sebagai SAUDARA #simapoInstansiSection.
//     PENTING: jangan taruh di dalam #simapoInstansiSection — blok itu hanya ditampilkan
//     untuk superadmin (js/simapo.js:698-708), jadi 13 layar admin akan hilang untuk admin biasa.
const gridMarkup = [
  '<div id="aset-grid" class="aset-grid"></div>',
  '<div id="aset-screen-head" style="display:none;align-items:center;gap:10px;margin-bottom:12px;">',
  '  <button class="btn-sm-admin" onclick="window.ASET_NAV.showGrid()" aria-label="Kembali ke daftar fitur Aset">',
  '    <i class="fas fa-arrow-left"></i> Kembali</button>',
  '  <span id="aset-screen-title" style="font-weight:800;color:var(--gold);font-size:14px;"></span>',
  '</div>',
  payload,
].join('\n');
lines.splice(panelSimapoClose, 0, gridMarkup);
// 3c. hapus tab strip user + <style> .simapo-tab-btn-nya sebagai SATU rentang.
//     Jangan dipotong dua tahap, jika tidak CSS jadi yatim dan </style>--nya menunjuk
//     blok style lain yang tidak ada hubungannya.
lines.splice(tabStart, tabStyleEnd - tabStart + 1);
// 3d. rename 3 layar user + buang inline display (user katalog sempat display:block).
//     Urutan penting: class harus jadi "aset-sect" DULU, karena regex penyingkir inline
//     display mencocokkan class="aset-sect". Kalau dibalik, 3 layar user lolos.
lines.splice(0, lines.length, ...lines.join('\n')
  .replace(/id="simapo-section-(pinjam|tiket|katalog)"/g, (_, k) => 'id="aset-sect-' + RENAME_SECT[k] + '"')
  .replace(/class="simapo-section"/g, 'class="aset-sect"')
  .replace(/(<div id="aset-sect-[a-z-]+" class="aset-sect")\s*style="[^"]*"/g, '$1')
  .split('\n'));
```

Expected: `selesai: 400 baris payload dipindahkan`.

Verifikasi tiga hal sekaligus:

```bash
node -e "const L=require('fs').readFileSync('index.html','utf8').split(/\r?\n/);const g=L.findIndex(l=>/id=\"aset-grid\"/.test(l));const pa=L.findIndex(l=>/id=\"panel-admin\"/.test(l));const si=L.findIndex(l=>/id=\"simapoInstansiSection\"/.test(l));const m=L.findIndex(l=>/id=\"aset-sect-master\"/.test(l));console.log('grid',g,'panelAdmin',pa,'instansiSection',si,'master',m);console.log('payload sibling instansi:', m>si && m<pa)"
```

Expected: `grid` > 0 dan **< `panelAdmin`**; `master` > `instansiSection` (artinya payload
tidak tersembunyi di dalam blok superadmin) dan < `panelAdmin`.

Kalau skrip gagal dengan `anchor tidak ditemukan` atau `urutan anchor tidak sesuai
harapan`, **berhenti** dan jalankan `git checkout -- index.html`, lalu periksa lagi
anchor. Jangan menebak.

- [x] **Step 5: Verifikasi hasil pemindahan lewat grep**

```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');const c=(re)=>(s.match(re)||[]).length;console.log('sa-sect-:',c(/sa-sect-/g),'sa-tab-:',c(/sa-tab-/g),'sa-group-:',c(/sa-group-/g),'simapo-section-:',c(/simapo-section-/g),'aset-sect-:',c(/aset-sect-/g),'aset-grid:',c(/id=\"aset-grid\"/g),'btn-nav-simapo-admin:',c(/btn-nav-simapo-admin/g),'btn-simapo-:',c(/btn-simapo-/g))"
```

Expected (satu baris): `sa-sect-: 0 sa-tab-: 0 sa-group-: 0 simapo-section-: 0 aset-sect-: 16 aset-grid: 1 btn-nav-simapo-admin: 0 btn-simapo-: 0`

Lalu pastikan 16 id `aset-sect-*` benar-benar unik dan lengkap (dua layar user harus memakai
nama `pinjaman-saya`/`tiket-saya`, bukan bentrok dengan `pinjam`/`tiket` milik admin):

```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');const ids=[...s.matchAll(/id=\"(aset-sect-[a-z-]+)\"/g)].map(m=>m[1]);const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);console.log('jumlah',ids.length);console.log('duplikat',JSON.stringify(dup));console.log(ids.sort().join(' '))"
```

Expected: `jumlah 16`, `duplikat []`, dan daftar memuat `aset-sect-kategori`, `aset-sect-master`,
`aset-sect-pinjaman-saya`, `aset-sect-tiket-saya` (bukan `aset-sect-pinjam`/`aset-sect-tiket`
yang sudah dipakai layar admin).

Lalu cek tidak ada markup yatim:

```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');let d=0,min=0;for(const ch of s){if(ch==='<'){} }const open=(s.match(/<div\b/g)||[]).length,close=(s.match(/<\/div>/g)||[]).length;console.log('div buka',open,'div tutup',close)"
```

Expected: kedua angka sama (balance tidak berubah dibanding HEAD — bila berbeda, ada blok yang
terpotong; `git checkout -- index.html` lalu ulangi Step 4).

- [x] **Step 6: Tambahkan CSS grid + pemicu eager load**

Di `index.html`, tepat sebelum penutup `#panel-simapo`, tambahkan satu blok `<style>`:

```html
<style>
.aset-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
.aset-card { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:8px; min-height:86px; padding:14px 10px; cursor:pointer; text-align:center;
  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
  border-radius:12px; color:var(--white); transition:transform .12s ease, background .12s ease; }
.aset-card:hover { transform:translateY(-2px); background:rgba(201,168,76,0.12); border-color:rgba(201,168,76,0.35); }
.aset-card > i { font-size:20px; color:var(--gold); }
.aset-card-label { font-size:11.5px; font-weight:700; line-height:1.3; }
.aset-card-warn { position:absolute; top:6px; right:8px; font-size:11px; color:var(--danger); }
.aset-sect { display:none; }
@media (max-width:900px) { .aset-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:640px) { .aset-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
```

Lalu, di `js/simapo.js`, tambahkan pemicu eager load + grid di dalam `switchSimapoSection`
sebelum `open`:

```javascript
function switchSimapoSection(section, force = false) {
  const map = { katalog: 'katalog', pinjam: 'pinjaman-saya', tiket: 'tiket-saya' };
  const key = map[section] || section;
  if (typeof populateSimapoInstansiSelect === 'function') populateSimapoInstansiSelect();
  if (typeof window.ASET_NAV !== 'object') return;
  if (section === 'grid') {
    window.ASET_NAV.showGrid();
    window.ASET_NAV.eagerLoad(force).then(window.ASET_NAV.renderGrid);
    return;
  }
  window.ASET_NAV.open(key, force);
}
```

Terakhir, di `index.html`, tambahkan dua `<script>` **sebelum** `<script src="js/simapo.js">`
(baris 3219):

```html
<script src="js/aset-screens.js?v=1"></script>
<script src="js/aset-nav.js?v=1"></script>
```

**WAJIB — ubah pemicu grid di `js/ui.js`.** Fungsi `switchTab` saat ini selalu membuka tab
pertama:

```javascript
      if (tab === 'simapo') {
        if (typeof populateSimapoInstansiSelect === 'function') populateSimapoInstansiSelect();
        if (typeof switchSimapoSection === 'function') switchSimapoSection('katalog');
      }
```

`js/ui.js:302`. Tanpa perubahan ini grid tidak pernah tampil — klik sidebar Aset akan terus
membuka Katalog. Ganti **hanya nilai argumennya**:

```javascript
        if (typeof switchSimapoSection === 'function') switchSimapoSection('grid');
```

Satu baris. Jangan tambah cabang lain di `switchTab`: pemicu lain (`initSimapo()` di
`js/simapo.js:763`) ikut membuka grid, dan itu memang yang diinginkan — membuka tab Aset
selalu berarti melihat grid.

- [x] **Step 7: Jalankan app dan cek grid tampil**

Jalankan server dev di terminal terpisah: `npm run dev` (baca URL dari output).
Lalu dengan chrome-devtools: buka URL localhost, login, klik sidebar **Aset**.

Expected: grid 16 kartu tampil (admin) tanpa error console; klik kartu **Aset** → layar
Master Aset tampil dengan tombol **Kembali** (ikon `fa-arrow-left`); klik Kembali → grid kembali.

Verifikasi juga lewat Console: `switchSimapoSection('grid')` → `window.ASET_NAV` terbuka
dan `#aset-grid` berisi 16 tombol.

Kalau grid tidak muncul, urut dari paling mungkin:
1. `js/ui.js` masih memanggil `switchSimapoSection('katalog')` (Step 6) → grid dilewati.
2. `id="aset-grid"` tidak ada (cek grep Step 5).
3. `typeof window.ASET_NAV` bukan `"object"` → urutan `<script>` salah atau `aset-nav.js` gagal load.
4. ada error JS di console.

- [x] **Step 8: Test + syntax check + commit**

```bash
node --check js/simapo.js; node --check js/simapo-ext.js; node --check js/aset-nav.js; node --check js/aset-screens.js
node --test tests/
git add index.html js/simapo.js js/simapo-ext.js js/aset-nav.js js/aset-screens.js js/ui.js
git commit -m "feat(aset): pindahkan 13 layar admin ke section Aset, pasang grid + eager load"
```

Expected: `node --test tests/` → 13 pass, 0 fail.

`git add` wajib memuat `js/aset-nav.js`, `js/aset-screens.js`, dan `js/ui.js` — tanpa
ketiganya commit ini akan meninggalkan file tak terlacak dan grid tidak terpicu.

---

### Task 4: Emoji → ikon FontAwesome

**Files:**
- Modify: markup 16 layar Aset di `index.html` (hasil Task 3)
- Modify: `js/simapo.js`, `js/simapo-ext.js`, `js/simapo-bast.js`
- Test: `tests/aset-emoji.test.mjs`

**Interfaces:**
- Consumes: bundle `css/lib/font-awesome.min.css`.
- Produces: nol karakter emoji pada rentang Aset di `index.html` dan pada 3 file `js/simapo*.js`.

- [x] **Step 1: Tulis test yang gagal**

Buat `tests/aset-emoji.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
// ponytail: rentang sempit — hanya pictograph/dingbat/simbol + variation selector.
// JANGAN masukkan U+2190–U+21FF (panah). Audit: "→" (U+2192) dipakai di markup Aset
// (2× di index.html, 1× di simapo-ext.js, 2× di simapo-bast.js) dan itu bukan emoji.
// U+2192 di luar rentang ini otomatis lolos. Tombol "Kembali" sendiri memakai ikon
// <i class="fas fa-arrow-left">, bukan karakter panah — tidak ada U+2190 di repo ini.
// U+2B50 sudah tercakup U+2B00–U+2BFF.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{23EA}-\u{23FA}]/u;
const JS_FILES = ['js/simapo.js', 'js/simapo-ext.js', 'js/simapo-bast.js'];

function countEmoji(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((l, i) => { if (EMOJI.test(l)) hits.push(i + 1); });
  return hits;
}

test('tidak ada emoji di 3 file js/simapo*.js', () => {
  const report = [];
  for (const f of JS_FILES) {
    const lines = countEmoji(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (lines.length) report.push(`${f}: baris ${lines.slice(0, 12).join(',')}${lines.length > 12 ? ',…' : ''} (${lines.length})`);
  }
  assert.deepEqual(report, [], 'emoji tersisa:\n' + report.join('\n'));
});

test('tidak ada emoji di markup 16 layar Aset', () => {
  const s = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const grid = s.indexOf('id="aset-grid"');
  const panelEnd = s.indexOf('id="panel-admin"');
  assert.ok(grid > 0 && panelEnd > grid, 'anchor aset-grid/panel-admin tidak ditemukan');
  const region = s.slice(s.lastIndexOf('<div class="panel"', grid), panelEnd);
  const lines = countEmoji(region);
  assert.deepEqual(lines, [], 'emoji tersisa di baris (relatif): ' + lines.join(','));
});

test('ikon hasil penggantian semuanya ada di bundle lokal', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/lib/font-awesome.min.css'), 'utf8');
  const used = new Set();
  for (const f of ['index.html', ...JS_FILES]) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/<i class="fas (fa-[a-z0-9-]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter(i => !(css.includes('.' + i + ':before') || css.includes('.' + i + '::before')));
  assert.deepEqual(missing, [], 'ikon tidak ada di bundle: ' + missing.join(', '));
});
```

- [x] **Step 2: Jalankan test, pastikan gagal dan lihat daftarnya**

Run: `node --test tests/aset-emoji.test.mjs`
Expected: FAIL, dan pesan kegagalan berisi daftar baris dengan emoji per file.

- [x] **Step 3: Jalankan skrip penggantian**

Skrip di bawah sudah diuji pada salinan repo: **81 baris berisi emoji ditemukan, 74
otomatis terpetakan, 7 sisanya dilaporkan** (persis daftar di Step 3b). Yang penting,
skrip menolak keras kalau ada ikon di `MAP` yang tidak ada di `css/lib/font-awesome.min.css`,
sehingga mustahil menghasilkan `<i class="fas fa-xyz">` yang tidak dirender.

Guard "// ponytail" yang menentukan apakah sebuah baris boleh diganti: hanya baris yang
jelas konteks HTML. Emoji di `textContent` / `title` / `confirmButtonText` **tidak boleh**
jadi `<i>` (CSS tidak berlaku pada teks node, dan string itu bukan markup) — baris seperti
itu sengaja dilewati dan dilaporkan, bukan diacak jadi HTML.

Buat `C:\Users\Agil\AppData\Local\Temp\opencode\deemoji.mjs`:

```javascript
import fs from 'node:fs';

const P = process.argv[2];               // root repo (dalam praktik: salinan)
const O = P.replace(/[\\/]+$/, '') + '/';

// DAFTAR IKON — semua WAJIB ada di css/lib/font-awesome.min.css (dicek di bawah).
// Diturunkan dari MAP lama + ikon yang baru ditemukan; 2 ikon lama yang tidak ada
// di bundle sudah diganti: fa-box-archive -> fa-archive, fa-chart-line-down -> fa-chart-line.
const MAP = {
  '\u{1F4E6}':'fa-box', '\u{1F5C3}':'fa-archive', '\u{1F5C3}\uFE0F':'fa-archive',
  '\u{1F3F7}':'fa-tags', '\u{1F3F7}\uFE0F':'fa-tags', '\u{1F504}':'fa-sync-alt',
  '\u{1F4CA}':'fa-chart-bar', '\u{1F4CB}':'fa-clipboard-list', '\u{1F4C4}':'fa-file-alt',
  '\u{1F6A8}':'fa-exclamation-triangle', '\u{1F4E5}':'fa-download', '\u{1F527}':'fa-wrench',
  '\u{1F4B0}':'fa-money-bill', '\u{1F4D0}':'fa-drafting-compass', '\u2699':'fa-cog',
  '\u2699\uFE0F':'fa-cog', '\u{1F4BE}':'fa-save', '\u{1F5C2}':'fa-folder-open',
  '\u{1F5C2}\uFE0F':'fa-folder-open', '\u{1F50D}':'fa-search', '\u2795':'fa-plus',
  '\u270F':'fa-edit', '\u270F\uFE0F':'fa-edit', '\u{1F5D1}':'fa-trash',
  '\u{1F5D1}\uFE0F':'fa-trash', '\u{1F441}':'fa-eye', '\u{1F441}\uFE0F':'fa-eye',
  '\u26A0':'fa-exclamation-triangle', '\u26A0\uFE0F':'fa-exclamation-triangle',
  '\u2705':'fa-check', '\u274C':'fa-times', '\u2715':'fa-times', '\u{1F534}':'fa-circle',
  '\u{1F7E1}':'fa-circle', '\u{1F7E2}':'fa-circle', '\u{1F5A8}':'fa-print',
  '\u{1F5A8}\uFE0F':'fa-print', '\u{1F3AF}':'fa-bullseye', '\u{1F512}':'fa-lock',
  '\u{1F9F9}':'fa-broom', '\u{1F4C1}':'fa-folder', '\u{1F4C2}':'fa-folder-open', '\u{1F4A1}':'fa-lightbulb',
  '\u23F0':'fa-clock', '\u{1F4C9}':'fa-chart-line', '\u{1F4C8}':'fa-chart-line',
  '\u{1F5BC}':'fa-image', '\u{1F5BC}\uFE0F':'fa-image', '\u26A1':'fa-bolt',
  '\u{1F465}':'fa-users', '\u{1F3E2}':'fa-building', '\u{1F5D3}':'fa-calendar',
  '\u{1F5D3}\uFE0F':'fa-calendar', '\u{1F4C5}':'fa-calendar-alt', '\u{1F50E}':'fa-search',
  '\u{1F4DD}':'fa-file-alt', '\u23F3':'fa-hourglass-half', '\u{1F6AB}':'fa-ban',
  '\u2714':'fa-check', '\u2714\uFE0F':'fa-check', '\u2139\uFE0F':'fa-info-circle',
  '\u{1F514}':'fa-bell', '\u{1F4E4}':'fa-upload', '\u{1F9FE}':'fa-receipt',
  '\u{1F5D2}':'fa-sticky-note', '\u{1F5D2}\uFE0F':'fa-sticky-note',
  // tambahan dari audit 81 baris
  '\u{1F464}':'fa-user', '\u{1F4CD}':'fa-map-marker-alt', '\u{1F6E0}':'fa-tools',
  '\u{1F6E0}\uFE0F':'fa-tools', '\u{1F3EA}':'fa-store', '\u{1F4CC}':'fa-thumbtack',
  '\u{1F697}':'fa-car', '\u{1F4F7}':'fa-camera', '\u{1F4F7}\uFE0F':'fa-camera',
  '\u{1F4E7}':'fa-inbox', '\u{1F4F0}':'fa-newspaper', '\u{1F510}':'fa-key',
  '\u{1F4C3}':'fa-file', '\u{1F4CE}':'fa-paperclip', '\u{1F4D6}':'fa-book-open',
  '\u{1F5DD}':'fa-book', '\u{1F517}':'fa-link', '\u{1F50B}':'fa-microchip',
  '\u{1F9F2}':'fa-magnet', '\u{1F4CE}':'fa-paperclip', '\u{1F6CD}':'fa-shopping-cart',
  '\u{1F4DA}':'fa-graduation-cap', '\u{1F4E2}':'fa-laptop',
  '\u{1F680}':'fa-rocket', '\u{1F4F8}':'fa-camera', '\u{1F4F1}':'fa-mobile-alt',
  '\u{1F4EB}':'fa-mobile', '\u{1F4ED}':'fa-envelope-open-text',
  '\u{1F501}':'fa-exchange-alt', '\u{1F4DC}':'fa-history',
};
const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);   // terpanjang dulu
const icon = (k) => '<i class="fas ' + MAP[k] + '" aria-hidden="true"></i>';

// Rentang emoji. JANGAN sertakan U+2190–U+21FF (panah) dan U+2700–U+27BF sudah
// mencakup "✔ ✕ ⚙ ✏ ➕ ⚠" yang memang ikon-ikon ini — bukan panah. U+27BF < U+2190? tidak:
// U+2190-21FF adalah rentang panah, TIDAK termasuk di 2600-27BF, jadi aman.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{23EA}-\u{23FA}]/u;

// --- guard: setiap ikon MAP harus ada di bundle. Gagal keras kalau tidak. ---
const css = fs.readFileSync(O + 'css/lib/font-awesome.min.css', 'utf8');
const has = (i) => css.includes('.' + i + ':before') || css.includes('.' + i + '::before');
const missing = [...new Set(Object.values(MAP))].filter(i => !has(i));
if (missing.length) throw new Error('ikon tidak ada di bundle: ' + missing.join(', '));

// --- konversi satu baris ---
// Hanya baris JS yang jelas konteks HTML (ada tag di sekitar emoji) yang diganti.
// Emoji di textContent / title / confirmButtonText / string label TIDAK bisa jadi
// <i> (CSS tidak berlaku, dan string itu bukan markup) -> dilaporkan untuk manual.
// Guard ini mencegah penyuntikan <i> ke kode JS biasa.
// index.html 100% markup, jadi strict=false di sana: kalau tetap dicek per-baris, teks
// alert yang tag-nya di baris sebelumnya akan terlewat (sudah terbukti diUJI).
const REPORT = [];
function convertLine(file, lineNo, line, strict) {
  if (!EMOJI.test(line)) return line;
  if (strict && !/<[a-zA-Z/!][^>]*>/.test(line)) { REPORT.push(file + ':' + lineNo + ' | ' + line.trim().slice(0, 95)); return line; }
  let out = line;
  for (const k of KEYS) {
    const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu');
    out = out.replace(re, icon(k));
  }
  if (EMOJI.test(out)) REPORT.push(file + ':' + lineNo + ' | ' + line.trim().slice(0, 95));
  return out;
}

const FILES = ['js/simapo.js', 'js/simapo-ext.js', 'js/simapo-bast.js'];
for (const f of FILES) {
  const p = O + f;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  fs.writeFileSync(p, lines.map((l, i) => convertLine(f, i + 1, l, true)).join('\n'));
}

// index.html: HANYA rentang #panel-simapo -> #panel-admin (16 layar Aset).
const ip = O + 'index.html';
const lines = fs.readFileSync(ip, 'utf8').split(/\r?\n/);
const start = lines.findIndex(l => /id="panel-simapo"/.test(l));
const end = lines.findIndex(l => /id="panel-admin"/.test(l));
if (start < 0 || end < start) throw new Error('anchor panel-simapo/panel-admin tidak ditemukan');
for (let i = start; i < end; i++) lines[i] = convertLine('index.html', i + 1, lines[i], false);
fs.writeFileSync(ip, lines.join('\n'));

console.log('konversi selesai. manual: ' + REPORT.length + ' baris');
REPORT.forEach(r => console.log('  ' + r));
```

Jalankan dengan argumen root repo:

```bash
node C:\Users\Agil\AppData\Local\Temp\opencode\deemoji.mjs D:\Code\absensi_refactored_v6
```

Expected: `konversi selesai. manual: 7 baris` beserta 7 baris yang dilaporkan.

- [x] **Step 3b: Perbaiki 7 baris sisanya secara semantik**

Tujuh baris berikut **memang bukan HTML** — jangan dipaksa jadi `<i>`, itu akan
menampilkan teks literal `<i class="fas ...">`. Ganti emoji-nya dengan teks biasa:

| File:baris | Sebelum | Sesudah |
|---|---|---|
| `js/simapo-ext.js:290` | `confirmButtonText: '📦 Kembalikan',` | `confirmButtonText: 'Kembalikan',` |
| `js/simapo-ext.js:450` | `titleEl.textContent = id ? '✏️ Edit Data Aset' : '➕ Tambah Aset Baru';` | `titleEl.textContent = id ? 'Edit Data Aset' : 'Tambah Aset Baru';` |
| `js/simapo-ext.js:845` | `📥 Download PNG` | `Download PNG` |
| `js/simapo-ext.js:1768` | `title: (id ? '✏️ Edit ' : '➕ Tambah ') + labels[level],` | `title: (id ? 'Edit ' : 'Tambah ') + labels[level],` |
| `js/simapo-bast.js:192` | `('✔️ ' + ...)` | `('' + ...)` — atau buang prefix-nya |
| `js/simapo-bast.js:231` | `title: '⚙️ Atur Pemegang Aset',` | `title: 'Atur Pemegang Aset',` |
| `js/simapo-bast.js:239` | `confirmButtonText: '💾 Simpan',` | `confirmButtonText: 'Simpan',` |

Nomor baris hanya berlaku untuk file yang belum diubah Task 3/4. Kalau sudah bergeser,
cari baris lewat teks (`confirmButtonText: '📦 Kembalikan'`). Setelah diubah, jalankan
ulang skrip — harus melaporkan `manual: 0 baris`.

- [x] **Step 4: Jalankan test, harus hijau**

Run: `node --test tests/aset-emoji.test.mjs`
Expected: PASS — `# pass 3`, `# fail 0`.

Test ketiga ikut memverifikasi penggantian: bila ada ikon hasil pilihan yang tidak ada di bundle
lokal, test itu yang akan gagal — itu memang tujuannya.

- [x] **Step 5: Cek visual cepat di browser**

Dengan chrome-devtools di halaman yang sama seperti Task 3: buka Aset → klik beberapa kartu
(Aset, BAST, Pengaturan). Expected: tidak ada kotak kosong di mana sebelumnya ada emoji,
tidak ada teks `[object Object]`, tidak ada ikon kosong.

- [x] **Step 6: Test penuh + syntax check + commit**

```bash
node --check js/simapo.js; node --check js/simapo-ext.js; node --check js/simapo-bast.js
node --test tests/
git add index.html js/simapo.js js/simapo-ext.js js/simapo-bast.js tests/aset-emoji.test.mjs
git commit -m "style(aset): ganti emoji dengan ikon FontAwesome di markup Aset + simapo*.js"
```

Expected: `node --test tests/` → 16 pass, 0 fail.

---

### Task 5: Verifikasi akhir (checkpoint, tanpa kode baru)

**Files:** tidak ada file baru; hanya verifikasi. Perbaikan yang muncul dari temuan diasosiasikan ke task Concerned.

**Interfaces:**
- Consumes: seluruh hasil Task 1–4.
- Produces: bukti bahwa milestone 1 selesai; tidak ada kode yang perlu di-commit kecuali perbaikan.

- [x] **Step 1: Test + syntax check seluruh file yang disentuh**

```bash
node --check js/aset-screens.js; node --check js/aset-nav.js; node --check js/simapo.js; node --check js/simapo-ext.js; node --check js/simapo-bast.js
node --test tests/*.test.mjs
```

Expected: 37 pass, 0 fail; tidak ada output error dari `node --check`.
Hasil: **37 pass, 0 fail**; `node --check` hijau untuk kelima file. (`node --test tests/`
tidak jalan di Node 22.22.0 — harus pakai glob.)

- [x] **Step 2: Checklist admin di browser**

Server dev sudah berjalan dari Task 3. chrome-devtools, login sebagai admin/superadmin,
klik sidebar **Aset**.

1. Grid menampilkan **16** kartu (Urutan: Aset, Kategori, Mutasi, Opname, Standar Harga, Serah Terima, Pinjaman, Tiket, Penerimaan, Pemeliharaan, Buku Kas Umum, PKS, Pengaturan, Katalog Aset, Pinjaman Saya, Tiket Kerusakan).
2. Klik tiap kartu satu per satu → layar terbuka, judul di header sesuai label, tombol Kembali kembali ke grid.
3. `console` bersih (tanpa error). `window._asetFailed` = `{}` atau semua nilai string kosong.
4. Panel Admin → nav tidak lagi memuat **Inventaris**.

- [x] **Step 3: Checklist user biasa**

Login sebagai user biasa (bukan admin), buka sidebar Aset.
Expected: tepat **3** kartu (Katalog Aset, Pinjaman Saya, Tiket Kerusakan); tidak ada kartu
admin di DOM; buka tiap kartu → normal.
Hasil: 3 kartu, dan `open('master', {force:true})` tetap ditolak untuk non-admin.

- [x] **Step 4: Checklist responsif**

chrome-devtools: set viewport 375×812, buka grid.
Expected: 2 kolom, tidak ada scroll horizontal, label tidak terpotong.
Kembali ke 1440×900: 4 kolom.
Hasil: 1440px = 4 kolom, 1000px = 3 kolom, ≤720px = 2 kolom (diuji 500px karena itu batas
minimum ukuran window). Tanpa scroll horizontal, tanpa label terpotong.

- [ ] **Step 5: Penjaga backend (opsional, butuh token)** — **belum dijalankan**, `N8N_TOKEN` tidak tersedia. Tidak memblokir milestone 1. Ditunda ke milestone 2 (tidak ada perubahan backend di plan ini).

```powershell
$env:N8N_TOKEN = "<token dari n8n → Settings → n8n API>"
node scripts/test-aset-data.mjs
```

Expected: semua pemeriksaan hijau. Kalau `N8N_TOKEN` belum tersedia, lewati langkah ini dan
catat "belum dijalankan" di ringkasan — jangan memblokir milestone 1, karena tidak ada
perubahan backend di plan ini.

- [x] **Step 6: Commit perbaikan bila ada**

Kalau Step 2–4 menemukan masalah, perbaiki di file yang sama, jalankan `node --test tests/`
lagi, lalu commit:

```bash
git add -A index.html js/ tests/
git commit -m "fix(aset): perbaikan hasil verifikasi milestone 1"
```

Kalau tidak ada masalah: `git status --short` harus kosong dan tidak ada commit baru.

- [x] **Step 7: Tutup milestone**

Ringkas ke user: jumlah kartu per role, hasil test (16 pass), temuan dari checklist browser,
dan apa yang masih ditunda ke milestone 2 (UI Input Massal, UI Impor KIB, bulk edit/delete,
filter lanjutan, backup, impor 281 aset ke `SIMAPO.unit_aset`).

---

## Ringkasan Task

| # | Deliverable | Test |
|---|---|---|
| 1 | `js/aset-screens.js` — 16 layar sebagai data | `tests/aset-screens.test.mjs` (5 test) |
| 2 | `js/aset-nav.js` — gate role, filter, loader, eager load | `tests/aset-nav.test.mjs` (9 test) |
| 3 | Markup: 13 layar admin pindah + grid + router pembungkus | `tests/aset-router.test.mjs` (7 test) + `tests/aset-markup.test.mjs` (10 test) + checklist browser |
| 4 | Emoji → ikon di Aset | `tests/aset-emoji.test.mjs` (3 test) |
| 5 | Verifikasi akhir | **41 pass, 0 fail** + checklist admin/user/responsif |