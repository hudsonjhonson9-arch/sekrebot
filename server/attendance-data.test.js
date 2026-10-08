import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

const { createAttendanceDataRouter } = await import('./attendance-data.js');

const TOKEN = 'a'.repeat(192);
const ADMIN = { id: '7', nip: '198001012000011001', role: 'ADMIN', instansi_id: 'bapperida' };

const PEGAWAI = {
  id: '8656838432',
  username: 'Charles Hermana Weru, S.Sos',
  NIP: '197211022001121001',
  instansi_id: 'bapperida',
  Jabatan: 'Kepala Badan',
  pangkat: 'Pembina Utama Muda (IV/c)',
  bidang: null,
  nomorhp: null,
  no: 1,
  Status: 'AKTIF',
};

function harness(query) {
  const app = express();
  app.use('/api', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...ADMIN }) }));
  app.use('/api', createAttendanceDataRouter({
    query: async (text, params) => query(text, params),
    withTransaction: async () => {},
  }));
  return app;
}

async function get(app, path) {
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('rekap-absen menyertakan field nama per pegawai (kontrak js/rekap.js)', async () => {
  const sqls = [];
  const q = async (text) => {
    sqls.push(text);
    if (/FROM user_list/i.test(text)) {
      // Bentuk baris = hasil SELECT dengan alias (NIP AS nip, dst).
      // Kolom 'nama' hanya ada kalau SELECT meng-alias username AS nama.
      const row = {
        id: PEGAWAI.id, username: PEGAWAI.username, nip: PEGAWAI.NIP,
        jabatan: PEGAWAI.Jabatan, pangkat: PEGAWAI.pangkat, bidang: PEGAWAI.bidang,
        nomorhp: PEGAWAI.nomorhp, urutan: PEGAWAI.no, status: PEGAWAI.Status,
      };
      if (/username\s+AS\s+nama/i.test(text)) row.nama = PEGAWAI.username;
      return { rows: [row] };
    }
    if (/Log_Absen/i.test(text)) return { rows: [] };
    return { rows: [] };
  };
  const r = await get(harness(q), '/api/rekap-absen?dari=2026-10-06&sampai=2026-10-06&instansi_id=bapperida');
  assert.equal(r.status, 200);
  assert.ok(sqls.some((s) => /username\s+AS\s+nama/i.test(s)), 'SQL user_list wajib alias username AS nama');
  assert.equal(r.body.pegawai.length, 1);
  const p = r.body.pegawai[0];
  assert.equal(p.nama, 'Charles Hermana Weru, S.Sos', 'client render membaca p.nama; username saja bikin tampilan jadi —');
  assert.equal(p.username, 'Charles Hermana Weru, S.Sos', 'username tetap ikut untuk konsumen lama');
  assert.equal(p.nip, PEGAWAI.NIP);
  assert.equal(p.jabatan, PEGAWAI.Jabatan);
});
