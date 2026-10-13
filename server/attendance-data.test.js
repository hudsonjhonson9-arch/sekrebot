import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

function harness(query, deps = {}) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...ADMIN }) }));
  app.use('/api', createAttendanceDataRouter({
    query: async (text, params) => query(text, params),
    withTransaction: async () => {},
    ...deps,
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

test('rekap-absen menyertakan logByDate & ketByDate (kalender per tanggal di js/rekap.js)', async () => {
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
          { ID_Log: 501, ID: PEGAWAI.id, Tanggal: '2026-10-06', Jam: '07:58', 'Jenis Absen': 'MASUK', Ket: '' },
          { ID_Log: 502, ID: PEGAWAI.id, Tanggal: '2026-10-06', Jam: '16:05', 'Jenis Absen': 'PULANG', Ket: '' },
          { ID_Log: 504, ID: PEGAWAI.id, Tanggal: '2026-10-07', Jam: '09:00', 'Jenis Absen': 'DL', Ket: '' },
          { ID_Log: 505, ID: PEGAWAI.id, Tanggal: '2026-10-08', Jam: '09:00', 'Jenis Absen': 'TB', Ket: '' },
        ],
      };
    }
    return { rows: [] };
  };
  const r = await get(harness(q), '/api/rekap-absen?dari=2026-10-06&sampai=2026-10-08&instansi_id=bapperida');
  assert.equal(r.status, 200);
  const p = r.body.pegawai[0];
  assert.ok(p.logByDate, 'logByDate wajib ikut ter-serialize');
  assert.equal(p.logByDate['2026-10-06'].masuk, 7 * 60 + 58, 'menit masuk per tanggal');
  assert.equal(p.logByDate['2026-10-06'].pulang, 16 * 60 + 5);
  assert.ok(p.ketByDate, 'ketByDate wajib ikut ter-serialize');
  assert.equal(p.ketByDate['2026-10-06'], undefined, 'tanggal tanpa ket tidak diisi');
  assert.equal(p.ketByDate['2026-10-07'], 'TUGAS', 'DL dinormalkan ke TUGAS (sama dgn counter)');
  assert.equal(p.ketByDate['2026-10-08'], 'ALPA', 'TB dinormalkan ke ALPA (sama dgn counter)');
  assert.equal(p.alpa, 1, '1 baris TB = 1 alpa');
  assert.equal(p.disiplinPct, 80, '1 alpa = -20%');
});

const STAT_ROW = {
  nip: PEGAWAI.NIP,
  akum_menit_terlambat: 520,
  akum_menit_lebih_awal: 30,
  total_izin: 1, total_sakit: 0, total_tugas: 2, total_tubel: 0, total_cuti: 0, total_alpa: 3,
};

function statQuery(opts = {}) {
  const sqls = [];
  const q = async (text) => {
    sqls.push(text);
    if (/FROM user_list/i.test(text)) {
      return {
        rows: [{
          id: PEGAWAI.id, username: PEGAWAI.username, nama: PEGAWAI.username, nip: PEGAWAI.NIP,
          jabatan: PEGAWAI.Jabatan, pangkat: PEGAWAI.pangkat, bidang: PEGAWAI.bidang,
          nomorhp: PEGAWAI.nomorhp, urutan: PEGAWAI.no, status: PEGAWAI.Status,
        }],
      };
    }
    if (/statistik_pegawai/i.test(text)) {
      if (opts.statThrow) throw new Error('relation "statistik_pegawai" does not exist');
      return { rows: opts.stat ?? [STAT_ROW] };
    }
    if (/Log_Absen/i.test(text)) {
      // 07:10 = 430 menit → di bawah batas 435, jadi angka periode 0.
      return { rows: [{ ID_Log: 601, ID: PEGAWAI.id, Tanggal: '2026-10-06', Jam: '07:10', 'Jenis Absen': 'MASUK', Ket: '' }] };
    }
    return { rows: [] };
  };
  return { q, sqls };
}

const REKAP_URL = '/api/rekap-absen?dari=2026-10-06&sampai=2026-10-06&instansi_id=bapperida';

test('rekap-absen: all-time dari statistik_pegawai, periode tetap dari log', async () => {
  const { q, sqls } = statQuery();
  const r = await get(harness(q), REKAP_URL);
  assert.equal(r.status, 200);
  assert.ok(sqls.some((s) => /statistik_pegawai/i.test(s)), 'wajib baca tabel statistik_pegawai');
  const p = r.body.pegawai[0];
  assert.equal(p.all_menit_terlambat, 520, 'akum_menit_terlambat (di luar jam masuk, termasuk TB)');
  assert.equal(p.all_menit_lebih_awal, 30, 'akum_menit_lebih_awal (di luar jam pulang)');
  assert.equal(p.all_izin, 1);
  assert.equal(p.all_tugas, 2);
  assert.equal(p.all_alpa, 3);
  assert.equal(p.menit_terlambat, 0, 'masuk 07:10 → periode 0 menit, terpisah dari all-time');
  assert.equal(p.masuk, 1, 'data periode tetap dari log');
});

