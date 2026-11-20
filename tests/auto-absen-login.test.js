import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const helperSrc = fs.readFileSync(path.join(ROOT, 'js', 'auto-absen-login.js'), 'utf8');

function plain(obj) {
  return obj && typeof obj === 'object' ? { ...obj } : obj;
}

function makeFixedDate(utcMs) {
  const RealDate = Date;
  return class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(utcMs);
      else super(...args);
    }
    static now() {
      return utcMs;
    }
  };
}

function loadAutoAbsenLogin(overrides = {}) {
  const storageMap = new Map();
  const sessionStorageMock = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => { storageMap.set(k, String(v)); },
    removeItem: (k) => { storageMap.delete(k); },
    clear: () => { storageMap.clear(); }
  };

  const windowObj = {
    ...(overrides.window || {})
  };

  const context = {
    window: windowObj,
    sessionStorage: overrides.sessionStorage || sessionStorageMock,
    navigator: overrides.navigator || {},
    fetch: overrides.fetch,
    Date: overrides.Date || Date,
    Promise,
    JSON,
    Math,
    Number,
    String,
    Array,
    encodeURIComponent
  };
  context.globalThis = context;
  windowObj.sessionStorage = context.sessionStorage;

  vm.runInNewContext(helperSrc, context);
  return {
    AutoAbsenLogin: windowObj.AutoAbsenLogin,
    window: windowObj,
    sessionStorage: context.sessionStorage
  };
}

test('shouldAttemptAutoAbsen allows weekday when status is BELUM_ABSEN and not a holiday', () => {
  const { AutoAbsenLogin } = loadAutoAbsenLogin();
  for (const day of [1, 2, 3, 4, 5]) {
    assert.deepEqual(
      plain(AutoAbsenLogin.shouldAttemptAutoAbsen({
        todayStatus: 'BELUM_ABSEN',
        witaDayOfWeek: day,
        todayWita: '2026-11-18',
        holidays: [{ tanggal: '2026-08-17', nama: 'HUT RI' }],
        autoEnabled: true
      })),
      { ok: true }
    );
  }
});

test('shouldAttemptAutoAbsen skips weekends (Saturday and Sunday)', () => {
  const { AutoAbsenLogin } = loadAutoAbsenLogin();
  assert.deepEqual(
    plain(AutoAbsenLogin.shouldAttemptAutoAbsen({
      todayStatus: 'BELUM_ABSEN',
      witaDayOfWeek: 6,
      todayWita: '2026-11-21',
      holidays: [],
      autoEnabled: true
    })),
    { ok: false, reason: 'weekend' }
  );
  assert.deepEqual(
    plain(AutoAbsenLogin.shouldAttemptAutoAbsen({
      todayStatus: 'BELUM_ABSEN',
      witaDayOfWeek: 0,
      todayWita: '2026-11-22',
      holidays: [],
      autoEnabled: true
    })),
    { ok: false, reason: 'weekend' }
  );
});

test('shouldAttemptAutoAbsen skips national holidays across object and string shapes', () => {
  const { AutoAbsenLogin } = loadAutoAbsenLogin();
  for (const holidays of [
    [{ tanggal: '2026-08-17', nama: 'HUT RI' }],
    [{ date: '2026-08-17' }],
    ['2026-08-17']
  ]) {
    assert.deepEqual(
      plain(AutoAbsenLogin.shouldAttemptAutoAbsen({
        todayStatus: 'BELUM_ABSEN',
        witaDayOfWeek: 1,
        todayWita: '2026-08-17',
        holidays,
        autoEnabled: true
      })),
      { ok: false, reason: 'holiday' }
    );
  }
});

test('shouldAttemptAutoAbsen skips when todayStatus is SUDAH_MASUK, SELESAI, or KETERANGAN', () => {
  const { AutoAbsenLogin } = loadAutoAbsenLogin();
  for (const status of ['SUDAH_MASUK', 'SELESAI', 'KETERANGAN']) {
    assert.deepEqual(
      plain(AutoAbsenLogin.shouldAttemptAutoAbsen({
        todayStatus: status,
        witaDayOfWeek: 2,
        todayWita: '2026-11-17',
        holidays: [],
        autoEnabled: true
      })),
      { ok: false, reason: 'already_recorded' }
    );
  }
});

test('shouldAttemptAutoAbsen skips when autoEnabled is false', () => {
  const { AutoAbsenLogin } = loadAutoAbsenLogin();
  assert.deepEqual(
    plain(AutoAbsenLogin.shouldAttemptAutoAbsen({
      todayStatus: 'BELUM_ABSEN',
      witaDayOfWeek: 3,
      todayWita: '2026-11-18',
      holidays: [],
      autoEnabled: false
    })),
    { ok: false, reason: 'disabled' }
  );
});

test('tryAutoAbsenAfterFaceLogin stores skipped_gps notice and never sends fake coordinates when GPS fails', async () => {
  const calls = [];
  const FixedDate = makeFixedDate(Date.UTC(2026, 10, 18, 0, 0, 0));

  const { AutoAbsenLogin, sessionStorage } = loadAutoAbsenLogin({
    Date: FixedDate,
    navigator: {
      geolocation: {
        getCurrentPosition: (_ok, err) => err(new Error('Permission denied'))
      }
    },
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      if (url.startsWith('/api/stitch/user-data')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, today: { status: 'BELUM_ABSEN' } }) };
      }
      if (url === '/api/stitch/bootstrap') {
        return { ok: true, status: 200, json: async () => ({ ok: true, holidays: [] }) };
      }
      throw new Error('Unexpected fetch: ' + url);
    }
  });

  const res = await AutoAbsenLogin.tryAutoAbsenAfterFaceLogin({
    nip: '198509042010012023',
    token: 'tok123',
    autoEnabled: true
  });
  assert.deepEqual(plain(res), { attempted: false, reason: 'gps_unavailable' });
  assert.equal(calls.some((c) => c.url === '/api/stitch/absen'), false);
  const notice = JSON.parse(sessionStorage.getItem('stitch_auto_absen_notice'));
  assert.equal(notice.status, 'skipped_gps');
});

