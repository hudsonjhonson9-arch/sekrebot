# Audit Paritas Aset → PostgreSQL SIMAPO (Milestone 2)

Tanggal: 2026-09-30 · Semua angka dari query read-only `postgres-mcp` + `aset-bapperida/data/aset.db`.

## 1. Posisi produksi saat ini

| Tabel | Baris | Catatan |
|---|---|---|
| `unit_aset` | **19** | referensi punya **281** → gap 262 |
| `barang` | 16 | 9 baris yatim (tidak dipakai `unit_aset`) |
| `kategori_barang` | 8 | sama dengan 8 kategori referensi ✓ |
| `ruangan` | 14 | **0 aset** — konsisten dengan referensi (ruangan juga 0 di `aset.db`) |
| `bidang` | 6 | dipakai oleh `unit_aset.bidangid` |
| `bast` / `penerimaan_barang` | 1 / 1 | referensi punya 7 arsip BAST |
| `pengaturan` (public) | 16 | **0 key Aset**; 7 key tanda tangan kosong |
| semua tabel transaksi | **0** | mutasi, peminjaman, pemeliharaan, opname, bku, tiket, request, program/kegiatan |

Produksi punya master + 19 aset, tanpa satu pun riwayat transaksi.

## 2. Temuan yang perlu diperbaiki (bukan fitur)

1. **`kondisi` tidak konsisten.** Default kolom `'BAIK'`, tapi 19/19 baris berisi `'Baik'`.
   Query `WHERE kondisi='BAIK'` mengembalikan **0 baris**. Arahkan ke satu kapitalisasi.
2. **Bloat 58 MB.** `unit_aset` total 59 MB untuk data hidup ~6,5 KB. Penyebabnya
   `unit_aset_pkey` (btree `text`) **47 MB**. `n_dead_tup` hanya 6, jadi ini index bloat
   yang tidak pernah direclaim. Perbaikan: `REINDEX INDEX CONCURRENTLY` (non-blocking).
3. **`nilaiperolehan` NULL di 19/19 aset** — tidak ada nilai perolehan sama sekali.
4. **`tahunperolehan` NULL di 17/19.**
5. **7 key tanda tangan BAST kosong**: `p1_id`, `p1_jabatan`, `p1_alamat`, `sekda_nama`,
   `sekda_nip`, `sekda_jabatan`, `sekda_alamat`. Referensi punya nilainya.
6. **9 `barang` yatim** — katalog sisa tanpa aset.

## 3. Koreksi terhadap spec lama

- Tabel `request_barang`, `detail_request`, `detail_distribusi_aset`, `detail_pemeliharaan`
  **bukan "dead table"**. Ketiganya bagian dari web FK yang utuh, hanya belum terpakai
  karena belum ada transaksi. Jangan di-drop.
- `ruangan` kosong bukan bug produksi: `aset.db` juga 0 aset yang punya `ruangan_id`.
- Spec menyebut "7 key aset kosong" — sebenarnya itu blok tanda tangan BAST, bukan
  pengaturan Aset.

## 4. Import 281 aset — scope

Master yang perlu disiapkan:

| Master | Dibutuhkan | Sudah ada |
|---|---|---|
| `kategori_barang` | 8 | 8 ✓ |
| `barang` (kategori+nama) | **111** | 16 |
| `unit_aset` | **281** | 19 |

Kategori teratas: Elektronik/TIK 120 (38 barang), Mebel 76 (30), Peralatan Kantor 43 (20),
Kendaraan 16 (7), Lainnya 13 (5). Total nilai perolehan **Rp 10.165.585.956**.
12 pegawai memegang aset.

### Semua 24 kolom punya tempat — tanpa DDL

Verifikasi lanjutan membatalkan daftar "6 kolom homeless". Tidak ada `ALTER TABLE` yang
diperlukan; semuanya muat ke kolom yang sudah ada:

