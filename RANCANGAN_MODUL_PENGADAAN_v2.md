# SIMAPO — Modul Penerimaan Barang & Pemeliharaan

---

### 1. Menu

**SIMAPO (user):** tidak berubah
```
[Katalog] [Pinjam] [Lapor]
```

**Panel Admin → Inventaris — grouping + scroll:**
```
[Kelola Aset | Transaksi]   ← segmented control ganti grup
  └─ Kelola Aset: [Aset] [Kategori] [Mutasi] [Opname]
  └─ Transaksi:  [Pinjaman] [Tiket] [Penerimaan] [Pemeliharaan] [BKU]
               ← scroll horizontal
```

### 2. Skema Database

Migration: `002_simapo_pengadaan_pemeliharaan.sql`

```sql
-- penerimaan_barang — header nota/kwitansi
-- detail_penerimaan — item per nota (FK ke barang)
-- pemeliharaan — kartu servis per barang
-- bku — data BKU hasil import Excel
```

### 3. N8n

1 workflow `simapo-ext` — 6 endpoint (GET/POST penerimaan, status, pemeliharaan, bku, rekonsiliasi)

### 4. Frontend

Extend `js/simapo.js` + `js/admin.js` (grouping logic di admin inventaris)

### 5. File

- `002_simapo_pengadaan_pemeliharaan.sql`
- `n8n/simapo-ext.workflow.json`
- `RANCANGAN_MODUL_PENGADAAN_v2.md`
