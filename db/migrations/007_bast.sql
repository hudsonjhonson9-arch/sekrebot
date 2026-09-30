-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 007: BAST Serah Terima Aset
-- ═══════════════════════════════════════════════════════════════
-- 1. SIMAPO.ruangan        : ruangan/lokasi penempatan aset
-- 2. SIMAPO.unit_aset      : kolom pemegang tetap (pegawai_id = NIP, ruangan_id)
--    + identitas kendaraan (no_polisi, no_rangka, no_mesin, roda, dll)
-- 3. SIMAPO.bast           : riwayat Berita Acara Serah Terima (1 BAST = 1 pegawai)
-- Idempoten (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- -> aman diulang via webhook n8n simapo-bast-init.
-- DDL ini adalah sumber kebenaran tunggal; identik dengan query PG Bast Init
-- pada n8n/SIMAPO - BAST.json.

-- ── RUANGAN ──
CREATE TABLE IF NOT EXISTS "SIMAPO".ruangan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL DEFAULT '',
  nama TEXT NOT NULL,
  keterangan TEXT,
  instansi_id TEXT NOT NULL DEFAULT 'bapperida',
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kode, instansi_id)
);

-- ── UNIT ASET: pemegang tetap + penempatan ──
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS pegawai_id TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS ruangan_id UUID;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS no_polisi TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS no_rangka TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS no_mesin TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS roda TEXT DEFAULT '2';
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS merk_type TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS model_jenis TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS warna TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS tahun_pembuatan TEXT;
ALTER TABLE "SIMAPO".unit_aset ADD COLUMN IF NOT EXISTS updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── BAST (riwayat serah terima; denormalisasi pegawai & penandatangan) ──
CREATE TABLE IF NOT EXISTS "SIMAPO".bast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor TEXT NOT NULL,
  instansi_id TEXT NOT NULL DEFAULT 'bapperida',
  pegawai_id TEXT,
  pegawai_nama TEXT,
  pegawai_nip TEXT,
  pegawai_jabatan TEXT,
  pegawai_alamat TEXT,
  penandatangan_id TEXT,
  penandatangan_nama TEXT,
  penandatangan_nip TEXT,
  penandatangan_jabatan TEXT,
  penandatangan_alamat TEXT,
  tanggal TIMESTAMPTZ,
  hari_tanggal TEXT,
  tempat TEXT,
  daftar_aset JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_aset INT NOT NULL DEFAULT 0,
  total_nilai NUMERIC(18,2) NOT NULL DEFAULT 0,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  createdby TEXT
);

-- ── INDEX ──
CREATE INDEX IF NOT EXISTS idx_bast_instansi ON "SIMAPO".bast(instansi_id);
CREATE INDEX IF NOT EXISTS idx_bast_pegawai ON "SIMAPO".bast(pegawai_id);
CREATE INDEX IF NOT EXISTS idx_bast_createdat ON "SIMAPO".bast(createdat DESC);
CREATE INDEX IF NOT EXISTS idx_unit_aset_pemegang ON "SIMAPO".unit_aset(pegawai_id);
CREATE INDEX IF NOT EXISTS idx_unit_aset_ruangan ON "SIMAPO".unit_aset(ruangan_id);
CREATE INDEX IF NOT EXISTS idx_unit_aset_nopolisi ON "SIMAPO".unit_aset(no_polisi);