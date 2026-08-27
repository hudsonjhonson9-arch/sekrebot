CREATE TABLE IF NOT EXISTS "SIMAPO".kodefikasi_barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode VARCHAR(50) NOT NULL,
    uraian VARCHAR(500) NOT NULL,
    level INTEGER DEFAULT 0,
    parent_id VARCHAR(50),
    path VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SIMAPO".rekening_belanja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode VARCHAR(50) NOT NULL,
    uraian VARCHAR(500) NOT NULL,
    jenis VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kodefikasi_path ON "SIMAPO".kodefikasi_barang(path);
CREATE INDEX IF NOT EXISTS idx_rekening_kode ON "SIMAPO".rekening_belanja(kode);
