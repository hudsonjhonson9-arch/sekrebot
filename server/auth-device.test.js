import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuthDeviceRouter } from './auth-device.js';
import {
  DEVICE_LOOKUP_SQL, isDeviceToken, isSessionToken, hashDeviceToken, requireRole,
} from './auth.js';

// Token perangkat tidak boleh bisa disamar sebagai token sesi, atau tabel yang salah
// akan terpilih danrolenya tidak sengaja ikut terbaca.
const DV = 'dv_' + 'a'.repeat(64);
const SESS = 'a'.repeat(192);

function stubApp(query) {
  const app = express();
  app.use(express.json());
  // Prefiks harus sama dengan index.js. Kalau test mount di root sementara
  // index.js mount di /api/auth, test hijau untuk konfigurasi yang tidak pernah
  // dipakai produksi.
  app.use('/api/auth', createAuthDeviceRouter({ query }));
  return app;
}

// close() harus di-await: server.close() asinkron, dan kalau tidak ditutup proses
// test menggantung meskipun semua assertion sudah lewat.
async function listen(app) {
  const s = await new Promise((resolve) => {
    const x = app.listen(0, () => resolve(x));
  });
  return {
    port: s.address().port,
    close: () => new Promise((resolve) => { s.closeAllConnections?.(); s.close(() => resolve()); }),
  };
}

async function post(port, path, body, token = null) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

test('Dv_* tidak lolos sebagai token sesi dan sebaliknya', () => {
  assert.equal(isDeviceToken(DV), true);
  assert.equal(isSessionToken(DV), false);
  assert.equal(isSessionToken(SESS), true);
  assert.equal(isDeviceToken(SESS), false);
});

test('hashDeviceToken stabil dan tidak menyimpan token mentah', () => {
  const h = hashDeviceToken(DV);
  assert.equal(h, hashDeviceToken(DV));
  assert.equal(h.length, 64);
  assert.ok(!h.includes('dv_'), 'hash tidak boleh memuat bentuk token');
});

test('requireRole mencari token perangkat lewat DEVICE_LOOKUP_SQL dengan hash', async () => {
  let seen;
  const mw = requireRole(new Set(['ADMIN']), {
    lookup: async (token, kind) => {
      seen = { token, kind };
      return { id: '7', nip: '123', role: 'ADMIN', instansi_id: 'bapperida' };
    },
  });
  const app = express();
  app.get('/x', mw, (_req, res) => res.json({ ok: true }));
  const { port, close } = await listen(app);
  const r = await fetch(`http://127.0.0.1:${port}/x`, { headers: { authorization: 'Bearer ' + DV } });
  await r.json();
  await close();

  assert.equal(r.status, 200);
  assert.equal(seen.kind, 'device');
  assert.equal(seen.token, DV);
  assert.ok(DEVICE_LOOKUP_SQL.includes('device_sessions'));
});

test('requireRole menolak bentuk token lain dengan 401', async () => {
  // Inilah yang menahan token client-side 'usr_<id>_<ts>' dan 'tg_<id>_<ts>'.
  let called = false;
  const mw = requireRole(new Set(['USER']), { lookup: async () => { called = true; return null; } });
  const app = express();
  app.get('/x', mw, (_req, res) => res.json({ ok: true }));
  const { port, close } = await listen(app);
  for (const bad of ['usr_1_2', 'tg_5_3', 'abc', 'dv_short', 'dv_' + 'Z'.repeat(64)]) {
    const r = await fetch(`http://127.0.0.1:${port}/x`, { headers: { authorization: 'Bearer ' + bad } });
    assert.equal(r.status, 401, `harus 401 untuk ${bad}`);
  }
  await close();
  assert.equal(called, false, 'lookup tidak boleh dipanggil untuk token tak valid');
});

test('pairing menerbitkan token dv_ dan hanya menyimpan hash-nya', async () => {
  let inserted;
  const { port, close } = await listen(stubApp(async (sql, params) => {
    if (sql.includes('user_list')) return { rows: [{ id: '9', nip: '321', role: 'ADMIN', instansi_id: 'bapperida' }] };
    inserted = params;
    return { rows: [{ id: 5, expires_at: 'later' }] };
  }));

  const r = await post(port, '/api/auth/devices', { nip: '321', device_label: 'Meja 1' });
  await close();

  assert.equal(r.status, 201);
  assert.match(r.body.device_token, /^dv_[0-9a-f]{64}$/);
  assert.equal(inserted[0], hashDeviceToken(r.body.device_token));
  assert.ok(!inserted.includes(r.body.device_token), 'token mentah tidak boleh masuk DB');
  assert.equal(inserted[2], '321');
});

test('NIP ambigu ditolak 409, bukan memilih baris pertama', async () => {
  const { port, close } = await listen(stubApp(async (sql) => {
    if (sql.includes('user_list')) {
      return { rows: [{ id: '1', nip: '77' }, { id: '2', nip: '77' }] };
    }
    throw new Error('tidak boleh insert');
  }));
  const r = await post(port, '/api/auth/devices', { nip: '77' });
  await close();
  assert.equal(r.status, 409);
});

test('NIP tidak terdaftar 400/404 tanpa membocorkan lain', async () => {
  const { port, close } = await listen(stubApp(async () => ({ rows: [] })));
  const kosong = await post(port, '/api/auth/devices', { nip: '' });
  const tidakDikenal = await post(port, '/api/auth/devices', { nip: '999' });
  await close();
  assert.equal(kosong.status, 400);
  assert.equal(tidakDikenal.status, 404);
});

test('daftar device tidak pernah memuat token', async () => {
  const { port, close } = await listen(stubApp(async (sql) => {
    if (sql.includes('device_sessions')) {
      return { rows: [{ id: 1, device_label: 'Meja 1', nip: '321', is_active: true }] };
    }
    return { rows: [] };
  }));
  const r = await fetch(`http://127.0.0.1:${port}/api/auth/devices`);
  const body = await r.json();
  await close();

  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  const json = JSON.stringify(body);
  assert.ok(!/dv_[0-9a-f]{64}/.test(json), 'token device tidak boleh bocor di daftar');
  assert.ok(!json.includes('token_hash'), 'hash pun tidak perlu dikembalikan');
});