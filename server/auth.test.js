// auth.js tidak punya test langsung sebelumnya: SESSION_LOOKUP_SQL adalah query
// keamanan yang menentukan identitas pemanggil, dan tidak terlihat dari test lain.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_LOOKUP_SQL, requireRole, singleSessionRow, ABSEN_ROLES, MEDIA_ROLES, SIMAPO_ROLES } from './auth.js';

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
  const lookup = async () => ({ id: '7', nip: '77', role: 'user', instansi_id: 'bapperida', is_admin: false });
  await requireRole(ABSEN_ROLES, { lookup })(req, res, () => {});
  assert.deepEqual(req.user, { id: '7', nip: '77', role: 'USER', instansi_id: 'bapperida', is_admin: false });
});

test('is_admin dari user_list dibawa ke req.user (bukan dari role)', async () => {
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const res = fakeRes();
  // role USER sekalipun, is_admin=true harus diteruskan — gate /api/log/add|edit
  // membaca boolean ini, bukan role.
  const lookup = async () => ({ id: '7', nip: '77', role: 'USER', instansi_id: 'bapperida', is_admin: true });
  await requireRole(ABSEN_ROLES, { lookup })(req, res, () => {});
  assert.equal(req.user.is_admin, true);

  // Fail-closed: selain true (undefined/null/'true' string yang bukan boolean) = false
  const req2 = { headers: { authorization: `Bearer ${TOKEN}` } };
  const lookup2 = async () => ({ id: '8', nip: '88', role: 'ADMIN', instansi_id: 'bapperida' });
  await requireRole(ABSEN_ROLES, { lookup: lookup2 })(req2, fakeRes(), () => {});
  assert.equal(req2.user.is_admin, false);
});

test('lookup SQL mengambil kolom is_admin dari user_list', () => {
  assert.match(SESSION_LOOKUP_SQL, /u\.is_admin/);
  assert.match(SESSION_LOOKUP_SQL, /SELECT\s+u\.id::text AS id, u\."NIP" AS nip, u\.role, u\.is_admin, u\.instansi_id/);
});

// BENDAHARA BARANG = admin aset saja: di SIMAPO_ROLES (mount /api/simapo) tapi
// sengaja BUKAN MEDIA_ROLES, supaya tidak mendapat akses tulis log/endpoint media.
// Kontrak ini yang membuat menu admin Aset terbuka untuk bendahara barang.
test('SIMAPO_ROLES mengotorisasi BENDAHARA BARANG untuk mount /api/simapo', async () => {
  assert.ok(SIMAPO_ROLES.has('BENDAHARA BARANG'));
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const res = fakeRes();
  let passed = false;
  const lookup = async () => ({ id: '5', nip: '55', role: 'BENDAHARA BARANG', instansi_id: 'bapperida' });
  await requireRole(SIMAPO_ROLES, { lookup })(req, res, () => { passed = true; });
  assert.equal(passed, true, 'BENDAHARA BARANG harus lolos gate /api/simapo');
  assert.equal(req.user.role, 'BENDAHARA BARANG');
});

test('BENDAHARA BARANG tidak masuk MEDIA_ROLES (hanya aset, bukan media)', () => {
  assert.ok(!MEDIA_ROLES.has('BENDAHARA BARANG'));
  assert.ok(MEDIA_ROLES.has('ADMIN'));
});