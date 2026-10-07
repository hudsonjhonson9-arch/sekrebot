// auth.js tidak punya test langsung sebelumnya: SESSION_LOOKUP_SQL adalah query
// keamanan yang menentukan identitas pemanggil, dan tidak terlihat dari test lain.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_LOOKUP_SQL, requireRole, singleSessionRow, ABSEN_ROLES } from './auth.js';

test('lookup sesi join lewat user_id, bukan NIP', () => {
  // NIP tidak unik di user_list. Join lewat NIP akan fan-out saat ada NIP dobel dan
  // mengunci pengguna yang sah, jadi ini dikunci di sini supaya tidak balik ke NIP.
  assert.match(SESSION_LOOKUP_SQL, /JOIN\s+user_list\s+u\s+ON\s+u\.id::text\s*=\s*s\.user_id/i);
  assert.doesNotMatch(SESSION_LOOKUP_SQL, /ON\s+u\."NIP"\s*=\s*s\.nip/i);
});

test('session hanya berlaku saat aktif dan belum kedaluwarsa', () => {
  assert.match(SESSION_LOOKUP_SQL, /is_active/);
  assert.match(SESSION_LOOKUP_SQL, /expires_at\s*>\s*now\(\)/i);
});

function fakeRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; this.statusCode ||= 200; return this; },
    end() { return this; },
  };
}

test('singleSessionRow hanya menerima tepat satu baris', () => {
  const row = { id: '1' };
  assert.deepEqual(singleSessionRow([row]), row);
  // Nol baris = sesi tak dikenal. Dua baris = user_list berubah sampai id terduplikasi;
  // memilih salah satu berarti "baris mana yang duluan" menentukan otorisasi.
  assert.equal(singleSessionRow([]), null);
  assert.equal(singleSessionRow([row, { ...row }]), null);
});

const TOKEN = 'a'.repeat(192);

test('tanpa token ditolak 401 tanpa menyentuh lookup', async () => {
  let called = false;
  const req = { headers: {} };
  const res = fakeRes();
  await requireRole(ABSEN_ROLES, { lookup: async () => { called = true; } })(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(called, false, 'tanpa token, lookup tidak boleh dijalankan');
  assert.equal(req.user, undefined);
});

test('sesi tidak dikenal (lookup null) ditolak 401', async () => {
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const res = fakeRes();
  await requireRole(ABSEN_ROLES, { lookup: async () => null })(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(req.user, undefined);
});

test('role tidak sesuai ditolak 403, req.user tidak terisi', async () => {
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const res = fakeRes();
  const lookup = async () => ({ id: '7', nip: '77', role: 'PERMINTAAN', instansi_id: 'b' });
  await requireRole(ABSEN_ROLES, { lookup })(req, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.equal(req.user, undefined);
});

test('lookup yang melempar jadi 500, bukan diloloskan sebagai otorisasi', async () => {
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const res = fakeRes();
  const lookup = async () => { throw new Error('db mati'); };
  await requireRole(ABSEN_ROLES, { lookup })(req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(req.user, undefined, 'outage DB tidak boleh jadi bypass otorisasi');
});

test('sesi valid mengisi req.user dari user_list', async () => {
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const res = fakeRes();
  const lookup = async () => ({ id: '7', nip: '77', role: 'user', instansi_id: 'bapperida' });
  await requireRole(ABSEN_ROLES, { lookup })(req, res, () => {});
  assert.deepEqual(req.user, { id: '7', nip: '77', role: 'USER', instansi_id: 'bapperida' });
});