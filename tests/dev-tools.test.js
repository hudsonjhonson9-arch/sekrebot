import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevTracker } from '../js/dev-tools.js';

test('createDevTracker: FIFO cap membatasi jumlah log sesuai maxLogs', () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 3 });

  tracker.log('INFO', 'AUTH', 'Event 1');
  tracker.log('WARN', 'GPS', 'Event 2');
  tracker.log('ERROR', 'API', 'Event 3');
  tracker.log('DEBUG', 'FACE', 'Event 4');
  tracker.log('INFO', 'SYNC', 'Event 5');

  const logs = tracker.getLogs();
  assert.strictEqual(logs.length, 3);
  assert.deepStrictEqual(
    logs.map((l) => l.action),
    ['Event 5', 'Event 4', 'Event 3']
  );
});

test('createDevTracker: filter level dan pencarian teks bekerja akurat', () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 20 });

  tracker.log('info', 'auth', 'Login berhasil', { nip: '19900101' });
  tracker.log('warn', 'gps', 'Akurasi rendah', { accuracy: 85 });
  tracker.log('error', 'api', 'Timeout endpoint', { code: 504 });
  tracker.log('debug', 'face', 'Ekstraksi descriptor selesai');

  assert.strictEqual(tracker.getLogs({ level: 'ALL' }).length, 4);
  assert.strictEqual(tracker.getLogs({ level: 'ERROR' }).length, 1);
  assert.strictEqual(tracker.getLogs({ level: 'WARN' })[0].module, 'GPS');
  assert.strictEqual(tracker.getLogs({ level: 'DEBUG' })[0].action, 'Ekstraksi descriptor selesai');

  const byModule = tracker.getLogs({ search: 'auth' });
  assert.strictEqual(byModule.length, 1);
  assert.strictEqual(byModule[0].action, 'Login berhasil');

  const byDetails = tracker.getLogs({ search: '504' });
  assert.strictEqual(byDetails.length, 1);
  assert.strictEqual(byDetails[0].level, 'ERROR');

  const combined = tracker.getLogs({ level: 'WARN', search: 'akurasi' });
  assert.strictEqual(combined.length, 1);
});

test('createDevTracker: exportLogs JSON & TXT dan clearLogs membersihkan log', () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 10 });
  tracker.log('ERROR', 'RUNTIME', 'ReferenceError', { line: 42 });
  tracker.log('INFO', 'BOOT', 'Aplikasi siap');

  const jsonOut = tracker.exportLogs('json');
  const parsed = JSON.parse(jsonOut);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].module, 'BOOT');
  assert.strictEqual(parsed[1].details.line, 42);

  const txtOut = tracker.exportLogs('txt');
  const lines = txtOut.split('\n');
  assert.strictEqual(lines.length, 2);
  assert.match(lines[0], /\[INFO\] \[BOOT\] Aplikasi siap/);
  assert.match(lines[1], /\[ERROR\] \[RUNTIME\] ReferenceError \| \{"line":42\}/);

  tracker.clearLogs();
  assert.strictEqual(tracker.getLogs().length, 0);
  assert.strictEqual(tracker.exportLogs('txt'), '');
});

test('runDiagnostics: mengagregasi prober sehat menjadi skor 100%', async () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 10 });

  const diag = await tracker.runDiagnostics({
    db: async () => ({ ok: true, latencyMs: 12, message: 'DB OK' }),
    api: async () => ({ ok: true, latencyMs: 8, message: 'API OK' }),
  });

  assert.strictEqual(diag.total, 2);
  assert.strictEqual(diag.passed, 2);
  assert.strictEqual(diag.failed, 0);
  assert.strictEqual(diag.score, 100);
  assert.strictEqual(diag.results.db.status, 'OK');
  assert.strictEqual(diag.results.db.latencyMs, 12);
  assert.strictEqual(diag.results.api.status, 'OK');

  const logs = tracker.getLogs({ level: 'INFO', search: 'DIAGNOSTIC' });
  assert.strictEqual(logs.length, 1);
  assert.match(logs[0].action, /skor 100% \(2\/2 subsistem normal\)/);
});

test('runDiagnostics: menangani prober warning, gagal, dan exception', async () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 10 });

  const diag = await tracker.runDiagnostics({
    healthy: async () => ({ ok: true, latencyMs: 5, message: 'Siap' }),
    degraded: async () => ({ ok: false, warning: true, latencyMs: 15, message: 'Cache belum siap' }),
    down: async () => ({ ok: false, latencyMs: 20, message: 'Koneksi putus' }),
    crashed: async () => { throw new Error('ECONNREFUSED'); },
  });

  assert.strictEqual(diag.total, 4);
  assert.strictEqual(diag.passed, 2);
  assert.strictEqual(diag.failed, 2);
  assert.strictEqual(diag.score, 50);

  assert.strictEqual(diag.results.healthy.status, 'OK');
  assert.strictEqual(diag.results.degraded.status, 'WARN');
  assert.strictEqual(diag.results.down.status, 'ERROR');
  assert.strictEqual(diag.results.crashed.status, 'ERROR');
  assert.strictEqual(diag.results.crashed.message, 'ECONNREFUSED');
});

test('runDiagnostics default probers: memeriksa 8 subsistem termasuk server_memory', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.strictEqual(url, '/api/dev/health');
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          uptime: 360,
          nodeVersion: 'v22.0.0',
          db: { ok: true, latencyMs: 9 },
          memory: {
            rss: 128 * 1024 * 1024,
            heapUsed: 64 * 1024 * 1024,
            heapTotal: 96 * 1024 * 1024,
          },
        };
      },
    };
  };

  try {
    const tracker = createDevTracker({ storageKey: null, maxLogs: 10 });
    const diag = await tracker.runDiagnostics();

    assert.strictEqual(diag.total, 8);
    assert.deepStrictEqual(Object.keys(diag.results), [
      'database',
      'backend_api',
      'face_ai',
      'geolocation',
      'client_storage',
      'telegram_sync',
      'n8n_webhook',
      'server_memory',
    ]);
    assert.strictEqual(diag.results.database.status, 'OK');
    assert.strictEqual(diag.results.backend_api.status, 'OK');
    assert.strictEqual(diag.results.face_ai.status, 'OK');
    assert.strictEqual(diag.results.server_memory.status, 'OK');
    assert.match(diag.results.server_memory.message, /RSS 128 MB/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
