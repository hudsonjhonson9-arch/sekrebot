import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAbsen, analisisRiwayatLokasi } from './absen-validate.js';

const EMP = { nip: '12345', role: 'USER', instansi_id: 'bapperida' };

// Bentuk baris sesuai schema asli: lokasiabsen + jam_absen.
const KANTOR = {
  id: '1', Nama_Lokasi: 'Kantor Bapperida',
  latitude: -9.6000, longitude: 120.1000,
  hari: 'senin,selasa,rabu,kamis,jumat',
  radius: '30', ip_range: '', instansi_id: 'bapperida',
};

// WFH adalah BARIS LOKASI bernama 'WFH', bukan flag di body.
const WFH = {
  id: '2', Nama_Lokasi: 'WFH',
  latitude: -9.6000, longitude: 120.1000,
  hari: 'senin,selasa,rabu,kamis,jumat',
  radius: '30', ip_range: '10.0.0.0/8', instansi_id: 'bapperida',
};

const FA = { // fakta server, sudah di-shape router
  penugasanHariIni: true,
  serverTime: { tanggal: '2026-10-05', jam: '07:10:00' }, // Senin
  hariIni: 'senin',
  jamMasuk: '7:15',
  jamPulang: '14:30',
  lokasi: [KANTOR],
};

// ~7,8 m dari pusat KANTOR, radius 30 m.
const base = {
  nip: '12345',
  latitude: -9.60005,
  longitude: 120.10005,
  accuracy: 5,
  clientIp: '10.1.2.3',
  keterangan: '',
};

const run = (payload, settings = FA, employee = EMP) =>
  validateAbsen({
    payload: { ...base, ...payload },
    serverTime: settings.serverTime,
    employee,
    settings,
  });

const jam = (h, settings = FA) => ({ ...settings, serverTime: { tanggal: '2026-10-05', jam: h } });

// ── PULANG LUAR: parity dengan n8n (baris 246-249) — tanpa cek GPS ──

test('PULANG LUAR: skip_radius_check=true lolos walau koordinat jauh', () => {
  const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true, latitude: -9.9, longitude: 121.5, keterangan: 'Tugas lapangan' });
  assert.equal(r.ok, true);
  assert.equal(r.jenisAbsen, 'PULANG LUAR');
  assert.equal(r.namaLokasi, 'Lapangan');
});

// Parity n8n baris 248: terima('PULANG LUAR', 'Lapangan', body.keterangan || 'Pulang dari
// lapangan'). Canonical tidak menolak PULANG LUAR tanpa keterangan, dia meng-default-nya.
// Versi lama test ini mengunci sebaliknya dan menolak absen lapangan yang tidak mengetik catatan.
test('PULANG LUAR tanpa keterangan tetap lolos dan default ke "Pulang dari lapangan"', () => {
  const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true, keterangan: '  ' });
  assert.equal(r.ok, true);
  assert.equal(r.jenisAbsen, 'PULANG LUAR');
  assert.equal(r.namaLokasi, 'Lapangan');
  assert.equal(r.keterangan, 'Pulang dari lapangan');
});

// skip_radius_check dikirim klien; radius hanya boleh dilewati kalau server
// mencatat penugasan hari ini (settings.penugasanHariIni, fail-closed).
test('PULANG LUAR tanpa penugasan hari ini ditolak walau skip_radius_check=true', () => {
  const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true, latitude: -9.9, longitude: 121.5 },
    { ...FA, penugasanHariIni: false });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'PULANG_LUAR_TANPA_PENUGASAN');
});

test('PULANG LUAR: penugasanHariIni tidak diisi dianggap tidak ada (fail-closed)', () => {
  const { penugasanHariIni, ...tanpa } = FA; // eslint-disable-line no-unused-vars
  const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true }, tanpa);
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'PULANG_LUAR_TANPA_PENUGASAN');
});

