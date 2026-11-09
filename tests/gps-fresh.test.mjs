import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const src = read('js/gps.js');

const T0 = 1_800_000_000_000;

// Muat js/gps.js dengan navigator palsu. watchPosition dikendalikan test:
// geo.emit(pos) / geo.emitErr(err) memicu callback yang didaftarkan.
function setup() {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  const geo = {
    watchCalls: [],
    cleared: [],
    onPos: null,
    onErr: null,
    watchPosition(ok, err, opts) {
      this.watchCalls.push(opts);
      this.onPos = ok;
      this.onErr = err;
      return 7;
    },
    clearWatch(id) { this.cleared.push(id); },
    emit(p) { this.onPos(p); },
    emitErr(e) { this.onErr(e); },
  };
  const factory = new Function('navigator', 'window', `${src}\n;return getFreshPosition;`);
  const getFreshPosition = factory({ geolocation: geo }, {});
  const res = { ok: [], err: [] };
  const start = (opts) => getFreshPosition((p) => res.ok.push(p), (e) => res.err.push(e), opts);
  return { geo, res, start, getFreshPosition };
}

// timestamp relatif terhadap "sekarang" (jam palsu).
const fix = (accuracy, ageMs = 0, extra = {}) => ({
  timestamp: Date.now() - ageMs,
  coords: { latitude: -9.6, longitude: 120.1, accuracy, ...extra },
});

test.afterEach(() => mock.timers.reset());

test('fix lama (timestamp sebelum permintaan) dibuang, fix segar diterima', () => {
  const { geo, res, start } = setup();
  start();
  geo.emit(fix(5, 5 * 60 * 1000)); // tersimpan 5 menit lalu, akurasi bagus
  assert.equal(res.ok.length, 0, 'fix lama tidak boleh dipakai walau akurasinya bagus');
  mock.timers.tick(1000);
  const segar = fix(8);
  geo.emit(segar);
  assert.equal(res.ok.length, 1);
  assert.equal(res.ok[0], segar);
  assert.deepEqual(geo.cleared, [7], 'watch harus dihentikan');
});

test('watchPosition diminta dengan maximumAge 0 dan highAccuracy', () => {
  const { geo, start } = setup();
  start({ timeout: 9000 });
  assert.deepEqual(geo.watchCalls[0], { enableHighAccuracy: true, maximumAge: 0, timeout: 9000 });
});

test('hanya fix lama sampai timeout -> error kode 3, TIDAK pernah sukses', () => {
  const { geo, res, start } = setup();
  start();
  geo.emit(fix(5, 60_000));
  mock.timers.tick(5000);
  geo.emit(fix(5, 60_000));
  mock.timers.tick(10_000);
  assert.equal(res.ok.length, 0);
  assert.equal(res.err.length, 1);
  assert.equal(res.err[0].code, 3);
  assert.match(res.err[0].message, /lama/i);
  assert.deepEqual(geo.cleared, [7]);
});

test('fix segar dalam toleransi jam (< 2 dtk sebelum permintaan) tetap diterima', () => {
  const { geo, res, start } = setup();
  start();
  geo.emit(fix(10, 1500));
  assert.equal(res.ok.length, 1);
});

test('akurasi sedang: menunggu settle 6 dtk lalu memakai yang terbaik (<= 100 m)', () => {
  const { geo, res, start } = setup();
  start();
  mock.timers.tick(1000); geo.emit(fix(60));
  mock.timers.tick(1000); geo.emit(fix(40));
  mock.timers.tick(1000); geo.emit(fix(70));
  assert.equal(res.ok.length, 0, 'belum selesai sebelum settle');
  mock.timers.tick(3000); // total 6 dtk
  assert.equal(res.ok.length, 1);
  assert.equal(res.ok[0].coords.accuracy, 40, 'fix terbaik yang dipilih, bukan yang terakhir');
});

test('akurasi buruk (> 100 m) menunggu sampai timeout lalu tetap dikembalikan', () => {
  const { geo, res, start } = setup();
  start();
  mock.timers.tick(500); geo.emit(fix(300));
  mock.timers.tick(6000);
  assert.equal(res.ok.length, 0);
  mock.timers.tick(9000);
  assert.equal(res.ok.length, 1);
  assert.equal(res.ok[0].coords.accuracy, 300);
});

test('izin ditolak -> error kode 1 langsung dan watch dihentikan', () => {
  const { geo, res, start } = setup();
  start();
  geo.emitErr({ code: 1, message: 'denied' });
  assert.equal(res.err.length, 1);
  assert.equal(res.err[0].code, 1);
  assert.deepEqual(geo.cleared, [7]);
});

