import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

import { createStitchApiRouter } from './stitch-api.js';
import { sortPegawaiHierarchy } from './stitch-api-rekap.js';

const ADMIN = { id: '1', nip: '198001011980011001', role: 'ADMIN', instansi_id: 'bapperida', is_admin: true };
const SUPERADMIN = { id: '0', nip: '197001011970011001', role: 'SUPERADMIN', instansi_id: 'bapperida', is_admin: true };
const USER = { id: '9', nip: '199001011990011001', role: 'USER', instansi_id: 'bapperida', is_admin: false };

function makeApp(user, query) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/stitch', createStitchApiRouter({ query }));
  return app;
}

async function getJson(app, url) {
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`);
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise(r => server.close(r));
  }
}

test('sortPegawaiHierarchy mengurutkan jabatan, PNS 18-digit, pangkat, NIP, dan nama', () => {
  const sample = [
    { nama: 'Zaki Magang', nip: 'NON-02', jabatan: 'Magang', pangkat: '' },
    { nama: 'Andi Kontrak', nip: 'NON-01', jabatan: 'Staf Non-ASN', pangkat: '' },
    { nama: 'Budi Kontrak', nip: 'NON-01', jabatan: 'Magang', pangkat: '' },
    { nama: 'Budi Staf Muda', nip: '199201012019011001', jabatan: 'Staf Pelaksana', pangkat: 'III/a' },
    { nama: 'Citra Staf Senior', nip: '198501012010012001', jabatan: 'Staf Pelaksana', pangkat: 'III/c' },
    { nama: 'Dedi Staf Non18', nip: '123456', jabatan: 'Staf Pelaksana', pangkat: 'IV/a' },
    { nama: 'Eko Kasi', nip: '198401012009011001', jabatan: 'Kepala Seksi Perencanaan', pangkat: 'III/d' },
    { nama: 'Fajar Kabid', nip: '198001012005011001', jabatan: 'Kepala Bidang Litbang', pangkat: 'IV/a' },
    { nama: 'Gina Sekban', nip: '197801012003012001', jabatan: 'Sekretaris Badan', pangkat: 'IV/b' },
    { nama: 'Hendra Kaban', nip: '197201011998011001', jabatan: 'Kepala Badan', pangkat: 'IV/c' },
    { nama: 'Ani Administrasi', nip: '199001012015012001', jabatan: 'Pengadministrasi Umum', pangkat: 'II/c' }
  ];

  const sorted = [...sample].sort(sortPegawaiHierarchy).map(u => u.nama);
  assert.deepEqual(sorted, [
    'Hendra Kaban',
    'Gina Sekban',
    'Fajar Kabid',
    'Eko Kasi',
    'Citra Staf Senior',
    'Budi Staf Muda',
    'Ani Administrasi',
    'Dedi Staf Non18',
    'Andi Kontrak',
    'Budi Kontrak',
    'Zaki Magang'
  ]);
});

test('GET /api/stitch/rekap-range mengembalikan bidangList, signers, logByDate, ketByDate, dan scoping instansi_id', async () => {
  const users = [
    { id: '1', nama: 'Budi Staf', nip: '199001011990011001', jabatan: 'Staf', pangkat: 'III/a', bidang: 'Litbang', instansi_id: 'bapperida', signature: null },
    { id: '2', nama: 'Hendra Kepala', nip: '197501011975011001', jabatan: 'Kepala Badan', pangkat: 'IV/c', bidang: 'Pimpinan', instansi_id: 'bapperida', signature: 'sig-kaban' },
    { id: '3', nama: 'Fajar Kabid', nip: '198001012005011001', jabatan: 'Kabid Perencanaan', pangkat: 'IV/a', bidang: 'Perencanaan', instansi_id: 'bapperida', signature: 'sig-kabid' },
    { id: '4', nama: 'Luar Instansi', nip: '198101012006011001', jabatan: 'Kepala Dinas', pangkat: 'IV/c', bidang: 'Sekretariat', instansi_id: 'dinkes', signature: null }
  ];
  const logs = [
    { ID_Log: 101, ID: '1', NIP: '199001011990011001', Tanggal: '2026-10-05', Jam: '07:05', 'Jenis Absen': 'MASUK', Lokasi: 'Kantor Bapperida', Ket: '' },
    { ID_Log: 102, ID: '1', NIP: '199001011990011001', Tanggal: '2026-10-05', Jam: '15:05', 'Jenis Absen': 'PULANG LUAR', Lokasi: 'Lapangan', Ket: 'SPT' },
    { ID_Log: 103, ID: '2', NIP: '197501011975011001', Tanggal: '2026-10-05', Jam: '07:30', 'Jenis Absen': 'DI LUAR JAM MASUK', Lokasi: 'Kantor Bapperida', Ket: '' },
    { ID_Log: 104, ID: '2', NIP: '197501011975011001', Tanggal: '2026-10-05', Jam: '16:00', 'Jenis Absen': 'PULANG', Lokasi: 'Kantor Bapperida', Ket: '' }
  ];
  const kets = [
    { ID_Ket: 'K1', ID_Pegawai: '3', NIP: '198001012005011001', Tanggal: '2026-10-05', tgl_mulai: '2026-10-05', tgl_selesai: '2026-10-06', jenis: 'TUBEL', ket: 'Tugas Belajar' }
  ];

  const q = async (sql) => {
    if (/FROM user_list/i.test(sql)) return { rows: users };
    if (/FROM "Log_Absen"/i.test(sql)) return { rows: logs };
    if (/FROM ket_temp/i.test(sql)) return { rows: kets };
    if (/FROM jam_absen/i.test(sql)) return { rows: [{ masuk: '07:15', pulang: '14:30' }] };
    if (/FROM libur_nasional/i.test(sql)) return { rows: [] };
    return { rows: [] };
  };

  // ADMIN bapperida hanya melihat bapperida
  const rAdmin = await getJson(makeApp(ADMIN, q), '/api/stitch/rekap-range?dari=2026-10-05&sampai=2026-10-06');
  assert.equal(rAdmin.status, 200);
  assert.equal(rAdmin.body.ok, true);
  assert.equal(rAdmin.body.hariKerja, 2);
  assert.deepEqual(rAdmin.body.bidangList, ['Litbang', 'Perencanaan', 'Pimpinan']);
  assert.deepEqual(rAdmin.body.signers.map(s => s.nama), ['Hendra Kepala', 'Fajar Kabid']);
  assert.deepEqual(rAdmin.body.rows.map(r => r.nama), ['Hendra Kepala', 'Fajar Kabid', 'Budi Staf']);
  assert.equal(rAdmin.body.data.length, 3);

  const budi = rAdmin.body.rows.find(r => r.id === '1');
  assert.equal(budi.bidang, 'Litbang');
  assert.equal(budi.instansi_id, 'bapperida');
  assert.equal(budi.hadir, 1);
  assert.equal(budi.lapangan, 1);
  assert.equal(budi.pulang, 0);
  assert.equal(budi.alpa, 1);
  assert.equal(budi.jamHadir, '8.0');
  assert.equal(budi.disiplinPct, 80);
  assert.equal(budi.kehadiranPct, 50);
  assert.deepEqual(budi.logByDate['2026-10-05'], {
    masuk: '07:05',
    pulang: '15:05',
    status: 'HADIR',
    lokasi: 'Kantor Bapperida'
  });

  const fajar = rAdmin.body.rows.find(r => r.id === '3');
  assert.equal(fajar.tubel, 2);
  assert.deepEqual(fajar.ketByDate['2026-10-05'], { jenis: 'TUBEL', ket: 'Tugas Belajar' });
  assert.deepEqual(fajar.ketByDate['2026-10-06'], { jenis: 'TUBEL', ket: 'Tugas Belajar' });

  // SUPERADMIN ?instansi_id=dinkes dan ?instansi_id=all
  const rDinkes = await getJson(makeApp(SUPERADMIN, q), '/api/stitch/rekap-range?dari=2026-10-05&sampai=2026-10-06&instansi_id=dinkes');
  assert.equal(rDinkes.body.rows.length, 1);
  assert.equal(rDinkes.body.rows[0].nama, 'Luar Instansi');

  const rAll = await getJson(makeApp(SUPERADMIN, q), '/api/stitch/rekap-range?dari=2026-10-05&sampai=2026-10-06&instansi_id=all');
  assert.equal(rAll.body.rows.length, 4);

  // USER biasa tetap hanya mendapat dirinya sendiri + kepala + signers
  const rUser = await getJson(makeApp(USER, q), '/api/stitch/rekap-range?dari=2026-10-05&sampai=2026-10-06');
  assert.equal(rUser.body.rows.length, 1);
  assert.equal(rUser.body.rows[0].nip, USER.nip);
  assert.equal(rUser.body.kepala.nama, 'Hendra Kepala');
});

test('GET /api/stitch/rekap-harian menyertakan lokasi, raw_*_log, bidangList, signers, summary 10-count, dan sort hierarki', async () => {
  const users = [
    { id: '1', nama: 'Staf A', nip: '199001011990011001', jabatan: 'Staf', pangkat: 'III/a', bidang: 'Umum', instansi_id: 'bapperida', signature: null },
    { id: '2', nama: 'Kepala B', nip: '197501011975011001', jabatan: 'Kepala Badan', pangkat: 'IV/c', bidang: 'Pimpinan', instansi_id: 'bapperida', signature: 'sig-k' },
    { id: '3', nama: 'Sekretaris C', nip: '197801012000011001', jabatan: 'Sekretaris', pangkat: 'IV/b', bidang: 'Sekretariat', instansi_id: 'bapperida', signature: null }
  ];
  const logs = [
    { ID_Log: 201, ID: '1', NIP: '199001011990011001', Jam: '07:35', 'Jenis Absen': 'DI LUAR JAM MASUK', Lokasi: 'Kantor', Ket: 'Macet', koordinat: '-9.6,119.3' },
    { ID_Log: 202, ID: '1', NIP: '199001011990011001', Jam: '14:10', 'Jenis Absen': 'PULANG LUAR', Lokasi: 'Lapangan', Ket: 'SPT', koordinat: '-9.7,119.4' },
    { ID_Log: 203, ID: '2', NIP: '197501011975011001', Jam: '07:05', 'Jenis Absen': 'MASUK', Lokasi: 'Kantor', Ket: '', koordinat: '-9.6,119.3' },
    { ID_Log: 204, ID: '2', NIP: '197501011975011001', Jam: '15:00', 'Jenis Absen': 'PULANG', Lokasi: 'Kantor', Ket: '', koordinat: '-9.6,119.3' }
  ];
  const kets = [
    { ID_Ket: 'K9', ID_Pegawai: '3', NIP: '197801012000011001', jenis: 'SAKIT', ket: 'Demam' }
  ];

  const q = async (sql) => {
    if (/FROM user_list/i.test(sql)) return { rows: users };
    if (/FROM "Log_Absen"/i.test(sql)) return { rows: logs };
    if (/FROM ket_temp/i.test(sql)) return { rows: kets };
    if (/FROM jam_absen/i.test(sql)) return { rows: [{ masuk: '07:15', pulang: '14:30' }] };
    return { rows: [] };
  };

  const r = await getJson(makeApp(ADMIN, q), '/api/stitch/rekap-harian?tanggal=2026-10-05');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.rows.map(x => x.nama), ['Kepala B', 'Sekretaris C', 'Staf A']);
  assert.deepEqual(r.body.bidangList, ['Pimpinan', 'Sekretariat', 'Umum']);
  assert.deepEqual(r.body.signers.map(s => s.nama), ['Kepala B', 'Sekretaris C']);
  assert.deepEqual(r.body.summary, {
    masuk: 1,
    pulang: 1,
    lapangan: 1,
    lambat: 1,
    izin: 0,
    sakit: 1,
    tugas: 0,
    tubel: 0,
    cuti: 0,
    alpa: 0
  });

  const staf = r.body.rows.find(x => x.id === '1');
  assert.equal(staf.bidang, 'Umum');
  assert.equal(staf.instansi_id, 'bapperida');
  assert.equal(staf.lokasi_masuk, 'Kantor');
  assert.equal(staf.koordinat_masuk, '-9.6,119.3');
  assert.equal(staf.lokasi_pulang, 'Lapangan');
  assert.equal(staf.koordinat_pulang, '-9.7,119.4');
  assert.equal(staf.menit_terlambat, 20);
  assert.equal(staf.menit_lebih_awal, 0);
  assert.deepEqual(staf.raw_masuk_log, { ID_Log: 201, Jam: '07:35', Jenis_Absen: 'DI LUAR JAM MASUK', Ket: 'Macet' });
  assert.deepEqual(staf.raw_pulang_log, { ID_Log: 202, Jam: '14:10', Jenis_Absen: 'PULANG LUAR', Ket: 'SPT' });
  assert.equal(staf.raw_ket_log, null);
});

test('js/stitch-auth.js STITCH_RE mencocokkan /api/log* dan /api/rekap-absen', () => {
  const src = fs.readFileSync(path.resolve('js/stitch-auth.js'), 'utf8');
  const m = src.match(/const STITCH_RE = (\/[^;]+\/);/);
  assert.ok(m, 'STITCH_RE harus ditemukan di js/stitch-auth.js');
  const re = eval(m[1]); // eslint-disable-line no-eval
  for (const url of [
    '/api/log',
    '/api/log/add',
    '/api/log/edit',
    '/api/log?dari=2026-10-01&sampai=2026-10-31',
    '/api/rekap-absen',
    '/api/rekap-absen?dari=2026-10-01&sampai=2026-10-31',
    'https://absensi.local/api/stitch/rekap-harian?tanggal=2026-10-05'
  ]) {
    assert.equal(re.test(url), true, `${url} harus cocok dengan STITCH_RE`);
  }
  assert.equal(re.test('/api/auth/login'), false);
  assert.equal(re.test('/api/login'), false);
});
