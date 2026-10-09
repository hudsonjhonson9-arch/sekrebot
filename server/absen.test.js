import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

// Import di atas file, bukan di dalam harness(): harness() dipanggil sinkron di
// setiap test, jadi import harus selesai sebelum test pertama jalan.
const { createAbsenRouter } = await import('./absen.js');
const { evaluateGates } = await import('./absen-validate.js');

// Token 192 hex asli: isSessionToken() menolak bentuk lain sebelum DB disentuh.
const TOKEN = 'a'.repeat(192);

const SESSION = {
  id: '42',
  nip: '199001012010011001',
  role: 'USER',
  instansi_id: 'bapperida',
};

// 2026-10-04T23:10Z = WITA 2026-10-05 07:10 (Senin). Dipilih supaya pita waktu
// jatuh ke MASUK: 07:10 <= jamMasuk 07:15.
const NOW = new Date('2026-10-04T23:10:00Z');
const TANGGAL = '2026-10-05';
const JAM = '07:10';

// ── state stub ──
// Dispatch SQL disimpan di satu tempat dengan satu fungsi. Enam salinan pola
// per test sebelumnya bisa saling tertukar: "SELECT request_id" dan "SELECT log
// harian" sama-sama FROM "Log_Absen", jadi pencocokan berbasis nama tabel saja
// diam-diam membuat salah satu membaca yang lain.
const stub = { ins: [], reqId: [], jam: [], lokasi: [], pegawai: [] };

function defaultQuery(text) {
  if (/INSERT INTO/i.test(text)) return { rows: stub.ins };
  if (/request_id = \$1/i.test(text)) return { rows: stub.reqId };
  if (/"NIP" = \$1 AND "Tanggal"/i.test(text)) return { rows: stub.log };
  if (/FROM "jam_absen"/i.test(text)) return { rows: stub.jam };
  if (/FROM "lokasiabsen"/i.test(text)) return { rows: stub.lokasi };
  if (/FROM "user_list"/i.test(text)) return { rows: stub.pegawai };
  return { rows: [] };
}

const pegawaiDefault = () => ({
  id: SESSION.id,
  username: 'budi',
  NIP: SESSION.nip,
  Jabatan: 'Staff',
  Status: 'AKTIF',
  bidang: 'Umum',
  pangkat: 'III/a',
  instansi_id: SESSION.instansi_id,
});

const jamDefault = () => ({ key: 'jam_absen_global', instansi_id: SESSION.instansi_id, masuk: '07:15', pulang: '14:30' });

const lokasiDefault = () => ({
  Nama_Lokasi: 'KANTOR',
  latitude: -9.91234,
  longitude: 121.51234,
  hari: 'senin',
  radius: 30,
  ip_range: '',
  instansi_id: SESSION.instansi_id,
});

const GOOD_BODY = {
  init_data: 'query_id=AAH&user=%7B%22id%22%3A42%7D',
  request_id: 'req-1',
  latitude: -9.9124,
  longitude: 121.5124,
  horizontal_accuracy: 5,
};

function harness({ auth = true, query, verify, at = NOW, session = SESSION } = {}) {
  const sql = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  if (auth) {
    app.use('/api/absen', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }));
  }
  app.use('/api/absen', createAbsenRouter({
    query: async (text, params) => {
      sql.push({ text, params });
      return query ? query(text, params) : defaultQuery(text);
    },
    verifyInitData: async (initData) => {
      if (verify) return verify(initData);
      return initData === GOOD_BODY.init_data ? { ok: true, user: { id: 42 } } : { ok: false, reason: 'bad_signature' };
    },
    botToken: 'test-bot-token',
    // Fungsi, bukan Date: router mengambil waktu sekali per request supaya tanggal
    // dan jam tidak bisa berbeda bila request melewati tengah malam.
    now: () => at,
  }));
  return { app, sql };
}