test('error sementara (2/3) tidak membatalkan; fix segar sesudahnya diterima', () => {
  const { geo, res, start } = setup();
  start();
  geo.emitErr({ code: 3, message: 'timeout' });
  geo.emitErr({ code: 2, message: 'unavailable' });
  assert.equal(res.err.length, 0);
  mock.timers.tick(2000);
  geo.emit(fix(12));
  assert.equal(res.ok.length, 1);
});

test('lokasi tidak tersedia sampai timeout -> error kode 2', () => {
  const { geo, res, start } = setup();
  start();
  geo.emitErr({ code: 2, message: 'unavailable' });
  mock.timers.tick(15_000);
  assert.equal(res.err.length, 1);
  assert.equal(res.err[0].code, 2);
});

test('callback dipanggil tepat sekali walau fix datang lagi atau timer menyusul', () => {
  const { geo, res, start } = setup();
  start();
  geo.emit(fix(5));
  geo.emit(fix(3));
  geo.emitErr({ code: 1 });
  mock.timers.tick(30_000);
  assert.equal(res.ok.length, 1);
  assert.equal(res.err.length, 0);
});

test('accuracy 0/NaN tidak dianggap akurat: tidak menghentikan lebih awal', () => {
  const { geo, res, start } = setup();
  start();
  geo.emit(fix(0));
  geo.emit(fix(NaN));
  assert.equal(res.ok.length, 0);
  geo.emit(fix(15));
  assert.equal(res.ok.length, 1);
  assert.equal(res.ok[0].coords.accuracy, 15);
});

test('fungsi batal menghentikan watch tanpa memanggil callback', () => {
  const { geo, res, start } = setup();
  const cancel = start();
  cancel();
  mock.timers.tick(30_000);
  assert.deepEqual(geo.cleared, [7]);
  assert.equal(res.ok.length + res.err.length, 0);
});

test('tanpa geolocation -> error kode 2', () => {
  const factory = new Function('navigator', 'window', `${src}\n;return getFreshPosition;`);
  const g = factory({}, {});
  const errs = [];
  g(() => assert.fail('tidak boleh sukses'), (e) => errs.push(e));
  assert.equal(errs[0].code, 2);
});

test('opsi akurasi bisa diatur (badge: target 200 m, settle 3 dtk)', () => {
  const { geo, res, start } = setup();
  start({ targetAccuracy: 200, settleMs: 3000, settleAccuracy: 1000 });
  geo.emit(fix(150));
  assert.equal(res.ok.length, 1, 'sudah memenuhi target 200 m');
});

// ── Penjaga regresi: titik pemanggilan tidak boleh kembali ke data lama ──

test('absen.js dan meja.js tidak memanggil getCurrentPosition langsung', () => {
  for (const f of ['js/absen.js', 'js/meja.js']) {
    assert.ok(!/navigator\.geolocation\.getCurrentPosition/.test(read(f)), `${f} masih memakai getCurrentPosition`);
    assert.ok(/getFreshPosition\(/.test(read(f)), `${f} harus memakai getFreshPosition`);
  }
});

test('tidak ada pemanggil GPS yang mengizinkan maximumAge > 0', () => {
  for (const f of ['js/absen.js', 'js/meja.js', 'js/tugas_lembur.js', 'js/admin.js', 'js/admin-face.js']) {
    const m = read(f).match(/maximumAge:\s*([1-9]\d*)/);
    assert.equal(m, null, `${f} mengizinkan fix lama: maximumAge: ${m && m[1]}`);
  }
});

test('badge lokasi selalu meminta posisi segar (tidak berhenti di cache)', () => {
  for (const f of ['js/admin.js', 'js/admin-face.js']) {
    const s = read(f);
    assert.ok(!/if \(_cachedPos && _permState === 'granted'\) return;/.test(s), `${f} masih melewati permintaan GPS saat cache ada`);
    assert.ok(/getFreshPosition\(/.test(s));
  }
});

test('gps.js dimuat sebelum absen.js dan ada di cache service worker', () => {
  const html = read('index.html');
  const iGps = html.indexOf('js/gps.js');
  assert.ok(iGps > 0, 'index.html belum memuat js/gps.js');
  for (const f of ['js/absen.js', 'js/meja.js', 'js/tugas_lembur.js', 'js/admin-face.js']) {
    assert.ok(iGps < html.indexOf(f), `gps.js harus dimuat sebelum ${f}`);
  }
  assert.ok(read('service-worker.js').includes("'./js/gps.js'"));
});
