import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createStitchApiRouter } from './stitch-api.js';

async function invokePostAbsen(body, queryFn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: '1', nip: body.nip || '19900101', role: 'USER', instansi_id: 'bapperida' };
    next();
  });
  app.use('/api/stitch', createStitchApiRouter({ query: queryFn }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/stitch/absen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } finally {
    server.close();
  }
}

describe('POST /api/stitch/absen offline sync', () => {
  it('mencatat waktu WITA dari offline_at dan menandai [Offline Sync]', async () => {
    let insertedParams = null;
    const queryFn = async (sql, params) => {
      if (sql.includes('FROM user_list')) {
        return { rows: [{ id: '1', username: 'Budi', NIP: '19900101', instansi_id: 'bapperida' }] };
      }
      if (sql.includes('WHERE request_id = $1')) return { rows: [] };
      if (sql.includes('FROM ket_temp')) return { rows: [] };
      if (sql.includes('SELECT "Jenis Absen" FROM "Log_Absen"')) return { rows: [] };
      if (sql.includes('FROM lokasiabsen')) {
        return { rows: [{ nama: 'Kantor Bapperida', latitude: -9.648769, longitude: 119.389232, radius: 250 }] };
      }
      if (sql.includes('INSERT INTO "Log_Absen"')) {
        insertedParams = params;
        return { rows: [{ ID_Log: 99, Tanggal: params[3], Jam: params[4], 'Jenis Absen': params[5], Ket: params[7], request_id: params[9] }] };
      }
      return { rows: [] };
    };

    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const expectedWita = new Date(oneHourAgo.getTime() + 8 * 3600000);
    const expectedTanggal = expectedWita.toISOString().slice(0, 10);
    const expectedJam = `${String(expectedWita.getUTCHours()).padStart(2, '0')}:${String(expectedWita.getUTCMinutes()).padStart(2, '0')}`;

    const r = await invokePostAbsen({
      nip: '19900101',
      jenis: 'MASUK',
      koordinat: '-9.648769,119.389232',
      akurasi: 15,
      request_id: 'offline_19900101_masuk_123456',
      offline_at: oneHourAgo.toISOString(),
    }, queryFn);

    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(insertedParams[3], expectedTanggal);
    assert.equal(insertedParams[4], expectedJam);
    assert.equal(insertedParams[7], '[Offline Sync]');
    assert.equal(insertedParams[9], 'offline_19900101_masuk_123456');
  });

  it('mengembalikan deduplicated: true jika request_id sudah ada', async () => {
    const queryFn = async (sql) => {
      if (sql.includes('FROM user_list')) {
        return { rows: [{ id: '1', username: 'Budi', NIP: '19900101', instansi_id: 'bapperida' }] };
      }
      if (sql.includes('WHERE request_id = $1')) {
        return { rows: [{ ID_Log: 77, Tanggal: '2026-11-22', Jam: '07:25', 'Jenis Absen': 'MASUK' }] };
      }
      throw new Error('Seharusnya berhenti sebelum query lain: ' + sql);
    };

    const r = await invokePostAbsen({
      nip: '19900101',
      jenis: 'MASUK',
      koordinat: '-9.648769,119.389232',
      request_id: 'offline_19900101_masuk_dup001',
    }, queryFn);

    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.deduplicated, true);
    assert.equal(r.json.record.ID_Log, 77);
  });

  it('menolak offline_at di masa depan atau lebih dari 7 hari lalu', async () => {
    const queryFn = async (sql) => {
      if (sql.includes('FROM user_list')) {
        return { rows: [{ id: '1', username: 'Budi', NIP: '19900101', instansi_id: 'bapperida' }] };
      }
      return { rows: [] };
    };

    const future = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const rFuture = await invokePostAbsen({ nip: '19900101', jenis: 'MASUK', koordinat: '-9.648769,119.389232', offline_at: future }, queryFn);
    assert.equal(rFuture.status, 400);

    const tooOld = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const rOld = await invokePostAbsen({ nip: '19900101', jenis: 'MASUK', koordinat: '-9.648769,119.389232', offline_at: tooOld }, queryFn);
    assert.equal(rOld.status, 400);
  });
});
