// Guard otorisasi /api/stitch: requireAdmin, isSelfOrAdmin, dan validasi aset/scan.
// Query di-inject — tidak ada DB atau jaringan yang tersentuh.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createStitchApiRouter } from './stitch-api.js';

const USER = { id: '9', nip: '199001011990011001', role: 'USER', instansi_id: 'bapperida', is_admin: false };
const ADMIN = { id: '1', nip: '198001011980011001', role: 'ADMIN', instansi_id: 'bapperida', is_admin: false };
const KEPALA = { id: '2', nip: '197501011975011001', role: 'KEPALA', instansi_id: 'bapperida', is_admin: false };
const BENDAHARA = { id: '3', nip: '199201011992011001', role: 'BENDAHARA BARANG', instansi_id: 'bapperida', is_admin: false };
const SUPERADMIN = { id: '0', nip: '197001011970011001', role: 'SUPERADMIN', instansi_id: 'bapperida', is_admin: true };

function stubQuery() {
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/aset\/scan|no_polisi|qrcode/i.test(sql) || /unit_aset/i.test(sql)) {
      return { rows: [{ id: 'a46bbe27-abca-4bb4-a37b-1b8966d0d20b', nama_barang: 'Laptop', no_polisi: null }] };
    }
    if (/UPDATE lokasiabsen/i.test(sql)) return { rows: [] };
    if (/UPDATE ket_temp/i.test(sql)) return { rows: [] };
    if (/FROM user_list/i.test(sql)) {
      return { rows: [{ id: '9', username: 'Budi', NIP: USER.nip, instansi_id: 'bapperida' }] };
    }
    if (/FROM "Log_Absen"|FROM Log_Absen/i.test(sql)) return { rows: [] };
    if (/FROM ket_temp/i.test(sql)) return { rows: [] };
    if (/FROM lokasiabsen/i.test(sql)) return { rows: [{ id: 1, latitude: -9.6, longitude: 119.3, radius: 50 }] };
    if (/FROM jam_absen/i.test(sql)) return { rows: [{ masuk: '07:30', pulang: '16:00' }] };
    if (/FROM libur_nasional/i.test(sql)) return { rows: [] };
    return { rows: [] };
  };
  fn.calls = calls;
  return fn;
}

function app(user, query) {
  const a = express();
  a.use(express.json({ limit: '1mb' }));
  a.use((req, _res, next) => { req.user = user; next(); });
  a.use('/api/stitch', createStitchApiRouter({ query }));
  return a;
}

