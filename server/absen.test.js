import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

// Import di atas file, bukan di dalam harness(): harness() dipanggil sinkron di
// setiap test, jadi import harus selesai sebelum test pertama jalan.
const { createAbsenRouter, formatAbsenMessage } = await import('./absen.js');
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
const stub = { ins: [], reqId: [], jam: [], lokasi: [], pegawai: [], penugasan: [], riwayat: [] };

function defaultQuery(text) {
  if (/INSERT INTO/i.test(text)) return { rows: stub.ins };
  if (/FROM penugasan/i.test(text)) return { rows: stub.penugasan };
  if (/koordinat IS NOT NULL/i.test(text)) return { rows: stub.riwayat };
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

function harness({ auth = true, query, verify, at = NOW, session = SESSION, notifyAbsen, teleportBlokKmh, pulangLuarWajibPenugasan } = {}) {
  const sql = [];
  const notifyCalls = [];
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
    // Spy default: test tidak boleh menembak api.telegram.org. Fungsi capture
    // dipanggil sinkron saat router memanggil notify, jadi tak perlu di-await.
    notifyAbsen: notifyAbsen || (async (msg) => { notifyCalls.push(msg); }),
    // Fungsi, bukan Date: router mengambil waktu sekali per request supaya tanggal
    // dan jam tidak bisa berbeda bila request melewati tengah malam.
    now: () => at,
    teleportBlokKmh,
    pulangLuarWajibPenugasan,
  }));
  return { app, sql, notifyCalls };
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
  stub.penugasan = [];
  stub.riwayat = [];
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

test('evaluateGates: bila sudah ada MASUK dan PULANG hari ini, ditolak SUDAH_ABSEN (kehadiran lengkap)', () => {
  const rows = [
    { ID: SESSION.id, Tanggal: TANGGAL, Jam: '07:05', 'Jenis Absen': 'MASUK' },
    { ID: SESSION.id, Tanggal: TANGGAL, Jam: '14:35', 'Jenis Absen': 'PULANG' },
  ];
  const r = evaluateGates({ ...basis(rows), jenisAbsen: 'PULANG', serverTime: { jam: '15:00:00' } });
  assert.equal(r.kodeTolak, 'SUDAH_ABSEN');
  assert.match(r.keterangan, /lengkap/i);
});

