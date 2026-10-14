-- Migration 013: kode aset unik (SINGKATAN-KATEGORI-TAHUN-HARGA) di unit_aset.
-- Kolom diisi oleh scripts/gen-kode-aset.mjs (aturan di server/kode-aset.js);
-- file ini hanya menyiapkan DDL-nya dan idempoten dijalankan kapan saja.
-- Contoh hasil: KPC-ELEKTRONIKTIK-2025-8702400 (Komputer PC/-All in one, 2025, Rp 8.702.400)
--               KPC-ELEKTRONIKTIK-2025-11523680 (unit lain, tabrak dasar → akhiran -2 dst.)

ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS kode_aset TEXT;

-- Isi ulang deterministik (aman diulang; menimpa isi lama):
--   node --env-file=.env scripts/gen-kode-aset.mjs --apply-prod
