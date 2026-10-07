CREATE SCHEMA IF NOT EXISTS "SIMAPO";

-- ── PENERIMAAN BARANG (Header) ──
CREATE TABLE IF NOT EXISTS "SIMAPO".penerimaan_barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instansi_id VARCHAR(100) NOT NULL DEFAULT 'bapperida',
    no_nota VARCHAR(200) NOT NULL,
    tgl_nota DATE NOT NULL,
    penyedia VARCHAR(300) NOT NULL,
    total_nilai NUMERIC(18,2) NOT NULL DEFAULT 0,
    no_sp2d VARCHAR(200),
    status_spj VARCHAR(20) NOT NULL DEFAULT 'belum_dikumpulkan'
        CHECK (status_spj IN ('belum_dikumpulkan','sudah_di_map','sudah_lapor')),
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── DETAIL PENERIMAAN ──
CREATE TABLE IF NOT EXISTS "SIMAPO".detail_penerimaan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    penerimaan_id UUID NOT NULL REFERENCES "SIMAPO".penerimaan_barang(id) ON DELETE CASCADE,
    barang_id TEXT NOT NULL REFERENCES "SIMAPO".barang(id),
    volume NUMERIC(12,2) NOT NULL DEFAULT 1,
    harga_satuan NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_harga NUMERIC(18,2) NOT NULL DEFAULT 0
);

-- ── PEMELIHARAAN (Kartu Servis) ──
CREATE TABLE IF NOT EXISTS "SIMAPO".pemeliharaan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instansi_id VARCHAR(100) NOT NULL DEFAULT 'bapperida',
    barang_id TEXT NOT NULL REFERENCES "SIMAPO".barang(id),
    tgl_pemeliharaan DATE NOT NULL,
    jenis_pemeliharaan VARCHAR(300) NOT NULL,
    biaya NUMERIC(18,2) NOT NULL DEFAULT 0,
    nama_penyedia VARCHAR(300),
    bentuk_kontrak VARCHAR(100),
    keterangan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── BKU (import dari Excel) ──
CREATE TABLE IF NOT EXISTS "SIMAPO".bku (
    id SERIAL PRIMARY KEY,
    instansi_id VARCHAR(100) NOT NULL DEFAULT 'bapperida',
    bulan SMALLINT NOT NULL CHECK (bulan BETWEEN 1 AND 12),
    tahun SMALLINT NOT NULL,
    no_urut INTEGER,
    tgl DATE,
    uraian TEXT,
    kode_rekening VARCHAR(50),
    penerimaan NUMERIC(18,2) DEFAULT 0,
    pengeluaran NUMERIC(18,2) DEFAULT 0,
    saldo NUMERIC(18,2) DEFAULT 0,
    import_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── INDEX ──
CREATE INDEX IF NOT EXISTS idx_penerimaan_instansi ON "SIMAPO".penerimaan_barang(instansi_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tgl ON "SIMAPO".penerimaan_barang(tgl_nota);
CREATE INDEX IF NOT EXISTS idx_detail_penerimaan ON "SIMAPO".detail_penerimaan(penerimaan_id);
CREATE INDEX IF NOT EXISTS idx_pemeliharaan_barang ON "SIMAPO".pemeliharaan(barang_id);
CREATE INDEX IF NOT EXISTS idx_bku_instansi ON "SIMAPO".bku(instansi_id, bulan, tahun);