test('evaluateGates: baris tanggal lain tidak ikut terhitung', () => {
  const rows = [{ ID: SESSION.id, Tanggal: '2026-10-04', Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  assert.equal(evaluateGates(basis(rows)), null);
});

test('evaluateGates: baris milik ID lain tidak ikut terhitung', () => {
  const rows = [{ ID: '999', Tanggal: TANGGAL, Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  assert.equal(evaluateGates(basis(rows)), null);
});

// --- konfirmasi Telegram setelah absen ----------------------------------------

test('formatAbsenMessage: memuat nama, NIP, lokasi, tanggal, jam, jenis', () => {
  const text = formatAbsenMessage({
    nama: 'Budi', nip: '123', jenisAbsen: 'MASUK', namaLokasi: 'KANTOR',
    tanggal: TANGGAL, jam: JAM, jamMasuk: '07:15', jamPulang: '14:30',
  });
  assert.match(text, /KONFIRMASI ABSENSI BERHASIL/);
  assert.match(text, /Budi/);
  assert.match(text, /123/);
  assert.match(text, /KANTOR/);
  assert.match(text, /2026-10-05/);
  assert.match(text, /07:10 WITA/);
  assert.match(text, /Masuk Tepat Waktu/);
});

test('formatAbsenMessage: terlambat menghitung selisih dari batas masuk', () => {
  const text = formatAbsenMessage({ jenisAbsen: 'DI LUAR JAM MASUK', jam: '08:25', jamMasuk: '08:00', jamPulang: '14:30' });
  assert.match(text, /TERLAMBAT/);
  assert.match(text, /Terlambat 25 menit/);
});

test('absen sukses mengirim konfirmasi ke chat id pegawai (user_list.id)', async () => {
  const h = harness();
  const r = await post(h, GOOD_BODY);

  assert.equal(r.status, 200);
  assert.equal(h.notifyCalls.length, 1);
  assert.equal(h.notifyCalls[0].chatId, SESSION.id);
  assert.match(h.notifyCalls[0].text, /KONFIRMASI ABSENSI BERHASIL/);
});

test('kegagalan kirim Telegram (id error) tidak menggagalkan absen', async () => {
  // chat id tanpa chat / bot diblokir -> sendMessage melempar; absen sudah
  // tercatat dan tetap harus 200.
  const h = harness({ notifyAbsen: async () => { throw new Error('chat not found'); } });
  const r = await post(h, GOOD_BODY);

  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, true);
});

test('absen yang ditolak gate tidak mengirim konfirmasi', async () => {
  stub.log = [{ ID: SESSION.id, Tanggal: TANGGAL, Jam: '07:10', 'Jenis Absen': 'MASUK' }];
  const h = harness();
  await post(h, GOOD_BODY);

  assert.equal(h.notifyCalls.length, 0);
});

// --- audit penolakan ----------------------------------------------------------
// Log_Absen hanya berisi absen sukses; tanpa baris [absen-tolak] ini frekuensi
// tiap kode_tolak (mis. LOKASI_TIDAK_VALID) mustahil dipantau dari log container.

test('penolakan radius ditulis ke log audit [absen-tolak] beserta jarak ke pin', async () => {
  const h = harness();
  const lines = [];
  const origWarn = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));
  let r;
  try {
    // Koordinat Jakarta: ~1000 km dari pin kantor, jauh melampaui radius+buffer.
    r = await post(h, { ...GOOD_BODY, latitude: -6.2088, longitude: 106.8456 });
  } finally {
    console.warn = origWarn;
  }

  assert.equal(r.status, 200);
  assert.equal(r.body.validasi.is_valid, false);
  assert.equal(r.body.validasi.kode_tolak, 'LOKASI_TIDAK_VALID');

  const line = lines.find((l) => l.startsWith('[absen-tolak]'));
  assert.ok(line, `log audit wajib ada, dapat: ${JSON.stringify(lines)}`);
  const entry = JSON.parse(line.replace(/^\[absen-tolak\]\s*/, ''));
  assert.equal(entry.kode, 'LOKASI_TIDAK_VALID');
  assert.equal(entry.nip, SESSION.nip);
  assert.equal(entry.user_id, SESSION.id);
  assert.equal(entry.tanggal, TANGGAL);
  assert.ok(entry.jam.startsWith(JAM), `jam server penuh, dapat ${entry.jam}`);
  assert.equal(entry.accuracy, 5);
  assert.equal(entry.pin, 'KANTOR');
  assert.equal(entry.radius_m, 30);
  assert.ok(entry.jarak_m > 1e6, `jarak ke pin harus ikut tercatat, dapat ${entry.jarak_m}m`);
});

test('penolakan gate juga ikut tercatat di log audit', async () => {
  // Jam 06:00 supaya tidak kena gate DUPLIKAT (±1 menit dari jam server 07:10).
  stub.log = [{ ID: SESSION.id, Tanggal: TANGGAL, Jam: '06:00', 'Jenis Absen': 'MASUK' }];
  const h = harness();
  const lines = [];
  const origWarn = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));
  try {
    await post(h, GOOD_BODY);
  } finally {
    console.warn = origWarn;
  }

  const line = lines.find((l) => l.startsWith('[absen-tolak]'));
  assert.ok(line, `log audit wajib ada, dapat: ${JSON.stringify(lines)}`);
  const entry = JSON.parse(line.replace(/^\[absen-tolak\]\s*/, ''));
  assert.equal(entry.kode, 'SUDAH_ABSEN');
  assert.equal(entry.nip, SESSION.nip);
});

test('absen sukses TIDAK menulis log [absen-tolak]', async () => {
  const h = harness();
  const lines = [];
  const origWarn = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));
  try {
    await post(h, GOOD_BODY);
  } finally {
    console.warn = origWarn;
  }
  assert.equal(lines.filter((l) => l.startsWith('[absen-tolak]')).length, 0);
});

// --- PULANG LUAR hanya untuk pegawai yang punya penugasan ---------------------

const PULANG_LUAR = {
  ...GOOD_BODY,
  request_id: 'req-pl',
  jenis_absen: 'PULANG LUAR',
  skip_radius_check: true,
  latitude: -9.5, // jauh dari kantor: radius memang dilewati
  longitude: 121.9,
};

const penugasanQ = (sql) => sql.filter((s) => /FROM penugasan/i.test(s.text));

test('PULANG LUAR tanpa penugasan hari ini ditolak (mode wajib), tidak ada insert', async () => {
  stub.penugasan = [];
  const h = harness({ at: new Date('2026-10-05T07:00:00Z'), pulangLuarWajibPenugasan: true }); // WITA 15:00, sesudah jam pulang
  const r = await post(h, PULANG_LUAR);

  assert.equal(r.body.validasi.is_valid, false);
  assert.equal(r.body.validasi.kode_tolak, 'PULANG_LUAR_TANPA_PENUGASAN');
  assert.equal(inserts(h.sql).length, 0);
});

