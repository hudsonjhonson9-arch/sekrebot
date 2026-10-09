import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

const { createLogRouter } = await import('./log.js');

const TOKEN = 'a'.repeat(192);

const ADMIN = {
  id: '7',
  nip: '198001012000011001',
  role: 'ADMIN',
  instansi_id: 'bapperida',
};

// Body dari frontend. `telegram_id` bernama misleading: isinya user_list.id,
// bukan Telegram ID (Log_Absen.ID = user_list.id, terbukti di data).
const BODY = {
  telegram_id: '6564',
  nama: 'NAMA DARI BODY',
  nip: '999',
  instansi_id: 'instansi_palsu',
  tanggal: '2026-10-05',
  jam: '07:10',
  jenis_absen: 'MASUK',
  keterangan: 'catatan',
  admin_id: 'NIP PALSU DARI LOCALSTORAGE',
  request_id: 'log_add_6564_2026-10-05_MASUK',
};

// Yang sebenarnya ada di user_list untuk id 6564.
const PEGAWAI = {
  id: '6564',
  username: 'William Cunrad Tobe, S.Tr.IP',
  NIP: '199910022022081001',
  instansi_id: 'bapperida',
};

const state = { insert: [], update: [], pegawai: [], insertRows: 1, updateRows: 1, existingLogs: [] };

function defaultQuery(text) {
  if (/INSERT INTO/i.test(text)) return { rows: Array.from({ length: state.insertRows }, (_, i) => ({ ID_Log: i + 1 })) };
  if (/UPDATE /i.test(text)) return { rows: Array.from({ length: state.updateRows }, (_, i) => ({ ID_Log: 900 + i })) };
  if (/SELECT "ID_Log" FROM "Log_Absen"/.test(text)) return { rows: state.existingLogs };
  if (/FROM "user_list"/i.test(text)) return { rows: state.pegawai };
  return { rows: [] };
}

