-- Migration: Per-instansi face_recognition toggle — remove old global key
-- Run this in PostgreSQL directly (psql, pgAdmin, or n8n SQL node)
-- Database: n8n_storage @ 10.11.8.62

-- Remove the old global face_recognition entry (now per-instansi)
DELETE FROM pengaturan WHERE key = 'face_recognition' AND instansi_id IS NULL;

-- Verify no orphaned global entries remain
SELECT key, value, instansi_id FROM pengaturan WHERE key = 'face_recognition' ORDER BY instansi_id;
