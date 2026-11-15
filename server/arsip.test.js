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

// roleDb = isi kolom user_credentials.role (tabel arsipdigital), karena gate tulis
// dan /me tidak lagi membaca role absensi dari user_list.
function harness({ fetchImpl, baseUrl = UPSTREAM, secret = SECRET, user = ME, roleDb = 'Admin', queryImpl } = {}) {
  const captured = [];
  const app = express();
  app.use(express.json());
  app.use(requireRole(ABSEN_ROLES, { lookup: async () => user }));
  app.use(
    '/api/arsip',
    createArsipRouter({
      baseUrl,
      secret,
      query: async (sql, params) => {
        if (queryImpl) return queryImpl(sql, params);
        if (typeof sql === 'string' && sql.includes('user_credentials')) {
          return { rows: roleDb ? [{ role: roleDb }] : [] };
        }
        return { rows: [] };
      },
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

test('tulis diteruskan dengan method+body dan cookie; gate dari user_credentials, bukan role absensi', async () => {
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

  // Absensi bilang ADMIN, tapi di user_credentials orang ini Staf -> tetap ditolak.
  const { app: appStaf } = harness({ roleDb: 'Staf' });
  const r2 = await via(
    appStaf,
    '/api/arsip/docs/7/status',
    { 'Content-Type': 'application/json' },
    { method: 'PATCH', body: '{}' }
  );
  assert.equal(r2.status, 403);

  // Kebalikannya juga: absensi bilang USER, tapi di user_credentials Admin -> boleh.
  const { app: appAdmin, captured: cap3 } = harness({
    user: { ...ME, role: 'USER' },
    roleDb: 'Admin',
    fetchImpl: async () => ({ status: 200, text: async () => '{"message":"ok"}' }),
  });
  const r3 = await via(
    appAdmin,
    '/api/arsip/docs/7/status',
    { 'Content-Type': 'application/json' },
    { method: 'PATCH', body: '{}' }
  );
  assert.equal(r3.status, 200);
  assert.equal(cap3.length, 1);
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

test('upload-file: 403 untuk role Staf, GAS tidak dipanggil', async () => {
  const { app, captured } = harness({ roleDb: 'Staf' });
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

test('whitelist /p/*: tulis oleh role Staf ditolak 403 (gate user_credentials)', async () => {
  const { app, captured } = harness({ roleDb: 'Staf' });
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

test('whitelist /p/*: master kategori/sektor/bidang diteruskan untuk dropdown unggah', async () => {
  for (const p of ['/api/kategori-dokumen', '/api/sektor', '/api/bidang']) {
    const { app, captured } = harness();
    const r = await via(app, '/api/arsip/p' + p);
    assert.equal(r.status, 200, p);
    assert.equal(captured[0].url, UPSTREAM + p, p);
  }
});

test('GET /api/arsip/me: role ternormalisasi dari user_credentials', async () => {
  const { app } = harness({ roleDb: 'ADMIN' });
  const b = JSON.parse((await via(app, '/api/arsip/me')).body);
  assert.equal(b.role, 'Admin');
  assert.equal(b.isAdmin, true);

  // Kapitalisasi/alias berbeda, hasilnya tetap sama.
  assert.equal(JSON.parse((await via(harness({ roleDb: 'kabid' }).app, '/api/arsip/me')).body).role, 'Reviewer');
  assert.equal(JSON.parse((await via(harness({ roleDb: 'KABID' }).app, '/api/arsip/me')).body).role, 'Reviewer');

  // Bukan admin.
  const r = JSON.parse((await via(harness({ roleDb: 'Staf' }).app, '/api/arsip/me')).body);
  assert.equal(r.role, 'Staf');
  assert.equal(r.isAdmin, false);

  // NIP tidak ada di user_credentials -> Staf, bukan admin (fail-closed).
  const kosong = JSON.parse((await via(harness({ roleDb: '' }).app, '/api/arsip/me')).body);
  assert.equal(kosong.role, 'Staf');
  assert.equal(kosong.isAdmin, false);
});

test('upstream 401: GET /api/arsip/docs jatuh ke database lokal dan mengembalikan 200', async () => {
  const { app } = harness({
    fetchImpl: async () => ({ status: 401, text: async () => '{"error":"Sesi berakhir"}' }),
    queryImpl: async (sql) => {
      if (typeof sql === 'string' && sql.includes('bapperida_dokumen')) {
        return {
          rows: [
            {
              id: 99,
              title: 'Dokumen Fallback',
              type: 'Perencanaan',
              files: '["file1.pdf"]',
              tagsRaw: 'tag1, tag2',
            },
          ],
        };
      }
      return { rows: [] };
    },
  });
  const r = await via(app, '/api/arsip/docs');
  assert.equal(r.status, 200);
  const data = JSON.parse(r.body);
  assert.equal(data.length, 1);
  assert.equal(data[0].title, 'Dokumen Fallback');
  assert.deepEqual(data[0].files, ['file1.pdf']);
  assert.deepEqual(data[0].tags, ['tag1', 'tag2']);
});

test('upstream 401: GET /api/arsip/p/api/pks/tahun jatuh ke database lokal dan mengembalikan 200', async () => {
  const { app } = harness({
    fetchImpl: async () => ({ status: 401, text: async () => '{"error":"Sesi berakhir"}' }),
    queryImpl: async (sql) => {
      if (typeof sql === 'string' && sql.includes('pks_tahun')) {
        return { rows: [{ tahun: 2026 }] };
      }
      return { rows: [] };
    },
  });
  const r = await via(app, '/api/arsip/p/api/pks/tahun');
  assert.equal(r.status, 200);
  const data = JSON.parse(r.body);
  assert.ok(Array.isArray(data));
  assert.ok(data.includes(2026));
});

test('upstream 401: GET /api/arsip/p/api/bankdata/tahun jatuh ke database lokal dan mengembalikan 200', async () => {
  const { app } = harness({
    fetchImpl: async () => ({ status: 401, text: async () => '{"error":"Sesi berakhir"}' }),
    queryImpl: async (sql) => {
      if (typeof sql === 'string' && sql.includes('bank_data_tahun')) {
        return { rows: [{ id: 1, tahun: 2026 }] };
      }
      return { rows: [] };
    },
  });
  const r = await via(app, '/api/arsip/p/api/bankdata/tahun');
  assert.equal(r.status, 200);
  const data = JSON.parse(r.body);
  assert.equal(data.length, 1);
  assert.equal(data[0].tahun, 2026);
});

test('upstream 401: GET /api/arsip/p/api/agenda/* jatuh ke database lokal dan mengembalikan 200', async () => {
  const { app } = harness({
    fetchImpl: async () => ({ status: 401, text: async () => '{"error":"Sesi berakhir"}' }),
    queryImpl: async (sql) => {
      if (typeof sql === 'string' && sql.includes('agenda_surat_masuk')) {
        if (sql.includes('COUNT(')) return { rows: [{ total: 1 }] };
        return { rows: [{ id: 1, nomor_agenda: '001/SM/2026' }] };
      }
      if (typeof sql === 'string' && sql.includes('agenda_surat_keluar')) {
        if (sql.includes('COUNT(')) return { rows: [{ total: 1 }] };
        return { rows: [{ id: 2, nomor_surat: '002/SK/2026' }] };
      }
      if (typeof sql === 'string' && sql.includes('agenda_sppd')) {
        if (sql.includes('COUNT(')) return { rows: [{ total: 1 }] };
        return { rows: [{ id: 3, nomor_sppd: '003/SPPD/2026' }] };
      }
      return { rows: [] };
    },
  });

  const r1 = await via(app, '/api/arsip/p/api/agenda/surat-masuk?tahun=2026');
  assert.equal(r1.status, 200);
  const d1 = JSON.parse(r1.body);
  assert.equal(d1.ok, true);
  assert.equal(d1.total, 1);
  assert.equal(d1.items[0].nomor_agenda, '001/SM/2026');

  const r2 = await via(app, '/api/arsip/p/api/agenda/surat-keluar?tahun=2026');
  assert.equal(r2.status, 200);
  const d2 = JSON.parse(r2.body);
  assert.equal(d2.ok, true);
  assert.equal(d2.total, 1);

  const r3 = await via(app, '/api/arsip/p/api/agenda/sppd?jenis=DALAM_DAERAH&tahun=2026');
  assert.equal(r3.status, 200);
  const d3 = JSON.parse(r3.body);
  assert.equal(d3.ok, true);
  assert.equal(d3.total, 1);
});

test('upstream 401: GET /api/arsip/p/api/kategori-dokumen, sektor, bidang jatuh ke DB lokal', async () => {
  const { app } = harness({
    fetchImpl: async () => ({ status: 401, text: async () => '{"error":"Sesi berakhir"}' }),
    queryImpl: async (sql) => {
      if (typeof sql === 'string' && sql.includes('bapperida_kategori_dokumen')) {
        return { rows: [{ id: 1, nama: 'Kajian' }] };
      }
      if (typeof sql === 'string' && sql.includes('bapperida_sektor')) {
        return { rows: [{ id: 2, nama: 'Ekonomi' }] };
      }
      if (typeof sql === 'string' && sql.includes('bidang_list')) {
        return { rows: [{ id: 3, nama: 'Bikor' }] };
      }
      return { rows: [] };
    },
  });

  const r1 = await via(app, '/api/arsip/p/api/kategori-dokumen');
  assert.equal(r1.status, 200);
  assert.equal(JSON.parse(r1.body)[0].nama, 'Kajian');

  const r2 = await via(app, '/api/arsip/p/api/sektor');
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(r2.body)[0].nama, 'Ekonomi');

  const r3 = await via(app, '/api/arsip/p/api/bidang');
  assert.equal(r3.status, 200);
  assert.equal(JSON.parse(r3.body)[0].nama, 'Bikor');
});

test('req.user tanpa NIP otomatis diselesaikan dari user_list', async () => {
  let queriedUserList = false;
  const { app, captured } = harness({
    user: { id: '77', nip: null, role: 'USER' },
    roleDb: 'Admin',
    queryImpl: async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('user_list') && sql.includes('"NIP"')) {
        queriedUserList = true;
        assert.equal(params[0], '77');
        return { rows: [{ nip: '198501012010011005' }] };
      }
      if (typeof sql === 'string' && sql.includes('user_credentials')) {
        return { rows: [{ role: 'Admin' }] };
      }
      return { rows: [] };
    },
  });

  const r = await via(app, '/api/arsip/docs');
  assert.equal(r.status, 200);
  assert.equal(queriedUserList, true);
  const cookie = captured[0].opts.headers.cookie;
  const token = cookie.slice('arsip_session='.length);
  assert.equal(verifikasi(token, SECRET)?.sub, '198501012010011005');
});
