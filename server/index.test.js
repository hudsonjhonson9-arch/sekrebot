// Smoke test createApp(). Yang dijaga hanya SATU hal: router ter-mount. Router-nya
// sendiri sudah diuji mendetail di media.test.js dan absen.test.js — test ini
// ada karena mount di index.js tidak terlihat dari test manapun, dan lupa mount
// hanya tampak sebagai 404 yang lolos review karena /api/health tetap hijau.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from './index.js';

const app = createApp();

// req/res minimal, tapi cukup untuk routing Express: app() butuh req.url,
// req.method, dan next. requireRole() menolak di token check sebelum menyentuh
// query/gasUpsert, jadi tidak ada DB atau jaringan yang tersentuh di test ini.
function call(method, url, headers = {}) {
  return new Promise((resolve) => {
    let err;
    const done = () => resolve({ err, res, answered: res.statusCode > 0 || res.body !== null });
    const req = { method, url, headers };
    const res = {
      statusCode: 0,
      body: null,
      status(code) { this.statusCode = code; return this; },
      // Express default status 200 kalau res.status() tidak dipanggil; stub harus
      // meniru itu, kalau tidak route yang sehat pun terlihat seperti tidak hidup.
      json(payload) { this.body = payload; this.statusCode ||= 200; done(); return this; },
      end() { this.statusCode ||= 200; done(); return this; },
      setHeader() {},
    };
    app(req, res, (e) => { err = e; done(); });
  });
}