async function call(a, method, url, body) {
  const server = await new Promise((r) => { const s = a.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* body bukan JSON */ }
    return { status: res.status, body: json };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// ── requireAdmin: endpoint admin hanya MEDIA_ROLES / is_admin ──

test('USER ditolak 403 di /admin-lokasi (requireAdmin)', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'POST', '/api/stitch/admin-lokasi', {
    id: '1', latitude: -9.6, longitude: 119.3, radius: 100,
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.ok, false);
  assert.equal(q.calls.length, 0, 'guard harus menolak sebelum menyentuh DB');
});

test('USER ditolak 403 di /keterangan/approve dan /admin/monitoring-today', async () => {
  const q = stubQuery();
  const approve = await call(app(USER, q), 'POST', '/api/stitch/keterangan/approve', {
    id_ket: 'K1', status: 'DISETUJUI',
  });
  assert.equal(approve.status, 403);
  assert.equal(approve.body.ok, false);

  const mon = await call(app(USER, q), 'GET', '/api/stitch/admin/monitoring-today');
  assert.equal(mon.status, 403);
  assert.equal(mon.body.ok, false);
  assert.equal(q.calls.length, 0, 'kedua endpoint admin harus ditolak sebelum query');
});

test('ADMIN lolos requireAdmin di /admin-lokasi dan menulis geofence', async () => {
  const q = stubQuery();
  const r = await call(app(ADMIN, q), 'POST', '/api/stitch/admin-lokasi', {
    id: '1', latitude: -9.648769, longitude: 119.389232, radius: 75,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.ok(q.calls.some((c) => /UPDATE lokasiabsen/i.test(c.sql)), 'harus UPDATE lokasiabsen');
});

test('KEPALA (MEDIA_ROLES) lolos requireAdmin; BENDAHARA tidak', async () => {
  const q1 = stubQuery();
  const kepala = await call(app(KEPALA, q1), 'GET', '/api/stitch/admin/monitoring-today');
  // Lolos guard, lalu query stub mengembalikan matrix kosong → 200
  assert.equal(kepala.status, 200);

  const q2 = stubQuery();
  const benda = await call(app(BENDAHARA, q2), 'POST', '/api/stitch/admin-lokasi', {
    id: '1', latitude: -9.6, longitude: 119.3, radius: 50,
  });
  assert.equal(benda.status, 403, 'BENDAHARA bukan MEDIA_ROLES');
  assert.equal(q2.calls.length, 0);
});

// ── isSelfOrAdmin: non-admin hanya boleh NIP sendiri ──

test('USER ditolak 403 saat /user-data nip orang lain', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'GET', `/api/stitch/user-data?nip=199999999999999999`);
  assert.equal(r.status, 403);
  assert.match(r.body.message, /bukan NIP Anda/);
  assert.equal(q.calls.length, 0, 'denySelf harus sebelum query');
});

test('USER boleh /user-data nip sendiri', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'GET', `/api/stitch/user-data?nip=${USER.nip}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.ok(q.calls.length > 0, 'lolos self-check lalu query');
});

test('ADMIN boleh /user-data nip orang lain', async () => {
  const q = stubQuery();
  const r = await call(app(ADMIN, q), 'GET', '/api/stitch/user-data?nip=199999999999999999');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('USER ditolak 403 saat POST /absen dan /keterangan untuk nip lain', async () => {
  const q = stubQuery();
  const absen = await call(app(USER, q), 'POST', '/api/stitch/absen', {
    nip: '199999999999999999', jenis: 'MASUK',
  });
  assert.equal(absen.status, 403);

  const ket = await call(app(USER, q), 'POST', '/api/stitch/keterangan', {
    nip: '199999999999999999', jenis: 'IZIN', tgl_mulai: '2026-11-01',
  });
  assert.equal(ket.status, 403);
  assert.equal(q.calls.length, 0);
});

test('ADMIN dapat POST /keterangan untuk NIP lain dengan auto_approve: true menjadi DISETUJUI', async () => {
  const q = stubQuery();
  const r = await call(app(ADMIN, q), 'POST', '/api/stitch/keterangan', {
    nip: USER.nip,
    jenis: 'IZIN',
    tgl_mulai: '2026-11-19',
    tgl_selesai: '2026-11-19',
    keterangan: 'Izin keperluan keluarga',
    auto_approve: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const ins = q.calls.find((c) => /INSERT INTO ket_temp/i.test(c.sql));
  assert.ok(ins, 'harus INSERT INTO ket_temp');
  assert.equal(ins.params[7], 'DISETUJUI');
});

test('USER tidak dapat memaksa auto_approve: true pada POST /keterangan NIP sendiri (selalu PENDING)', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'POST', '/api/stitch/keterangan', {
    nip: USER.nip,
    jenis: 'IZIN',
    tgl_mulai: '2026-11-19',
    tgl_selesai: '2026-11-19',
    keterangan: 'Izin pribadi',
    auto_approve: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const ins = q.calls.find((c) => /INSERT INTO ket_temp/i.test(c.sql));
  assert.ok(ins, 'harus INSERT INTO ket_temp');
  assert.equal(ins.params[7], 'PENDING');
});

// ── GET /keterangan: non-admin dipaksa ke NIP sesi sendiri ──

test('GET /keterangan USER mengabaikan ?nip= orang lain dan memakai NIP sesi', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'GET', '/api/stitch/keterangan?nip=199999999999999999');
  assert.equal(r.status, 200);
  const sel = q.calls.find((c) => /FROM ket_temp/i.test(c.sql));
  assert.ok(sel, 'harus query ket_temp');
  assert.deepEqual(sel.params, [USER.nip], 'WHERE NIP harus NIP sesi, bukan query string');
});

test('GET /keterangan ADMIN boleh filter lintas NIP', async () => {
  const q = stubQuery();
  const r = await call(app(ADMIN, q), 'GET', '/api/stitch/keterangan?nip=199999999999999999');
  assert.equal(r.status, 200);
  const sel = q.calls.find((c) => /FROM ket_temp/i.test(c.sql));
  assert.deepEqual(sel.params, ['199999999999999999']);
});

// ── aset/scan: validasi parameter ──

test('GET /aset/scan tanpa q dibalas 400 sebelum query', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'GET', '/api/stitch/aset/scan');
  assert.equal(r.status, 400);
  assert.equal(r.body.ok, false);
  assert.equal(q.calls.length, 0);
});

test('GET /aset/scan menormalkan prefix SIMAPO- lalu mencari aset', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'GET', '/api/stitch/aset/scan?q=SIMAPO-a46bbe27-abca-4bb4-a37b-1b8966d0d20b');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.asset.id, 'a46bbe27-abca-4bb4-a37b-1b8966d0d20b');
  const sel = q.calls.find((c) => /unit_aset/i.test(c.sql));
  assert.ok(sel, 'harus query unit_aset');
  // Prefix SIMAPO- dibuang: params[0] = uuid polos, bukan SIMAPO-uuid
  assert.equal(sel.params[0], 'a46bbe27-abca-4bb4-a37b-1b8966d0d20b');
});

test('GET /aset/scan 404 saat tidak ada baris cocok', async () => {
  const q = async () => ({ rows: [] });
  const r = await call(app(USER, q), 'GET', '/api/stitch/aset/scan?q=BARANG-FIKTIF-XYZ');
  assert.equal(r.status, 404);
  assert.equal(r.body.ok, false);
});

// ── SUPERADMIN is_admin ──

test('SUPERADMIN is_admin lolos requireAdmin', async () => {
  const q = stubQuery();
  const r = await call(app(SUPERADMIN, q), 'POST', '/api/stitch/admin-lokasi', {
    id: '1', latitude: -9.6, longitude: 119.3, radius: 60,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('endpoint dashboard dan mobile-data mengeksekusi query secara paralel', async () => {
  function concurrencyTracker() {
    let inflight = 0;
    let maxInflight = 0;
    const calls = [];
    const fn = async (sql, params) => {
      calls.push({ sql: String(sql), params });
      inflight++;
      if (inflight > maxInflight) maxInflight = inflight;
      await new Promise((r) => setTimeout(r, 10));
      inflight--;
      if (/GROUP BY kondisi/i.test(sql)) {
        return { rows: [{ kondisi: 'Baik', count: 5 }, { kondisi: 'Rusak Ringan', count: 2 }] };
      }
      if (/FROM "SIMAPO"\.unit_aset/i.test(sql)) {
        return { rows: [{ id: 'u1', nama_barang: 'Laptop' }] };
      }
      if (/count\(\*\)::int AS total FROM bapperida_dokumen/i.test(sql)) {
        return { rows: [{ total: 12 }] };
      }
      if (/GROUP BY kategori/i.test(sql)) {
        return { rows: [{ kategori: 'SK', count: 4 }] };
      }
      if (/FROM user_list/i.test(sql)) {
        return { rows: [{ id: '9', nama: 'Budi', nip: USER.nip, jabatan: 'Staf' }] };
      }
      return { rows: [] };
    };
    fn.calls = calls;
    fn.getMax = () => maxInflight;
    return fn;
  }

  for (const [ep, minParallel] of [
    ['/api/stitch/bootstrap', 5],
    [`/api/stitch/user-data?nip=${USER.nip}`, 3],
    ['/api/stitch/admin/monitoring-today', 3],
    ['/api/stitch/rekap-harian?tanggal=2026-11-19', 3],
    [`/api/stitch/aset/mobile-data?nip=${USER.nip}`, 4],
    ['/api/stitch/arsip/mobile-data', 3],
  ]) {
    const q = concurrencyTracker();
    const r = await call(app(ADMIN, q), 'GET', ep);
    assert.equal(r.status, 200, `${ep} harus 200`);
    assert.equal(r.body.ok, true, `${ep} harus ok:true`);
    assert.ok(q.getMax() >= minParallel, `${ep} max inflight ${q.getMax()} harus >= ${minParallel}`);
    if (ep.includes('/aset/mobile-data')) {
      assert.equal(r.body.stats.totalUnit, 7);
      assert.equal(r.body.stats.kondisiBaik, 5);
      assert.equal(r.body.stats.kondisiRusak, 2);
      assert.ok(!q.calls.some((c) => /SELECT count\(\*\)::int AS total FROM "SIMAPO"\.unit_aset/i.test(c.sql)));
    }
  }
});

// ── admin/face-reset: reset biometrik wajah oleh admin ──

test('USER ditolak 403 di POST /admin/face-reset (requireAdmin)', async () => {
  const q = stubQuery();
  const r = await call(app(USER, q), 'POST', '/api/stitch/admin/face-reset', { nip: USER.nip });
  assert.equal(r.status, 403);
  assert.equal(r.body.ok, false);
  assert.equal(q.calls.length, 0, 'guard harus menolak sebelum menyentuh DB');
});

test('POST /admin/face-reset tanpa nip/userId ditolak 400', async () => {
  const q = stubQuery();
  const r = await call(app(ADMIN, q), 'POST', '/api/stitch/admin/face-reset', {});
  assert.equal(r.status, 400);
  assert.equal(r.body.ok, false);
  assert.equal(q.calls.length, 0);
});

test('ADMIN berhasil POST /admin/face-reset dan mengosongkan face_photo & face_histogram', async () => {
  const calls = [];
  const q = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: [{ id: '9', nama: 'Budi', nip: USER.nip }] };
  };
  const r = await call(app(ADMIN, q), 'POST', '/api/stitch/admin/face-reset', { nip: USER.nip });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.data.nip, USER.nip);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /face_photo\s*=\s*NULL/i);
  assert.match(calls[0].sql, /face_histogram\s*=\s*NULL/i);
  assert.deepEqual(calls[0].params, [USER.nip]);
});

test('POST /admin/face-reset mengembalikan 404 saat pegawai tidak ditemukan', async () => {
  const q = async () => ({ rows: [] });
  const r = await call(app(ADMIN, q), 'POST', '/api/stitch/admin/face-reset', { nip: '000000000000000000' });
  assert.equal(r.status, 404);
  assert.equal(r.body.ok, false);
});

// ── Nomor urut SPPD, Tiket, Peminjaman & validasi SPPD tanpa nilai tetap ──

test('POST /sppd menolak jika tujuan kosong dan memakai nomor urut + tahun/pejabat dinamis', async () => {
  const calls = [];
  const q = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/FROM user_list/i.test(sql)) {
      return { rows: [{ username: 'Budi', NIP: USER.nip, Jabatan: 'Analis', pangkat: 'III/a', instansi_id: 'dinkes' }] };
    }
    if (/FROM instansi_list/i.test(sql)) {
      return { rows: [{ nama: 'Dinas Kesehatan' }] };
    }
    if (/AS max_seq\s+FROM agenda_sppd/i.test(sql)) {
      return { rows: [{ max_seq: 5 }] };
    }
    if (/INSERT INTO agenda_sppd/i.test(sql)) {
      return { rows: [{ id: 10, nomor_sppd: params[2], pelaksana_nama: params[5], maksud_perjalanan: params[8], tempat_tujuan: params[10], status: 'Pengajuan' }] };
    }
    return { rows: [] };
  };

  const bad = await call(app(USER, q), 'POST', '/api/stitch/sppd', { nip: USER.nip, maksud: 'Rapat' });
  assert.equal(bad.status, 400);

  const ok = await call(app(USER, q), 'POST', '/api/stitch/sppd', {
    nip: USER.nip,
    maksud: 'Koordinasi Program',
    tujuan: 'Waingapu',
    tgl_berangkat: '2027-03-10',
    lama_hari: 2,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.nomor_sppd, '0006/SPPD-LD/2027');
  const ins = calls.find((c) => /INSERT INTO agenda_sppd/i.test(c.sql));
  assert.equal(ins.params[1], 2027);
  assert.equal(ins.params[3], 'Kepala Dinas Kesehatan');
  assert.equal(ins.params[10], 'Waingapu');
});

test('POST /aset/tiket dan /aset/pinjam menghasilkan nomor urut berurutan bukan acak', async () => {
  const year = new Date(Date.now() + 8 * 3600000).getUTCFullYear();
  const q = async (sql) => {
    if (/FROM "SIMAPO"\.tiket_kerusakan/i.test(sql)) return { rows: [{ max_seq: 3 }] };
    if (/FROM "SIMAPO"\.peminjaman/i.test(sql)) return { rows: [{ max_seq: 2 }] };
    return { rows: [] };
  };
  const rTkt = await call(app(USER, q), 'POST', '/api/stitch/aset/tiket', { deskripsi: 'AC tidak dingin' });
  assert.equal(rTkt.status, 200);
  assert.equal(rTkt.body.nomortiket, `TKT/${year}/0004`);

  const rPjm = await call(app(USER, q), 'POST', '/api/stitch/aset/pinjam', { unitasetid: 'u1', keperluan: 'Rapat luar' });
  assert.equal(rPjm.status, 200);
  assert.equal(rPjm.body.nomorpeminjaman, `PJM/${year}/0003`);
});

test('POST /absen menolak PULANG LUAR tanpa penugasan dan menolak GPS teleport', async () => {
  const nowWita = new Date(Date.now() + 8 * 3600000);
  const today = nowWita.toISOString().slice(0, 10);
  const tenMinAgo = new Date(nowWita.getTime() - 10 * 60000);
  const jamLalu = `${String(tenMinAgo.getUTCHours()).padStart(2, '0')}:${String(tenMinAgo.getUTCMinutes()).padStart(2, '0')}`;

  // 1. PULANG LUAR tanpa penugasan -> 403
  const qPl = async (sql) => {
    if (/FROM user_list/i.test(sql)) return { rows: [{ id: '9', username: 'Budi', NIP: USER.nip, instansi_id: 'bapperida' }] };
    if (/FROM "Log_Absen"/i.test(sql)) return { rows: [{ 'Jenis Absen': 'MASUK' }] };
    if (/FROM penugasan/i.test(sql)) return { rows: [] };
    return { rows: [] };
  };
  const rPl = await call(app(USER, qPl), 'POST', '/api/stitch/absen', {
    nip: USER.nip, jenis: 'PULANG LUAR', koordinat: '-9.648769,119.389232', ket: 'Survei lapangan',
  });
  assert.equal(rPl.status, 403);
  assert.match(rPl.body.message, /penugasan/i);

  // 2. GPS Teleport (~111 km dalam 10 menit) -> 403 GPS_TELEPORT
  const qTp = async (sql) => {
    if (/FROM user_list/i.test(sql)) return { rows: [{ id: '9', username: 'Budi', NIP: USER.nip, instansi_id: 'bapperida' }] };
    if (/koordinat IS NOT NULL/i.test(sql)) return { rows: [{ Tanggal: today, Jam: jamLalu, koordinat: '-8.648769,119.389232' }] };
    if (/FROM lokasiabsen/i.test(sql)) return { rows: [{ nama: 'Kantor', latitude: -9.648769, longitude: 119.389232, radius: 250 }] };
    return { rows: [] };
  };
  const rTp = await call(app(USER, qTp), 'POST', '/api/stitch/absen', {
    nip: USER.nip, jenis: 'MASUK', koordinat: '-9.648769,119.389232',
  });
  assert.equal(rTp.status, 403);
  assert.equal(rTp.body.kode_tolak, 'GPS_TELEPORT');
});
