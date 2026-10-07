import test from 'node:test';
import assert from 'node:assert/strict';
import { witaNow, hariIndonesia, isValidMejaToken } from './absen-util.js';

test('witaNow memakai UTC+8 regardless of host timezone', () => {
  // 2026-10-04T17:30:00Z = 2026-10-05 01:30 WITA
  const r = witaNow(new Date('2026-10-04T17:30:00Z'));
  assert.equal(r.tanggal, '2026-10-05');
  assert.equal(r.jam, '01:30:00');
});

test('witaNow tidak bergeser di tengah malam UTC', () => {
  // 2026-10-04T20:00:00Z = 2026-10-05 04:00 WITA
  const r = witaNow(new Date('2026-10-04T20:00:00Z'));
  assert.equal(r.tanggal, '2026-10-05');
  assert.equal(r.jam, '04:00:00');
});

test('witaNow menolak input tidak valid', () => {
  assert.throws(() => witaNow(new Date('bukan tanggal')), /tanggal tidak valid/i);
});

test('hariIndonesia memakai nama yang sama dengan lokasiabsen.hari', () => {
  assert.equal(hariIndonesia(new Date('2026-10-05T00:00:00Z')), 'senin');
  assert.equal(hariIndonesia(new Date('2026-10-04T00:00:00Z')), 'minggu');
  assert.equal(hariIndonesia(new Date('2026-10-09T00:00:00Z')), 'jumat');
});

test('isValidMejaToken menolak token asing dan kosong', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['RAHASIA-1'] });
  assert.equal(isValidMejaToken('RAHASIA-1', 'bapperida'), true);
  assert.equal(isValidMejaToken('RAHASIA-2', 'bapperida'), false);
  assert.equal(isValidMejaToken('RAHASIA-1', 'dpmptsp'), false);
  assert.equal(isValidMejaToken('', 'bapperida'), false);
  assert.equal(isValidMejaToken(undefined, 'bapperida'), false);
});

test('isValidMejaToken fail-closed saat MEJA_TOKENS rusak', () => {
  process.env.MEJA_TOKENS = 'bukan json';
  assert.equal(isValidMejaToken('apa saja', 'bapperida'), false);
});

test('isValidMejaToken fail-closed saat MEJA_TOKENS kosong', () => {
  delete process.env.MEJA_TOKENS;
  assert.equal(isValidMejaToken('apa saja', 'bapperida'), false);
});