test('PULANG LUAR dengan penugasan hari ini lolos; query memakai tanggal server + NIP sesi', async () => {
  stub.penugasan = [{ '?column?': 1 }];
  stub.log = [{ ID: SESSION.id, Tanggal: '2026-10-05', Jam: '07:00', 'Jenis Absen': 'MASUK' }];
  const h = harness({ at: new Date('2026-10-05T07:00:00Z'), pulangLuarWajibPenugasan: true });
  const r = await post(h, { ...PULANG_LUAR, nip: '999', tanggal_iso: '1999-01-01' });

  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(inserts(h.sql).length, 1);
  assert.deepEqual(penugasanQ(h.sql)[0].params, [SESSION.nip, '2026-10-05', SESSION.instansi_id]);
});

test('absen biasa tidak menyentuh tabel penugasan', async () => {
  const h = harness();
  await post(h, GOOD_BODY);
  assert.equal(penugasanQ(h.sql).length, 0);
});

test('skip_radius_check tanpa jenis_absen PULANG LUAR tidak membuka bypass', async () => {
  stub.penugasan = [{ '?column?': 1 }];
  const h = harness();
  const r = await post(h, { ...GOOD_BODY, request_id: 'req-x', skip_radius_check: true, latitude: -9.5, longitude: 121.9 });
  assert.equal(r.body.validasi.kode_tolak, 'LOKASI_TIDAK_VALID');
});

// --- analisis riwayat lokasi ---------------------------------------------------

async function withWarnSpy(fn) {
  const calls = [];
  const orig = console.warn;
  console.warn = (...a) => { calls.push(a); };
  try { return { result: await fn(), calls }; } finally { console.warn = orig; }
}

// ~111 km dari GOOD_BODY, 10 menit sebelum NOW (07:10 WITA).
const RIWAYAT_JAUH = { Tanggal: TANGGAL, Jam: '07:00', koordinat: '-8.9124,121.5124' };

test('teleport: absen tetap diterima (default hanya menandai) dan [absen-curiga] tercatat', async () => {
  stub.riwayat = [RIWAYAT_JAUH];
  const h = harness();
  const { result: r, calls } = await withWarnSpy(() => post(h, GOOD_BODY));

  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(inserts(h.sql).length, 1);
  const curiga = calls.find((c) => c[0] === '[absen-curiga]');
  assert.ok(curiga, 'harus ada log [absen-curiga]');
  const log = JSON.parse(curiga[1]);
  assert.equal(log.nip, SESSION.nip);
  assert.match(log.flags[0], /^TELEPORT_/);
  assert.equal(log.blok, false);
});

test('teleport: dengan teleportBlokKmh absen ditolak GPS_TELEPORT dan tidak diinsert', async () => {
  stub.riwayat = [RIWAYAT_JAUH];
  const h = harness({ teleportBlokKmh: 500 });
  const { result: r } = await withWarnSpy(() => post(h, GOOD_BODY));

  assert.equal(r.body.validasi.is_valid, false);
  assert.equal(r.body.validasi.kode_tolak, 'GPS_TELEPORT');
  assert.equal(inserts(h.sql).length, 0);
});

test('riwayat bersih: tidak ada log [absen-curiga]', async () => {
  stub.riwayat = [{ Tanggal: TANGGAL, Jam: '07:00', koordinat: '-9.9124,121.5124' }];
  const h = harness({ teleportBlokKmh: 500 });
  const { result: r, calls } = await withWarnSpy(() => post(h, GOOD_BODY));

  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(calls.filter((c) => c[0] === '[absen-curiga]').length, 0);
});

test('riwayat dibaca dari NIP sesi dengan batas 2 hari ke belakang', async () => {
  const h = harness();
  await post(h, GOOD_BODY);
  const q = h.sql.find((s) => /koordinat IS NOT NULL/i.test(s.text));
  assert.deepEqual(q.params, [SESSION.nip, '2026-10-03']);
});

test('query riwayat gagal tidak menggagalkan absen yang sudah valid', async () => {
  const h = harness({
    query: (text) => {
      if (/koordinat IS NOT NULL/i.test(text)) throw new Error('db down');
      return defaultQuery(text);
    },
  });
  const origErr = console.error;
  console.error = () => {};
  try {
    const r = await post(h, GOOD_BODY);
    assert.equal(r.body.validasi.is_valid, true);
    assert.equal(inserts(h.sql).length, 1);
  } finally { console.error = origErr; }
});

