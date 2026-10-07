CREATE TABLE IF NOT EXISTS "SIMAPO".sbu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instansi_id VARCHAR(100) NOT NULL DEFAULT 'bapperida',
    nama_barang VARCHAR(500) NOT NULL,
    satuan VARCHAR(100) NOT NULL,
    harga_satuan NUMERIC(18,2) NOT NULL DEFAULT 0,
    sheet_name VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sbu_instansi ON "SIMAPO".sbu(instansi_id);
CREATE INDEX IF NOT EXISTS idx_sbu_nama ON "SIMAPO".sbu(nama_barang);
