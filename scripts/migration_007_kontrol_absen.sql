-- Migration: Kontrol Kehadiran config in pengaturan (key/value/instansi_id)
-- Run this in PostgreSQL directly (psql, pgAdmin, or n8n SQL node)
-- Database: n8n_storage @ 10.11.8.62

-- Seed default (disabled) config. Value is JSON:
--   { "enabled": bool, "toleransi": menit, "times": [ { "jam": "HH:MM", "aktif": bool } ] }
INSERT INTO pengaturan (id, key, value, instansi_id)
VALUES (
  COALESCE((SELECT MAX(id) FROM pengaturan), 0) + 1,
  'kontrol_absen',
  '{"enabled":false,"toleransi":30,"times":[{"jam":"10:00","aktif":true}]}',
  'bapperida'
)
ON CONFLICT (key, instansi_id) DO NOTHING;

-- Verify
SELECT key, value, instansi_id FROM pengaturan WHERE key = 'kontrol_absen' ORDER BY instansi_id;