function harness({ auth = true, session = ADMIN, query } = {}) {
  const sql = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  if (auth) {
    // Montasi produksi: /api/log untuk seluruh ABSEN_ROLES; pencatatan manual
    // (/add, /edit) dan baca lintas-pegawai ditolak di dalam log.js.
    app.use('/api/log', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }));
  }
  app.use('/api/log', createLogRouter({
    query: async (text, params) => {
      sql.push({ text, params });
      return query ? query(text, params) : defaultQuery(text);
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

async function post(h, path, body, { auth = true } = {}) {
  const server = await new Promise((r) => { const s = h.app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const headers = { 'content-type': 'application/json' };
    if (auth) headers.authorization = `Bearer ${TOKEN}`;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function reset() {
  state.insert = []; state.update = []; state.insertRows = 1; state.updateRows = 1;
  state.pegawai = [{ ...PEGAWAI }];
}

test('menolak request tanpa bearer', async () => {
  reset();
  const r = await post(harness(), '/api/log/add', BODY, { auth: false });
  assert.equal(r.status, 401);
});

test('menolak role non-media (USER)', async () => {
  reset();
  const h = harness({ session: { ...ADMIN, role: 'USER' } });
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 403);
});

test('field wajib kosong ditolak dengan pesan n8n', async () => {
  for (const field of ['telegram_id', 'tanggal', 'jam', 'jenis_absen']) {
    reset();
    const h = harness();
    const r = await post(h, '/api/log/add', { ...BODY, [field]: '' });
    assert.equal(r.status, 400, field);
    assert.equal(r.body.message, 'Data tidak lengkap (ID, Tanggal, Jam, Jenis wajib).');
  }
});

test('add: nama/nip/instansi diambil dari DB, bukan dari body', async () => {
  reset();
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const ins = h.sql.find((s) => /INSERT INTO/i.test(s.text));
  assert.ok(ins, 'INSERT harus dieksekusi');
  const p = ins.params;
  assert.equal(p[0], '6564', 'ID dari telegram_id=id user_list');
  assert.equal(p[1], PEGAWAI.username, 'Nama dari user_list.username');
  assert.equal(p[2], PEGAWAI.NIP, 'NIP dari user_list');
  assert.equal(p[7], PEGAWAI.instansi_id, 'instansi dari user_list');
  assert.ok(!p.includes('NAMA DARI BODY'));
  assert.ok(!p.includes('999'));
  assert.ok(!p.includes('instansi_palsu'));
});

test('add: input mentah tidak pernah masuk ke teks SQL', async () => {
  reset();
  const h = harness();
  const nasty = "x'); DROP TABLE \"Log_Absen\"; --";
  await post(h, '/api/log/add', { ...BODY, keterangan: nasty, nama: nasty });
  const ins = h.sql.find((s) => /INSERT INTO/i.test(s.text));
  assert.ok(!ins.text.includes('DROP TABLE'), 'SQL harus parameterized');
  assert.ok(ins.params.includes(nasty), 'payload mentah jadi parameter, bukan SQL');
});

test('add: admin tidak boleh mencatat untuk instansi lain', async () => {
  reset();
  state.pegawai = [{ ...PEGAWAI, instansi_id: 'instansi_lain' }];
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 403);
  assert.ok(!h.sql.some((s) => /INSERT INTO/i.test(s.text)), 'tidak boleh menulis');
});

test('add: SUPERADMIN boleh lintas instansi', async () => {
  reset();
  state.pegawai = [{ ...PEGAWAI, instansi_id: 'instansi_lain' }];
  const h = harness({ session: { ...ADMIN, role: 'SUPERADMIN' } });
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 200);
  assert.ok(h.sql.some((s) => /INSERT INTO/i.test(s.text)));
});

test('add: pegawai tidak ada ditolak', async () => {
  reset();
  state.pegawai = [];
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 404);
  assert.ok(!h.sql.some((s) => /INSERT INTO/i.test(s.text)));
});

test('add: request_id duplikat tetap sukses (idempoten)', async () => {
  reset();
  state.insertRows = 0; // ON CONFLICT DO NOTHING -> 0 baris
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('edit: tanpa ID_Log dan tanpa pegawai -> 400 (data tidak lengkap)', async () => {
  reset();
  const h = harness();
  const r = await post(h, '/api/log/edit', { ...BODY, ID_Log: '', telegram_id: '' });
  assert.equal(r.status, 400);
});

test('edit: ID_Log eksplisit tetap jalan (non-SUPERADMIN)', async () => {
  reset();
  const h = harness();
  const r = await post(h, '/api/log/edit', { ...BODY, ID_Log: '10355' });
  assert.equal(r.status, 200);
});

test('edit: subjek tidak bisa diganti (kolom ID tidak di-set)', async () => {
  reset();
  const h = harness();
  const r = await post(h, '/api/log/edit', { ...BODY, ID_Log: '10355' });
  assert.equal(r.status, 200);
  const upd = h.sql.find((s) => /UPDATE /i.test(s.text));
  assert.ok(!/SET[^;]*"ID"\s*=/.test(upd.text), 'kolom "ID" tidak boleh di-set');
  assert.ok(!upd.text.includes('NAMA DARI BODY'));
});

test('edit: non-SUPERADMIN dibatasi instansi di SQL', async () => {
  reset();
  const h = harness();
  await post(h, '/api/log/edit', { ...BODY, ID_Log: '10355' });
  const upd = h.sql.find((s) => /UPDATE /i.test(s.text));
  assert.ok(/AND "instansi_id" = \$6/.test(upd.text), 'filter instansi wajib ada');
  assert.equal(upd.params[5], 'bapperida');
});

test('edit: SUPERADMIN tidak difilter instansi', async () => {
  reset();
  const h = harness({ session: { ...ADMIN, role: 'SUPERADMIN' } });
  await post(h, '/api/log/edit', { ...BODY, ID_Log: '10355' });
  const upd = h.sql.find((s) => /UPDATE /i.test(s.text));
  assert.ok(!/"instansi_id" = \$6/.test(upd.text));
});

test('edit: 0 baris -> 404, bukan diam-diam sukses', async () => {
  reset();
  state.updateRows = 0;
  const h = harness();
  const r = await post(h, '/api/log/edit', { ...BODY, ID_Log: '999999' });
  assert.equal(r.status, 404);
  assert.equal(r.body.ok, false);
});

test('pesan sukses tetap sama dengan n8n', async () => {
  reset();
  const r = await post(harness(), '/api/log/add', BODY);
  assert.deepEqual(r.body, { ok: true, message: 'Log berhasil disimpan.' });
});

const USER = { id: '99', nip: '199900000000001002', role: 'USER', instansi_id: 'bapperida' };

test('GET: pegawai biasa dipaksa melihat riwayatnya sendiri (user_id dikirim diabaikan)', async () => {
  reset();
  const h = harness({ session: USER });
  const res = await get(h, '/api/log/?user_id=777&tanggal=2026-10-05');
  assert.equal(res.status, 200);
  const q = h.sql.find((s) => /FROM "Log_Absen"/.test(s.text) && /"ID"::text=\$1/.test(s.text));
  assert.ok(q, 'filter ID milik-pegawai wajib ada');
  assert.equal(q.params[0], USER.id, 'user_id asing tidak dipakai');
  assert.ok(!h.sql.some((s) => /WHERE/.test(s.text) && JSON.stringify(s.params).includes('777')), 'tidak boleh query 777');
});

test('GET: pegawai biasa bisa membaca riwayatnya sendiri', async () => {
  reset();
  const h = harness({ session: USER });
  const res = await get(h, '/api/log');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('GET: admin boleh menembak user_id tertentu', async () => {
  reset();
  const h = harness();
  const res = await get(h, '/api/log/?user_id=777');
  assert.equal(res.status, 200);
  const q = h.sql.find((s) => /FROM "Log_Absen"/.test(s.text));
  assert.ok(q);
  assert.equal(q.params[0], '777', 'admin boleh query id lain');
});

// ── Upsert: "kalau sudah ada log, berarti edit" ─────────────────────────────
function resetUpsert() {
  reset();
  state.pegawai = [{ ...PEGAWAI }];
  state.existingLogs = [];
  state.updateRows = 1;
}

test('add: log sudah ada (pegawai+tanggal+jenis) -> diupdate, bukan duplikat', async () => {
  resetUpsert();
  state.existingLogs = [{ ID_Log: '10355' }];
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 200);
  assert.equal(r.body.message, 'Log absen diperbarui.');
  assert.equal(r.body.updated, true);
  const upd = h.sql.find((s) => /UPDATE "Log_Absen"/.test(s.text));
  assert.ok(upd, 'harus UPDATE, bukan INSERT');
  assert.ok(upd.params.includes('10355'), `target ID_Log lama: ${JSON.stringify(upd.params)}`);
  assert.ok(!h.sql.some((s) => /INSERT INTO/i.test(s.text)), 'tidak boleh insert duplikat');
});

test('add: belum ada log -> tetap insert (tidak ada regresi)', async () => {
  resetUpsert();
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 200);
  assert.equal(r.body.message, 'Log berhasil disimpan.');
  assert.ok(h.sql.some((s) => /INSERT INTO/i.test(s.text)), 'harus ada INSERT');
});

test('edit: tanpa ID_Log, dicari lewat (pegawai+tanggal+jenis)', async () => {
  resetUpsert();
  state.existingLogs = [{ ID_Log: '10355' }];
  const h = harness();
  const r = await post(h, '/api/log/edit', { ...BODY, ID_Log: '' });
  assert.equal(r.status, 200);
  const upd = h.sql.find((s) => /UPDATE "Log_Absen"/.test(s.text));
  assert.ok(upd, 'harus UPDATE dengan ID hasil resolve');
  assert.ok(upd.params.includes('10355'), 'ID Log hasil resolve dipakai');
});

test('edit: tanpa ID_Log dan tidak ada log yang cocok -> 404', async () => {
  resetUpsert();
  const h = harness();
  const r = await post(h, '/api/log/edit', { ...BODY, ID_Log: '' });
  assert.equal(r.status, 404);
  assert.equal(r.body.message, 'Log tidak ditemukan.');
});