| Kolom `aset.db` | Avalan | Tujuan di SIMAPO |
|---|---|---|
| `nama` | 111 nilai unik | `barang.nama` (barang = **(kategori,nama)**, 111 pasang) |
| `kategori` | 8 | `kategori_barang.nama` — **sudah cocok 8/8** |
| `kode_barang` | 44 kode | `barang.kodebarang` ✓ sudah dikirim skrip |
| `harga` | 281/281 | `barang.hargasatuan` ✓ **dan** `unit_aset.nilaiperolehan` ⚠ |
| `tahun_pembelian` | 277/281 | `unit_aset.tahunperolehan` ⚠ |
| `kondisi` | Baik 277, Kurang Baik 4 | `unit_aset.kondisi` ✓ |
| identitas kendaraan | — | `no_polisi/no_rangka/no_mesin/roda/merk_type/model_jenis/warna/tahun_pembuatan` ✓ sudah dikirim |
| `kib` | B 268, E 11, D 1, C 1 | **turunkan dari `kode_barang`** — konsisten per kode, tidak perlu kolom |
| `sumber` | 4 nilai | `"KIB 2026 - KIB B PERALATAN"` — **turunan `kib`**, tidak perlu kolom |
| `asal_usul` | Pembelian 271, null 10 | **konstan**, tidak perlu kolom |
| `bahan` | BESI/kayu/besi-plastik… | **acak per-unit** (Kamera punya 2 bahan) → bukan atribut master, nilai rendah |
| `masa_manfaat` | 5/10/4/50/null | enum 4 nilai → bisa ikut `barang.spesifikasi` |
| `ukuran` | 1/281 | praktis kosong → tidak perlu kolom |
| `no_register` | duplikat (`0001` berulang) | ⚠ **jangan** → `nomorseri` (risiko bentrok unik); nomorinventaris sintetis sudah unik |
| `ruangan_id` | **0/281 terisi** | null — sama dengan produksi, bukan cacat |

**Temuan sebenarnya:** `nilaiperolehan` NULL di 19/19 aset produksi bukan karena tidak ada
kolom — kolomnya ada. `scripts/import-bast-data.js:131` hanya mengirim `hargasatuan`
(ke `barang`), sehingga **nilai perolehan Rp 10.165.585.956 tidak pernah masuk ke
`unit_aset`**. Sama untuk `tahunperolehan`. Kalau impor dijalankan apa adanya, 281 aset
baru akan lahir dengan `nilaiperolehan` NULL — mengulang bug yang sekarang.

## 5. Gap fitur (referensi punya, kita belum)

Dikonfirmasi lewat `D:\Code\aset-bapperida\app.py` (Flask, 1004 baris, 65 def):

| Fitur | Referensi | Status kita |
|---|---|---|
| Ubah/Hapus massal | `aset_ubah_massal`, `aset_hapus_massal` | tidak ada |
| Impor KIB | `aset_impor_kib` + modul `kib_import` (openpyxl) | tidak ada |
| Export Excel | `export_xlsx` | tidak ada |
| Backup DB | `backup` | tidak ada |
| Dokumen Word | `docx` | tidak ada |

UI 16 layar sudah setara. Parser Excel **sudah ada** di bundle (`js/lib/xlsx.full.min.js`),
jadi Impor KIB bisa diparse di browser lalu dikirim lewat webhook — tanpa dependensi baru.

## 6. Status keputusan

### Sudah terjawab oleh data — tanpa DDL

1. ~~"6 kolom homeless"~~ → **semuanya punya tempat**; `kib`/`sumber`/`asal_usul` bisa
   diturunkan, `ukuran` kosong, `no_register` justru berbahaya dipetakan. Tidak perlu
   `ALTER TABLE`.
2. **Merge, bukan replace.** `import-bast-data.js` murni upsert — tidak ada `DELETE`.
   19 aset existing tidak akan hilang; 281 aset referensi masuk bersih di atasnya.
