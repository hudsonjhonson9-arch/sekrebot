# Arsip Native — Tahap 1 (Dokumen + Beranda + Preview + FAB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel Arsip native punya beranda grid tile, daftar dokumen bergaya arsipdigital, preview dokumen **di dalam panel** (tanpa pindah tab), dan tombol `+` untuk unggah — semua di `absensi_refactored_v6`.

**Architecture:** Satu helper baru (`js/arsip-ui.js`) berisi fungsi murni (URL Drive → embed/thumbnail, jenis berkas, reducer navigasi) + builder HTML kecil, diuji di Node dengan cara `new Function('window', src)`. Panel `js/arsip.js` mendapat state `view` (beranda/dokumen/kk/bd/app) lewat reducer itu, daftar dokumen dipercantik, dan preview dibuka sebagai overlay di dalam `#panel-arsip`. Backend `server/arsip.js` menambah satu rute proxy generik ber-whitelist `/p/*` (dipakai tahap 2 & 3) — di tahap 1 hanya untuk memastikan jalur dan test-nya siap.

**Tech Stack:** Vanilla JS (script klasik, bukan module), Express 4 ESM, Node `node:test`, CSS variable tema, Vite dev server.

**Referensi spec:** `docs/superpowers/specs/2026-10-15-arsip-native-3domain-design.md`

## Global Constraints

- **Tahap 1 hanya dokumen.** Kertas Kerja & Bank Data = placeholder; jangan implementasi modulnya di plan ini.
- Tidak ada dependensi baru. Ikon memakai Font Awesome yang sudah dimuat.
- Teks UI **bahasa Indonesia**.
- Jangan ubah `.env` (khususnya `ARSIP_SESSION_SECRET=ARSIPDIGITALBAPPERIDA2026`) dan jangan ubah format/ nama cookie SSO.
- Jangan regresikan tampilan full-bleed & dual tema: warna hanya dari CSS variable yang ada (`var(--card-bg)`, `var(--border)`, `var(--gold)`, `var(--white)`, `var(--muted)`, `var(--radius)`, `var(--radius-lg)`, `var(--shadow-md)`).
- `js/*.js` dimuat sebagai **script klasik** (bukan `type="module"`). Helper baru diekspor lewat `window.ArsipUI`.
- Urutan muat script: `js/arsip-ui.js` **sebelum** `js/arsip.js`.
- ID lama yang dipakai kode lain **tidak boleh hilang**: `arsipNative`, `arsipList`, `arsipDetail`, `arsipQuery`, `arsipStatus`, `arsipCount`, `arsipUploadBtn`, `arsipUploadModal`, `arsipUploadForm`, `arsipFullBtn`, `arsipFrame`.
- Shell **PowerShell 5.1**: tidak ada `&&`, `&`, heredoc `<<`, `head`, `tail`, `grep`, `cat`. Pakai `;`, `if ($?) { }`, `Select-Object`.
- Perintah tes:
  - `node --test server/arsip.test.js`
  - `node --test tests/arsip-ui.test.js`
  - `node --test tests/arsip-markup.test.mjs`
  - `npx eslint --no-ignore js/arsip.js js/arsip-ui.js`
- Cache-bust wajib dinaikkan di `index.html` setiap kali aset berubah.
- **Soal commit:** langkah commit di bawah hanya dijalankan kalau user sudah menyetujui commit otomatis. Kalau tidak, ganti langkah commit dengan laporan singkat ("task selesai, belum di-commit") dan lanjut ke task berikutnya.

---

## Struktur Berkas

| Berkas | Tanggung jawab |
|---|---|
| `server/arsip.js` (ubah) | Tambah rute proxy generik ber-whitelist `/p/*`. Tidak ada berkas server baru. |
| `server/arsip.test.js` (ubah) | Tes whitelist, query string, gate tulis. |
| `js/arsip-ui.js` (baru) | Fungsi murni + builder HTML: `driveFileId`, `driveEmbedUrl`, `driveThumbUrl`, `extOf`, `jenisFile`, `warnaFile`, `ikonFile`, `nav`, `skeleton`, `empty`. Tidak menyentuh DOM. |
| `tests/arsip-ui.test.js` (baru) | Tes fungsi murni di atas lewat `new Function('window', src)`. |
| `tests/arsip-markup.test.mjs` (baru) | Tes markup: landmark baru ada, 4 tile, FAB, urutan script, tidak ada tautan `target="_blank"` untuk dokumen. |
| `index.html` (ubah) | `#arsipHome`, `#arsipDokumen`, `#arsipKK`, `#arsipBD`, `#arsipPreview`; tombol unggah jadi FAB `+`; script `arsip-ui.js`; cache-bust. |
| `css/styles.css` (ubah) | Tambah blok gaya di akhir berkas: tile beranda, baris dokumen baru, overlay preview, FAB. |
| `js/arsip.js` (ubah) | State `view`, beranda, list restyle, overlay preview, FAB wiring, reset saat masuk tab. |
| `js/ui.js` (ubah) | Panggil `window.arsipReset()` saat masuk tab arsip. |

---

### Task 1: Proxy whitelist `/p/*` (backend)

**Files:**
- Modify: `server/arsip.js` (sisipkan sebelum `return router;` di akhir `createArsipRouter`)
- Test: `server/arsip.test.js` (tambah di akhir berkas, pakai `harness()`/`via()` yang sudah ada)

**Interfaces:**
- Consumes: `forward(req, res, target)` (sudah ada, `server/arsip.js:21`), `harness({ fetchImpl, baseUrl, secret, user })` dan `via(app, path, headers, init)` dari `server/arsip.test.js:33,50`.
- Produces: rute `GET|POST|PUT|PATCH|DELETE /api/arsip/p/<path-peta>` — dipakai `js/arsip-kk.js` & `js/arsip-bd.js` di tahap 2/3, dan diverifikasi di tahap 1.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan ke akhir `server/arsip.test.js`:

```js
test('whitelist /p/*: path diizinkan diteruskan, query string ikut', async () => {
  const { app, captured } = harness();
  const r = await via(app, '/api/arsip/p/api/kertas-kerja?tahun=2026');
  assert.equal(r.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, UPSTREAM + '/api/kertas-kerja?tahun=2026');
});

test('whitelist /p/*: path di luar daftar ditolak 403 tanpa menyentuh upstream', async () => {
  const { app, captured } = harness();
  const r = await via(app, '/api/arsip/p/api/users');
  assert.equal(r.status, 403);
  assert.equal(captured.length, 0);
});

test('whitelist /p/*: tulis oleh role non-MEDIA ditolak 403 (gate absensi)', async () => {
  const { app, captured } = harness({ user: { ...ME, role: 'USER' } });
  const r = await via(
    app,
    '/api/arsip/p/api/bankdata/opd',
    { 'Content-Type': 'application/json' },
    { method: 'POST', body: '{}' }
  );
  assert.equal(r.status, 403);
  assert.equal(captured.length, 0);
});

test('whitelist /p/*: GET bankdata diteruskan dan /p/api/docs tidak menabrak /docs/:id', async () => {
  const { app, captured } = harness();
  const r1 = await via(app, '/api/arsip/p/api/bankdata');
  assert.equal(r1.status, 200);
  assert.equal(captured[0].url, UPSTREAM + '/api/bankdata');

  const { app: app2, captured: cap2 } = harness();
  const r2 = await via(app2, '/api/arsip/p/api/docs/abc123');
  assert.equal(r2.status, 200);
  assert.equal(cap2[0].url, UPSTREAM + '/api/docs/abc123');
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

Run: `node --test server/arsip.test.js`
Expected: 4 tes baru FAIL — rute `/api/arsip/p/...` balik **404** (belum ada), `captured.length` 0.

- [ ] **Step 3: Implementasi whitelist**

Di `server/arsip.js`, sisipkan tepat sebelum baris `return router;`:

```js
  // ── Proxy generik domain lain (Kertas Kerja / Bank Data / PKS) ──
  // ponytail: whitelist, bukan handler per endpoint. Gate tulis tetap dua lapis —
  // forward() (MEDIA_ROLES) lalu peta (kebijakan.js) — jadi di sini cukup daftar
  // path yang boleh lewat supaya panel arsip tidak jadi open proxy.
  const IZIN = {
    GET: [
      /^\/api\/docs$/, /^\/api\/docs\/[^/]+$/,
      /^\/api\/docs\/[^/]+\/(history|versions|index-status|shares)$/,
      /^\/api\/pks\/[a-z-]+$/, /^\/api\/pks\/ringkasan\/\d+$/, /^\/api\/pks\/deadline-terdekat$/,
      /^\/api\/kertas-kerja$/, /^\/api\/kertas-kerja\/[^/]+$/,
      /^\/api\/kertas-kerja\/periode\/[^/]+\/kandidat$/,
      /^\/api\/bankdata$/, /^\/api\/bankdata\/tahun$/,
    ],
    POST: [
      /^\/api\/docs$/, /^\/api\/docs\/bulk$/,
      /^\/api\/docs\/[^/]+\/(status|publik|shares|versions)$/,
      /^\/api\/pks\/[a-z-]+$/,
      /^\/api\/kertas-kerja$/, /^\/api\/kertas-kerja\/bulk$/,
      /^\/api\/kertas-kerja\/[^/]+\/(generate|sinkron-wajib|pengingat)$/,
      /^\/api\/kertas-kerja\/periode\/[^/]+\/tautan$/,
      /^\/api\/bankdata\/[a-z]+$/,
    ],
    PUT: [
      /^\/api\/docs\/[^/]+$/, /^\/api\/pks\/[a-z-]+\/[^/]+$/,
      /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/,
    ],
    PATCH: [
      /^\/api\/docs\/[^/]+\/(status|publik)$/, /^\/api\/kertas-kerja\/periode\/[^/]+$/,
      /^\/api\/bankdata\/[a-z]+(\/[^/]+)*$/,
    ],
    DELETE: [
      /^\/api\/docs\/[^/]+$/, /^\/api\/docs\/[^/]+\/shares\/[^/]+$/, /^\/api\/pks\/[a-z-]+\/[^/]+$/,
      /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/, /^\/api\/bankdata\/tahun\/[^/]+$/,
    ],
  };

  router.all(/^\/p\/(.*)$/, (req, res) => {
    const rest = req.params[0];
    const i = req.originalUrl.indexOf('?');
    const qs = i === -1 ? '' : req.originalUrl.slice(i);
    const pola = IZIN[req.method] || [];
    if (!pola.some((re) => re.test('/' + rest))) {
      return res.status(403).json({ ok: false, message: 'Path arsip tidak diizinkan.' });
    }
    return forward(req, res, '/api/' + rest + qs);
  });

```

Catatan: `req.params[0]` tidak memuat query string (Express 4 mencocokkan pathname), jadi query diambil dari `req.originalUrl`.

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

Run: `node --test server/arsip.test.js`
Expected: PASS semua (26 tes lama + 4 tes baru = 30).

- [ ] **Step 5: Lint**

Run: `npx eslint --no-ignore server/arsip.js`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add server/arsip.js server/arsip.test.js
git commit -m "feat(arsip): proxy /p/* ber-whitelist untuk domain kertas-kerja & bankdata"
```

---

### Task 2: Helper murni `js/arsip-ui.js`

**Files:**
- Create: `js/arsip-ui.js`
- Test: `tests/arsip-ui.test.js`

**Interfaces:**
- Consumes: `window.driveImgUrl(url, size)` (`js/helpers.js:386`, opsional — ada fallback sendiri).
- Produces (semua di `window.ArsipUI`):
  - `driveFileId(url) → string|null`
  - `driveEmbedUrl(url) → string|null` (URL `/preview` Drive)
  - `driveThumbUrl(url, size = 400) → string`
  - `extOf(d) → string` (huruf kecil, `''` bila tidak ada)
  - `jenisFile(d) → 'gambar' | 'pdf' | 'lain'`
  - `warnaFile(d) → string` (hex)
  - `ikonFile(d) → string` (kelas Font Awesome, mis. `fa-file-pdf`)
  - `nav(state, action) → { view, folder, detail }` dengan `view ∈ 'home'|'dokumen'|'kk'|'bd'|'app'`
  - `skeleton(mode, n) → string` (HTML)
  - `empty(text) → string` (HTML)

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/arsip-ui.test.js`:

```js
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