test('tryAutoAbsenAfterFaceLogin posts MASUK with real GPS and stores success notice', async () => {
  const calls = [];
  const FixedDate = makeFixedDate(Date.UTC(2026, 10, 18, 0, 0, 0));

  const { AutoAbsenLogin, sessionStorage } = loadAutoAbsenLogin({
    Date: FixedDate,
    navigator: {
      geolocation: {
        getCurrentPosition: (ok) => ok({ coords: { latitude: -9.6487, longitude: 119.3892, accuracy: 12.4 } })
      }
    },
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      if (url.startsWith('/api/stitch/user-data')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, today: { status: 'BELUM_ABSEN' } }) };
      }
      if (url === '/api/stitch/bootstrap') {
        return { ok: true, status: 200, json: async () => ({ ok: true, holidays: [] }) };
      }
      if (url === '/api/stitch/absen') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, witaTime: '08:00 WITA', record: { Lokasi: 'Kantor Bapperida' } })
        };
      }
      throw new Error('Unexpected fetch: ' + url);
    }
  });

  const res = await AutoAbsenLogin.tryAutoAbsenAfterFaceLogin({
    nip: '198509042010012023',
    token: 'tok123',
    autoEnabled: true
  });
  assert.deepEqual(plain(res), { attempted: true, ok: true, witaTime: '08:00 WITA' });

  const absenCall = calls.find((c) => c.url === '/api/stitch/absen');
  assert.ok(absenCall);
  assert.equal(absenCall.opts.method, 'POST');
  assert.equal(absenCall.opts.headers.Authorization, 'Bearer tok123');
  const body = JSON.parse(absenCall.opts.body);
  assert.equal(body.jenis, 'MASUK');
  assert.equal(body.koordinat, '-9.6487,119.3892');
  assert.equal(body.akurasi, 12);

  const notice = JSON.parse(sessionStorage.getItem('stitch_auto_absen_notice'));
  assert.equal(notice.status, 'success');
  assert.equal(notice.witaTime, '08:00 WITA');
});

test('tryAutoAbsenAfterFaceLogin handles 403 policy rejection and 409 silent skip', async () => {
  const FixedDate = makeFixedDate(Date.UTC(2026, 10, 18, 0, 0, 0));
  const mkGeo = {
    geolocation: {
      getCurrentPosition: (ok) => ok({ coords: { latitude: -9.7, longitude: 119.5, accuracy: 15 } })
    }
  };

  // 403 case
  const env403 = loadAutoAbsenLogin({
    Date: FixedDate,
    navigator: mkGeo,
    fetch: async (url) => {
      if (url.startsWith('/api/stitch/user-data')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, today: { status: 'BELUM_ABSEN' } }) };
      }
      if (url === '/api/stitch/bootstrap') {
        return { ok: true, status: 200, json: async () => ({ ok: true, holidays: [] }) };
      }
      return { ok: false, status: 403, json: async () => ({ ok: false, message: 'Anda berada di luar radius lokasi presensi.' }) };
    }
  });
  const res403 = await env403.AutoAbsenLogin.tryAutoAbsenAfterFaceLogin({ nip: '1985', token: 'tok' });
  assert.deepEqual(plain(res403), { attempted: true, ok: false, status: 403 });
  const n403 = JSON.parse(env403.sessionStorage.getItem('stitch_auto_absen_notice'));
  assert.equal(n403.status, 'skipped_policy');

  // 409 case (silent)
  const env409 = loadAutoAbsenLogin({
    Date: FixedDate,
    navigator: mkGeo,
    fetch: async (url) => {
      if (url.startsWith('/api/stitch/user-data')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, today: { status: 'BELUM_ABSEN' } }) };
      }
      if (url === '/api/stitch/bootstrap') {
        return { ok: true, status: 200, json: async () => ({ ok: true, holidays: [] }) };
      }
      return { ok: false, status: 409, json: async () => ({ ok: false, message: 'Sudah masuk' }) };
    }
  });
  const res409 = await env409.AutoAbsenLogin.tryAutoAbsenAfterFaceLogin({ nip: '1985', token: 'tok' });
  assert.deepEqual(plain(res409), { attempted: true, ok: false, status: 409, reason: 'already_recorded' });
  assert.equal(env409.sessionStorage.getItem('stitch_auto_absen_notice'), null);
});

test('consumeAutoAbsenNotice reads, clears, and displays notice via showDynamicIsland', () => {
  const shown = [];
  const { AutoAbsenLogin, sessionStorage } = loadAutoAbsenLogin({
    window: {
      showDynamicIsland: (opts) => shown.push(opts)
    }
  });

  sessionStorage.setItem(
    'stitch_auto_absen_notice',
    JSON.stringify({ status: 'success', witaTime: '07:31 WITA', lokasi: 'Kantor Bapperida' })
  );

  const consumed = AutoAbsenLogin.consumeAutoAbsenNotice();
  assert.equal(consumed, true);
  assert.equal(sessionStorage.getItem('stitch_auto_absen_notice'), null);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].type, 'success');
  assert.match(shown[0].title, /Login & Presensi Masuk Berhasil \(07:31 WITA\)/);

  // Second call returns false (one-shot)
  assert.equal(AutoAbsenLogin.consumeAutoAbsenNotice(), false);
});