async function post(h, body, { auth = true } = {}) {
  const server = await new Promise((resolve) => {
    const s = h.app.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/absen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
}

const inserts = (sql) => sql.filter((s) => /INSERT INTO/i.test(s.text));

test.beforeEach(() => {
  stub.ins = [{ 'ID_Log': 1, Lokasi: 'KANTOR' }];
  stub.reqId = [];
  stub.log = [];
  stub.jam = [jamDefault()];
  stub.lokasi = [lokasiDefault()];
  stub.pegawai = [pegawaiDefault()];
});

// --- kontrak respons & jalur sukses -------------------------------------------

test('absen valid: insert memakai tanggal+jam server dan balas is_valid true', async () => {
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(r.body.validasi.nama_lokasi, 'KANTOR');
  assert.equal(inserts(h.sql).length, 1);

  const params = inserts(h.sql)[0].params;
  assert.ok(params.includes(TANGGAL), `params harus memuat tanggal server ${TANGGAL}, dapat: ${JSON.stringify(params)}`);
  assert.ok(params.includes(JAM), `params harus memuat jam server ${JAM}, dapat: ${JSON.stringify(params)}`);
});

test('identitas diambil dari sesi, bukan body.nip', async () => {
  const h = harness();
  await post(h, { ...GOOD_BODY, nip: '999999999999999999' });

  const params = inserts(h.sql)[0].params;
  assert.ok(params.includes(SESSION.nip), `insert harus memakai NIP sesi, dapat: ${JSON.stringify(params)}`);
  assert.ok(!params.includes('999999999999999999'), `NIP dari body tidak boleh bocor ke log, dapat: ${JSON.stringify(params)}`);
});

test('query pegawai memakai primary key id, bukan NIP', async () => {
  const h = harness();
  await post(h, GOOD_BODY);

  const peg = h.sql.find((s) => /FROM "user_list"/i.test(s.text));
  assert.match(peg.text, /WHERE id = \$1::bigint/);
  assert.ok(!/"NIP" =/.test(peg.text), 'lookup pegawai tidak boleh berdasarkan NIP');
  assert.deepEqual(peg.params, [SESSION.id]);
});

test('tanggal_iso dan jam dari body diabaikan sepenuhnya', async () => {
  const h = harness();
  await post(h, { ...GOOD_BODY, tanggal_iso: '1999-01-01', jam: '23:59' });

  const params = inserts(h.sql)[0].params;
  assert.ok(!params.includes('1999-01-01'), 'tanggal client tidak boleh dipakai');
  assert.ok(!params.includes('23:59'), 'jam client tidak boleh dipakai');
});

// --- autentikasi & otorisasi --------------------------------------------------

test('tanpa token sesi ditolak 401', async () => {
  const h = harness();
  assert.equal((await post(h, GOOD_BODY, { auth: false })).status, 401);
});

test('init_data tidak valid ditolak 401', async () => {
  const h = harness();
  const r = await post(h, { ...GOOD_BODY, init_data: 'user=%7B%22id%22%3A999%7D' });
  assert.equal(r.status, 401);
});

test('init_data milik user lain ditolak 403', async () => {
  const h = harness({ verify: async () => ({ ok: true, user: { id: 777 } }) });
  const r = await post(h, GOOD_BODY);
  assert.equal(r.status, 403);
  assert.equal(inserts(h.sql).length, 0, 'impersonasi tidak boleh menulis log');
});

test('absen web/NIP (source telegram_x_fallback tanpa init_data) diterima dari sesi valid', async () => {
  const h = harness();
  // verify dipaksa gagal: kalau fallback tetap memanggil verifier, request ini
  // harusnya 401. Harus 200 = bukti jalur fallback TIDAK memverifikasi init_data.
  const r = await post(h, {
    ...GOOD_BODY,
    init_data: '',
    source: 'telegram_x_fallback',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(inserts(h.sql).length, 1);
});

test('absen source telegram_x_fallback TAPI init_data diisi tetap diverifikasi', async () => {
  const h = harness({ verify: async () => ({ ok: true, user: { id: 777 } }) });
  const r = await post(h, { ...GOOD_BODY, source: 'telegram_x_fallback' });
  assert.equal(r.status, 403, 'init_data hadir berarti jalur Telegram, bukan fallback web');
});

test('absen tanpa init_data dan tanpa source fallback ditolak 401', async () => {
  const h = harness();
  const r = await post(h, { ...GOOD_BODY, init_data: '' });
  assert.equal(r.status, 401);
});

test('pegawai tidak ditemukan ditolak 403', async () => {
  stub.pegawai = [];
  const h = harness();
  assert.equal((await post(h, GOOD_BODY)).status, 403);
});

test('pegawai yang terduplikasi ditolak 403, bukan memilih salah satu', async () => {
  stub.pegawai = [pegawaiDefault(), pegawaiDefault()];
  const h = harness();
  assert.equal((await post(h, GOOD_BODY)).status, 403);
  assert.equal(inserts(h.sql).length, 0);
});

// --- idempotensi --------------------------------------------------------------

test('request_id yang sudah ada dibalas idempoten tanpa insert', async () => {
  stub.reqId = [{ '?column?': 1 }];
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.validasi, undefined, 'request ulang tidak boleh mengembalikan balasan baru');
  assert.equal(inserts(h.sql).length, 0, 'request_id ganda tidak boleh insert');
});

test('request_id kosong ditolak 400', async () => {
  const h = harness();
  assert.equal((await post(h, { ...GOOD_BODY, request_id: '' })).status, 400);
});

test('ON CONFLICT DO NOTHING: insert 0 baris tetap 200 idempoten', async () => {
  stub.ins = [];
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, true, 'balon konfliken = request sudah tercatat');
});

test('INSERT memakai ON CONFLICT (request_id) DO NOTHING', async () => {
  const h = harness();
  await post(h, GOOD_BODY);
  assert.match(inserts(h.sql)[0].text, /ON CONFLICT \("request_id"\) DO NOTHING/i);
});

// --- gate bisnis (dari node Validasi Absen) -----------------------------------

test('gate DUPLIKAT_ABSEN memakai jam server, bukan jam client', async () => {
  // Jam log = 07:10 = jam server. body.jam diset jauh berbeda supaya terlihat
  // gate ini mengabaikan klien: kalau body.jam dipakai (12:00), selisihnya
  // 110 menit dan gate ini tidak akan menyala.
  stub.log = [{ ID: SESSION.id, Tanggal: TANGGAL, Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  const h = harness();
  const r = await post(h, { ...GOOD_BODY, jam: '12:00' });

  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, false);
  assert.equal(r.body.validasi.kode_tolak, 'DUPLIKAT_ABSEN');
  assert.equal(inserts(h.sql).length, 0);
});

test('gate SUDAH_ADA_KETERANGAN menolak saat hari ini sudah ada IZIN', async () => {
  stub.log = [{ ID: SESSION.id, Tanggal: TANGGAL, Jam: '06:00', 'Jenis Absen': 'IZIN' }];
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.body.validasi.kode_tolak, 'SUDAH_ADA_KETERANGAN');
  assert.match(r.body.validasi.keterangan, /IZIN/);
});

test('gate SUDAH_ABSEN menolak absen masuk kedua', async () => {
  stub.log = [{ ID: SESSION.id, Tanggal: TANGGAL, Jam: '06:00', 'Jenis Absen': 'MASUK' }];
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.body.validasi.kode_tolak, 'SUDAH_ABSEN');
});

test('gate BELUM_MASUK menolak pulang tanpa absen masuk', async () => {
  const h = harness({ at: new Date('2026-10-05T07:30:00Z') }); // WITA 15:30 -> PULANG
  const r = await post(h, GOOD_BODY);

  assert.equal(r.body.validasi.kode_tolak, 'BELUM_MASUK');
});

test('log milik Telegram id lain tidak ikut terhitung', async () => {
  // ID berbeda = milik orang lain. Bila ikut terhitung, jam 07:10 akan memicu
  // DUPLIKAT dan request sah ini ditolak.
  stub.log = [{ ID: '999', Tanggal: TANGGAL, Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.body.validasi.is_valid, true);
});

// --- gate IP: dari req.ip, bukan body.clientIp --------------------------------

test('gate IP memakai req.ip dan mengabaikan clientIp dari body', async () => {
  // ip_range hanya memuat loopback. Kalau router memakai body.clientIp =
  // '1.2.3.4' (node "Cek Validasi Absen" lama), gate ini akan menolak. Lolos
  // berarti IP benar-benar berasal dari req.ip.
  //
  // ::ffff:127.0.0.1 harus dinormalisasi router menjadi 127.0.0.1 lebih dulu;
  // tanpa itu tidak ada range IPv4 pun yang cocok untuk klien IPv4.
  stub.lokasi = [{ ...lokasiDefault(), ip_range: '127.0.0.0/8' }];
  const h = harness();
  const r = await post(h, { ...GOOD_BODY, clientIp: '1.2.3.4' });

  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, true, 'clientIp body tidak boleh dipakai sebagai IP pemanggil');
});

test('gate IP menolak req.ip di luar ip_range lokasi', async () => {
  stub.lokasi = [{ ...lokasiDefault(), ip_range: '10.0.0.0/8' }];
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.body.validasi.is_valid, false);
  assert.equal(r.body.validasi.kode_tolak, 'IP_TIDAK_VALID');
});

