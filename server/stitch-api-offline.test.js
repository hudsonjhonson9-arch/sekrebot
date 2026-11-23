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


describe('Notifikasi Telegram & WA di stitch-api (/absen, /keterangan, /keterangan/approve)', () => {
  it('mengirim notifikasi Telegram ke pegawai saat POST /api/stitch/absen berhasil', async () => {
    const sentTg = [];
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: '555001', nip: '19900101', role: 'USER', instansi_id: 'bapperida' };
      next();
    });
    app.use('/api/stitch', createStitchApiRouter({
      sendTelegram: async (msg) => { sentTg.push(msg); },
      query: async (sql, params) => {
        if (sql.includes('FROM user_list')) return { rows: [{ id: '555001', username: 'Budi', NIP: '19900101', instansi_id: 'bapperida' }] };
        if (sql.includes('FROM lokasiabsen')) return { rows: [{ nama: 'Kantor', latitude: -9.648769, longitude: 119.389232, radius: 250 }] };
        if (sql.includes('FROM jam_absen')) return { rows: [{ masuk: '07:15', pulang: '14:30' }] };
        if (sql.includes('INSERT INTO "Log_Absen"')) return { rows: [{ ID_Log: 1, Jam: params[4], 'Jenis Absen': params[5] }] };
        return { rows: [] };
      },
    }));

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/stitch/absen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: '19900101', jenis: 'MASUK', koordinat: '-9.648769,119.389232', akurasi: 10 }),
      });
      assert.equal(res.status, 200);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(sentTg.length, 1);
      assert.equal(sentTg[0].chatId, '555001');
      assert.match(sentTg[0].text, /KONFIRMASI ABSENSI BERHASIL/);
    } finally {
      server.close();
    }
  });

  it('memanggil notifyKeterangan (WA + Telegram) pada /keterangan & /keterangan/approve', async () => {
    const notified = [];
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: '555001', nip: '19900101', role: 'ADMIN', is_admin: true, instansi_id: 'bapperida' };
      next();
    });
    app.use('/api/stitch', createStitchApiRouter({
      notifyKeterangan: async (arg) => { notified.push(arg); },
      query: async (sql, params) => {
        if (sql.includes('FROM user_list')) return { rows: [{ id: '555001', username: 'Budi', NIP: '19900101', Jabatan: 'Staf', instansi_id: 'bapperida' }] };
        if (sql.includes('INSERT INTO ket_temp')) return { rows: [{ ID_Ket: params[0], Status: params[7] }] };
        if (sql.includes('UPDATE ket_temp')) return { rows: [{ ID_Ket: 'IZN1', 'Jenis Absen': 'IZIN', Nama: 'Budi', NIP: '19900101', Ket: 'Urusan keluarga', tgl_mulai: '2026-11-23', tgl_selesai: '2026-11-23', instansi_id: 'bapperida' }] };
        return { rows: [] };
      },
    }));

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try {
      const port = server.address().port;
      const r1 = await fetch(`http://127.0.0.1:${port}/api/stitch/keterangan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: '19900101', jenis: 'SAKIT', tgl_mulai: '2026-11-23', tgl_selesai: '2026-11-23', keterangan: 'Demam' }),
      });
      assert.equal(r1.status, 200);
      const r2 = await fetch(`http://127.0.0.1:${port}/api/stitch/keterangan/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_ket: 'IZN1', status: 'DISETUJUI' }),
      });
      assert.equal(r2.status, 200);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(notified.length, 2);
      assert.equal(notified[0].kind, 'auto');
      assert.equal(notified[0].jenis, 'SAKIT');
      assert.equal(notified[1].kind, 'approve');
      assert.equal(notified[1].action, 'APPROVE');
    } finally {
      server.close();
    }
  });
});