test('rekap-absen: statistik_pegawai gagal dibaca → rekap tetap jalan tanpa field all_*', async () => {
  const { q } = statQuery({ statThrow: true });
  const r = await get(harness(q), REKAP_URL);
  assert.equal(r.status, 200);
  const p = r.body.pegawai[0];
  assert.equal(p.all_menit_terlambat, undefined);
  assert.equal(p.all_alpa, undefined);
  assert.equal(p.masuk, 1, 'data periode tetap tersaji');
});

test('rekap-absen: NIP beda format (spasi/petak) tetap cocok dengan statistik_pegawai', async () => {
  const { q } = statQuery({ stat: [{ ...STAT_ROW, nip: '1972 1102 2001 12 1001' }] });
  const r = await get(harness(q), REKAP_URL);
  const p = r.body.pegawai[0];
  assert.equal(p.all_menit_terlambat, 520);
  assert.equal(p.all_menit_lebih_awal, 30);
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

test('keterangan dengan bukti_base64: diupload ke Drive, drive_link masuk INSERT', async () => {
  const sqls = [];
  const uploads = [];
  const q = async (text, params) => {
    sqls.push({ text, params });
    if (/FROM user_list/i.test(text)) {
      const row = { ...PEGAWAI, nip: PEGAWAI.NIP };
      return { rows: [row] };
    }
    if (/INSERT INTO ket_temp/i.test(text)) return { rows: [{ ...params }] };
    if (/FROM ket_temp/i.test(text)) return { rows: [] };
    return { rows: [] };
  };
  const r = await post(harness(q, {
    gasUpsert: async (arg) => { uploads.push(arg); return { fileId: 'f123', url: 'https://drive.google.com/file/d/f123/view' }; },
  }), '/api/keterangan', {
    source: 'admin_panel',
    user: { id: PEGAWAI.id },
    jenis: 'TUGAS',
    keterangan: 'Dinas luar',
    tgl_mulai: '2026-10-10',
    tgl_selesai: '2026-10-10',
    bukti_base64: 'aGVsbG8=',
    bukti_mime: 'image/jpeg',
  });
  assert.equal(r.status, 200);
  assert.equal(uploads.length, 1, 'bukti_base64 wajib diupload via gasUpsert');
  assert.equal(uploads[0].dataBase64, 'aGVsbG8=');
  assert.equal(uploads[0].mimeType, 'image/jpeg');
  assert.match(uploads[0].filename, /^bukti-ket-/);
  const ins = sqls.find((s) => /INSERT INTO ket_temp/i.test(s.text));
  assert.ok(ins, 'harus ada INSERT ket_temp');
  const linkIdx = ins.text.indexOf('"drive_link"');
  assert.ok(linkIdx > -1, 'kolom drive_link wajib ikut INSERT');
  assert.ok(ins.params.includes('https://drive.google.com/file/d/f123/view'), 'URL hasil upload wajib jadi nilai drive_link');
});

test('keterangan: gasUpsert gagal → 502, INSERT tidak jalan (bukti tidak hilang diam-diam)', async () => {
  const sqls = [];
  const q = async (text, params) => {
    sqls.push({ text, params });
    if (/FROM user_list/i.test(text)) return { rows: [{ ...PEGAWAI, nip: PEGAWAI.NIP }] };
    return { rows: [] };
  };
  const r = await post(harness(q, {
    gasUpsert: async () => { throw new Error('Drive down'); },
  }), '/api/keterangan', {
    source: 'admin_panel',
    user: { id: PEGAWAI.id },
    jenis: 'TUGAS',
    keterangan: 'Dinas luar',
    tgl_mulai: '2026-10-10',
    tgl_selesai: '2026-10-10',
    bukti_base64: 'aGVsbG8=',
    bukti_mime: 'image/jpeg',
  });
  assert.equal(r.status, 502);
  assert.ok(!sqls.some((s) => /INSERT INTO ket_temp/i.test(s.text)), 'upload gagal = keterangan tidak boleh tersimpan tanpa bukti');
});

test('dateRange bebas timezone: TZ +8 tidak menggeser tanggal (bug keterangan 1 hari)', () => {
  // ponytail: child process dengan TZ=Asia/Shanghai = kondisi server produksi (DB Asia/Shanghai);
  // sebelum fix, parse lokal + toISOString UTC memundakkan tiap tanggal 1 hari.
  const mod = new URL('./attendance-data.js', import.meta.url).href;
  const code = `import { dateRange, parseDate } from ${JSON.stringify(mod)}; console.log(JSON.stringify([dateRange('2026-10-12','2026-10-12'),dateRange('2026-10-11','2026-10-14'),dateRange('2026-10-13','2026-10-16'),['2026-10-11','2026-10-12','2026-10-13'].map(t=>parseDate(t).getUTCDay())]));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, TZ: 'Asia/Shanghai' },
    encoding: 'utf8',
  }).trim();
  const [single, multi, future, weekdays] = JSON.parse(out);
  assert.deepEqual(single, ['2026-10-12'], 'tanggal tunggal harus persis tanggal input');
  assert.deepEqual(multi, ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'], 'rentang harus persis dari s.d. tanpa geser');
  assert.deepEqual(future, ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'], 'pengajuan tanggal lain tidak boleh menyertakan tanggal sebelumnya');
  assert.deepEqual(weekdays, [0, 1, 2], 'parseDate -> getUTCDay harus hari Minggu/Senin/Selasa (filter akhir pekan rekap)');
});
