// Tipis demi murah: test arsip hanya memeriksa TIGA hal — (1) router ter-mount di
// createApp (401 tanpa token, bukan 404), (2) proxy meneruskan respons dan
// cookie arsip_session-nya memuat nip, (3) tega 503 kalau env konfigurasi belum
// diatur. Logika pemanggil lain (peta-ekonomi) sudah diuji di repo sana.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { createArsipRouter } from './arsip.js';
import { createApp } from './index.js';
import { ABSEN_ROLES, requireRole } from './auth.js';

const SECRET = 'secret-16-chars-ok';
const UPSTREAM = 'https://arsipdigital.mindcloud.my.id';
const ME = { id: '42', nip: '199001012010011001', role: 'ADMIN', instansi_id: 'bapperida' };
// Bentuk token sesi absensi (192 hex) — lookup di-stub, jadi isi diabaikan.
const TOKEN = 'a'.repeat(192);

// Replika verifikasi peta session.js (sama seperti arsip-sso.test.js).
function verifikasi(token, secret) {
  const i = token.indexOf('.');
  if (i < 1) return null;
  const isi = token.slice(0, i);
  const expect = crypto.createHmac('sha256', secret).update(isi).digest('base64url');
  const a = Buffer.from(expect);
  const b = Buffer.from(token.slice(i + 1));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const m = JSON.parse(Buffer.from(isi, 'base64url').toString('utf8'));
  if (!m.sub || typeof m.exp !== 'number' || m.exp <= Math.floor(Date.now() / 1000)) return null;
  return m;
}

async function via(app, path, headers = {}, init = {}) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: init.method || 'GET',
      body: init.body,
      headers: { Authorization: `Bearer ${TOKEN}`, ...headers },
    });
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
}

function harness({ fetchImpl, baseUrl = UPSTREAM, secret = SECRET, user = ME } = {}) {
  const captured = [];
  const app = express();
  app.use(express.json());
  app.use(requireRole(ABSEN_ROLES, { lookup: async () => user }));
  app.use(
    '/api/arsip',
    createArsipRouter({
      baseUrl,
      secret,
      fetchImpl: async (url, opts) => {
        captured.push({ url, opts });
        if (fetchImpl) return fetchImpl(url, opts);
        return { status: 200, text: async () => '[{"title":"contoh"}]' };
      },
    })
  );
  return { app, captured };
}

test('/api/arsip ter-mount di createApp: 401 tanpa token, bukan 404', async () => {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/arsip/docs`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
});

test('proxy meneruskan respons upstream dan cookie berisi nip', async () => {
  const { app, captured } = harness();
  const r = await via(app, '/api/arsip/docs');
  assert.equal(r.status, 200);
  assert.equal(r.body, '[{"title":"contoh"}]');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, UPSTREAM + '/api/docs');
  const cookie = captured[0].opts.headers.cookie;
  assert.match(cookie, /^arsip_session=/);
  const token = cookie.slice('arsip_session='.length);
  assert.equal(verifikasi(token, SECRET)?.sub, ME.nip);
});

test('status upstream diteruskan apa adanya', async () => {
  const { app } = harness({
    fetchImpl: async () => ({ status: 500, text: async () => '{"ok":false,"message":"err"}' }),
  });
  const r = await via(app, '/api/arsip/docs');
  assert.equal(r.status, 500);
  assert.equal(r.body, '{"ok":false,"message":"err"}');
});

test('tanpa konfigurasi -> 503, fetch tidak dipanggil', async () => {
  const { app, captured } = harness({ baseUrl: '', secret: '' });
  const r = await via(app, '/api/arsip/docs');
  assert.equal(r.status, 503);
  assert.equal(captured.length, 0);
});

test('tulis diteruskan dengan method+body dan cookie; 403 untuk role USER', async () => {
  const { app, captured } = harness({
    fetchImpl: async () => ({ status: 200, text: async () => '{"message":"ok"}' }),
  });
  const r = await via(
    app,
    '/api/arsip/docs/7/status',
    { 'Content-Type': 'application/json' },
    { method: 'PATCH', body: JSON.stringify({ status: 'Diarsipkan' }) }
  );
  assert.equal(r.status, 200);
  assert.equal(r.body, '{"message":"ok"}');
  assert.equal(captured[0].url, UPSTREAM + '/api/docs/7/status');
  assert.equal(captured[0].opts.method, 'PATCH');
  assert.equal(JSON.parse(captured[0].opts.body).status, 'Diarsipkan');

  const { app: appUser } = harness({ user: { ...ME, role: 'USER' } });
  const r2 = await via(
    appUser,
    '/api/arsip/docs/7/status',
    { 'Content-Type': 'application/json' },
    { method: 'PATCH', body: '{}' }
  );
  assert.equal(r2.status, 403);
});

test('DELETE diteruskan ke peta', async () => {
  const { app, captured } = harness({
    fetchImpl: async () => ({ status: 200, text: async () => '{"message":"hapus"}' }),
  });
  const r = await via(app, '/api/arsip/docs/7', {}, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal(captured[0].opts.method, 'DELETE');
  assert.equal(captured[0].url, UPSTREAM + '/api/docs/7');
});

test('upload-file: 403 untuk role USER, GAS tidak dipanggil', async () => {
  const { app, captured } = harness({ user: { ...ME, role: 'USER' } });
  const r = await via(
    app,
    '/api/arsip/docs/upload-file',
    { 'Content-Type': 'application/json' },
    { method: 'POST', body: JSON.stringify({ filename: 'a.pdf', dataBase64: 'AAAA' }) }
  );
  assert.equal(r.status, 403);
  assert.equal(captured.length, 0);
});

test('upload-file: 400 tanpa filename/dataBase64 (admin)', async () => {
  const { app } = harness();
  const r = await via(
    app,
    '/api/arsip/docs/upload-file',
    { 'Content-Type': 'application/json' },
    { method: 'POST', body: '{}' }
  );
  assert.equal(r.status, 400);
});