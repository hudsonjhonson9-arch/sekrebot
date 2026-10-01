# Design: Port Fitur aset-bapperida → Admin Aset absensi

Tanggal: 2026-09-30
Status: menunggu review user

## 1. Tujuan & Cakupan

Memindahkan **semua fitur** aplikasi `D:\Code\aset-bapperida` (Flask + SQLite) ke panel admin aset di `D:\Code\absensi_refactored_v6` (static JS + n8n + Postgres), **tanpa mengubah output dokumen** — BAST harus identik dengan template di `D:\Code\aset-bapperida\docx_template\`.

**Termasuk (sudah disetujui):**
1. BAST lengkap: dua template (`bast_kendaraan.docx` + `bast_umum.docx`), logika jenis otomatis + campuran, P1 Sekda/Kepala + validasi, blok TTD rapat, opsi tempel gambar TTD
2. Fitur data aset: input massal, impor KIB, normalisasi kode barang/harga, export XLSX, ringkasan aset
3. Dua tab baru + Pengaturan (Sekda/Kepala, kosongkan aset) + ringkasan di Master
4. Taste overhaul semua tab panel admin aset (tema gelap-navy+emas dipertahankan)
5. Bugfix: sub-menu grup tampil semua saat load pertama

**Tidak termasuk:** backup/cadangan (dibatalkan user).

## 2. Konteks

### 2.1 Sumber (D:\Code\aset-bapperida)
- Flask monolitik `app.py` (805 baris); helper `util.py` (`norm_kode`, `kode_compact`, `parse_harga`, `fmt_id`, `guess_kategori`, `roda_from`), `kib_import.py`, `bulk.py`
- Template: `docx_template/bast_kendaraan.docx` (41.296 B), `docx_template/bast_umum.docx` (38.632 B)
- Logika BAST kunci: `tipe_aset` (kategori == "Kendaraan" → kendaraan), `fill_bast` (template = kendaraan jika semua kendaraan, selainnya umum; campuran → tabel kendaraan di-clone dari template kendaraan disisipkan sebelum tabel umum), `kalimat_serah`, `bast_defaults`, `bast_data` (P1 sekda/kepala dari settings, validasi P1 NIP ≠ P2 NIP), `isi_tabel` (baris contoh di-clone per item), `terbilang`
- Fitur lain: CRUD aset/pegawai/ruangan, input massal (paste Excel), impor KIB (idempoten), export XLSX, pengaturan (sekda_*, p1_*), kosongkan aset, riwayat BAST

### 2.2 Target (absensi_refactored_v6)
- Frontend statis vanilla JS; tab admin SIMAPO di `index.html` (`sa-sect-*`), logic di `js/simapo-ext.js` (86 KB, sudah pakai SheetJS), `js/simapo-bast.js` (render docx client-side via docxtemplater + pizzip)
- Backend: n8n workflow HTTP → Postgres. BAST lama: `SIMAPO - BAST` id `jHGUCiYJeaOzUWM6` (34 node), gate header `x-bast-key` (`BAST_API_KEY` di `js/config.js`)
  - id workflow berubah 2026-10-01: `GRwy3zOtdC4HCLP7` dihapus tak sengaja saat aktivasi ulang, lalu dibuat ulang dari salinan lokal `n8n/SIMAPO - BAST.json`. Path webhook tidak berubah, jadi semua pemanggil tetap jalan.
- **Database: Postgres via pgAdmin 4** (bukan Supabase) — verifikasi via MCP `postgres-mcp`:
  - skema `SIMAPO`: `barang`, `unit_aset`, `bast`, `ruangan`, `kategori_barang`, `kategori` id kat06/kat07 = "Kendaraan Roda 4/2", `mutasi_barang`, `penerimaan_barang`, `standar_harga`, `request_barang`, `kodefikasi_barang`, `detail_distribusi_aset`
  - `public`: `pengaturan` (key/value), `tanda_tangan` (signature per NIP), `user_list` (pegawai; kolom "Jabatan", tanpa `isactive`)
- Sudah ada: master aset CRUD, kategori, mutasi, opname, standar harga, BAST (kendaraan saja), pinjam/tiket/penerimaan/pemeliharaan/BKU/PKS, QR aset

### 2.3 Design read & dial (taste skill)
Panel admin pemerintah daerah, trust-first, data-dense → VARIANCE 3–4, MOTION 2–3, DENSITY 4–5. Redesign-preserve: wajah merek dipertahankan, kualitas dinaikkan.

## 3. Bagian 1 — BAST (prioritas utama)

### 3.1 Template (build-time, `scripts/build-bast-template.js` diperluas)
| Output | Sumber | Isi |
|---|---|---|
| `bast_template.docx` (sudah ada) | `bast_kendaraan.docx` | loop `{#asets}` tabel kendaraan |
| `bast_umum_template.docx` (baru) | `bast_umum.docx` | loop `{#asets}` tabel umum: No, Nama Barang, Merk/Type, Kode Barang, Reg., Tahun, Kondisi, Harga (Rp), Keterangan |
| `bast_campuran_template.docx` (baru) | `bast_umum.docx` + tabel kendaraan disisipkan build-time (deep-copy `<w:tbl>` XML dari docx kendaraan, port `_clone_rpr`) | dua loop: `{#kendAsets}` (tabel kendaraan) + `{#umumAsets}` (tabel umum) |

- Perbaiki default `TEMPLATE_SRC` di script: `../../aset-bapperida/aset-bapperida/docx_template/...` salah → `../../aset-bapperida/docx_template/bast_kendaraan.docx` (path asli sekarang `D:\Code\aset-bapperida\docx_template\`)
- Keluaran tetap juga ke `public/bast_template.docx` (+ root untuk fallback fetch); `dist/` hasil `npm run build`
- Blok TTD (nama + NIP): set `<w:keepNext/>` build-time pada paragrafnya agar tidak terpisah halaman — di ketiga template
- Gambar TTD opsional: bake placeholder gambar tetap ukuran di posisi TTD build-time; runtime tukar byte `word/media/imageN.png` via pizzip (isi contain + padding transparan agar rasio tidak melar) — **tanpa dependency baru**

### 3.2 Logika jenis (client — port persis `fill_bast`/`tipe_item`)
- Tipe per aset: `kategori_nama` mengandung "Kendaraan" → kendaraan, selainnya umum
- Semua kendaraan → template kendaraan; selainnya (semua umum ATAU campuran) → template umum/campuran
- Kalimat serah terima = port `kalimat_serah` persis (terbilang, campuran "X unit kendaraan dinas dan N (terbilang) item barang inventaris", tempat/unit BAPPERIDA, kondisi BAIK/sebagaimana tercantum)
- `bastTerbilang` yang sudah ada diverifikasi paritas dengan `terbilang()` Python lewat test render

### 3.3 P1/P2 (port `bast_data`)
- Form BAST: dropdown P1 = **Sekretaris Daerah** | **Kepala Badan** (data dari tab Pengaturan) | **penandatangan manual** (opsi lama tetap)
- Validasi: P1 NIP ≠ P2 NIP (client, port pesan error); jika P2 berjabatan "Kepala …" → default P1 = Sekda
- Simpan ke kolom `SIMAPO.bast.penandatangan_*` yang ada (P1) + `pegawai_*` (P2) — **tanpa migrasi**; tiap item di `daftar_aset` jsonb membawa `tipe`; arsip lama tetap terbuka (fallback mapping lama di `bastReopen`)
- Perlengkapan: kendaraan → default "STNK, Surat Ketetapan Pajak Kendaraan Bermotor" (editable); umum → opsional

### 3.4 Tanda tangan
- **A (default)**: blok nama+NIP tetap persis template, tidak terpisah halaman (keepNext)
- **B (opsi)**: checkbox "Tempel gambar tanda tangan" (default mati) → ambil gambar via `simapo-ttd-get?nip=` untuk P1 & P2; jika NIP tidak punya gambar → fallback ketikan

## 4. Bagian 2 — Fitur data aset

1. **Input massal** (tab Impor & Data): textarea paste tab-separated, dukung baris judul opsional; urutan tanpa judul: Nama, Kode Barang, Merk/Type, Tahun, Harga, Kondisi (port `aset_massal`) → preview tabel → `simapo-aset-massal` → mapping `barang`+`unit_aset` (pola `scripts/import-bast-data.js`), duplikat dilewati, hasil per baris
2. **Impor KIB**: upload `.xlsx` KIB A-F → parse client (SheetJS, port `kib_import.py`) → preview → `simapo-aset-kib`; aman diulang (tidak menggandakan)
3. **Normalisasi**: port `norm_kode` + `parse_harga` ke helper JS; dipakai form Master, massal, KIB; pencarian Master menerima semua bentuk ("1 3 2 02 01 04 001", "1.3.2.02.01.04.001")
4. **Export XLSX**: client-side SheetJS dari data list/summary
5. **Ringkasan**: kartu di atas Master — total unit, total nilai perolehan, jumlah pemegang, jumlah ruangan (endpoint agregat)

## 5. Bagian 3 — UI & taste overhaul

- **Tab baru**: "📥 Impor & Data" (group Aset); "⚙️ Pengaturan" (group Referensi: data P1 Sekda/Kepala + Kosongkan Aset dengan ketik "HAPUS")
- **Bugfix**: saat load pertama hanya tab grup aktif yang tampil (panggil filter `switchSAGroup` saat init)
- **Audit-first**: inventaris semua `sa-sect-*` (Aset, Kategori, Mutasi, Opname, Standar Harga, BAST, Pinjaman, Tiket, Penerimaan, Pemeliharaan, BKU, PKS) → daftar temuan → perbaiki
- **Kunci token**: radius tunggal (card 14px / input 8px / tombol satu aturan), palet navy-gold + aksen status (hijau/merah/kuning), satu skala tipografi; vanilla CSS/JS — tanpa ganti library
- **State lengkap per tab**: skeleton sesuai bentuk, empty state terkomposisi, error inline/toast
- **Aksesibilitas**: kontras WCAG AA (teks, tombol, form, placeholder, focus, error), label di atas input, error di bawah input
- **Rapi**: angka `mono`, divider halus, `:active` scale 0.98, dark mode terkunci, motion rendah (hover/focus saja)

## 6. Bagian 4 — Backend n8n

- **Workflow baru** `SIMAPO - Aset Data`: JSON di `n8n/`, deploy update-in-place (pola skrip yang ada), gate `x-bast-key` sama; workflow BAST lama tidak diubah
- **Endpoint**:
  | Path | Fungsi |
  |---|---|
  | `simapo-aset-massal` | bulk insert barang+unit (idempoten, hasil per baris) |
  | `simapo-aset-kib` | bulk insert hasil parse KIB (aman diulang) |
  | `simapo-aset-summary` | agregat ringkasan + data export |
  | `simapo-pengaturan-get` / `simapo-pengaturan-set` | key/value P1 di `public.pengaturan` (nama key persis mengikuti `bast_data()` app.py — dibaca saat implementasi) |
  | `simapo-ttd-get?nip=` | gambar TTD dari `public.tanda_tangan` |
  | `simapo-aset-kosongkan` | destructive; wajib konfirmasi "HAPUS" di client **dan** guard server-side; cakupan hapus (per instansi — `instansi_id` dari query, default `bapperida`; baris instansi lain tidak tersentuh): semua tabel domain aset yang jadi FK-referen `barang`/`unit_aset` (riwayat transaksi ikut terhapus — dipaksa FK Postgres: `riwayat_pemeliharaan`, `detail_distribusi_aset`, `jadwal_maintenance`, `peminjaman`, `detail_opname`, `detail_request`, `detail_pemeliharaan`, `mutasi_barang`, `detail_penerimaan`, `pemeliharaan`, lalu `unit_aset`, `barang`), sedangkan ruangan/kategori/pegawai/pengaturan/tanda_tangan/arsip BAST tetap |
- **Tanpa migrasi DB**; export & parse tetap client-side; normalisasi selesai sebelum kirim ke server

## 7. Bagian 5 — Verifikasi

1. Test render Node untuk **ketiga** template: semua tag terisi, tidak ada placeholder sisa, loop/tabel benar, kalimat serah terima persis, blok TTD utuh
2. Render via browser: bandingkan halaman per halaman dengan docx sumber
3. Massal (dengan/tanpa judul, berbagai bentuk kode) → jumlah baris sesuai; KIB 2× → tidak menggandakan (cek langsung via MCP Postgres)
4. Angka ringkasan vs query SQL (MCP) cocok; export XLSX terbuka
5. Roundtrip pengaturan; opsi gambar TTD hanya muncul bila NIP punya gambar
6. Kosongkan: uji guard saja (tolak tanpa "HAPUS"); penghapusan asli dijalankan user
7. Bugfix sub-menu + taste pre-flight checklist + screenshot sebelum/sesudah
8. `node --check`, `npm run build`, deploy workflow, smoke endpoint live

## 8. File yang disentuh

- `scripts/build-bast-template.js` — perluas: sumber umum, doc campuran, keepNext, placeholder gambar
- `public/bast_template.docx`, `public/bast_umum_template.docx`, `public/bast_campuran_template.docx` (+ salinan root)
- `js/simapo-bast.js` — jenis otomatis, `kalimat_serah`, P1 sekda/kepala, checkbox TTD, pilih template
- `js/simapo-ext.js` / `js/simapo.js` — tab baru, ringkasan, massal, KIB, export, pengaturan, kosongkan, bugfix grup
- `index.html` — dua `sa-sect` baru, kartu ringkasan, kontrol form BAST
- CSS (token radius/palette/type, state)
- `n8n/SIMAPO - Aset Data.json` (baru) + skrip deploy
- Helper baru: `norm_kode`/`parse_harga` (JS) — kemungkinan `js/simapo-util.js` atau di dalam file yang sudah ada

## 9. Risiko & keputusan

- **Token n8n API punya masa berlaku** — kalau expired saat deploy, perlu token baru dari user
- **Parse KIB**: format kolom KIB A–F dipelajari dari `kib_import.py` + file contoh saat implementasi (bukan tebakan)
- **Nama key pengaturan**: ikuti persis `bast_data()` app.py — dibaca ulang saat implementasi
- **List endpoint mungkin ber-limit** — kalau export butuh semua baris, tambah param `limit`/`all` atau pakai `simapo-aset-summary` untuk baris lengkap (diputuskan saat implementasi setelah cek SQL list yang ada)
- **Campuran ≠ identik sekop**: dokumen campuran aset-bapperida juga menghasilkan dua tabel dalam satu doc; kita meniru hasil akhirnya, bukan kode Python-nya