test('warnaFile & ikonFile berubah per jenis', () => {
  assert.match(UI.warnaFile({ title: 'a.pdf' }), /^#/);
  assert.notEqual(UI.warnaFile({ title: 'a.pdf' }), UI.warnaFile({ title: 'a.xlsx' }));
  assert.equal(UI.ikonFile({ title: 'a.pdf' }), 'fa-file-pdf');
  assert.equal(UI.ikonFile({ title: 'a.jpg' }), 'fa-file-image');
  assert.equal(UI.ikonFile({ title: 'a.xlsx' }), 'fa-file-excel');
  assert.equal(UI.ikonFile({ title: 'a.doc' }), 'fa-file-word');
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

test('nav: folder & detail, dan rantai back menaik satu tingkat', () => {
  let s = UI.nav({ view: 'home', folder: null, detail: null }, 'folder:Bapperida');
  assert.deepEqual(s, { view: 'dokumen', folder: 'Bapperida', detail: null });
  s = UI.nav(s, 'detail:abc');
  assert.equal(s.detail, 'abc');
  s = UI.nav(s, 'back');
  assert.deepEqual(s, { view: 'dokumen', folder: 'Bapperida', detail: null });
  s = UI.nav(s, 'back');
  assert.deepEqual(s, { view: 'dokumen', folder: null, detail: null });
  s = UI.nav(s, 'back');
  assert.deepEqual(s, { view: 'home', folder: null, detail: null });
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
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

Run: `node --test tests/arsip-ui.test.js`
Expected: FAIL — `ENOENT` `js/arsip-ui.js` (berkas belum ada).

- [ ] **Step 3: Implementasi `js/arsip-ui.js`**

```js
/* Utilitas panel arsip native. Script klasik: semua keluar lewat window.ArsipUI.
   Fungsi di sini MURNI (tanpa DOM) supaya bisa diuji di Node lewat
   new Function('window', src) — lihat tests/arsip-ui.test.js. */
(function () {
  var WARNA_EXT = {
    pdf: '#e5484d',
    doc: '#3b82f6', docx: '#3b82f6',
    xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
    ppt: '#f59e0b', pptx: '#f59e0b',
    jpg: '#a855f7', jpeg: '#a855f7', png: '#a855f7', webp: '#a855f7', gif: '#a855f7',
    zip: '#64748b', rar: '#64748b', '7z': '#64748b',
  };
  var GAMBAR = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

  function driveFileId(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return null;
    var m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/) || s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  // URL embed Drive (boleh di-iframe). Non-Drive / tanpa id -> null.
  function driveEmbedUrl(url) {
    var id = driveFileId(url);
    return id ? 'https://drive.google.com/file/d/' + id + '/preview' : null;
  }

  // Thumbnail Drive; delegasi ke driveImgUrl (js/helpers.js) supaya satu jalur saja.
  function driveThumbUrl(url, size) {
    var s = String(url == null ? '' : url);
    var w = size || 400;
    if (typeof window.driveImgUrl === 'function') return window.driveImgUrl(s, w);
    var id = driveFileId(s);
    return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + w : s;
  }

  function extOf(d) {
    var s = String((d && (d.title || d.url)) || '');
    var m = s.match(/\.([a-z0-9]{2,5})(?=$|[?#])/i);
    return m ? m[1].toLowerCase() : '';
  }

  function jenisFile(d) {
    var ext = extOf(d);
    if (GAMBAR.indexOf(ext) !== -1) return 'gambar';
    if (ext === 'pdf') return 'pdf';
    return 'lain';
  }

  function warnaFile(d) {
    return WARNA_EXT[extOf(d)] || '#64748b';
  }

  function ikonFile(d) {
    var ext = extOf(d);
    if (GAMBAR.indexOf(ext) !== -1) return 'fa-file-image';
    if (ext === 'pdf') return 'fa-file-pdf';
    if (ext === 'doc' || ext === 'docx') return 'fa-file-word';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'fa-file-excel';
    if (ext === 'ppt' || ext === 'pptx') return 'fa-file-powerpoint';
    return 'fa-file-alt';
  }

  // Reducer navigasi: murni + tanpa DOM, jadi bisa diuji. Inilah satu-satunya
  // tempat aturan "naik satu tingkat" ditulis.
  function nav(state, action) {
    var s = {
      view: (state && state.view) || 'home',
      folder: (state && state.folder) || null,
      detail: (state && state.detail) || null,
    };
    var a = String(action == null ? '' : action);
    if (a.indexOf('tile:') === 0) {
      var v = a.slice(5);
      if (['dokumen', 'kk', 'bd', 'app'].indexOf(v) === -1) return s;
      return { view: v, folder: null, detail: null };
    }
    if (a === 'home') return { view: 'home', folder: null, detail: null };
    if (a === 'folder-back') return { view: 'dokumen', folder: null, detail: null };
    if (a === 'detail-close') return { view: s.view, folder: s.folder, detail: null };
    if (a.indexOf('folder:') === 0) return { view: 'dokumen', folder: a.slice(7) || null, detail: null };
    if (a.indexOf('detail:') === 0) return { view: s.view, folder: s.folder, detail: a.slice(7) || null };
    if (a === 'back') {
      if (s.view !== 'dokumen') return { view: 'home', folder: null, detail: null };
      if (s.detail) return { view: 'dokumen', folder: s.folder, detail: null };
      if (s.folder) return { view: 'dokumen', folder: null, detail: null };
      return { view: 'home', folder: null, detail: null };
    }
    return s;
  }

  function esc(v) {
    return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v == null ? '' : v);
  }

  function skeleton(mode, n) {
    var k = Math.max(1, Math.min(8, n || 4));
    var cls = (mode === 'grid' ? 'arsip-card ' : 'arsip-item-wrap ') + 'arsip-skel';
    var out = '';
    for (var i = 0; i < k; i++) out += '<div class="' + cls + '"></div>';
    return out;
  }

  function empty(text) {
    return '<div class="arsip-placeholder">' + esc(text) + '</div>';
  }

  window.ArsipUI = {
    WARNA_EXT: WARNA_EXT,
    driveFileId: driveFileId,
    driveEmbedUrl: driveEmbedUrl,
    driveThumbUrl: driveThumbUrl,
    extOf: extOf,
    jenisFile: jenisFile,
    warnaFile: warnaFile,
    ikonFile: ikonFile,
    nav: nav,
    skeleton: skeleton,
    empty: empty,
  };
})();
```

- [ ] **Step 4: Jalankan tes, pastikan LULUS**

Run: `node --test tests/arsip-ui.test.js`
Expected: PASS semua.

- [ ] **Step 5: Lint**

Run: `npx eslint --no-ignore js/arsip-ui.js`
Expected: 0 error (kalau `window`/`document` dilaporkan `no-undef`, tambahkan `/* global window */` di baris pertama berkas).

- [ ] **Step 6: Commit**

```bash
git add js/arsip-ui.js tests/arsip-ui.test.js
git commit -m "feat(arsip): helper murni arsip-ui (drive embed/thumb, jenis file, nav reducer)"
```

---

### Task 3: Markup `index.html` (beranda, section, preview, FAB)

**Files:**
- Modify: `index.html` (blok `#panel-arsip`, baris 418–463; blok `<script>` `js/arsip.js` di baris ~3223)
- Test: `tests/arsip-markup.test.mjs`

**Interfaces:**
- Consumes: —
- Produces (ID yang dipakai Task 4–7): `#arsipHome` (+ `[data-tile]`), `#arsipDokumen`, `#arsipKK`, `#arsipBD`, `#arsipPreview`, `#arsipPreviewTitle`, `#arsipPreviewBody`, `#arsipPreviewOpen`, `#arsipPreviewDl`, `#arsipPreviewClose`, `#arsipTileCount`, dan `#arsipUploadBtn` berkelas `arsip-fab`.

- [ ] **Step 1: Tulis tes yang gagal**

Buat `tests/arsip-markup.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lines = html.split(/\r?\n/);
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const arsipJs = fs.readFileSync(path.join(ROOT, 'js', 'arsip.js'), 'utf8');

test('landmark beranda, section, dan overlay preview ada', () => {
  for (const id of [
    'arsipHome', 'arsipDokumen', 'arsipKK', 'arsipBD',
    'arsipPreview', 'arsipPreviewTitle', 'arsipPreviewBody',
    'arsipPreviewOpen', 'arsipPreviewDl', 'arsipPreviewClose', 'arsipTileCount',
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), 'hilang #' + id);
  }
});

test('empat tile sesuai keputusan: Dokumen, Kertas Kerja, Bank Data, Aplikasi Lengkap', () => {
  const tiles = [...html.matchAll(/data-tile="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['dokumen', 'kk', 'bd', 'app']);
  for (const label of ['Dokumen', 'Kertas Kerja', 'Bank Data', 'Aplikasi Lengkap']) {
    assert.ok(html.includes(label), 'label tile hilang: ' + label);
  }
});

test('tombol unggah tetap id lama tapi jadi FAB, dan punya gaya .arsip-fab', () => {
  const tag = html.match(/<button[^>]*id="arsipUploadBtn"[^>]*>/);
  assert.ok(tag, '#arsipUploadBtn hilang');
  assert.match(tag[0], /arsip-fab/, 'tombol unggah harus berkelas arsip-fab');
  assert.match(css, /\.arsip-fab\s*\{/);
});

test('ID lama yang dipakai kode lain tetap ada', () => {
  for (const id of ['arsipNative', 'arsipList', 'arsipDetail', 'arsipQuery', 'arsipStatus',
    'arsipCount', 'arsipUploadBtn', 'arsipUploadModal', 'arsipUploadForm', 'arsipFullBtn', 'arsipFrame']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'hilang #' + id);
  }
});

test('panel-arsip kembali punya #arsipList di dalam #arsipDokumen', () => {
  const iDok = lines.findIndex((l) => l.includes('id="arsipDokumen"'));
  const iList = lines.findIndex((l) => l.includes('id="arsipList"'));
  assert.ok(iDok > 0 && iList > iDok, '#arsipList harus berada setelah #arsipDokumen');
});

test('arsip-ui.js dimuat dan mendahului arsip.js', () => {
  const at = (f) => lines.findIndex((l) => l.includes('src="js/' + f));
  const iUi = at('arsip-ui.js'), iArsip = at('arsip.js');
  assert.ok(iUi > 0, 'js/arsip-ui.js belum dimuat');
  assert.ok(iUi < iArsip, 'arsip-ui.js harus mendahului arsip.js');
});

test('tidak ada tautan dokumen yang membuka tab baru di js/arsip.js', () => {
  assert.doesNotMatch(arsipJs, /href="\$\{escapeHtml\(d\.url\)\}"/, 'tautan dokumen keluar tab masih ada');
});
```

- [ ] **Step 2: Jalankan tes, pastikan GAGAL**

Run: `node --test tests/arsip-markup.test.mjs`
Expected: FAIL — `#arsipHome` tidak ada, `arsip-ui.js` belum dimuat, dan `js/arsip.js` masih memuat `href="${escapeHtml(d.url)}"`.

- [ ] **Step 3: Ganti isi blok `#panel-arsip`**

Ganti baris 418–461 (dari `<div class="panel" id="panel-arsip">` sampai `</div>` penutup `#arsipNative`) dengan:

```html
<div class="panel" id="panel-arsip">
<button class="arsip-back" onclick="arsipBack()"><i class="fas fa-arrow-left" aria-hidden="true"></i> Kembali</button>
<div class="arsip-native" id="arsipNative">

  <!-- beranda: grid tile (dulu menu, baru daftar) -->
  <div class="arsip-head">
    <div class="arsip-h1">Arsip</div>
    <div class="arsip-sub" id="arsipCount">Memuat dokumen…</div>
  </div>
  <div id="arsipHome" class="arsip-home">
    <button class="arsip-tile" data-tile="dokumen">
      <span class="arsip-tile-ico"><i class="fas fa-folder-open" aria-hidden="true"></i></span>
      <span class="arsip-tile-name">Dokumen</span>
      <em id="arsipTileCount">—</em>
    </button>
    <button class="arsip-tile" data-tile="kk">
      <span class="arsip-tile-ico"><i class="fas fa-clipboard-list" aria-hidden="true"></i></span>
      <span class="arsip-tile-name">Kertas Kerja</span>
      <em>Segera</em>
    </button>
    <button class="arsip-tile" data-tile="bd">
      <span class="arsip-tile-ico"><i class="fas fa-chart-column" aria-hidden="true"></i></span>
      <span class="arsip-tile-name">Bank Data</span>
      <em>Segera</em>
    </button>
    <button class="arsip-tile" data-tile="app">
      <span class="arsip-tile-ico"><i class="fas fa-external-link-alt" aria-hidden="true"></i></span>
      <span class="arsip-tile-name">Aplikasi Lengkap</span>
      <em>arsipdigital</em>
    </button>
  </div>

  <!-- dokumen: folder per bidang -> list -> detail -->
  <div id="arsipDokumen" class="arsip-dokumen" style="display:none">
    <div class="arsip-toolbar">
      <input id="arsipQuery" class="arsip-search" placeholder="Cari judul / bidang / tahun…" aria-label="Cari dokumen" />
      <select id="arsipStatus" class="arsip-search arsip-filter" aria-label="Filter status">
        <option value="">Semua</option>
        <option>Diarsipkan</option>
        <option>Menunggu Review</option>
        <option>Ditolak</option>
      </select>
      <button class="arsip-full" id="arsipFullBtn" title="Buka seluruh menu arsip (aplikasi web)">
        <i class="fas fa-external-link-alt" aria-hidden="true"></i><span>Aplikasi lengkap</span>
      </button>
    </div>
    <div id="arsipList" class="arsip-list"><div class="arsip-placeholder">Memuat dokumen…</div></div>
    <div id="arsipDetail" class="arsip-detail" style="display:none"></div>
  </div>

  <!-- tahap 2 & 3 -->
  <div id="arsipKK" class="arsip-section" style="display:none"></div>
  <div id="arsipBD" class="arsip-section" style="display:none"></div>

  <!-- tombol unggah: FAB, id lama dipertahankan supaya listener lama tetap jalan -->
  <button class="arsip-upload arsip-fab" id="arsipUploadBtn" style="display:none" title="Unggah dokumen baru" aria-label="Unggah dokumen baru">
    <i class="fas fa-fw fa-plus" aria-hidden="true"></i>
  </button>

  <!-- overlay preview: di dalam panel, jadi tidak pernah pindah tab -->
  <div id="arsipPreview" class="arsip-preview" style="display:none">
    <div class="arsip-preview-bar">
      <strong id="arsipPreviewTitle">Dokumen</strong>
      <div class="arsip-preview-acts">
        <a id="arsipPreviewOpen" class="arsip-act" target="_blank" rel="noopener">Buka</a>
        <a id="arsipPreviewDl" class="arsip-act" target="_blank" rel="noopener">Unduh</a>
        <button class="arsip-act" id="arsipPreviewClose">Tutup</button>
      </div>
    </div>
    <div id="arsipPreviewBody" class="arsip-preview-body"></div>
  </div>

  <div id="arsipUploadModal" class="arsip-modal" style="display:none">
    <div class="arsip-modal-box">
      <div class="arsip-modal-head"><strong>Unggah Dokumen</strong><button class="arsip-act" data-upload-close>Tutup</button></div>
      <form id="arsipUploadForm" class="arsip-form">
        <label>Judul <span class="arsip-req">*</span><input name="title" required maxlength="200" /></label>
        <label>Kategori <input name="type" placeholder="mis. SK, Laporan" maxlength="80" /></label>
        <label>Sektor <input name="sector" maxlength="80" /></label>
        <label>Bidang <input name="bidang" maxlength="80" /></label>
        <label>Nomor Dokumen <input name="nomor_dokumen" maxlength="80" /></label>
        <label>Tanggal Dokumen <input name="tanggal_dokumen" type="date" /></label>
        <label>Berkas <span class="arsip-req">*</span><input name="file" type="file" required /></label>
        <div id="arsipUploadMsg" class="arsip-form-msg"></div>
        <div class="arsip-form-acts">
          <button type="submit" class="arsip-act ok" id="arsipUploadSubmit">Unggah</button>
          <button type="button" class="arsip-act" data-upload-close>Batal</button>
        </div>
      </form>
    </div>
  </div>
</div>
<iframe id="arsipFrame" class="arsip-frame" title="Arsip Digital" loading="lazy" style="display:none"></iframe>
```

- [ ] **Step 4: Tambah script & naikkan cache-bust**

Di `index.html`, tepat sebelum baris `<script src="js/arsip.js?v=11"></script>`, tambahkan:

```html
  <script src="js/arsip-ui.js?v=1"></script>
```

Lalu ubah baris itu jadi:

```html
  <script src="js/arsip.js?v=12"></script>
```

Dan naikkan `css/styles.css?v=34` → `css/styles.css?v=35`.

- [ ] **Step 5: Jalankan tes**

Run: `node --test tests/arsip-markup.test.mjs`
Expected: 6 dari 7 tes PASS; tes terakhir ("tidak ada tautan dokumen ... keluar tab") masih **FAIL** — itu jatah Task 7. Catat itu, jangan "perbaiki" dengan mengubah tes.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/arsip-markup.test.mjs
git commit -m "feat(arsip): markup beranda tile, section dokumen, overlay preview, FAB unggah"
```

---

### Task 4: Gaya CSS (tile, baris dokumen, overlay, FAB)

**Files:**
- Modify: `css/styles.css` (tambah blok baru di akhir berkas, setelah baris 7419)

**Interfaces:**
- Consumes: kelas dari Task 3 (`.arsip-home`, `.arsip-tile`, `.arsip-preview`, `.arsip-fab`) dan Task 6 (`.arsip-item-body`, `.arsip-skel`).
- Produces: kelas `.arsip-skel` (dipakai `ArsipUI.skeleton`).

- [ ] **Step 1: Tambahkan CSS**

Tambah di akhir `css/styles.css`:

```css
/* ── Arsip: beranda tile, baris dokumen, overlay preview, FAB ── */
.arsip-home {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 0 32px 16px;
}
.arsip-tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 16px; text-align: left; cursor: pointer;
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  background: var(--card-bg);
  transition: border-color .2s ease, box-shadow .2s ease;
}
.arsip-tile:hover { border-color: var(--gold); box-shadow: var(--shadow-md); }
.arsip-tile-ico {
  display: grid; place-items: center; width: 42px; height: 42px;
  margin-bottom: 8px; border-radius: var(--radius);
  background: color-mix(in srgb, var(--gold) 16%, transparent);
}
.arsip-tile-ico i { color: var(--gold); font-size: 18px; }
.arsip-tile-name { font-size: 13px; font-weight: 800; color: var(--white); line-height: 1.35; }
.arsip-tile em { font-style: normal; font-weight: 600; font-size: 11px; color: var(--muted); }

.arsip-dokumen { display: flex; flex-direction: column; min-height: 0; }
.arsip-section { padding: 0 32px 16px; color: var(--white); font-size: 13px; }

/* baris dokumen gaya arsipdigital: ikon berwarna + judul + meta + badge */
.arsip-item {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 12px; width: 100%; text-align: left;
  border: 0; background: transparent; color: var(--white);
  cursor: pointer; font: inherit;
}
.arsip-item-body { min-width: 0; flex: 1 1 auto; display: block; }
.arsip-ico { --ic: var(--gold); }
.arsip-ico i { color: var(--ic); }
.arsip-item-meta, .arsip-item-sub { display: block; }

.arsip-skel {
  min-height: 56px; border-radius: var(--radius);
  background: linear-gradient(90deg, var(--card-bg) 25%, var(--border) 37%, var(--card-bg) 63%);
  background-size: 400% 100%;
  animation: arsip-skel 1.2s ease-in-out infinite;
}
@keyframes arsip-skel { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

@media (prefers-reduced-motion: reduce) { .arsip-skel { animation: none; } }

/* FAB unggah: tetap di dalam panel, di atas bottom nav */
.arsip-fab {
  position: absolute;
  right: 16px;
  bottom: calc(16px + var(--tg-safe-area-inset-bottom, 0px));
  z-index: 1200;
  display: grid; place-items: center;
  width: 52px; height: 52px; padding: 0;
  border: 0; border-radius: 999px;
  background: var(--gold); color: #0f172a;
  box-shadow: var(--shadow-md);
  cursor: pointer; font-size: 18px;
}
.arsip-fab:hover { filter: brightness(1.06); }
#panel-arsip { position: relative; }

/* overlay preview: mengisi area panel, tidak pernah keluar tab */
.arsip-preview {
  position: absolute; inset: 0; z-index: 1300;
  display: flex; flex-direction: column;
  background: var(--card-bg);
}
.arsip-preview-bar {
  display: flex; align-items: center; gap: 8px; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
}
.arsip-preview-bar strong {
  color: var(--white); font-size: 13px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.arsip-preview-acts { display: flex; gap: 6px; flex: 0 0 auto; }
.arsip-preview-body { flex: 1 1 auto; min-height: 0; display: grid; place-items: center; overflow: auto; }
.arsip-preview-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.arsip-preview-frame { width: 100%; height: 100%; border: 0; display: block; background: var(--card-bg); }
body.arsip-preview-open { overflow: hidden; }

@media (max-width: 767px) {
  .arsip-home { padding: 0 14px 12px; grid-template-columns: repeat(2, 1fr); }
  .arsip-section { padding: 0 14px 12px; }
  .arsip-fab { right: 14px; bottom: calc(80px + var(--tg-safe-area-inset-bottom, 0px)); }
  .arsip-preview-img { max-height: 70vh; }
}
```

- [ ] **Step 2: Cek gaya terbaca & tidak menimpa blok lama**

Run: `Select-String -Path css/styles.css -Pattern "\.arsip-fab|\.arsip-tile|\.arsip-preview|\.arsip-skel" | Measure-Object | Select-Object -ExpandProperty Count`
Expected: angka > 10 (blok baru terpasang di akhir berkas).

- [ ] **Step 3: Tes markup (yang menguji `css`)**

Run: `node --test tests/arsip-markup.test.mjs`
Expected: tes FAB+`.arsip-fab` PASS; tes tautan dokumen masih FAIL (jatah Task 7).

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "style(arsip): tile beranda, baris dokumen, overlay preview, FAB"
```

---

### Task 5: State `view` + navigasi beranda/dokumen di `js/arsip.js`

**Files:**
- Modify: `js/arsip.js` (baris 16 variabel `openFolder`; sisipkan fungsi baru setelah `let failed`; ubah `render` 283–300; ubah `onListClick` 362–374, 409–418; ubah `arsipBack` 357–360; tambah export di 455–457)

**Interfaces:**
- Consumes: `ArsipUI.nav(state, action)` (Task 2).
- Produces: `window.ARSIP.goArsip(action)`, `window.arsipReset()`, variabel modul `view`.

- [ ] **Step 1: Ganti variabel `openFolder` jadi state `view`**

Ubah baris 16:

```js
  let view = { view: 'home', folder: null, detail: null }; // beranda -> dokumen/kk/bd/app
```

- [ ] **Step 2: Tambah fungsi tampilan & navigasi**

Sisipkan setelah baris `let view = ...`:

```js
  // Tampilkan hanya satu bagian panel sekaligus; iframe "Aplikasi lengkap"
  // tetap dikelola showFull()/closeFull() supaya perilaku lamanya tidak berubah.
  function tampil(id, on) {
    const el = $(id);
    if (el) el.style.display = on ? '' : 'none';
  }

  function applyView() {
    tampil('arsipHome', view.view === 'home');
    tampil('arsipDokumen', view.view === 'dokumen');
    tampil('arsipKK', view.view === 'kk');
    tampil('arsipBD', view.view === 'bd');
    if (window._arsipFull !== (view.view === 'app')) {
      if (view.view === 'app') showFull();
      else closeFull();
    }
    const kk = $('arsipKK');
    if (view.view === 'kk' && kk && !kk.dataset.mounted) {
      kk.dataset.mounted = '1';
      kk.innerHTML = '<div class="arsip-placeholder">Kertas Kerja menyusul (tahap 2).</div>';
    }
    const bd = $('arsipBD');
    if (view.view === 'bd' && bd && !bd.dataset.mounted) {
      bd.dataset.mounted = '1';
      bd.innerHTML = '<div class="arsip-placeholder">Bank Data menyusul (tahap 3).</div>';
    }
    if (view.detail) openDetail(view.detail);
    else if (view.view === 'dokumen') {
      const listEl = $('arsipList');
      const detailEl = $('arsipDetail');
      if (listEl) listEl.style.display = '';
      if (detailEl) detailEl.style.display = 'none';
      render();
    }
  }

  function goArsip(action) {
    view = window.ArsipUI.nav(view, action);
    applyView();
  }
```

- [ ] **Step 3: Ubah `render` agar memakai `view.folder`**

Ubah baris 283:

```js
    if (view.folder === null) {
```

Ubah baris 295–299:

```js
    if (!groups.has(view.folder)) { view.folder = null; return render(); }
    const back = `<button class="arsip-back-folder" data-folder-back>`
      + `<i class="fas fa-arrow-left" aria-hidden="true"></i> Semua Bidang</button>`
      + `<div class="arsip-folder-title"><i class="fas fa-folder" aria-hidden="true"></i> ${escapeHtml(view.folder)}`
      + `<em>${groups.get(view.folder).length} dokumen</em></div>`;
    box.innerHTML = cb + back + groups.get(view.folder).map(row).join('');
```

Ubah baris 300 yang lama (`box.innerHTML = cb + back + groups.get(openFolder).map(row).join('');`) menjadi bagian dari penggantian di atas (satu blok). Pastikan tidak ada lagi referensi `openFolder`:

Run: `Select-String -Path js/arsip.js -Pattern "openFolder"`
Expected: tidak ada baris hasil.

- [ ] **Step 4: Sambungkan klik beranda & folder ke `goArsip`**

Ubah blok awal `onListClick` (baris 362–374) jadi:

```js
  async function onListClick(e) {
    const tile = e.target.closest('[data-tile]');
    if (tile) {
      e.preventDefault();
      return goArsip('tile:' + tile.dataset.tile);
    }
    const fol = e.target.closest('[data-folder]');
    if (fol) {
      e.preventDefault();
      return goArsip('folder:' + fol.dataset.folder);
    }
    const back = e.target.closest('[data-folder-back]');
    if (back) {
      e.preventDefault();
      return goArsip('folder-back');
    }
```

Ubah blok `[data-detail]`/`[data-close-detail]` (baris 409–418) jadi:

```js
    const dt = e.target.closest('[data-detail]');
    if (dt) {
      e.preventDefault();
      return goArsip('detail:' + dt.dataset.detail);
    }
    const cls = e.target.closest('[data-close-detail]');
    if (cls) {
      e.preventDefault();
      return goArsip('detail-close');
    }
```

- [ ] **Step 5: Beranda juga menangani klik (listener baru) & `arsipBack` naik satu tingkat**

Ubah `arsipBack` (baris 357–360) jadi:

```js
  function arsipBack() {
    if (window._arsipFull) return goArsip('home');
    if (view.view !== 'home' || view.folder || view.detail) return goArsip('back');
    switchTab(window._arsipPrevTab || 'absen');
  }
```

Di `DOMContentLoaded` (baris 432–453), tambahkan listener beranda tepat setelah baris `if (listEl) listEl.addEventListener('click', onListClick);`:

```js
    const homeEl = $('arsipHome');
    if (homeEl) homeEl.addEventListener('click', onListClick);
```

Dan ganti baris terakhir DOMContentLoaded (`if (document.querySelector('#panel-arsip.active')) loadArsipDocs();`) jadi:

```js
    applyView();
    if (document.querySelector('#panel-arsip.active')) loadArsipDocs();
```

- [ ] **Step 6: Keluarkan fungsi baru & setel beranda saat masuk tab**

Ubah baris 455–457 jadi:

```js
  window.loadArsipDocs = loadArsipDocs;
  window.arsipBack = arsipBack;
  window.arsipReset = () => goArsip('home');
  window.ARSIP = { filterDocs, showFull, closeFull, openDetail, closeDetail, openUpload, closeUpload, goArsip, openPreview: openPreview, closePreview: closePreview };
```

Catatan: `openPreview`/`closePreview` baru ada di Task 7. Kalau Task 5 dikerjakan sebelum Task 7, tulis dulu export itu sebagai

```js
  window.ARSIP = { filterDocs, showFull, closeFull, openDetail, closeDetail, openUpload, closeUpload, goArsip };
```

dan tambahkan `openPreview`/`closePreview` di Task 7 Step 5.

- [ ] **Step 7: Lint**

Run: `npx eslint --no-ignore js/arsip.js`
Expected: 0 error.

- [ ] **Step 8: Verifikasi manual beranda**

Run (dua terminal): `node server/index.js` dan `npm run dev`
Buka `http://localhost:5173`, login, buka tab **Arsip**.
Expected: yang tampil **grid 4 tile** (Dokumen / Kertas Kerja / Bank Data / Aplikasi Lengkap), bukan langsung daftar folder. Klik tile **Dokumen** → muncul daftar folder bidang. Klik folder → isi folder. Tombol **Kembali** → naik satu tingkat (isi folder → daftar folder → beranda). Klik tile **Kertas Kerja** → pesan "Kertas Kerja menyusul (tahap 2)". Klik tile **Aplikasi Lengkap** → iframe arsipdigital memenuhi panel.

- [ ] **Step 9: Commit**

```bash
git add js/arsip.js
git commit -m "feat(arsip): state view + beranda grid tile, navigasi naik satu tingkat"
```

---

### Task 6: Daftar dokumen bergaya arsipdigital + skeleton/empty/retry

**Files:**
- Modify: `js/arsip.js` (`render` baris 233–235 error state, 256–271 `row`)

**Interfaces:**
- Consumes: `ArsipUI.warnaFile(d)`, `ArsipUI.ikonFile(d)`, `ArsipUI.empty(text)`, `ArsipUI.skeleton(mode, n)`.
- Produces: baris dokumen memakai `data-view="<id>"` (dipakai Task 7) dan `data-retry`.

- [ ] **Step 1: Ubah state gagal jadi ada tombol coba lagi**

Ubah baris 233–235:

```js
    if (failed) {
      box.innerHTML = '<div class="arsip-placeholder">Gagal memuat dokumen.'
        + ' <button class="arsip-act" data-retry>Coba lagi</button></div>';
      return;
    }
```

- [ ] **Step 2: Skeleton saat memuat**

Ubah baris 243–246:

```js
    if (!list.length) {
      box.innerHTML = loading && !loaded
        ? window.ArsipUI.skeleton('list', 5)
        : window.ArsipUI.empty('Tidak ada dokumen.');
      return;
    }
```

- [ ] **Step 3: Isi jumlah dokumen di tile beranda**

Tepat setelah baris 239 (`if (cnt) cnt.textContent = ...`), tambahkan:

```js
    const tileCnt = $('arsipTileCount');
    if (tileCnt) tileCnt.textContent = `${docs.length} dokumen`;
```

- [ ] **Step 4: Ganti `row` jadi baris gaya arsipdigital**

Ganti baris 256–271 dengan:

```js
    const row = (d) => {
      const meta = [d.type, d.sector, d.year, d.versi ? 'v' + d.versi : '']
        .filter(Boolean)
        .map((x) => escapeHtml(x))
        .join(' · ');
      const sub = [d.uploader, d.uploadDate].filter(Boolean).map((x) => escapeHtml(x)).join(' · ');
      const chk = IS_ADMIN() ? `<input type="checkbox" class="arsip-cb" data-id="${escapeHtml(d.id)}">` : '';
      const ico = `<span class="arsip-ico" style="--ic:${window.ArsipUI.warnaFile(d)}"><i class="fas ${window.ArsipUI.ikonFile(d)}" aria-hidden="true"></i></span>`;
      const item = `<button type="button" class="arsip-item" data-view="${escapeHtml(d.id)}">
          ${ico}
          <span class="arsip-item-body">
            <span class="arsip-item-top"><strong>${escapeHtml(d.title)}</strong>${badge(d.status)}</span>
            <span class="arsip-item-meta">${meta}</span>
            <span class="arsip-item-sub">${sub}</span>
          </span>
        </button>`;
      const acts = IS_ADMIN()
        ? actionsFor(d)
        : `<button class="arsip-act" data-detail="${escapeHtml(d.id)}">Detail</button>`;
      return `<div class="arsip-item-wrap"><div class="arsip-row">${chk}${item}</div>${acts}</div>`;
    };
```

Catatan: `tint()` (baris 32) tidak lagi dipakai setelah ini. Hapus fungsinya:

Run: `Select-String -Path js/arsip.js -Pattern "tint"`
Kalau hanya definisi `function tint(` yang tersisa, hapus fungsi itu (baris 32–37).

- [ ] **Step 5: Tangani klik baris & tombol coba lagi**

Di `onListClick`, tambahkan sebelum blok `[data-detail]`:

```js
    const rt = e.target.closest('[data-retry]');
    if (rt) {
      e.preventDefault();
      return loadArsipDocs(true);
    }
```

- [ ] **Step 6: Lint & tes**

Run: `npx eslint --no-ignore js/arsip.js`
Expected: 0 error.

Run: `node --test tests/arsip-markup.test.mjs tests/arsip-ui.test.js`
Expected: `arsip-ui` PASS semua; `arsip-markup` masih FAIL hanya pada tes tautan tab-baru (jatah Task 7).

- [ ] **Step 7: Verifikasi manual daftar**

Dengan dev server jalan, buka tab Arsip → tile Dokumen → klik satu folder.
Expected: tiap dokumen tampil sebagai **kartu sebaris** dengan ikon berwarna sesuai jenis berkas (pdf merah, xlsx hijau, jpg ungu), judul tebal, meta `tipe · tahun`, baris unggahan, dan badge status di kanan. Klik baris = belum terjadi apa-apa (handler `data-view` dipasang di Task 7).

- [ ] **Step 8: Commit**

```bash
git add js/arsip.js
git commit -m "feat(arsip): daftar dokumen gaya arsipdigital + skeleton, empty, coba lagi"
```

---

### Task 7: Preview di dalam panel (tanpa pindah tab)

**Files:**
- Modify: `js/arsip.js` (tambah `openPreview`/`closePreview`; ubah baris 125 `openDetail`; tambah handler `[data-view]` di `onListClick`; tambah Escape & tombol tutup di `DOMContentLoaded`; export di baris 455–457)

**Interfaces:**
- Consumes: `ArsipUI.jenisFile(d)`, `ArsipUI.driveEmbedUrl(url)`, `ArsipUI.driveThumbUrl(url, size)`, markup `#arsipPreview*` (Task 3).
- Produces: `window.ARSIP.openPreview`, `window.ARSIP.closePreview`.

- [ ] **Step 1: Tambah fungsi preview**

Sisipkan setelah fungsi `closeDetail` (setelah baris 90):

```js
  // Preview di dalam panel. Jenis berkas menentukan cara tampilnya; pemanggilan
  // tab baru hanya sebagai jalan terakhir (jenis yang memang tidak bisa di-embed).
  function pesanLuar(d) {
    return '<div class="arsip-placeholder">Berkas ini tidak bisa ditampilkan di sini.'
      + ` <a class="arsip-act" href="${escapeHtml(d.url || '#')}" target="_blank" rel="noopener">Buka di tab baru</a></div>`;
  }

  function openPreview(id) {
    const d = (docs || []).find((x) => String(x.id) === String(id));
    const box = $('arsipPreview');
    const body = $('arsipPreviewBody');
    if (!d || !box || !body) return;
    const t = $('arsipPreviewTitle');
    if (t) t.textContent = d.title || 'Dokumen';
    const url = d.url || '';
    const buka = $('arsipPreviewOpen');
    if (buka) buka.href = url || '#';
    const dl = $('arsipPreviewDl');
    if (dl) dl.href = url || '#';

    const jenis = window.ArsipUI.jenisFile(d);
    if (jenis === 'gambar' && url) {
      const thumb = window.ArsipUI.driveThumbUrl(url, 1000);
      body.innerHTML = `<img class="arsip-preview-img" alt="${escapeHtml(d.title || '')}">`;
      const img = body.firstElementChild;
      // Dua cadangan: proxy gambar, lalu pesan + tombol buka.
      img.onerror = () => {
        img.onerror = () => { body.innerHTML = pesanLuar(d); };
        img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(thumb.replace(/^https?:\/\//, ''));
      };
      img.src = thumb;
    } else if (jenis === 'pdf') {
      const emb = window.ArsipUI.driveEmbedUrl(url);
      body.innerHTML = emb
        ? `<iframe class="arsip-preview-frame" src="${escapeHtml(emb)}" title="${escapeHtml(d.title || '')}"></iframe>`
        : pesanLuar(d);
    } else {
      body.innerHTML = pesanLuar(d);
    }
    box.style.display = '';
    document.body.classList.add('arsip-preview-open');
  }

  function closePreview() {
    const box = $('arsipPreview');
    if (!box) return;
    box.style.display = 'none';
    const body = $('arsipPreviewBody');
    if (body) body.innerHTML = ''; // hentikan iframe/muat gambar
    document.body.classList.remove('arsip-preview-open');
  }
```

- [ ] **Step 2: Ganti tautan keluar tab di detail jadi tombol utama preview**

Ubah baris 125:

```js
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="arsip-act ok" data-view="${escapeHtml(d.id)}">Lihat dokumen</button>
        <a class="arsip-act" href="${escapeHtml(d.url || '#')}" target="_blank" rel="noopener">Buka di tab baru</a>
      </div>
```

- [ ] **Step 3: Tangani klik `[data-view]` (baris dokumen & tombol detail)**

Di `onListClick`, tambahkan tepat setelah blok `[data-retry]`:

```js
    const vw = e.target.closest('[data-view]');
    if (vw) {
      e.preventDefault();
      return openPreview(vw.dataset.view);
    }
```

- [ ] **Step 4: Pasang tombol tutup & tombol Escape**

Di `DOMContentLoaded`, tambahkan setelah listener `arsipHome`:

```js
    const pvClose = $('arsipPreviewClose');
    if (pvClose) pvClose.addEventListener('click', closePreview);
    const pv = $('arsipPreview');
    if (pv) pv.addEventListener('click', (e) => {
      if (e.target === pv) closePreview();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePreview();
    });
    const pvOpen = $('arsipPreviewOpen');
    if (pvOpen) pvOpen.addEventListener('click', closePreview);
    const pvDl = $('arsipPreviewDl');
    if (pvDl) pvDl.addEventListener('click', (e) => { e.stopPropagation(); });
```

- [ ] **Step 5: Ekspor fungsi preview**

Ubah `window.ARSIP` (baris ~455-457) jadi:

```js
  window.ARSIP = { filterDocs, showFull, closeFull, openDetail, closeDetail, openUpload, closeUpload, goArsip, openPreview, closePreview };
```

- [ ] **Step 6: Lint & seluruh tes**

Run: `npx eslint --no-ignore js/arsip.js js/arsip-ui.js`
Expected: 0 error.

Run: `node --test tests/arsip-markup.test.mjs tests/arsip-ui.test.js server/arsip.test.js`
Expected: **semua PASS**, termasuk tes "tidak ada tautan dokumen ... membuka tab baru".

- [ ] **Step 7: Verifikasi manual preview**

Dengan dev server jalan, buka tab Arsip → Dokumen → folder → klik satu dokumen ber-ekstensi `.pdf`.
Expected: overlay terbuka **di dalam panel** (bottom nav tetap terlihat, tidak ada tab baru), judul dokumen di bar atas, dokumen PDF tampil di iframe Drive. Klik **Tutup** atau tekan `Esc` → kembali ke daftar.
Ulangi untuk berkas `.jpg` → gambar tampil. Untuk berkas `.docx` → muncul pesan + tombol "Buka di tab baru".
Pastikan URL browser **tidak berubah** dan tidak ada tab baru yang terbuka.

- [ ] **Step 8: Commit**

```bash
git add js/arsip.js
git commit -m "feat(arsip): preview dokumen di dalam panel (drive preview/thumbnail, tanpa tab baru)"
```

---

### Task 8: Reset saat masuk tab, cache-bust final, verifikasi menyeluruh

**Files:**
- Modify: `js/ui.js` (baris 305–307), `index.html` (versi aset)

**Interfaces:**
- Consumes: `window.arsipReset()` (Task 5).
- Produces: —

- [ ] **Step 1: Reset ke beranda tiap kali tab arsip dibuka**

Ubah `js/ui.js` baris 305–307 jadi:

```js
        if (tab === 'arsip') {
          // Panel Dokumen native (Jalur A); iframe hanya dibuka via ARSIP.showFull().
          // Selalu mulai dari beranda tile, jadi tidak nyangkut di sub-menu terakhir.
          if (typeof window.arsipReset === 'function') window.arsipReset();
          if (typeof loadArsipDocs === 'function') loadArsipDocs();
```

- [ ] **Step 2: Lint**

Run: `npx eslint --no-ignore js/ui.js js/arsip.js js/arsip-ui.js`
Expected: 0 error.

- [ ] **Step 3: Verifikasi manual akhir**

Dengan `node server/index.js` + `npm run dev`, buka `http://localhost:5173`, login sebagai admin, lalu periksa berurutan:

1. Masuk tab Arsip → tampil grid 4 tile.
2. Tile Dokumen → daftar folder bidang.
3. Klik folder → daftar dokumen bergaya kartu, ikon berwarna.
4. Klik dokumen → detail muncul di panel (bukan pindah tab).
5. Klik "Lihat dokumen" → overlay preview di dalam panel; `Esc` menutup.
6. FAB `+` tampil kanan bawah (di atas bottom nav) dan membuka modal "Unggah Dokumen".
7. Pindah ke tab lain lalu balik ke Arsip → kembali ke beranda tile.
8. Tile Aplikasi Lengkap → iframe arsipdigital; tombol Kembali → beranda.
9. Ganti tema (terang/gelap) → tile, kartu, dan overlay tetap terbaca.
10. Sebagai user non-admin (`USER`) → FAB `+` tidak tampil.

- [ ] **Step 4: Cache-bust final**

Pastikan di `index.html`: `css/styles.css?v=35`, `js/arsip-ui.js?v=1`, `js/arsip.js?v=12`.
Run: `Select-String -Path index.html -Pattern "arsip-ui.js\?v=|arsip.js\?v=|styles.css\?v=" | ForEach-Object { $_.Line.Trim() }`
Expected: ketiga versi di atas muncul.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js index.html
git commit -m "feat(arsip): mulai dari beranda saat tab dibuka + cache-bust tahap 1"
```

---

## Yang sengaja DILEWATI di tahap ini

- **Toggle grid/list** seperti arsipdigital (beserta `localStorage` mode) — tambah kalau diminta; sekarang daftar kartu sebaris dianggap cukup.
- **Filter bidang sebagai dropdown** — folder bidang sudah jadi filter.
- **Pencarian server-side** — pencarian masih di klien lewat `#arsipQuery`.
- **Modul Kertas Kerja & Bank Data** — tahap 2 & 3; tahap ini hanya tile + placeholder.
- **Tombol unggah ganda** — tombol "Unggah" di toolbar dihapus, diganti FAB `+` dengan ID yang sama (tidak ada duplikasi listener).

## Verifikasi yang harus LULUS sebelum tahap 1 dianggap selesai

```powershell
node --test server/arsip.test.js tests/arsip-ui.test.js tests/arsip-markup.test.mjs
npx eslint --no-ignore js/arsip.js js/arsip-ui.js js/ui.js server/arsip.js
```

Ditambah 10 poin verifikasi manual Task 8 Step 3.
