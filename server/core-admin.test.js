import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

const { createCoreAdminRouter } = await import('./core-admin.js');

const TOKEN = 'a'.repeat(192);

const ADMIN = {
  id: '7',
  nip: '198001012000011001',
  role: 'ADMIN',
  instansi_id: 'bapperida',
};

const USER = {
  id: '42',
  nip: '199900000000001001',
  role: 'USER',
  instansi_id: 'bapperida',
};

// Bentuk baris asli dari lokasiabsen: kolomnya CamelCase `Nama_Lokasi`.
// Kontrak client (6 tempat / 3 file: admin-lokasi-v9.js, admin.js, admin-face.js)
// membaca `l.nama_lokasi` — tanpa alias SQL, semua kartu/tooltip/LOK_DEF jadi ''.
const LOKASI_ROWS = [
  { id: 1, Nama_Lokasi: 'Kantor Bapperida', instansi_id: 'bapperida', radius: 30 },
];

function harness({ session = ADMIN, query } = {}) {
  const sql = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  // Montasi produksi: router core-admin di-mount untuk seluruh ABSEN_ROLES;
  // endpoint tulis dan daftar lintas-instansi ditolak di dalam handler.
  app.use('/api', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }));
  app.use('/api', createCoreAdminRouter({
    query: async (text, params) => {
      sql.push({ text, params });
      const r = query ? await query(text, params) : { rows: LOKASI_ROWS.map((x) => ({ ...x })) };
      // Emulasi Postgres: alias `AS nama_lokasi` hanya lahir kalau SQL-nya benar.
      if (text.includes('AS nama_lokasi')) {
        r.rows = r.rows.map((row) => ({ ...row, nama_lokasi: row.Nama_Lokasi }));
      }
      return r;
    },
  }));
  return { app, sql };
}

async function req(h, method, path, body) {
  const server = await new Promise((r) => { const s = h.app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const headers = { authorization: `Bearer ${TOKEN}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function get(h, path) { return req(h, 'GET', path); }

test('lokasi-list: baris membawa nama_lokasi (kontrak client) selain kolom asli', async () => {
  const h = harness();
  const res = await get(h, '/api/lokasi-list');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const row = res.body.data[0];
  assert.equal(row.Nama_Lokasi, 'Kantor Bapperida', 'kolom asli tetap ikut');
  assert.equal(row.nama_lokasi, 'Kantor Bapperida', 'alias kontrak client');
  const sqlText = h.sql[0].text;
  assert.equal(sqlText.includes('AS nama_lokasi'), true, sqlText);
});

test('USER: user-list dipaksa ke baris miliknya sendiri (bukan instansi/pegawai lain)', async () => {
  const h = harness({ session: USER });
  const res = await get(h, '/api/user-list?user_id=999&instansi_id=instansi_lain');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const q = h.sql.find((s) => /FROM user_list/.test(s.text) && /WHERE/.test(s.text));
  assert.ok(q, 'user-list wajib punya WHERE');
  assert.equal(q.params[0], USER.id, 'akan menarik id sesi sendiri');
});

test('USER: dapat membaca jam-absen, jam-periode-list, kontrol-absen, lokasi-list, bidang-list', async () => {
  for (const p of ['/api/jam-absen', '/api/jam-periode-list', '/api/kontrol-absen', '/api/lokasi-list', '/api/bidang-list']) {
    const h = harness({ session: USER });
    const res = await get(h, p);
    assert.equal(res.status, 200, `${p} harus boleh dibaca pegawai biasa`);
    assert.equal(res.body.ok, true, `${p} ok`);
  }
});

test('USER: instansi-list dan admin-list tetap larangan (broad listing)', async () => {
  for (const p of ['/api/instansi-list', '/api/admin-list']) {
    const h = harness({ session: USER });
    const res = await get(h, p);
    assert.equal(res.status, 403, `${p} harus 403 untuk USER`);
  }
});

test('USER: endpoint tulis master ditolak', async () => {
  const writes = [
    ['POST', '/api/user-add', { id: '1', nama: 'x', nip: '1' }],
    ['POST', '/api/jam-absen', { masuk: '07:00', pulang: '15:00' }],
    ['POST', '/api/jam-periode-add', { nama: 'P', dari: '2026-01-01', sampai: '2026-12-31', masuk: '07:00', pulang: '15:00' }],
    ['POST', '/api/kontrol-absen', { enabled: true }],
    ['POST', '/api/lokasi-add', { nama_lokasi: 'X', latitude: -1, longitude: 120, radius: 50 }],
    ['POST', '/api/libur-add', { tanggal: '2026-08-17', nama: 'Kemerdekaan' }],
  ];
  for (const [method, p, body] of writes) {
    const h = harness({ session: USER });
    const res = await req(h, method, p, body);
    assert.equal(res.status, 403, `${method} ${p} harus 403 untuk USER`);
  }
});
