-- Native Phase 3: archive rekap lembur.
-- Dulu tabel ini dibuat oleh workflow n8n saat endpoint lembur-save dipanggil.
-- Schema dipindahkan menjadi migration agar Express tidak melakukan DDL pada request runtime.

CREATE TABLE IF NOT EXISTS rekap_lembur (
  id SERIAL PRIMARY KEY,
  judul TEXT NOT NULL,
  nomor_surat TEXT,
  tanggal_dari DATE NOT NULL,
  tanggal_sampai DATE NOT NULL,
  tanggal_list TEXT[],
  pegawai_nips TEXT NOT NULL,
  pegawai_names TEXT NOT NULL,
  data_json JSONB NOT NULL,
  instansi_id TEXT,
  saved_by_nip TEXT,
  saved_by_nama TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rekap_lembur_instansi_created_idx
  ON rekap_lembur (instansi_id, created_at DESC);