// --- operand SQL harus terparameterisasi ---------------------------------------

test('nilai client masuk lewat parameter, bukan disisipkan ke teks SQL', async () => {
  // Vektor nyata adalah keterangan: teks bebas tanpa batas charset, jadi ia
  // sampai ke DB. request_id dibatasi router, jadi marker ditaruh di keterangan
  // agar jalur ini benar-benar dieksekusi, bukan ditolak di awal.
  const marker = `'; DROP TABLE "user_list"; --`;
  const h = harness();
  await post(h, { ...GOOD_BODY, request_id: 'req-inject-1', keterangan: marker });

  assert.equal(inserts(h.sql).length, 1, 'permintaan harus sampai ke insert, bukan ditolak validasi');
  for (const s of h.sql) {
    assert.ok(!s.text.includes('DROP TABLE'), `SQL memuat nilai client: ${s.text}`);
  }
  assert.ok(inserts(h.sql)[0].params.includes(marker), 'keterangan harus lewat parameter');
});

// --- evaluateGates (murni) ----------------------------------------------------

const basis = (rows) => ({ jenisAbsen: 'MASUK', serverTime: { jam: JAM }, tanggal: TANGGAL, employeeId: SESSION.id, rows });

test('evaluateGates: lolos saat tidak ada baris hari ini', () => {
  assert.equal(evaluateGates(basis([])), null);
});

