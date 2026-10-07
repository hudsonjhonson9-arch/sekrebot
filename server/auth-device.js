import express from 'express';
import crypto from 'node:crypto';
import { query as realQuery } from './db.js';
import { hashDeviceToken, singleSessionRow } from './auth.js';

// NIP tidak unik di user_list, jadi satu NIP bisa lebih dari satu baris. Ambil
// seluruhnya lalu menolak yang ambigu; memilih "baris mana yang kebetulan duluan"
// berarti menerbitkan token untuk identitas yang salah.
const USERS_BY_NIP_SQL = `
  SELECT id::text AS id, "NIP" AS nip, role, instansi_id
  FROM user_list WHERE "NIP" = $1`;

const INSERT_SQL = `
  INSERT INTO device_sessions (token_hash, device_label, nip, user_id, expires_at)
  VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval)
  RETURNING id, expires_at`;

// Token asli tidak pernah disimpan, jadi tidak bisa ditampilkan lagi: daftar hanya
// metadata. Perlu label supaya admin bisa meng tahu device mana yang dicabut.
const LIST_SQL = `
  SELECT id, device_label, nip, created_at, last_used_at, expires_at, is_active, revoked_at
  FROM device_sessions ORDER BY id DESC LIMIT 200`;

const REVOKE_SQL = `
  UPDATE device_sessions SET is_active = false, revoked_at = now()
  WHERE id = $1 AND is_active = true AND revoked_at IS NULL
  RETURNING id`;

const DEFAULT_EXPIRY_DAYS = 365;
const MAX_EXPIRY_DAYS = 3650;

export function createAuthDeviceRouter({ query = realQuery } = {}) {
  const router = express.Router();

  router.post('/devices', async (req, res) => {
    const nip = String(req.body?.nip || '').trim();
    if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib diisi.' });

    const { rows } = await query(USERS_BY_NIP_SQL, [nip]);
    const user = singleSessionRow(rows);
    if (!user) {
      // 404 untuk "tidak ada" dan 409 untuk "ambigu" sengaja dibedakan: admin perlu
      // tahu NIP-nya typo atau justru dobel di user_list sebelum serialize perangkat.
      return res.status(rows.length ? 409 : 404).json({
        ok: false,
        message: rows.length ? 'NIP ambigu di user_list' : 'NIP tidak terdaftar.',
      });
    }

    const days = Number(req.body?.expires_days);
    const expiresDays = Number.isFinite(days) && days > 0
      ? Math.min(Math.trunc(days), MAX_EXPIRY_DAYS)
      : DEFAULT_EXPIRY_DAYS;

    const token = 'dv_' + crypto.randomBytes(32).toString('hex');
    const label = String(req.body?.device_label || '').trim().slice(0, 80);
    const created = await query(INSERT_SQL, [hashDeviceToken(token), label, user.nip, user.id, String(expiresDays)]);

    // Token dikembalikan tepat sekali. Kalau hilang, cabut device dan buat baru.
    return res.status(201).json({
      ok: true,
      device_id: created.rows[0]?.id,
      device_token: token,
      expires_at: created.rows[0]?.expires_at,
      message: 'Simpan token ini sekarang. Tidak akan ditampilkan lagi.',
    });
  });

  router.get('/devices', async (req, res) => {
    const { rows } = await query(LIST_SQL, []);
    return res.json({ ok: true, data: rows });
  });

  router.delete('/devices/:id', async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^\d+$/.test(id)) return res.status(400).json({ ok: false, message: 'id tidak valid.' });
    const { rows } = await query(REVOKE_SQL, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Device tidak aktif.' });
    return res.json({ ok: true, device_id: rows[0].id });
  });

  return router;
}