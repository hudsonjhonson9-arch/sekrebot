import test from 'node:test';
import assert from 'node:assert/strict';

// Test runner for Frontend Dev Tools logic
import { createDevTracker } from '../js/dev-tools.js';

test('createDevTracker: mencatat log dan menyimpannya dalam buffer', () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 5 });
  tracker.log('INFO', 'AUTH', 'Login berhasil', { nip: '19800101' });
  tracker.log('WARN', 'GPS', 'Akurasi rendah', { accuracy: 65 });
  tracker.log('ERROR', 'API', 'Gagal fetch /api/absen', { status: 500 });

  const logs = tracker.getLogs();
  assert.equal(logs.length, 3);
  assert.equal(logs[0].level, 'ERROR', 'Log terbaru di indeks pertama');
  assert.equal(logs[0].module, 'API');
  assert.equal(logs[1].level, 'WARN');
  assert.equal(logs[2].level, 'INFO');
});

test('createDevTracker: membatasi jumlah log (FIFO) sesuai maxLogs', () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 3 });
  tracker.log('INFO', 'MOD1', 'Aksi 1');
  tracker.log('INFO', 'MOD2', 'Aksi 2');
  tracker.log('INFO', 'MOD3', 'Aksi 3');
  tracker.log('INFO', 'MOD4', 'Aksi 4');

  const logs = tracker.getLogs();
  assert.equal(logs.length, 3);
  assert.equal(logs[0].action, 'Aksi 4');
  assert.equal(logs[2].action, 'Aksi 2');
});

test('createDevTracker: filter getLogs berdasarkan level dan pencarian teks', () => {
  const tracker = createDevTracker({ storageKey: null, maxLogs: 10 });
  tracker.log('INFO', 'AUTH', 'User login', { user: 'Budi' });
  tracker.log('ERROR', 'DB', 'Query timeout', { code: 'ETIMEDOUT' });
  tracker.log('WARN', 'GPS', 'GPS buffer overflow');
  tracker.log('ERROR', 'HUMAN', 'Model missing');

  const errorOnly = tracker.getLogs({ level: 'ERROR' });
  assert.equal(errorOnly.length, 2);
  assert.ok(errorOnly.every((l) => l.level === 'ERROR'));

  const searchGPS = tracker.getLogs({ search: 'gps' });
  assert.equal(searchGPS.length, 1);
  assert.equal(searchGPS[0].module, 'GPS');

  const searchNotFound = tracker.getLogs({ search: 'tidak-ada' });
  assert.equal(searchNotFound.length, 0);
});

test('createDevTracker: exportLogs menghasilkan string JSON dan teks yang valid', () => {
  const tracker = createDevTracker({ storageKey: null });
  tracker.log('INFO', 'TEST', 'Testing export', { key: 'val' });

  const jsonStr = tracker.exportLogs('json');
  const parsed = JSON.parse(jsonStr);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].module, 'TEST');

  const txtStr = tracker.exportLogs('txt');
  assert.ok(txtStr.includes('[INFO]'));
  assert.ok(txtStr.includes('[TEST]'));
  assert.ok(txtStr.includes('Testing export'));
});

test('createDevTracker: runDiagnostics menjalankan probers dan menghitung score', async () => {
  const tracker = createDevTracker({ storageKey: null });
  const mockProbers = {
    db: async () => ({ ok: true, latencyMs: 12, message: 'DB terhubung' }),
    api: async () => ({ ok: true, latencyMs: 8, message: 'API normal' }),
    gps: async () => ({ ok: false, latencyMs: 0, message: 'Izin lokasi ditolak' }),
  };

  const diag = await tracker.runDiagnostics(mockProbers);
  assert.equal(diag.total, 3);
  assert.equal(diag.passed, 2);
  assert.equal(diag.failed, 1);
  assert.equal(diag.score, 67); // Math.round(2/3 * 100)
  assert.equal(diag.results.db.status, 'OK');
  assert.equal(diag.results.gps.status, 'ERROR');
});

test('createDevTracker: clearLogs mengosongkan riwayat log', () => {
  const tracker = createDevTracker({ storageKey: null });
  tracker.log('INFO', 'A', 'B');
  assert.equal(tracker.getLogs().length, 1);
  tracker.clearLogs();
  assert.equal(tracker.getLogs().length, 0);
});
