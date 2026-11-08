import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { requireRole, ABSEN_ROLES } from '../server/auth.js';

// Bug: saat hari sudah punya log TANPA BERITA (cron jam 10:00) atau keterangan
// lain, approve keterangan / add log MANUAL menumpuk baris BARU — 1 hari jadi
// 2 log, hitungan alpa+keterangan dobel. Keputusan: 1 keterangan per
// pegawai+tanggal (gantikan), dan ada scan nyata = baris TB dihapus.

const { createLogRouter } = await import('../server/log.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const attData = fs.readFileSync(path.join(ROOT, 'server', 'attendance-data.js'), 'utf8');
const sched = fs.readFileSync(path.join(ROOT, 'server', 'scheduler.js'), 'utf8');

const TOKEN = 'a'.repeat(192);
const ADMIN = { id: '7', nip: '198001012000011001', role: 'ADMIN', instansi_id: 'bapperida', is_admin: true };
const PEGAWAI = { id: '6564', username: 'William', NIP: '199910022022081001', instansi_id: 'bapperida' };

const BODY = {
  telegram_id: '6564',
  tanggal: '2026-11-05',
  jam: '07:10',
  jenis_absen: 'SAKIT',
  keterangan: 'demam',
  request_id: 'log_add_6564_2026-11-05_SAKIT',
};

const state = { pegawai: [{ ...PEGAWAI }], groupRows: [], exactRows: [], deleted: [] };

// Params[2] = array → query kelompok ANY($3::text[]); string → resolve exact jenis.
function query(text, params) {
  if (/FROM "user_list"/i.test(text)) return { rows: state.pegawai };
  if (/SELECT "ID_Log" FROM "Log_Absen"/.test(text)) {
    if (Array.isArray(params?.[2])) return { rows: state.groupRows };
    return { rows: state.exactRows };
  }
  if (/DELETE FROM "Log_Absen"/i.test(text)) { state.deleted.push(params); return { rows: [] }; }
  if (/INSERT INTO/i.test(text)) return { rows: [{ ID_Log: 1 }] };
  if (/UPDATE /i.test(text)) return { rows: [{ ID_Log: 900 }] };
  return { rows: [] };
}

function harness(session = ADMIN) {
  const sql = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api/log', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }));
  app.use('/api/log', createLogRouter({
    query: async (text, params) => { sql.push({ text, params }); return query(text, params); },
  }));
  return { app, sql };
}

async function post(h, path, body) {
  const server = await new Promise((r) => { const s = h.app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function reset() {
  state.pegawai = [{ ...PEGAWAI }];
  state.groupRows = [];
  state.exactRows = [];
  state.deleted = [];
}

test('add keterangan saat sudah ada keterangan lain -> gantikan (UPDATE), bukan INSERT baru', async () => {
  reset();
  state.groupRows = [{ ID_Log: '555' }]; // mis. TANPA BERITA dari cron
  const h = harness();
  const r = await post(h, '/api/log/add', BODY); // jenis SAKIT
  assert.equal(r.status, 200);
  assert.equal(r.body.updated, true);
  const upd = h.sql.find((s) => /UPDATE "Log_Absen"/.test(s.text));
  assert.ok(upd, 'harus UPDATE baris lama');
  assert.ok(upd.params.includes('555'), 'target baris kelompok keterangan lama');
  assert.ok(upd.params.includes('SAKIT'), 'jenis diganti ke SAKIT');
  assert.ok(!h.sql.some((s) => /INSERT INTO/i.test(s.text)), 'jangan INSERT baris kedua');
});

test('add keterangan tanpa keterangan lama -> tetap INSERT (tidak ada regresi)', async () => {
  reset();
  const h = harness();
  const r = await post(h, '/api/log/add', BODY);
  assert.equal(r.status, 200);
  assert.equal(r.body.message, 'Log berhasil disimpan.');
  assert.ok(h.sql.some((s) => /INSERT INTO/i.test(s.text)));
  assert.equal(state.deleted.length, 0);
});

test('add MASUK saat hari masih ber-TANPA BERITA -> baris TB dihapus dulu', async () => {
  reset();
  state.groupRows = [{ ID_Log: '777' }]; // TB/TANPA BERITA
  state.exactRows = []; // belum ada log MASUK
  const h = harness();
  const r = await post(h, '/api/log/add', { ...BODY, jenis_absen: 'MASUK', request_id: 'log_add_6564_2026-11-05_MASUK' });
  assert.equal(r.status, 200);
  const del = h.sql.find((s) => /DELETE FROM "Log_Absen"/i.test(s.text));
  assert.ok(del, 'baris alpa-group harus dihapus');
  assert.ok(del.params.includes('777'), 'target baris TB');
  assert.ok(h.sql.some((s) => /INSERT INTO/i.test(s.text)), 'log masuk tetap tercatat');
  assert.ok(!h.sql.some((s) => /UPDATE "Log_Absen"/.test(s.text)), 'TB tidak di-update jadi masuk, tapi dihapus');
});

test('add MASUK di hari bersih -> tanpa DELETE (tidak ada regresi)', async () => {
  reset();
  const h = harness();
  const r = await post(h, '/api/log/add', { ...BODY, jenis_absen: 'MASUK' });
  assert.equal(r.status, 200);
  assert.equal(state.deleted.length, 0, 'tidak boleh ada DELETE');
  assert.ok(h.sql.some((s) => /INSERT INTO/i.test(s.text)));
});

test('applyApprovedKeterangan: SELECT dulu, ada baris = UPDATE (bukan INSERT buta)', () => {
  const fn = attData.slice(attData.indexOf('async function applyApprovedKeterangan'));
  assert.match(fn, /SELECT "ID_Log" FROM "Log_Absen"[\s\S]*?ANY\(\$3::text\[\]\)/, 'cek baris kelompok keterangan dulu');
  assert.match(fn, /if\(exist\[0\]\)\{[\s\S]*?UPDATE "Log_Absen"/, 'baris lama diUPDATE');
  assert.match(fn, /else\{\s*await qx\(queryLike, `INSERT INTO "Log_Absen"/, 'INSERT hanya jika belum ada');
  // deklarasi kelompok ada sebelum fungsi — cek di seluruh berkas
  assert.match(attData, /KET_GROUP = \['IZIN', 'SAKIT', 'TUGAS', 'DL', 'TUBEL', 'CUTI', 'TB', 'TANPA BERITA', 'ALPA'\]/);
});

test('applyApprovedKeterangan: auto-pulang IZIN juga idempoten (re-approve tak menumpuk PULANG)', () => {
  const fn = attData.slice(attData.indexOf('async function applyApprovedKeterangan'));
  assert.match(fn, /Jenis Absen"='PULANG'/, 'cek PULANG yang sudah ada');
  assert.match(fn, /if\(plg\[0\]\)\{[\s\S]*?UPDATE "Log_Absen"/, 'PULANG lama diUPDATE');
});

test('scheduler cron tanpa-berita menghormati SEMUA jenis keterangan (DL/TB/ALPA ikut)', () => {
  assert.match(sched, /const KET = \['IZIN', 'SAKIT', 'TUGAS', 'DL', 'TUBEL', 'CUTI', 'TB', 'TANPA BERITA', 'ALPA'\]/,
    'hari ber-DL/TB/ALPA jangan ditimpa TANPA BERITA');
});
