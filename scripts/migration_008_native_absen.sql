-- Migration: audit jam client + bersihkan statistik orphan (Native Absensi V5.2)
-- Run this in PostgreSQL directly (psql, pgAdmin, or n8n SQL node)
-- Database: n8n_storage @ mindcloud.my.id
--
-- Idempotent: aman dijalankan ulang.
--
-- CATATAN WAKTU: ALTER TABLE mengunci Log_Absen selama seluruh durasi.
-- Jalankan di luar jam sibuk (admin absen aktif ~07:00-16:00 WITA).

-- T2: jam resmi (Tanggal/Jam) tetap diisi dari server. Nilai yang diklaim
-- client disimpan terpisah supaya bisa diaudit tanpa dipercaya.
ALTER TABLE public."Log_Absen"
  ADD COLUMN IF NOT EXISTS client_jam text;

-- Statistik tanpa pegawai = sisa workflow lama. Bersihkan supaya UPSERT
-- berbasis recompute tidak pernah menghidupkan kembali baris yatim.
DELETE FROM public.statistik_pegawai s
  WHERE NOT EXISTS (SELECT 1 FROM public.user_list u WHERE u."NIP" = s.nip);

-- Verify: kolom harus ada, dan tidak ada statistik yatim.
SELECT count(*) AS statistik_yatim
  FROM public.statistik_pegawai s
  WHERE NOT EXISTS (SELECT 1 FROM public.user_list u WHERE u."NIP" = s.nip);