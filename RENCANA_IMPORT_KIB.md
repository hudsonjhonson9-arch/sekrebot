# Rencana Import KIB Excel ke SIMAPO

**File:** `14. KIB A - F 2025.xlsx`
**Target DB:** `SIMAPO` schema (`barang` + `unit_aset`)

## Data

| Sheet | Item | Jumlah |
|-------|------|--------|
| KIB B KENDARAAN | Kendaraan (mobil, motor) | 17 |
| KIB B PERALATAN | Peralatan (komputer, AC, dll) | ~250 |

## Mapping

| Excel | DB | Keterangan |
|-------|----|------------|
| NAMA BARANG / JENIS BARANG | `barang.nama` | 1 barang per jenis |
| KODE BARANG (hirarki) | `barang.kodebarang` | Grup kode |
| MERK/TYPE | `barang.spesifikasi` | |
| NOMOR REG | `unit_aset.nomorinventaris` | |
| TAHUN PEMBELIAN | `unit_aset.tahunperolehan` | |
| HARGA | `unit_aset.nilaiperolehan` | |
| KONDISI BARANG (B/RR) | `unit_aset.kondisi` | |
| NAMA PEMEGANG | `unit_aset.keterangan` | |
| SUB PERANGKAT DAERAH | `unit_aset.bidangid` | (perlu mapping) |
| `jenisbarang` | `barang.jenisbarang` = `'ASET_TETAP'` | |
| `satuan` | `barang.satuan` = `'Unit'` | |
| QR Code | `unit_aset.qrcode` | Auto `SIMAPO-` + id |

## Proses (via n8n)

1. **Bulk insert barang** — tiap distinct NAMA BARANG → 1 baris di `barang` (jenisbarang='ASET_TETAP')
2. **Bulk insert unit_aset** — tiap baris Excel → 1 baris di `unit_aset`, linking ke barang via `barangid`
3. **Generate QR** — update `unit_aset.qrcode` = `SIMAPO-{id}`
4. **Update stok** — `UPDATE barang SET stok_saat_ini = (SELECT COUNT(*) FROM unit_aset WHERE barangid = barang.id) WHERE jenisbarang = 'ASET_TETAP'`

## Yang Perlu Diputuskan

- [ ] Import semua sheet atau hanya Kendaraan + Peralatan?
- [ ] Mapping bidang/sub perangkat daerah?
- [ ] QR format: `SIMAPO-{id}` atau `KIB-{nomorinventaris}`?
