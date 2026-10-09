import express from 'express';
import crypto from 'node:crypto';
import { verifyInitData } from './telegram.js';
import { query as realQuery } from './db.js';
import { singleSessionRow } from './auth.js';

const EMPLOYEE_SQL = `
  SELECT id::text AS id, "NIP" AS nip, role, instansi_id
  FROM user_list WHERE id::text = $1 LIMIT 1`;

const INSERT_SESSION_SQL = `
  INSERT INTO auth_sessions (session_token, nip, user_id, role, instansi_id, created_at, expires_at, last_used_at, is_active)
  VALUES ($1,$2,$3,$4,$5, now(), now() + interval '12 hours', now(), true)
  RETURNING session_token`;

const DEACTIVATE_SQL = `UPDATE auth_sessions SET is_active = false WHERE session_token = $1`;

// NIP tidak unik di user_list: ambil SEMUA baris, lalu tolak yang ambigu
// (singleSessionRow). Memilih baris pertama = menerbitkan sesi identitas salah.
const USERS_BY_NIP_SQL = `
  SELECT *, "NIP" AS nip, username AS nama FROM user_list WHERE "NIP" = $1`;

const TOKEN_RE = /^[0-9a-f]{192}$/;

// Error DB (mis. host Postgres mati/disk penuh) dulu melempar promise tak
// tertangkap → Node meng-exit seluruh proses → nginx 502 untuk SEMUA rute
// termasuk /api/health, sampai supervisor me-restart. Balas 500 supaya API tetap
// hidup dan penyebab aslinya tidak disamarkan jadi outage total.
function dbError(res) {
  return res.status(500).json({ ok: false, message: 'Gagal mengakses database.' });
}

export function createAuthSessionRouter({ query = realQuery } = {}) {
  const router = express.Router();

  router.post('/api/auth/session', async (req, res) => {
    try {
      const auth = verifyInitData(req.body?.init_data, process.env.TELEGRAM_BOT_TOKEN, { maxAgeSeconds: 86400 });
      if (!auth.ok) {
        // reason = missing | malformed | bad_signature | expired | no_user, dipakai
        // untuk diagnosis cepat tanpa menggali log.
        return res.status(401).json({ ok: false, message: 'Bukti identitas tidak valid.', reason: auth.reason });
      }

      // Identitas diambil dari init_data yang sudah diverifikasi, bukan body.nip.
      // NIP tidak unik di user_list, jadi membiarkannya memilih baris pegawai berarti
      // siapa pun yang tahu NIP orang lain bisa meminta sesi atas nama orang itu.
      const employee = (await query(EMPLOYEE_SQL, [String(auth.user.id)])).rows[0];
      if (!employee) return res.status(404).json({ ok: false, message: 'Pegawai tidak dikenal.' });

      const token = crypto.randomBytes(96).toString('hex');
      const { rows } = await query(INSERT_SESSION_SQL, [token, employee.nip, employee.id, employee.role, employee.instansi_id]);
      if (!rows.length) return res.status(500).json({ ok: false, message: 'Gagal membuat sesi.' });

      return res.status(200).json({ ok: true, session_token: rows[0].session_token });
    } catch {
      return dbError(res);
    }
  });

  // Login web non-Telegram: NIP saja, tanpa password (keputusan pengguna).
  // ponytail: NIP-only berarti siapa pun yang tahu NIP orang lain bisa mengambil
  // sesinya — celah yang sudah ada sejak alur lama juga NIP-only. Mitigasi yang
  // berjalan: face-verify sesuai toggle instansi di sisi klien, otorisasi tetap
  // dari sesi, NIP ambigu ditolak. Upgrade path kalau perlu lebih: rate-limit,
  // wajib face-verify untuk web, atau PIN/OTP per pegawai.
  router.post('/api/auth/login', async (req, res) => {
    try {
      const nip = String(req.body?.nip || '').trim();
      if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib diisi.' });

      const { rows } = await query(USERS_BY_NIP_SQL, [nip]);
      const user = singleSessionRow(rows);
      if (!user) {
        return res.status(rows.length ? 409 : 404).json({
          ok: false,
          message: rows.length ? 'NIP ambigu di user_list' : 'NIP tidak terdaftar.',
        });
      }

      const token = crypto.randomBytes(96).toString('hex');
      const ins = await query(INSERT_SESSION_SQL, [token, user.nip, user.id, user.role, user.instansi_id]);
      if (!ins.rows.length) return res.status(500).json({ ok: false, message: 'Gagal membuat sesi.' });

      return res.status(200).json({ ok: true, session_token: ins.rows[0].session_token, user });
    } catch {
      return dbError(res);
    }
  });

  router.post('/api/auth/logout', async (req, res) => {
    try {
      const token = req.body?.session_token;
      if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
        return res.status(400).json({ ok: false, message: 'session_token tidak valid.' });
      }
      await query(DEACTIVATE_SQL, [token]);
      return res.status(200).json({ ok: true });
    } catch {
      return dbError(res);
    }
  });

  return router;
}