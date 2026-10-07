import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSimapoNativeExtraRouter } from './simapo-native-extra.js';

// Router ini menerima query lewat DI, jadi seluruh cabang validasi bisa diuji
// tanpa database. Yang dijaga: guard type benar-benar berhenti SEBELUM
// menyentuh DB, scoping per level tidak tertukar, dan urutan parameter insert
// mengikuti level masing-masing.

function stubApp(query, withTransaction) {
  const app = express();
  app.use(express.json());
  // Prefiks harus sama dengan index.js, kalau tidak test hijau untuk
  // konfigurasi yang tidak pernah dipakai produksi.
  app.use('/api/simapo', createSimapoNativeExtraRouter({ query, withTransaction }));
  return app;
}

// close() harus di-await: server.close() asinkron, tanpa itu proses test
// menggantung walau semua assertion sudah lewat.
async function listen(app) {
  const s = await new Promise((resolve) => { const x = app.listen(0, () => resolve(x)); });
  return {
    port: s.address().port,
    close: () => new Promise((resolve) => { s.closeAllConnections?.(); s.close(() => resolve()); }),
  };
}

const req = async (port, path, init = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

const post = (port, path, body) => req(port, path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('type PKS tidak valid ditolak 400 tanpa pernah menyentuh DB', async () => {
  let dipanggil = 0;
  const { port, close } = await listen(stubApp(async () => { dipanggil++; return { rows: [] }; }));
  const list = await req(port, '/api/simapo/pks-list?type=ngawur');
  const simpan = await post(port, '/api/simapo/pks-save', { type: 'ngawur' });
  const hapus = await post(port, '/api/simapo/pks-delete', { type: 'ngawur' });
  await close();

  for (const [nama, r] of [['list', list], ['save', simpan], ['delete', hapus]]) {
    assert.equal(r.status, 400, `pks-${nama} harus 400`);
    assert.equal(r.body.ok, false);
    assert.match(r.body.message, /type PKS tidak valid/);
  }
  assert.equal(dipanggil, 0, 'guard harus menghentikan sebelum query DB');
});

test('type kosong jatuh ke program, bukan crash', async () => {
  let sql = '';
  const { port, close } = await listen(stubApp(async (s) => { sql = s; return { rows: [] }; }));
  const r = await req(port, '/api/simapo/pks-list');
  await close();

  assert.equal(r.status, 200);
  assert.match(sql, /FROM "SIMAPO"\.\s*program/);
});

test('pks-list meneruskan parent id sesuai level, dan null untuk program', async () => {
  const seen = [];
  const { port, close } = await listen(stubApp(async (sql, params) => {
    seen.push({ sql, params });
    return { rows: [] };
  }));
  await req(port, '/api/simapo/pks-list?type=program&program_id=11111111-1111-1111-1111-111111111111');
  await req(port, '/api/simapo/pks-list?type=kegiatan&program_id=22222222-2222-2222-2222-222222222222');
  await req(port, '/api/simapo/pks-list?type=subkegiatan&kegiatan_id=33333333-3333-3333-3333-333333333333');
  await close();

  assert.deepEqual(seen[0].params, [null], 'program tidak punya parent');
  assert.deepEqual(seen[1].params, ['22222222-2222-2222-2222-222222222222']);
  assert.deepEqual(seen[2].params, ['33333333-3333-3333-3333-333333333333']);
  assert.match(seen[0].sql, /"SIMAPO"\.\s*program/);
  assert.match(seen[1].sql, /"SIMAPO"\.\s*kegiatan/);
  assert.match(seen[2].sql, /"SIMAPO"\.\s*subkegiatan/);
});

test('pks-save menyusun urutan parameter sesuai level', async () => {
  const seen = [];
  const { port, close } = await listen(stubApp(async (sql, params) => {
    seen.push(params);
    return { rows: [{ id: '44444444-4444-4444-4444-444444444444' }] };
  }));
  await post(port, '/api/simapo/pks-save', { type: 'program', kode: 'P1', nama: 'Program Satu' });
  await post(port, '/api/simapo/pks-save', {
    type: 'kegiatan', program_id: '55555555-5555-5555-5555-555555555555', kode: 'K1', nama: 'Kegiatan Satu',
  });
  await post(port, '/api/simapo/pks-save', {
    type: 'subkegiatan', kegiatan_id: '66666666-6666-6666-6666-666666666666', kode: 'S1', nama: 'Sub Satu',
  });
  await close();

  assert.deepEqual(seen[0], ['P1', 'Program Satu'], 'program: (kode, nama)');
  assert.deepEqual(seen[1], ['55555555-5555-5555-5555-555555555555', 'K1', 'Kegiatan Satu'], 'kegiatan: (program_id, kode, nama)');
  assert.deepEqual(seen[2], ['66666666-6666-6666-6666-666666666666', 'S1', 'Sub Satu'], 'subkegiatan: (kegiatan_id, kode, nama)');
});

test('pks-delete 404 saat tidak ada baris dan menolak id non-uuid lewat DB', async () => {
  const seen = [];
  const { port, close } = await listen(stubApp(async (sql, params) => {
    seen.push({ sql, params });
    return { rows: [] };
  }));
  const viaPost = await post(port, '/api/simapo/pks-delete', { type: 'program', id: '77777777-7777-7777-7777-777777777777' });
  // r.all harus tetap menerima DELETE; kalau jadi POST-only, ini 404 palsu.
  const viaDelete = await req(port, '/api/simapo/pks-delete', {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'program', id: '77777777-7777-7777-7777-777777777777' }),
  });
  await close();

  assert.equal(viaPost.status, 404);
  assert.equal(viaPost.body.ok, false);
  assert.equal(viaDelete.status, 404, 'r.all harus menerima DELETE juga');
  assert.match(seen[0].sql, /DELETE FROM "SIMAPO"\.\s*program/);
  assert.match(seen[0].sql, /\$1::uuid/, 'id harus dipaksa uuid supaya DB menolak, bukan string bebas');
  assert.deepEqual(seen[0].params, ['77777777-7777-7777-7777-777777777777']);
});

test('kegagalan query PKS dibalas 500 dengan pesan, bukan melempar ke luar', async () => {
  const { port, close } = await listen(stubApp(async () => { throw new Error('DB down'); }));
  const list = await req(port, '/api/simapo/pks-list');
  const simpan = await post(port, '/api/simapo/pks-save', { kode: 'X', nama: 'Y' });
  const hapus = await post(port, '/api/simapo/pks-delete', { id: '88888888-8888-8888-8888-888888888888' });
  await close();

  for (const [nama, r] of [['list', list], ['save', simpan], ['delete', hapus]]) {
    assert.equal(r.status, 500, `pks-${nama} harus 500`);
    assert.equal(r.body.ok, false);
  }
  assert.ok(!JSON.stringify([list, simpan, hapus]).includes('DB down'), 'detail error internal tidak boleh bocor');
});