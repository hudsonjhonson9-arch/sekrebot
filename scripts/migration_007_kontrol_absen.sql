-- Migration: Kontrol Kehadiran config in pengaturan (key/value/instansi_id)
-- Run this in PostgreSQL directly (psql, pgAdmin, or n8n SQL node)
-- Database: n8n_storage @ 10.11.8.62

-- WAJIB: unique index (key, instansi_id) supaya ON CONFLICT bekerja.
-- (Juga dipakai webhook face-settings & kontrol-absen saat UPSERT.)
CREATE UNIQUE INDEX IF NOT EXISTS pengaturan_key_instansi_idx ON pengaturan (key, instansi_id);

-- Seed default (disabled) config. Value is JSON:
--   { "enabled": bool, "toleransi": menit, "times": [ { "jam": "HH:MM", "aktif": bool } ] }
INSERT INTO pengaturan (key, value, instansi_id)
VALUES (
  'kontrol_absen',
  '{"enabled":false,"toleransi":15,"times":[{"jam":"10:00","aktif":true}]}',
  'bapperida'
)
ON CONFLICT (key, instansi_id) DO NOTHING;

-- Verify
SELECT key, value, instansi_id FROM pengaturan WHERE key = 'kontrol_absen' ORDER BY instansi_id;