test('evaluateGates: DUPLIKAT hanya dalam toleransi 1 menit', () => {
  // jenisAbsen PULANG + baris MASUK: supaya yang diuji hanya toleransi DUPLIKAT,
  // bukan gate SUDAH_ABSEN yang juga akan menyala bila barisnya MASUK.
  const p = { jenisAbsen: 'PULANG', serverTime: { jam: JAM }, tanggal: TANGGAL, employeeId: SESSION.id };
  const row = (Jam) => [{ ID: SESSION.id, Tanggal: TANGGAL, Jam, 'Jenis Absen': 'MASUK' }];

  assert.equal(evaluateGates({ ...p, rows: row('07:11') }).kodeTolak, 'DUPLIKAT_ABSEN', 'selisih 1 menit masih duplikat');
  assert.equal(evaluateGates({ ...p, rows: row('07:12') }), null, 'selisih 2 menit bukan duplikat');
});

test('evaluateGates: KONTROL tidak memicu BELUM_MASUK', () => {
  assert.equal(evaluateGates({ ...basis([]), jenisAbsen: 'KONTROL' }), null);
});

test('evaluateGates: PULANG tanpa MASUK ditolak', () => {
  assert.equal(evaluateGates({ ...basis([]), jenisAbsen: 'PULANG' }).kodeTolak, 'BELUM_MASUK');
});

test('evaluateGates: baris tanggal lain tidak ikut terhitung', () => {
  const rows = [{ ID: SESSION.id, Tanggal: '2026-10-04', Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  assert.equal(evaluateGates(basis(rows)), null);
});

test('evaluateGates: baris milik ID lain tidak ikut terhitung', () => {
  const rows = [{ ID: '999', Tanggal: TANGGAL, Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  assert.equal(evaluateGates(basis(rows)), null);
});