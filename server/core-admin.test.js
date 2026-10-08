import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, MEDIA_ROLES } from './auth.js';

const { createCoreAdminRouter } = await import('./core-admin.js');

const TOKEN = 'a'.repeat(192);

const ADMIN = {
  id: '7',
  nip: '198001012000011001',
  role: 'ADMIN',
  instansi_id: 'bapperida',
};

// Bentuk baris asli dari lokasiabsen: kolomnya CamelCase `Nama_Lokasi`.
// Kontrak client (6 tempat / 3 file: admin-lokasi-v9.js, admin.js, admin-face.js)
// membaca `l.nama_lokasi` — tanpa alias SQL, semua kartu/tooltip/LOK_DEF jadi ''.
const LOKASI_ROWS = [
  { id: 1, Nama_Lokasi: 'Kantor Bapperida', instansi_id: 'bapperida', radius: 30 },
];

function harness({ query } = {}) {
  const sql = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', requireRole(MEDIA_ROLES, { lookup: async () => ({ ...ADMIN }) }));
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

async function get(h, path) {
  const server = await new Promise((r) => { const s = h.app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

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
