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
  app.use(express.json({ limit: '256kb' }));
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

async function post(app, path, body) {
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
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

test('rekap-absen menyertakan _rawMasukLog/_rawPulangLog/_rawKetLog (kartu ✏️/➕ di js/rekap.js)', async () => {
  const q = async (text) => {
    if (/FROM user_list/i.test(text)) {
      return {
        rows: [{
          id: PEGAWAI.id, username: PEGAWAI.username, nama: PEGAWAI.username, nip: PEGAWAI.NIP,
          jabatan: PEGAWAI.Jabatan, pangkat: PEGAWAI.pangkat, bidang: PEGAWAI.bidang,
          nomorhp: PEGAWAI.nomorhp, urutan: PEGAWAI.no, status: PEGAWAI.Status,
        }],
      };
    }
    if (/Log_Absen/i.test(text)) {
      return {
        rows: [
          { ID_Log: 501, ID: PEGAWAI.id, Nama: PEGAWAI.username, NIP: PEGAWAI.NIP, Tanggal: '2026-10-06', Jam: '07:58', 'Jenis Absen': 'MASUK', Ket: '' },
          { ID_Log: 502, ID: PEGAWAI.id, Nama: PEGAWAI.username, NIP: PEGAWAI.NIP, Tanggal: '2026-10-06', Jam: '16:05', 'Jenis Absen': 'PULANG', Ket: '' },
          { ID_Log: 503, ID: PEGAWAI.id, Nama: PEGAWAI.username, NIP: PEGAWAI.NIP, Tanggal: '2026-10-06', Jam: '09:00', 'Jenis Absen': 'IZIN', Ket: 'Acara keluarga' },
        ],
      };
    }
    return { rows: [] };
  };
  const r = await get(harness(q), '/api/rekap-absen?dari=2026-10-06&sampai=2026-10-06&instansi_id=bapperida');
  assert.equal(r.status, 200);
  const p = r.body.pegawai[0];
  assert.ok(p._rawMasukLog, '_rawMasukLog wajib ada agar kartu Jam Masuk tampil ✏️ edit');
  assert.equal(Number(p._rawMasukLog.ID_Log), 501);
  assert.equal(p._rawMasukLog['Jenis Absen'], 'MASUK');
  assert.equal(p._rawMasukLog.Jam, '07:58');
  assert.ok(p._rawPulangLog, '_rawPulangLog wajib ada agar kartu Jam Pulang tampil ✏️');
  assert.equal(p._rawPulangLog['Jenis Absen'], 'PULANG');
  assert.ok(p._rawKetLog, '_rawKetLog wajib ada agar kartu Keterangan tampil ✏️');
  assert.equal(p._rawKetLog['Jenis Absen'], 'IZIN');
  assert.equal(p._rawKetLog.Ket, 'Acara keluarga');
  assert.equal(p.nama, PEGAWAI.username, 'kontrak lama tetap terjaga');
});

test('keterangan admin panel: target adalah pegawai terpilih (user.id), bukan admin', async () => {
  const sqls = [];
  const q = async (text, params) => {
    sqls.push({ text, params });
    if (/FROM user_list/i.test(text)) {
      const pid = params ? String(params[0]) : '';
      const row = String(pid) === String(PEGAWAI.id) ? { ...PEGAWAI } : { ...ADMIN };
      // SQL memakai alias "NIP" AS nip, jadi baris hasil query kolomnya lowercase.
      if (row.NIP) row.nip = row.NIP;
      return { rows: [row] };
    }
    if (/INSERT INTO ket_temp/i.test(text)) {
      const fresh = { ...params };
      return { rows: [fresh] };
    }
    if (/FROM ket_temp/i.test(text)) return { rows: [] };
    return { rows: [] };
  };
  const r = await post(harness(q), '/api/keterangan', {
    source: 'admin_panel',
    user: { id: PEGAWAI.id, nama: PEGAWAI.username, nip: PEGAWAI.NIP },
    jenis: 'IZIN',
    keterangan: 'Acara keluarga',
    tgl_mulai: '2026-10-10',
    tgl_selesai: '2026-10-10',
  });
assert.equal(r.status, 200);
  const ins = sqls.find((s) => /INSERT INTO ket_temp/i.test(s.text));
  assert.ok(ins, 'harus ada INSERT ket_temp');
  assert.equal(String(ins.params[1]), String(PEGAWAI.id), 'ID_Pegawai = pegawai terpilih');
  assert.notEqual(String(ins.params[1]), String(ADMIN.id), 'BUKAN id admin');
  assert.equal(ins.params[2], PEGAWAI.username, 'Nama = pegawai terpilih');
  assert.equal(ins.params[3], PEGAWAI.NIP, 'NIP = pegawai terpilih');
});