test('PULANG LUAR: nilai truthy selain true (mis. "true") tidak cukup', () => {
  const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true }, { ...FA, penugasanHariIni: 'true' });
  assert.equal(r.ok, false);
});

test('PULANG LUAR: wajibPenugasan=false (mode tandai) diterima dengan peringatan', () => {
  const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true, latitude: -9.9, longitude: 121.5 },
    { ...FA, penugasanHariIni: false, wajibPenugasan: false });
  assert.equal(r.ok, true);
  assert.equal(r.jenisAbsen, 'PULANG LUAR');
  assert.deepEqual(r.peringatan, ['PULANG_LUAR_TANPA_PENUGASAN']);
});

test('PULANG LUAR: dengan penugasan tidak ada peringatan di kedua mode', () => {
  for (const wajibPenugasan of [true, false]) {
    const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true }, { ...FA, penugasanHariIni: true, wajibPenugasan });
    assert.equal(r.ok, true);
    assert.equal(r.peringatan, undefined);
  }
});

test('wajibPenugasan hanya false persis yang melonggarkan (nilai lain tetap wajib)', () => {
  for (const wajibPenugasan of [undefined, null, 0, '', 'false']) {
    const r = run({ jenis_absen: 'PULANG LUAR', skip_radius_check: true }, { ...FA, penugasanHariIni: false, wajibPenugasan });
    assert.equal(r.ok, false, `wajibPenugasan=${JSON.stringify(wajibPenugasan)} harus tetap menolak`);
  }
});

test('absen biasa tidak butuh penugasan', () => {
  assert.equal(run({}, { ...FA, penugasanHariIni: false }).ok, true);
});

test('PULANG LUAR tanpa skip_radius_check bukan jenis khusus, dihitung dari jam', () => {
  const r = run({ jenis_absen: 'PULANG LUAR', keterangan: 'Lapangan' });
  assert.equal(r.jenisAbsen, 'MASUK');
});

// ── Radius ──

test('radius dipakai dari kolom radius, bukan default', () => {
  // radius 30 m: koordinat ~44 m dari pusat harus ditolak.
  const r = run({ latitude: -9.6004, longitude: 120.1000 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_TIDAK_VALID');
});

test('koordinat tepat di dalam radius diterima', () => {
  assert.equal(run({}).ok, true);
});

// ── Accuracy buffer (paritas n8n "Validasi Absen": radius + min(accuracy, 50)) ──

test('accuracy buffer: koordinat ~44 m lolos saat accuracy 50', () => {
  // Regresi port native: tanpa buffer, radius 30 m menolak pegawai yang
  // berdiri di kantor saat GPS indoor error puluhan meter.
  const r = run({ latitude: -9.6004, longitude: 120.1000, accuracy: 50 });
  assert.equal(r.ok, true);
});

test('accuracy buffer dibatasi 50 m: accuracy 400 tidak meloloskan jarak ~100 m', () => {
  const r = run({ latitude: -9.6009, longitude: 120.1000, accuracy: 400 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_TIDAK_VALID');
});

test('penolakan radius menyertakan diag jarak/akurasi untuk log audit', () => {
  const r = run({ latitude: -9.6004, longitude: 120.1000, accuracy: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_TIDAK_VALID');
  assert.ok(r.diag, 'tolak LOKASI_TIDAK_VALID wajib membawa diag');
  assert.ok(r.diag.jarak_m >= 40 && r.diag.jarak_m <= 48, `jarak ~44 m, dapat ${r.diag.jarak_m}`);
  assert.equal(r.diag.radius_m, 30);
  assert.equal(r.diag.toleransi_m, 5);
  assert.equal(r.diag.pin, 'Kantor Bapperida');
});

// ── Meja Absen (T3): nilai token divalidasi, bukan hanya keberadaan ──

test('meja_token salah ditolak', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['BENAR'] });
  const r = run({ source: 'meja_absen', meja_token: 'SALAH' });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'MEJA_TOKEN_INVALID');
});

test('meja_token benar diterima dan menghitung jenisAbsen dari jam dalam radius kantor', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['BENAR'] });
  const r = run({ source: 'meja_absen', meja_token: 'BENAR' });
  assert.equal(r.ok, true);
  assert.equal(r.jenisAbsen, 'MASUK');
  assert.equal(r.namaLokasi, 'Kantor Bapperida');
});