test('GET /api/health tetap hidup tanpa token', async () => {
  const { err, res } = await call('GET', '/api/health');
  assert.equal(err, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test('/api/media ter-mount: 401 tanpa token, bukan 404', async () => {
  for (const [method, url] of [
    ['POST', '/api/media/face'],
    ['POST', '/api/media/signature'],
    ['GET', '/api/media/face/1'],
    ['GET', '/api/media/signature/123'],
    ['GET', '/api/media/signatures'],
    ['GET', '/api/media/raw/abc123'],
  ]) {
    const { err, res } = await call(method, url);
    assert.equal(err, undefined, `${method} ${url} -> next(${err})`);
    // 401 = middleware auth jalan = route ADA. 404 = mount hilang.
    assert.equal(res.statusCode, 401, `${method} ${url} -> ${res.statusCode} (404 = router belum di-mount)`);
  }
});

test('/api/simapo ter-mount: 401 tanpa token, bukan 404', async () => {
  for (const [method, url] of [
    ['GET', '/api/simapo/penerimaan'],
    ['POST', '/api/simapo/penerimaan'],
    ['GET', '/api/simapo/pemeliharaan'],
    ['POST', '/api/simapo/pemeliharaan'],
    ['GET', '/api/simapo/bku'],
    ['POST', '/api/simapo/bku'],
    // Kategori & master barang. Nama path sengaja meniru n8n supaya peta
    // NATIVE_TO_LEGACY di config.js bisa dibaca tanpa perlu menebak.
    ['GET', '/api/simapo/kategori-list'],
    ['POST', '/api/simapo/kategori-save'],
    ['POST', '/api/simapo/kategori-delete'],
    ['GET', '/api/simapo/katalog'],
    ['GET', '/api/simapo/admin-master-list'],
    ['POST', '/api/simapo/admin-master-save'],
    ['POST', '/api/simapo/admin-master-delete'],
    // Mutasi stok.
    ['GET', '/api/simapo/mutasi-list'],
    ['POST', '/api/simapo/mutasi-save'],
  ]) {
    const { err, res } = await call(method, url);
    assert.equal(err, undefined, `${method} ${url} -> next(${err})`);
    assert.equal(res.statusCode, 401, `${method} ${url} -> ${res.statusCode} (404 = router belum di-mount)`);
  }
});

test('/api/absen ter-mount: 401 tanpa token, bukan 404', async () => {
  const { err, res } = await call('POST', '/api/absen');
  assert.equal(err, undefined);
  // 401 = requireRole(ABSEN_ROLES) jalan = route ADA. 404 = mount hilang.
  assert.equal(res.statusCode, 401, `status ${res.statusCode} (404 = router belum di-mount)`);
});

// Sesi terbit tanpa requireRole, jadi yang diawali adalah verifikasi init_data
// (401), bukan penolakan token. Status 401/400 di sini sama artinya "route ADA";
// 404 berarti router auth tidak ter-mount dan tidak ada yang bisa masuk.
test('/api/auth ter-mount: menolak di handler, bukan 404', async () => {
  const session = await call('POST', '/api/auth/session');
  assert.equal(session.err, undefined);
  assert.equal(session.res.statusCode, 401, `status ${session.res.statusCode} (404 = router belum di-mount)`);

  const logout = await call('POST', '/api/auth/logout');
  assert.equal(logout.err, undefined);
  assert.equal(logout.res.statusCode, 400, `status ${logout.res.statusCode} (404 = router belum di-mount)`);
});

test('token berformat salah (tg_ legacy) ditolak 401, tidak pernah jatuh ke handler', async () => {
  const { err, res } = await call('GET', '/api/media/signatures', {
    authorization: 'Bearer tg_1_1700000000',
  });
  assert.equal(err, undefined);
  assert.equal(res.statusCode, 401);
});

// Gate SUPERADMIN hanya boleh menutup /api/auth/devices. Dulu
// createAuthDeviceRouter di-mount di root (path di dalamnya absolut), jadi
// requireRole-nya jadi catch-all: /, /login, /favicon.ico, dan semua typo URL
// dapat 401 "sesi berakhir" alih-alih 404. Akibatnya frontend menampilkan
// pesan auth yang salah untuk file hilang atau endpoint yang tidak pernah ada,
// dan browser tidak bisa membedakan "belum login" dari "salah alamat".
//
// `answered: false` = tidak ada yang menjawab, jadi request jatuh ke 404 bawaan
// Express (dan, di produksi, ke nginx yang menyajikan www/). Itu bentuk yang benar.
//
// Hanya path non-API yang diuji. `/api/*` sengaja di-gate penuh oleh router
// di index.js dan menjawab 401 tanpa token — fail-closed itu benar untuk API,
// jadi tidak ikut diubah.
test('path tak dikenal tidak dijawab gate, jadi jatuh ke 404', async () => {
  for (const url of ['/', '/index.html', '/login', '/absen.html', '/favicon.ico', '/js/app.js']) {
    const { err, res, answered } = await call('GET', url);
    assert.equal(err, undefined, `${url} -> next(${err})`);
    assert.equal(answered, false, `${url} -> ${res.statusCode} (401 = gate masih catch-all di root)`);
  }
});

// Memindahkan mount ke /api/auth tidak boleh membuka lubang: device tetap 401
// tanpa sesi. 404 di sini berarti router hilang, bukan "aman".
test('device tetap 401 tanpa sesi setelah mount dipindah ke /api/auth', async () => {
  for (const [method, url] of [
    ['POST', '/api/auth/devices'],
    ['GET', '/api/auth/devices'],
    ['DELETE', '/api/auth/devices/abc'],
  ]) {
    const { err, res } = await call(method, url);
    assert.equal(err, undefined, `${method} ${url} -> next(${err})`);
    assert.equal(res.statusCode, 401, `${method} ${url} -> ${res.statusCode} (404 = router belum di-mount)`);
  }
});

// Tes 401 di atas tidak cukup: requireRole menjawab 401 SEBELUM routing selesai,
// jadi ia hijau walaupun route-nya tidak pernah cocok. v6 pernah mendaftarkan
// /api/auth/devices/api/auth/devices dan tesnya tetap green.
//
// Yang diuji di sini adalah path hasil komposisi mount + router. Membaca
// _router.stack adalah white-box, tapi tidak ada cara lain memeriksa komposisi
// ini tanpa DB, dan white-box di satu tempat lebih murah daripada endpoint mati
// yang lolos review.
function mountedPaths(stack, prefix = '') {
  return stack
    .flatMap((l) => {
      if (l.route) return [`${prefix}${l.route.path} [${Object.keys(l.route.methods)}]`];
      if (l.name === 'router' && l.handle?.stack) {
        const p = l.regexp?.source?.replace('^\\/', '').replace('\\/?(?=\\/|$)', '') || '';
        return mountedPaths(l.handle.stack, `${prefix}/${p}`.replace(/\/+/g, '/'));
      }
      return [];
    })
    // regexp.source masih berisi escape\/ ; rapikan supaya bisa dibandingkan
    // dengan path yang ditulis orang.
    .map((s) => s.replace(/\\\//g, '/'));
}

test('path device persis /api/auth/devices, tanpa prefiks dobel', () => {
  const paths = mountedPaths(createApp()._router.stack);
  for (const want of [
    '/api/auth/devices [post]',
    '/api/auth/devices [get]',
    '/api/auth/devices/:id [delete]',
  ]) {
    assert.ok(paths.includes(want), `route hilang: ${want}\nada: ${paths.join(', ')}`);
  }
  const dobel = paths.filter((p) => p.includes('/api/auth/devices/api'));
  assert.deepEqual(dobel, [], `prefiks dobel: ${dobel.join(', ')}`);
});