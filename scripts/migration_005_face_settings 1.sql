-- Migration: Add face settings to pengaturan table (MCP-postgres / n8n_storage)
-- Run this in PostgreSQL directly (psql, pgAdmin, or n8n SQL node)
-- Database: n8n_storage @ 10.11.8.62

-- Insert face settings (skip if already exists)
INSERT INTO pengaturan (key, value, instansi_id) VALUES
  ('face_liveness_enabled', 'true', 'bapperida'),
  ('face_threshold', '0.55', 'bapperida'),
  ('face_meja_threshold', '0.55', 'bapperida'),
  ('face_liveness_score', '0.40', 'bapperida'),
  ('face_mandatory_nips', '[]', 'bapperida')
ON CONFLICT DO NOTHING;

-- Verify
SELECT key, value FROM pengaturan WHERE key LIKE 'face%' ORDER BY key;