test('Meja Absen: jam sore menghasilkan jenisAbsen PULANG', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['BENAR'] });
  const r = run({ source: 'meja_absen', meja_token: 'BENAR' }, jam('15:00:00'));
  assert.equal(r.ok, true);
  assert.equal(r.jenisAbsen, 'PULANG');
});

test('Meja Absen tanpa koordinat valid ditolak LOKASI_INVALID', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['BENAR'] });
  const r = run({ source: 'meja_absen', meja_token: 'BENAR', latitude: 'abc', accuracy: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_INVALID');
});

test('Meja Absen di luar radius ditolak LOKASI_TIDAK_VALID', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['BENAR'] });
  const r = run({ source: 'meja_absen', meja_token: 'BENAR', latitude: -9.8, longitude: 120.5 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_TIDAK_VALID');
});

// ── Hari kerja ──

test('hari di luar lokasiabsen.hari ditolak', () => {
  const r = run({}, jam('07:10:00', { ...FA, hariIni: 'sabtu' }));
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'BUKAN_HARI_KERJA');
});

test('lokasi dengan hari kosong berlaku setiap hari', () => {
  const r = run({}, jam('07:10:00', { ...FA, hariIni: 'sabtu', lokasi: [{ ...KANTOR, hari: '' }] }));
  assert.equal(r.ok, true);
});

// ── WFH: baris lokasi, bebas radius & IP, hari tetap wajib ──

test('WFH: baris lokasi WFH bebas radius dan IP', () => {
  const r = run(
    { latitude: -6.2088, longitude: 106.8456, clientIp: '203.0.113.9' }, // Jakarta, IP asing
    { ...FA, lokasi: [WFH] },
  );
  assert.equal(r.ok, true);
  assert.equal(r.namaLokasi, 'WFH');
});

test('WFH: hari kerja tetap wajib berlaku', () => {
  const r = run({}, jam('07:10:00', { ...FA, hariIni: 'sabtu', lokasi: [WFH] }));
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'BUKAN_HARI_KERJA');
});

test('payload.wfh tanpa baris lokasi WFH tidak melewati radius', () => {
  const r = run({ wfh: true, latitude: -9.9, longitude: 121.5 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_TIDAK_VALID');
});

// ── KONTROL ──

test('KONTROL diprioritaskan dari client dan tidak butuh keterangan', () => {
  const r = run({ jenis_absen: 'KONTROL' });
  assert.equal(r.ok, true);
  assert.equal(r.jenisAbsen, 'KONTROL');
});

// ── IP range (hanya bila lokasi punya ip_range) ──

test('ip_range terisi dan IP asing ditolak', () => {
  const r = run({ clientIp: '203.0.113.9' }, { ...FA, lokasi: [{ ...KANTOR, ip_range: '10.0.0.0/8' }] });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'IP_TIDAK_VALID');
});

test('ip_range terisi dan IP benar diterima', () => {
  const r = run({ clientIp: '10.1.2.3' }, { ...FA, lokasi: [{ ...KANTOR, ip_range: '10.0.0.0/8' }] });
  assert.equal(r.ok, true);
});

test('ip_range menerima IP persis tanpa prefix', () => {
  const r = run({ clientIp: '10.1.2.3' }, { ...FA, lokasi: [{ ...KANTOR, ip_range: '10.1.2.3' }] });
  assert.equal(r.ok, true);
});

// ── Identitas & koordinat ──

test('NIP kosong ditolak', () => {
  assert.equal(run({}, FA, { nip: '', instansi_id: 'bapperida' }).kodeTolak, 'NIP_REQUIRED');
});

test('pegawai NONAKTIF ditolak', () => {
  const r = run({}, FA, { ...EMP, status: 'NONAKTIF' });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'PEGAWAI_NONAKTIF');
});