// Mode "tandai" (DEFAULT, untuk instansi yang belum memakai menu Penugasan/SPT):
// PULANG LUAR tetap diterima, tapi tercatat supaya terlihat siapa yang belum
// punya penugasan sebelum mode wajib dinyalakan.
test('PULANG LUAR tanpa penugasan, mode default (tandai): diterima dan dicatat [absen-curiga]', async () => {
  stub.penugasan = [];
  stub.log = [{ ID: SESSION.id, Tanggal: '2026-10-05', Jam: '07:00', 'Jenis Absen': 'MASUK' }];
  const h = harness({ at: new Date('2026-10-05T07:00:00Z') }); // tanpa opsi = default
  const { result: r, calls } = await withWarnSpy(() => post(h, PULANG_LUAR));

  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(inserts(h.sql).length, 1);
  const curiga = calls.find((c) => c[0] === '[absen-curiga]');
  assert.ok(curiga, 'harus ada log [absen-curiga]');
  const log = JSON.parse(curiga[1]);
  assert.deepEqual(log.flags, ['PULANG_LUAR_TANPA_PENUGASAN']);
  assert.equal(log.nip, SESSION.nip);
  assert.equal(log.jenis, 'PULANG LUAR');
});

test('mode tandai: dengan penugasan tidak ada log [absen-curiga]', async () => {
  stub.penugasan = [{ '?column?': 1 }];
  stub.log = [{ ID: SESSION.id, Tanggal: '2026-10-05', Jam: '07:00', 'Jenis Absen': 'MASUK' }];
  const h = harness({ at: new Date('2026-10-05T07:00:00Z'), pulangLuarWajibPenugasan: false });
  const { result: r, calls } = await withWarnSpy(() => post(h, PULANG_LUAR));

  assert.equal(r.body.validasi.is_valid, true);
  assert.equal(calls.filter((c) => c[0] === '[absen-curiga]').length, 0);
});

test('mode tandai: flag penugasan dan teleport digabung dalam satu log', async () => {
  stub.penugasan = [];
  // Sekarang 15:00 WITA; absen sebelumnya 14:50 dan ~111 km dari titik ini.
  stub.riwayat = [{ ...RIWAYAT_JAUH, Jam: '14:50' }];
  stub.log = [{ ID: SESSION.id, Tanggal: '2026-10-05', Jam: '06:00', 'Jenis Absen': 'MASUK' }];
  const h = harness({ at: new Date('2026-10-05T07:00:00Z') });
  const { calls } = await withWarnSpy(() => post(h, { ...PULANG_LUAR, latitude: -9.9124, longitude: 121.5124 }));

  const logs = calls.filter((c) => c[0] === '[absen-curiga]');
  assert.equal(logs.length, 1, 'satu baris log per absen');
  const flags = JSON.parse(logs[0][1]).flags;
  assert.ok(flags.includes('PULANG_LUAR_TANPA_PENUGASAN'));
  assert.ok(flags.some((f) => f.startsWith('TELEPORT_')));
});

test('mode tandai tidak membuka bypass lain: skip_radius_check tanpa PULANG LUAR tetap ditolak radius', async () => {
  const h = harness({ pulangLuarWajibPenugasan: false });
  const r = await post(h, { ...GOOD_BODY, request_id: 'req-y', skip_radius_check: true, latitude: -9.5, longitude: 121.9 });
  assert.equal(r.body.validasi.kode_tolak, 'LOKASI_TIDAK_VALID');
});

test('Meja Absen: admin mengirim source meja_absen dengan NIP pegawai tanpa init_data berhasil di-insert untuk pegawai tersebut', async () => {
  stub.ins = [{ id: 999 }];
  stub.reqId = [];
  stub.log = [];
  stub.jam = [{ masuk: '07:15', pulang: '14:30' }];
  stub.lokasi = [lokasiDefault()];
  stub.pegawai = [{
    id: '100',
    username: 'Ani Staff',
    NIP: '199505052020012001',
    Status: 'AKTIF',
    Jabatan: 'Staff',
    bidang: 'Sekretariat',
    pangkat: 'III/a',
    nomorhp: '08123456789',
    instansi_id: 'bapperida',
  }];
  const adminSession = { id: '1', nip: '19700101', role: 'ADMIN', is_admin: true, instansi_id: 'bapperida' };
  const h = harness({ session: adminSession });
  const r = await post(h, {
    request_id: 'meja-req-1',
    source: 'meja_absen',
    nip: '199505052020012001',
    latitude: -9.9124,
    longitude: 121.5124,
    horizontal_accuracy: 5,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.validasi?.is_valid, true);
  const ins = h.sql.find((s) => /INSERT INTO "Log_Absen"/i.test(s.text));
  assert.ok(ins, 'absen harus di-insert ke Log_Absen');
  assert.equal(ins.params[0], '100', 'ID pegawai di log harus ID milik pegawai yang di-scan, bukan ID admin');
  assert.equal(ins.params[1], 'Ani Staff');
  assert.equal(ins.params[2], '199505052020012001');
});
