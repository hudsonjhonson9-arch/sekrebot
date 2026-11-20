import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOpenwaStatus, restartOpenwaSession, createOpenwaWatchdog } from './openwa-health.js';

test('checkOpenwaStatus mengembalikan NOT_CONFIGURED bila url kosong', async () => {
  const res = await checkOpenwaStatus({ url: '' });
  assert.equal(res.configured, false);
  assert.equal(res.ok, false);
  assert.equal(res.status, 'NOT_CONFIGURED');
});

test('checkOpenwaStatus mendeteksi sesi WORKING sebagai ok=true', async () => {
  const fakeFetch = async () => new Response(JSON.stringify([
    { id: 'sess-1', name: 'default', status: 'WORKING', phone: '62812345' },
  ]), { status: 200, headers: { 'content-type': 'application/json' } });

  const res = await checkOpenwaStatus({ url: 'https://wa.example.com', apiKey: 'k', session: 'default' }, fakeFetch);
  assert.equal(res.configured, true);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'WORKING');
  assert.equal(res.sessionId, 'sess-1');
  assert.equal(res.phone, '62812345');
});

test('checkOpenwaStatus mendeteksi sesi STOPPED sebagai ok=false', async () => {
  const fakeFetch = async () => new Response(JSON.stringify([
    { id: 'sess-1', name: 'default', status: 'STOPPED' },
  ]), { status: 200, headers: { 'content-type': 'application/json' } });

  const res = await checkOpenwaStatus({ url: 'https://wa.example.com', session: 'default' }, fakeFetch);
  assert.equal(res.ok, false);
  assert.equal(res.status, 'STOPPED');
});

test('restartOpenwaSession memanggil POST /api/sessions/:id/start', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, method: opts.method });
    if (opts.method === 'GET') {
      return new Response(JSON.stringify([{ id: 's1', name: 'default', status: 'STOPPED' }]), { status: 200 });
    }
    return new Response(JSON.stringify({ status: 'STARTING' }), { status: 200 });
  };

  const res = await restartOpenwaSession({ url: 'https://wa.example.com', session: 'default' }, fakeFetch);
  assert.equal(res.ok, true);
  assert.equal(res.sessionId, 's1');
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/sessions/s1/start')));
});

test('watchdog otomatis merestart saat STOPPED dan mematuhi cooldown, tapi tidak merestart saat SCAN_QR', async () => {
  let restarts = 0;
  let currentStatus = 'STOPPED';
  const fakeFetch = async (url, opts) => {
    if (opts.method === 'GET') {
      return new Response(JSON.stringify([{ id: 's1', name: 'default', status: currentStatus }]), { status: 200 });
    }
    restarts++;
    return new Response(JSON.stringify({ status: 'STARTING' }), { status: 200 });
  };

  const wd = createOpenwaWatchdog({
    url: 'https://wa.example.com',
    session: 'default',
    cooldownMs: 60_000,
    logger: { warn() {}, info() {}, error() {} },
    fetchFn: fakeFetch,
  });

  await wd.checkNow({ allowAutoRestart: true });
  assert.equal(restarts, 1);

  // Cooldown mencegah restart kedua langsung
  await wd.checkNow({ allowAutoRestart: true });
  assert.equal(restarts, 1);

  // SCAN_QR tidak boleh di-auto-restart
  const wdQr = createOpenwaWatchdog({
    url: 'https://wa.example.com',
    session: 'default',
    cooldownMs: 0,
    logger: { warn() {}, info() {}, error() {} },
    fetchFn: async () => new Response(JSON.stringify([{ id: 's1', name: 'default', status: 'SCAN_QR' }]), { status: 200 }),
  });
  let qrRestarts = 0;
  const r = await wdQr.checkNow({ allowAutoRestart: true });
  assert.equal(r.status, 'SCAN_QR');
  assert.equal(qrRestarts, 0);
});
