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
// express.static (mount terakhir) memanggil setHeader/getHeader/write saat
// menyajikan berkas; tanpa method itu send() melempar dan test jatuh ke 500 palsu.
function call(method, url, headers = {}) {
  return new Promise((resolve) => {
    let err;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve({ err, res, answered: res.statusCode > 0 || res.body !== null || res.ended === true });
    };
    const req = { method, url, headers };
    const headerStore = Object.create(null);
    const chunks = [];
    const res = {
      statusCode: 0,
      body: null,
      ended: false,
      headersSent: false,
      status(code) { this.statusCode = code; return this; },
      // Express default status 200 kalau res.status() tidak dipanggil; stub harus
      // meniru itu, kalau tidak route yang sehat pun terlihat seperti tidak hidup.
      json(payload) { this.body = payload; this.statusCode ||= 200; this.ended = true; done(); return this; },
      end(chunk) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        if (this.body == null && chunks.length) this.body = Buffer.concat(chunks);
        this.statusCode ||= 200;
        this.ended = true;
        this.headersSent = true;
        done();
        return this;
      },
      write(chunk) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      writeHead(code) { this.statusCode = code; this.headersSent = true; return this; },
      setHeader(k, v) { headerStore[String(k).toLowerCase()] = v; },
      getHeader(k) { return headerStore[String(k).toLowerCase()]; },
      removeHeader(k) { delete headerStore[String(k).toLowerCase()]; },
      flushHeaders() { this.headersSent = true; },
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
// Sejak express.static dipasang di index.js, berkas yang ada (/, /index.html,
// /js/app.js) memang dijawab 200 oleh static — itu benar dan bukan gate.
// Yang dijaga di sini: path yang TIDAK ada sebagai berkas tidak boleh kena 401
// dari gate; ia jatuh ke next() lalu 404 bawaan Express (di produksi: nginx).
//
// Hanya path non-API yang diuji. `/api/*` sengaja di-gate penuh oleh router
// di index.js dan menjawab 401 tanpa token — fail-closed itu benar untuk API,
// jadi tidak ikut diubah.
test('path tak dikenal tidak dijawab gate, jadi jatuh ke 404', async () => {
  for (const url of ['/login', '/absen.html', '/favicon.ico', '/halaman-tidak-ada', '/js/tidak-ada.js']) {
    const { err, res, answered } = await call('GET', url);
    assert.equal(err, undefined, `${url} -> next(${err})`);
    assert.notEqual(res.statusCode, 401, `${url} -> 401 = gate masih catch-all di root`);
    assert.equal(answered, false, `${url} -> ${res.statusCode} (seharusnya tidak dijawab, jatuh 404)`);
  }
});

// express.static harus melayani berkas yang ada — bukan 401 gate, bukan 404.
// Pakai HTTP server nyata: stream.pipe(res) butuh interface Writable/EventEmitter
// yang tidak bisa di-stub dengan object literal.
test('berkas statis yang ada dilayani express.static', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    for (const url of ['/', '/index.html', '/js/app.js']) {
      const res = await fetch(`http://127.0.0.1:${port}${url}`);
      assert.notEqual(res.status, 401, `${url} -> 401 = gate masih catch-all di root`);
      assert.ok(res.status >= 200 && res.status < 400, `${url} -> ${res.status} (seharusnya terlayani)`);
      await res.arrayBuffer();
    }
  } finally {
    server.close();
    server.closeAllConnections?.();
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

test('/api/admin/roles dan /api/absen-roles ter-mount dengan benar', () => {
  const paths = mountedPaths(createApp()._router.stack);
  for (const prefix of ['/api/admin/roles', '/api/absen-roles']) {
    for (const want of [
      `${prefix}/ [get]`,
      `${prefix}/ [post]`,
      `${prefix}/permissions-list [get]`,
      `${prefix}/:id [get]`,
      `${prefix}/:id [put]`,
      `${prefix}/:id [delete]`,
      `${prefix}/assign [post]`,
    ]) {
      assert.ok(paths.includes(want), `route hilang: ${want}\nada: ${paths.join(', ')}`);
    }
  }
  // Kritis: /api/roles root TIDAK boleh ter-mount (milik peta-ekonomi)
  const petaRoles = paths.filter((p) => p.startsWith('/api/roles'));
  assert.deepEqual(petaRoles, [], `KOLISI TERDETEKSI: /api/roles ter-mount: ${petaRoles.join(', ')}`);
});

test('gzip compression dan static Cache-Control headers bekerja benar', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    // 1. HTML -> no-cache dan terkompresi gzip saat > 1024 bytes
    const htmlRes = await fetch(`http://127.0.0.1:${port}/index.html`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(htmlRes.status, 200);
    assert.equal(htmlRes.headers.get('cache-control'), 'no-cache');
    assert.equal(htmlRes.headers.get('content-encoding'), 'gzip');
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('<!DOCTYPE html>') || htmlText.includes('<html'));

    // 2. Vendor library di js/lib/* & css/lib/* -> max-age=86400 (1d)
    const libJsRes = await fetch(`http://127.0.0.1:${port}/js/lib/qrcode.min.js`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(libJsRes.status, 200);
    assert.match(libJsRes.headers.get('cache-control') || '', /max-age=86400/);
    assert.equal(libJsRes.headers.get('content-encoding'), 'gzip');
    await libJsRes.arrayBuffer();

    const libCssRes = await fetch(`http://127.0.0.1:${port}/css/lib/leaflet.min.css`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(libCssRes.status, 200);
    assert.match(libCssRes.headers.get('cache-control') || '', /max-age=86400/);
    await libCssRes.arrayBuffer();

    // 3. App JS non-lib -> max-age=3600 (1h)
    const appJsRes = await fetch(`http://127.0.0.1:${port}/js/app.js`);
    assert.equal(appJsRes.status, 200);
    assert.match(appJsRes.headers.get('cache-control') || '', /max-age=3600/);
    await appJsRes.arrayBuffer();

    // 4. Small JSON (/api/health < 1024 bytes) tidak di-gzip
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('content-encoding'), null);
    assert.equal((await healthRes.json()).ok, true);
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
});