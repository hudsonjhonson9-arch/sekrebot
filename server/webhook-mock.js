// webhook-mock.js — harness lokal: serve statis + implementasikan /webhook/* di atas Postgres lokal.
// Jalankan: node server/webhook-mock.js  (buka http://127.0.0.1:8377)
import express from 'express';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const { Pool } = pg;
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = process.env.PORT || 8377;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/absensi';

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', '*');
  res.set('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const ok = (res, data) => res.json(data);
const fail = (res, msg, status = 400) => res.status(status).json({ ok: false, message: msg });
const bodyOf = (b) => (Array.isArray(b) ? b[0] : b) || {};

function userIdOf(req) {
  const b = bodyOf(req.body);
  return req.query.user_id || req.query.userId || b?.user?.id || b?.user_id || b?.ID || null;
}

// ── /js/config.js: ulang SERVER_1/SERVER_2 → '' agar same-origin ──
app.get('/js/config.js', (_req, res) => {
  let src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
  src = src.replace(/^\s*const SERVER_1 = '[^']*';/m, "const SERVER_1 = '';");
  src = src.replace(/^\s*const SERVER_2 = '[^']*';/m, "const SERVER_2 = '';");
  res.type('js').send(src);
});

// ── User ──
app.get('/webhook/user-list', async (req, res) => {
  try {
    const { nip, instansi_id } = req.query;
    let q = `SELECT ul.*, ul."NIP" AS nip, ul.username AS nama, ul."Jabatan" AS jabatan, ul."Status" AS status, ul.id AS telegram_id,
              EXISTS(SELECT 1 FROM tanda_tangan tt WHERE tt.nip = ul."NIP") AS has_signature
              FROM user_list ul WHERE 1=1`;
    const p = [];
    if (nip) { p.push(nip); q += ` AND ul."NIP" = $${p.length}`; }
    if (instansi_id) { p.push(instansi_id); q += ` AND ul.instansi_id = $${p.length}`; }
    q += ' ORDER BY COALESCE(ul.no, 0)';
    const { rows } = await pool.query(q, p);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/user-add', async (req, res) => {
  try {
    const u = bodyOf(req.body);
    const id = u.id || u.ID || Date.now();
    await pool.query(
      `INSERT INTO user_list (id, username, "NIP", "Jabatan", "Status", no, bidang, pangkat, nomorhp, role, is_admin, instansi_id, tgl_pangkat, tgl_berkala, jam_masuk, jam_pulang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, u.username || u.nama, u.nip || u.NIP, u.jabatan || '', u.status || 'AKTIF', u.no ?? null, u.bidang || '', u.pangkat || '', u.nomorhp || '', u.role || 'USER', !!u.is_admin, u.instansi_id || 'bapperida', u.tgl_pangkat || null, u.tgl_berkala || null, u.jam_masuk || null, u.jam_pulang || null]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/user-edit', async (req, res) => {
  try {
    const u = bodyOf(req.body);
    const id = u.id ?? u.ID;
    if (!id) return fail(res, 'id wajib');
    const fields = ['username', 'Jabatan', 'Status', 'no', 'bidang', 'pangkat', 'nomorhp', 'role', 'is_admin', 'instansi_id', 'tgl_pangkat', 'tgl_berkala', 'jam_masuk', 'jam_pulang'];
    const sets = [], p = [id];
    for (const f of fields) if (u[f] !== undefined) { p.push(u[f]); sets.push(`"${f}" = $${p.length}`); }
    if (u.nip !== undefined) { p.push(u.nip); sets.push(`"NIP" = $${p.length}`); }
    if (!sets.length) return fail(res, 'tidak ada field');
    await pool.query(`UPDATE user_list SET ${sets.join(', ')} WHERE id = $1`, p);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/user-delete', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id ?? b.ID ?? b.user_id;
    if (!id) return fail(res, 'id wajib');
    await pool.query('DELETE FROM user_list WHERE id = $1', [id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/update-status', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id ?? b.ID;
    if (!id) return fail(res, 'id wajib');
    await pool.query('UPDATE user_list SET "Status" = $1, tgl_pangkat = $2, tgl_berkala = $3, pangkat = $4 WHERE id = $5',
      [b.status || b.Status || 'AKTIF', b.tgl_pangkat || null, b.tgl_berkala || null, b.pangkat || null, id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Instansi / Bidang ──
app.get('/webhook/instansi-list', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM instansi_list');
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/instansi-update', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id;
    if (!id) return fail(res, 'id wajib');
    const fields = ['nama_instansi', 'logo_url', 'alamat', 'header', 'kontak', 'header_font', 'header_size'];
    const sets = [], p = [id];
    for (const f of fields) if (b[f] !== undefined) { p.push(b[f]); sets.push(`"${f}" = $${p.length}`); }
    if (!sets.length) return fail(res, 'tidak ada field');
    await pool.query(`UPDATE instansi_list SET ${sets.join(', ')} WHERE id = $1`, p);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/bidang-list', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows } = await pool.query('SELECT * FROM bidang_list WHERE instansi_id = $1 ORDER BY id', [inst]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Lokasi ──
app.get('/webhook/lokasi-list', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows } = await pool.query('SELECT * FROM lokasiabsen WHERE instansi_id = $1 ORDER BY id', [inst]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/lokasi-add', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const { rows } = await pool.query(
      `INSERT INTO lokasiabsen ("Nama_Lokasi", latitude, longitude, hari, radius, ip_range, instansi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [b.lokasi || b.nama || b.Nama_Lokasi || '', b.latitude, b.longitude, b.hari || null, b.radius ?? null, b.ip_range || '', b.instansi_id || 'bapperida']);
    return ok(res, { ok: true, id: rows[0].id });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/lokasi-update', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id;
    if (!id) return fail(res, 'id wajib');
    await pool.query(
      `UPDATE lokasiabsen SET "Nama_Lokasi"=$1, latitude=$2, longitude=$3, hari=$4, radius=$5, ip_range=$6 WHERE id=$7`,
      [b.lokasi || b.nama || b.Nama_Lokasi, b.latitude, b.longitude, b.hari ?? null, b.radius ?? null, b.ip_range || '', id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/lokasi-delete', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id;
    if (!id) return fail(res, 'id wajib');
    await pool.query('DELETE FROM lokasiabsen WHERE id = $1', [id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Jam Absen / Periode ──
app.get('/webhook/jam-absen', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows } = await pool.query('SELECT * FROM jam_absen WHERE instansi_id = $1', [inst]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/jam-absen', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const inst = b.instansi_id || 'bapperida';
    const key = b.key || 'jam_absen_global';
    await pool.query(
      `INSERT INTO jam_absen ("key", masuk, pulang, diubah_oleh, instansi_id) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("key", instansi_id) DO UPDATE SET masuk=$2, pulang=$3, diubah_oleh=$4, updated_at=now()`,
      [key, b.masuk ?? null, b.pulang ?? null, b.diubah_oleh ?? userIdOf(req), inst]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/jam-periode-list', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows } = await pool.query('SELECT * FROM jam_periode WHERE instansi_id = $1 ORDER BY id', [inst]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/jam-periode-add', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id || crypto.randomUUID();
    await pool.query(
      `INSERT INTO jam_periode (id, nama, dari, sampai, masuk, pulang, ditambahkan_oleh, timestamp, instansi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, b.nama || '', b.dari || '', b.sampai || '', b.masuk || '', b.pulang || '', b.ditambahkan_oleh ?? userIdOf(req), b.timestamp || Date.now(), b.instansi_id || 'bapperida']);
    return ok(res, { ok: true, id });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/jam-periode-delete', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id;
    if (!id) return fail(res, 'id wajib');
    await pool.query('DELETE FROM jam_periode WHERE id = $1', [id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Libur ──
app.get('/webhook/libur-list', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM libur_nasional ORDER BY tanggal');
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/libur-add', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const tgl = b.tanggal;
    if (!tgl) return fail(res, 'tanggal wajib');
    await pool.query(
      `INSERT INTO libur_nasional (tanggal, nama, ditambahkan_oleh, timestamp) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tanggal) DO UPDATE SET nama=$2`,
      [tgl, b.nama || 'Libur', b.ditambahkan_oleh ?? userIdOf(req), b.timestamp || String(Date.now())]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/libur-delete', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const tgl = b.tanggal;
    if (!tgl) return fail(res, 'tanggal wajib');
    await pool.query('DELETE FROM libur_nasional WHERE tanggal = $1', [tgl]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Keterangan (ket) ──
app.get('/webhook/ket-list', async (_req, res) => {
  const names = ['Izin', 'Sakit', 'Tugas', 'Tubel', 'Cuti'];
  return ok(res, { data: names.map(n => ({ nama: n })) });
});

app.post('/webhook/keterangan', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const jenis = (b.keterangan || b.jenis || '').toUpperCase() || 'IZIN';
    await pool.query(
      `INSERT INTO "Log_Absen" ("ID", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", koordinat, instansi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [userIdOf(req), b.nama || b.username || '', b.nip || '', b.tanggal || '', b.jam || '', jenis, 'Keterangan', b.alasan || b.ket || '', b.koordinat || '', b.instansi_id || 'bapperida']);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/ket-edit', async (_req, res) => ok(res, { ok: true }));
app.post('/webhook/ket-delete', async (_req, res) => ok(res, { ok: true }));
app.post('/webhook/ket-approve', async (_req, res) => ok(res, { ok: true }));

// ── Admin ──
app.get('/webhook/admin-list', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows } = await pool.query(
      `SELECT a.telegram_id, a.nama, a.role, a.instansi_id FROM admin_list a WHERE a.instansi_id = $1
       UNION SELECT u.id, u.username, u.role, u.instansi_id FROM user_list u WHERE u.is_admin = true AND u.instansi_id = $1`, [inst]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/admin-add', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.telegram_id ?? b.id ?? b.ID;
    if (!id) return fail(res, 'telegram_id wajib');
    await pool.query(
      `INSERT INTO admin_list (telegram_id, nama, role, instansi_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (telegram_id) DO UPDATE SET nama=$2, role=$3, instansi_id=$4`,
      [id, b.nama || b.username || '', b.role || 'ADMIN', b.instansi_id || 'bapperida']);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/admin-delete', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.telegram_id ?? b.id ?? b.ID;
    if (!id) return fail(res, 'telegram_id wajib');
    await pool.query('DELETE FROM admin_list WHERE telegram_id = $1', [id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Face ──
app.get('/webhook/face-toggle', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM pengaturan WHERE "key"='face_recognition' AND instansi_id='bapperida'`);
    const enabled = (rows[0]?.value || '0') === '1';
    return ok(res, { data: [{ key: 'face_recognition', value: enabled ? '1' : '0', enabled }] });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/face-toggle', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const val = b.enabled ? '1' : '0';
    await pool.query(`INSERT INTO pengaturan ("key", value, instansi_id) VALUES ('face_recognition', $1, 'bapperida')
                      ON CONFLICT ("key", instansi_id) DO UPDATE SET value=$1`, [val]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/face-register', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const id = b.id ?? b.ID ?? b.user?.id;
    if (!id) return fail(res, 'id wajib');
    const hist = JSON.stringify(b.face_histogram || b.histogram || []);
    const faceModel = b.model || b.face_model || 'faceapi';
    await pool.query('UPDATE user_list SET face_histogram=$1, face_model=$2, face_photo=$3, face_saved_at=$4 WHERE id=$5',
      [hist, faceModel, b.face_photo || '', new Date().toISOString(), id]);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/face-get', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, username, "NIP", face_histogram, face_model, face_saved_at, face_photo FROM user_list WHERE "NIP"=$1`, [req.query.nip]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/face-get-all', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, username, "NIP", face_histogram, face_model, face_saved_at, face_photo FROM user_list`);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/face-settings', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT "key", value FROM pengaturan WHERE instansi_id='bapperida'`);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Signature ──
app.get('/webhook/signature-get', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nip, signature, saved_at, saved_by FROM tanda_tangan WHERE nip=$1', [req.query.nip]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/signature-list', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows } = await pool.query('SELECT id, nip, signature, saved_at, saved_by FROM tanda_tangan WHERE instansi_id=$1', [inst]);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/signature-save', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    if (!b.signature) return fail(res, 'signature wajib');
    const id = b.id || crypto.randomUUID();
    await pool.query(
      `INSERT INTO tanda_tangan (id, nip, signature, saved_by, instansi_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (nip) DO UPDATE SET signature=$3, saved_by=$4, updated_at=now()`,
      [id, b.nip || '', b.signature, b.saved_by ?? userIdOf(req), b.instansi_id || 'bapperida']);
    return ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Log & Rekap ──
app.get('/webhook/log-absen', async (req, res) => {
  try {
    const { nip, instansi_id, tanggal, limit } = req.query;
    let q = 'SELECT * FROM "Log_Absen" WHERE 1=1';
    const p = [];
    if (nip) { p.push(nip); q += ` AND "NIP" = $${p.length}`; }
    if (instansi_id) { p.push(instansi_id); q += ` AND instansi_id = $${p.length}`; }
    if (tanggal) { p.push(tanggal); q += ` AND "Tanggal" = $${p.length}`; }
    q += ' ORDER BY "Tanggal" DESC, "Jam" DESC LIMIT ' + Math.min(parseInt(limit, 10) || 200, 500);
    const { rows } = await pool.query(q, p);
    return ok(res, { data: rows });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/absen', async (req, res) => {
  try {
    const b = bodyOf(req.body);
    const nama = b.nama || b.username || '';
    const tang = b.tanggal || b.tanggal_iso || '';
    const jam = b.jam || '';
    const koordinat = b.koordinat || (b.latitude && b.longitude) ? `${b.latitude},${b.longitude}` : '';
    const jenis = (b.jenis || b.jenis_absen || '').toUpperCase() || 'MASUK';
    await pool.query(
      `INSERT INTO "Log_Absen" ("ID", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", koordinat, instansi_id, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [userIdOf(req), nama, b.nip || '', tang, jam, jenis, b.lokasi || '', b.ket || b.keterangan || '', koordinat, b.instansi_id || 'bapperida', b.request_id || null]);
    return ok(res, { ok: true, data: [] });
  } catch (e) { fail(res, e.message, 500); }
});

app.get('/webhook/rekap-absen', async (req, res) => {
  try {
    const inst = req.query.instansi_id || 'bapperida';
    const { rows: users } = await pool.query(
      'SELECT id, username, "NIP", bidang, pangkat, "Status", jam_masuk, jam_pulang FROM user_list WHERE instansi_id=$1 AND "Status"=\'AKTIF\' ORDER BY COALESCE(no,0)', [inst]);
    const pegawai = users.map(u => ({
      id: u.id, nip: u.NIP, nama: u.username, bidang: u.bidang || '', pangkat: u.pangkat || '',
      jam_masuk: u.jam_masuk || '', jam_pulang: u.jam_pulang || '',
      masuk: 0, pulang: 0, terlambat: 0, lambat_count: 0, pulang_cepat_count: 0,
      izin: 0, sakit: 0, tugas: 0, tubel: 0, cuti: 0, alpa: 0,
      _rawMasukLog: [], _rawPulangLog: [], detail: [],
    }));
    const { dari, sampai } = req.query;
    let place = 0;
    const params = [inst];
    let dq = 'SELECT * FROM "Log_Absen" WHERE instansi_id=$1';
    if (dari) { params.push(dari); dq += ` AND "Tanggal" >= $${++place+1}`; }
    if (sampai) { params.push(sampai); dq += ` AND "Tanggal" <= $${++place+1}`; }
    dq += ' ORDER BY "Tanggal", "Jam"';
    const { rows: logs } = await pool.query(dq, params);
    const byNip = new Map(pegawai.map(p => [p.nip, p]));
    const ringkasan = { hadir: 0, masuk: 0, pulang: 0, terlambat: 0, izin: 0, sakit: 0, tugas: 0, tubel: 0, cuti: 0, alpa: 0 };
    for (const l of logs) {
      const p = byNip.get(l.NIP);
      if (!p) continue;
      const jenis = (l['Jenis Absen'] || '').toUpperCase();
      ringkasan.masuk += jenis === 'MASUK' ? 1 : 0;
      ringkasan.pulang += jenis === 'PULANG' ? 1 : 0;
      const bin = { Tanggal: l.Tanggal, Jam: l.Jam, Lokasi: l.Lokasi, Ket: l.Ket, koordinat: l.koordinat };
      if (jenis === 'MASUK') { p.masuk++; p._rawMasukLog.push(bin); }
      else if (jenis === 'PULANG') { p.pulang++; p._rawPulangLog.push(bin); }
      else if (jenis === 'IZIN') { p.izin++; ringkasan.izin++; }
      else if (jenis === 'SAKIT') { p.sakit++; ringkasan.sakit++; }
      else if (jenis === 'TUGAS') { p.tugas++; ringkasan.tugas++; }
      else if (jenis === 'TUBEL') { p.tubel++; ringkasan.tubel++; }
      else if (jenis === 'CUTI') { p.cuti++; ringkasan.cuti++; }
      const d = p.detail.find(x => x.tanggal === l.Tanggal) || (p.detail.push({ tanggal: l.Tanggal, masuk: [], pulang: [] }), p.detail[p.detail.length - 1]);
      if (jenis === 'MASUK') d.masuk.push(bin); else if (jenis === 'PULANG') d.pulang.push(bin);
    }
    ringkasan.hadir = pegawai.filter(p => p.masuk || p.pulang).length;
    return ok(res, { pegawai, ringkasan });
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/webhook/kirim-rekap', async (_req, res) => ok(res, { ok: true }));

// ── Stub generik: endpoint /webhook/* lain → respons kosong (frontend tak crash) ──
app.all('/webhook/*', (_req, res) => ok(res, { ok: true, data: [], message: 'stub' }));

// ── Statis ──
app.use(express.static(ROOT));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`webhook-mock di http://127.0.0.1:${PORT} (DB ${DATABASE_URL})`);
});