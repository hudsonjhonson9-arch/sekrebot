import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createOvertimeRouter } from '../server/overtime.js';

// Harness meniru server/auth-device.test.js: mount di prefiks produksi (/api)
// supaya test tidak hijau untuk konfigurasi yang tak pernah dipakai index.js.
const ADMIN = { role: 'ADMIN', instansi_id: 'bapperida', nip: '123' };
const PEGAWAI = { role: 'PEGAWAI', instansi_id: 'bapperida', nip: '123' };

function stubApp(user, query) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api', createOvertimeRouter({ query }));
  return app;
}

async function listen(app) {
  const s = await new Promise((resolve) => {
    const x = app.listen(0, () => resolve(x));
  });
  return {
    port: s.address().port,
    close: () => new Promise((resolve) => { s.closeAllConnections?.(); s.close(() => resolve()); }),
  };
}

async function post(port, path, body) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

function recorder() {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (/UPDATE penugasan SET perjadin/.test(sql)) return { rows: [{ id: '1' }, { id: '2' }] };
    if (/INSERT INTO penugasan/.test(sql)) return { rows: [{ id: '9' }] };
    return { rows: [] };
  };
  return { calls, query };
}

const UPDATE_RE = /UPDATE penugasan SET perjadin=\$1,nomor_surat=\$2 WHERE id::text=ANY\(\$3::text\[\]\) AND instansi_id=\$4/;

test('non-admin ditolak 403 dan tidak menyentuh UPDATE', async (t) => {
  const { calls, query } = recorder();
  const { port, close } = await listen(stubApp(PEGAWAI, query));
  t.after(close);
  const r = await post(port, '/api/penugasan/perjadin', { ids: ['1'], perjadin: {}, nomor_surat: 'x' });
  assert.equal(r.status, 403);
  assert.ok(!calls.some((c) => UPDATE_RE.test(c.sql)), 'UPDATE tidak boleh dijalankan untuk non-admin');
});

test('admin tanpa ids ditolak 400', async (t) => {
  const { port, close } = await listen(stubApp(ADMIN, recorder().query));
  t.after(close);
  const kosong = await post(port, '/api/penugasan/perjadin', { ids: [], perjadin: {} });
  const absen = await post(port, '/api/penugasan/perjadin', { perjadin: {} });
  assert.equal(kosong.status, 400);
  assert.equal(absen.status, 400);
});

test('admin sukses: kolom dibuat dan UPDATE di-scope ke instansi pemanggil', async (t) => {
  const perjadin = { maksud: 'Rapat koordinasi', tujuan: 'Bandung' };
  const nomor_surat = 'B-123/SPT/2026';
  const { calls, query } = recorder();
  const { port, close } = await listen(stubApp(ADMIN, query));
  t.after(close);
  const r = await post(port, '/api/penugasan/perjadin', { ids: [1, 2], perjadin, nomor_surat });

  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.updated, 2);

  assert.ok(calls.some((c) => /ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS perjadin JSONB/.test(c.sql)), 'kolom perjadin dibuat');
  assert.ok(calls.some((c) => /ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS nomor_surat TEXT/.test(c.sql)), 'kolom nomor_surat dibuat');

  const upd = calls.find((c) => UPDATE_RE.test(c.sql));
  assert.ok(upd, 'UPDATE perjadin dijalankan');
  assert.equal(upd.params[0], JSON.stringify(perjadin));
  assert.equal(upd.params[1], nomor_surat);
  assert.deepEqual(upd.params[2], ['1', '2']);
  assert.equal(upd.params[3], 'bapperida', 'scope instansi pemanggil dipakai, bukan sekadar dideklarasikan');
});

test('buat penugasan baru menyimpan nomor_surat', async (t) => {
  const nomor_surat = 'B-9/SPT/2026';
  const { calls, query } = recorder();
  const { port, close } = await listen(stubApp(ADMIN, query));
  t.after(close);
  const r = await post(port, '/api/penugasan', { nama: 'A', nip: '1', tanggal: '2026-01-01', nomor_surat });
  assert.equal(r.status, 200);

  const ins = calls.find((c) => /INSERT INTO penugasan/.test(c.sql));
  assert.ok(ins, 'INSERT dijalankan');
  assert.match(ins.sql, /\([^)]*nomor_surat[^)]*\)/, 'nomor_surat ada di daftar kolom INSERT');
  assert.ok(ins.params.includes(nomor_surat), 'nilai nomor_surat ikut dikirim sebagai parameter');
});