3. **Kapitalisasi `kondisi`.** Sumber `aset.db` memakai title-case yang bermakna:
   `Baik` 277, `Kurang Baik` 4. Yang menyimpang justru **default kolom** `'BAIK'`.
   Rekomendasi: normalisasi ke `'BAIK'`/`'KURANG BAIK'`, atau ubah default ke `'Baik'`.
   Sambil itu `js/simapo.js:818` sudah diperbaiki membandingkan case-insensitive, jadi
   keduanya aman.

### Masih butuh persetujuan

4. **`REINDEX INDEX CONCURRENTLY "SIMAPO".unit_aset_pkey`** — 47 MB indeks bloat.
   Non-blocking, tapi tetap DDL di produksi.
5. **7 key tanda tangan BAST** — isi dari referensi? Perlu konfirmasi data Kepala/Sekda
   masih berlaku; jangan disalin buta.
6. **Urutan fitur baru**: bulk, Impor KIB, export, atau backup dulu?

### Blocker teknis — SUDAH SELESAI

`scripts/import-bast-data.js` dry-run lulus (281 aset, 14/14 ruangan, 47 pegawai, 0 warning
kategori). Kontrak webhook dibaca dari `n8n/SIMAPO - BAST.json` dan **live-nya identik**
(34 node, SQL 3297 char sama persis).

Tiga cacat ditemukan dan **sudah dipatch + diverifikasi di DB**:

| # | Cacat | Perbaikan | Bukti |
|---|-------|-----------|-------|
| 1 | `barang` di-key `md5(instansi:kodebarang)` → hanya **44** ember, padahal sumber punya **111** pasangan unik `(kode,nama)`. Kode `1.3.2.10.02.03.003` menyangkut **39 unit** → semua akan tampil dengan satu nama arbitrer | `bid` ikut cocokkan `nama`; `md5` ikut nama | `INV-...-007` → `nama_barang = "Sepeda Motor"` |
| 2 | `nilaiperolehan` + `tahunperolehan` absen dari 17 kolom insert | ditambah; importer kini mengirim `harga` → `nilaiperolehan`, `tahun_pembelian` → `tahunperolehan` | `nilaiperolehan=18240000`, `tahunperolehan=2011` |
| 3 | `qrcode` memakai `gen_random_uuid()` **kedua** yang berbeda dari `unit_aset.id` → QR tidak resolve | CTE `nu` dipakai bersama untuk `id` **dan** `qrcode` | `qr_cocok = true` |

Sumber: `harga` 281/281 terisi (total Rp 10.165.585.956), `tahun_pembelian` 277/281
dan semua 4 digit valid. `no_register` hanya **10 nilai distinct** → memang bukan nomor
inventaris, jadi `nomorinventaris` disintesis `INV-<kode>-<id>` sudah benar (unik + stabil).

Tidak ada unique constraint di `barang(kodebarang, instansi_id)`, jadi menambah baris
`barang` dengan kode yang sama diizinkan.

**Pelajaran penting:** `PUT /workflows/{id}` saja **tidak cukup** — webhook masih
menjalankan versi aktif lama (terbukti: baris pertama tetap `null`). Perlu siklus
aktivasi. Aktivasi ulang dilakukan dengan deactivate/reactivate, dan `DELETE /workflows/{id}`
di API n8n berarti **DELETE**, bukan deactivate — workflow sempat hilang, lalu dipulihkan
dari `n8n/SIMAPO - BAST.json` dengan **id baru `jHGUCiYJeaOzUWM6`**. Path webhook tidak
berubah, jadi tidak ada pemanggil yang putus.

Progres impor: **14 dari 281** sudah ada sebelum sesi ini (hasil impor sebelumnya) →
**267 tersisa**. `simapo-bast-list` melaporkan `unit_aset=2`; itu keliru (DB = 19→20),
kemungkinan pagination default — tidak dipakai untuk dedup.

Ada **3 baris `SMOKE-TEST-*`** dan 2 baris non-`INV` (`AST-COMP-001-001`,
`AST-PROJ-001-001`) di `unit_aset` — sisa uji coba, belum diputuskan apakah dihapus.
HapusButuh write path yang bisa `DELETE`.