test('koordinat bukan angka ditolak, tidak throw', () => {
  const r = run({ latitude: 'abc' });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_INVALID');
});

test('koordinat 0,0 ditolak', () => {
  const r = run({ latitude: 0, longitude: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'LOKASI_INVALID');
});

// ── Anti-fake GPS (parity n8n baris 174-184) ──

test('accuracy 0 ditolak sebagai GPS palsu', () => {
  const r = run({ accuracy: 0 });
  assert.equal(r.kodeTolak, 'GPS_ACCURACY_ZERO');
});

test('accuracy > 500m ditolak sebagai sinyal lemah', () => {
  const r = run({ accuracy: 600 });
  assert.equal(r.kodeTolak, 'GPS_WEAK');
});

test('accuracy < 3m tanpa altitude ditolak sebagai terlalu sempurna', () => {
  const r = run({ accuracy: 1.5 });
  assert.equal(r.kodeTolak, 'GPS_ACCURACY_TOO_PERFECT');
});

test('accuracy < 3m dengan altitude diterima', () => {
  const r = run({ accuracy: 1.5, gps_fingerprint: { has_altitude: true } });
  assert.equal(r.ok, true);
});

test('profil GPS kosong semua ditolak saat accuracy kecil', () => {
  const r = run({
    accuracy: 8,
    gps_fingerprint: { has_altitude: false, has_altitude_acc: false, has_heading: false, has_speed: false },
  });
  assert.equal(r.kodeTolak, 'GPS_FAKE_FINGERPRINT');
});

// ── T2: jenis absen dari jam server, empat pita ──

test('sebelum jam masuk dihitung MASUK', () => {
  assert.equal(run({}, jam('06:00:00')).jenisAbsen, 'MASUK');
});

test('tepat jam masuk masih MASUK', () => {
  assert.equal(run({}, jam('07:15:00')).jenisAbsen, 'MASUK');
});

test('antara jam masuk dan tengah hari dihitung DI LUAR JAM MASUK', () => {
  assert.equal(run({}, jam('09:00:00')).jenisAbsen, 'DI LUAR JAM MASUK');
});

test('tepat tengah hari (12:00) masih DI LUAR JAM MASUK', () => {
  assert.equal(run({}, jam('12:00:00')).jenisAbsen, 'DI LUAR JAM MASUK');
});

test('setelah tengah hari sebelum jam pulang dihitung DI LUAR JAM PULANG', () => {
  assert.equal(run({}, jam('13:00:00')).jenisAbsen, 'DI LUAR JAM PULANG');
});

test('tepat jam pulang dihitung PULANG', () => {
  assert.equal(run({}, jam('14:30:00')).jenisAbsen, 'PULANG');
});

test('setelah jam pulang dihitung PULANG', () => {
  assert.equal(run({}, jam('15:00:00')).jenisAbsen, 'PULANG');
});

test('jam client tidak pernah memengaruhi jenis absen', () => {
  const r = run({ jam: '23:59', jenis_absen: 'PULANG' }, jam('06:00:00'));
  assert.equal(r.jenisAbsen, 'MASUK');
});

// ── Keterangan wajib untuk jenis khusus ──

test('IZIN wajib keterangan', () => {
  const r = run({ jenis_absen: 'IZIN', keterangan: '  ' });
  assert.equal(r.ok, false);
  assert.equal(r.kodeTolak, 'KETERANGAN_WAJIB');
});

// ── analisisRiwayatLokasi: teleport & koordinat identik dari Log_Absen ──

const ST = { tanggal: '2026-10-05', jam: '07:10:00' };
// 1 derajat lintang ~ 111,2 km.
const LAT = -9.6;
const LNG = 120.1;
const rw = (tanggal, jam, lat = LAT, lng = LNG) => ({ Tanggal: tanggal, Jam: jam, koordinat: `${lat},${lng}` });
const cek = (riwayat, extra = {}) => analisisRiwayatLokasi({ lat: LAT, lng: LNG, serverTime: ST, riwayat, ...extra });

test('riwayat: tanpa riwayat tidak ada flag', () => {
  assert.deepEqual(cek([]), { flags: [], teleport: null, blok: false });
});

test('riwayat: pindah 111 km dalam 10 menit ditandai TELEPORT', () => {
  const r = cek([rw('2026-10-05', '07:00', LAT + 1)]);
  assert.equal(r.flags.length, 1);
  assert.match(r.flags[0], /^TELEPORT_\d+kmh_\d+m$/);
  assert.ok(r.teleport.kmh > 600);
  assert.equal(r.blok, false, 'tanpa blokKmh hanya menandai');
});

test('riwayat: blokKmh menolak bila kecepatan melewati ambang', () => {
  assert.equal(cek([rw('2026-10-05', '07:00', LAT + 1)], { blokKmh: 500 }).blok, true);
  assert.equal(cek([rw('2026-10-05', '07:00', LAT + 1)], { blokKmh: 5000 }).blok, false);
});

test('riwayat: pesawat 300 km dalam 1 jam ditandai tapi tidak diblok pada ambang 900', () => {
  const r = cek([rw('2026-10-05', '06:10', LAT + 2.7)], { blokKmh: 900 });
  assert.ok(r.teleport.kmh > 200 && r.teleport.kmh < 400);
  assert.equal(r.blok, false);
  assert.equal(r.flags.length, 1);
});

test('riwayat: selisih kecil (< 5 km) bukan teleport meski waktunya sangat dekat', () => {
  // ~2,2 km dalam 1 menit = 133 km/j secara hitungan, tapi jitter GPS/jaringan.
  const r = cek([rw('2026-10-05', '07:09', LAT + 0.02)]);
  assert.deepEqual(r.flags, []);
  assert.equal(r.teleport, null);
});

test('riwayat: perjalanan wajar (60 km dalam 3 jam) tidak ditandai', () => {
  assert.deepEqual(cek([rw('2026-10-04', '16:10', LAT + 0.54)]).flags, []);
});

test('riwayat: lintas hari dihitung dengan benar (kemarin 16:00 ke hari ini 07:10)', () => {
  const r = cek([rw('2026-10-04', '16:00', LAT + 1)]); // 111 km dalam ~15 jam = 7 km/j
  assert.deepEqual(r.flags, []);
});

test('riwayat: koordinat identik 3x ditandai, 2x tidak', () => {
  const sama = (j) => rw('2026-10-05', j);
  assert.deepEqual(cek([sama('07:00'), sama('06:00')]).flags, []);
  assert.deepEqual(cek([sama('07:00'), sama('06:00'), sama('05:00')]).flags, ['KOORDINAT_IDENTIK_3x']);
});

test('riwayat: baris rusak, kosong, atau di masa depan diabaikan', () => {
  const r = cek([
    { Tanggal: '2026-10-05', Jam: '07:00', koordinat: '' },
    { Tanggal: '2026-10-05', Jam: '07:00', koordinat: 'abc' },
    { Tanggal: '2026-10-05', Jam: '07:00', koordinat: '0,0' },
    { Tanggal: 'bukan-tanggal', Jam: '07:00', koordinat: `${LAT + 1},${LNG}` },
    rw('2026-10-06', '07:00', LAT + 1), // setelah serverTime
  ]);
  assert.deepEqual(r, { flags: [], teleport: null, blok: false });
});

test('riwayat: lat/lng saat ini tidak valid tidak melempar error', () => {
  const r = analisisRiwayatLokasi({ lat: NaN, lng: LNG, serverTime: ST, riwayat: [rw('2026-10-05', '07:00')] });
  assert.deepEqual(r.flags, []);
});
