# Rancangan Modul Pengadaan Barang / Aset (SIMAPO)
### Integrasi ke `absensi_refactored_v6` — BAPPERIDA Kabupaten Sumba Barat

---

## 1. Latar Belakang & Tujuan

Saat ini pencatatan pengadaan barang (belanja pakai habis & aset tetap) dilakukan manual:
nota/kwitansi dikumpulkan fisik ke dalam map, baru direkap menjadi Excel & SPJ di akhir
periode. Proses ini rawan telat, rawan nota hilang/lupa dicatat, dan rekap manual
memakan waktu.

**Tujuan modul ini:**
- Pencatatan transaksi belanja dilakukan **saat itu juga**, bukan menunggu terkumpul di map.
- Nota fisik tetap disimpan terpisah sebagai arsip SPJ (tidak perlu foto/scan di sistem).
- Pegawai (bukan hanya bendahara) bisa **memantau progres** status pelaporan.
- Rekap periode (bulanan/triwulanan) sesuai format Permen 47 bisa digenerate otomatis,
  bukan disusun manual dari tumpukan nota.

---

## 2. Keputusan Arsitektur

| Aspek | Keputusan |
|---|---|
| Database | Satu database Postgres yang sama dengan absensi (`instansi_id`, `user_list` dipakai ulang) |
| Auth | Reuse auth & RBAC yang sudah ada di absensi (role bendahara ditambahkan ke sistem role existing) |
| Backend | Express/Node custom (route baru, bukan n8n) |
| Frontend | Modul React terpisah di dalam aplikasi yang sama |
| **Akses menu** | **Terpisah dari menu Absensi** — muncul sebagai menu/section sendiri di navigasi utama, bukan submenu di dalam halaman absensi. Tetap bisa diakses dari aplikasi yang sama (satu login, satu domain), tapi secara UX dua area yang jelas berbeda. |
| Skema tabel | Namespace terpisah (`nota_pengadaan`, `pengadaan_barang`, dst) — tidak menyentuh tabel absensi (`Log_Absen`, `jam_absen`, dll) |

**Alasan pemisahan menu:** absensi bersifat harian/real-time (face recognition, GPS),
pengadaan bersifat transaksional/periodik (nota, laporan triwulanan). Concern-nya
beda, jadi UX-nya juga sebaiknya dipisah supaya tidak membingungkan pegawai yang cuma
mau presensi, sekaligus supaya bug di satu modul tidak berisiko ke modul lain.

---

## 3. Skema Database

Sudah dibuat: `001_modul_pengadaan_barang.sql`

Ringkasan tabel:

- **`kodefikasi_barang`** — master kode barang berjenjang sesuai Permen 47 (Aset → Aset
  Lancar → Persediaan → ... → kode barang detail). Diisi sekali via seed data dari
  Excel yang sudah ada.
- **`rekening_belanja`** — master kode & uraian rekening belanja daerah.
- **`sub_kegiatan`** — master sub kegiatan per instansi.
- **`nota_pengadaan`** (header) — satu baris = satu nota/kwitansi. Menyimpan tanggal,
  penyedia, status SPJ (`belum_dikumpulkan` → `sudah_di_map` → `sudah_lapor`), dan
  `periode_pelaporan` yang terisi **otomatis** via trigger dari tanggal transaksi.
- **`pengadaan_barang`** (detail) — banyak baris per nota, satu baris = satu item
  barang. Karena satu nota bisa berisi beberapa barang berbeda (mis. cat, kuas, tiner
  dalam satu kwitansi yang sama).
- **View `v_progres_nota`** — untuk dashboard progres pegawai (read-only), termasuk
  flag `terlambat` otomatis (belum di-map setelah 7 hari).
- **View `v_rekap_pengadaan_periode`** — rekap agregat per periode & status, untuk
  laporan ringkas.

---

## 4. Backend API (Express)

Sudah dibuat kerangka: `pengadaanRouter.js`

| Endpoint | Method | Akses | Fungsi |
|---|---|---|---|
| `/api/pengadaan/kodefikasi` | GET | semua pegawai | daftar kode barang |
| `/api/pengadaan/sub-kegiatan` | GET | semua pegawai | daftar sub kegiatan |
| `/api/pengadaan/rekening` | GET | semua pegawai | daftar rekening belanja |
| `/api/pengadaan/nota` | POST | bendahara/admin | simpan nota + semua item sekaligus (transaksional) |
| `/api/pengadaan/nota/:id/status` | PATCH | bendahara/admin | update status SPJ |
| `/api/pengadaan/progres` | GET | semua pegawai | data dashboard progres |
| `/api/pengadaan/rekap` | GET | semua pegawai | rekap per periode |

**Belum final, masih perlu:**
- Cocokkan `db/pool` dengan koneksi Postgres yang sudah ada di project absensi.
- Cocokkan `requireRole` dengan middleware auth existing (pola `UPPER(role) IN
  ('ADMIN','SUPERADMIN')` yang sudah dipakai di SekreBot).
- Tambah role baru `BENDAHARA` ke sistem role yang sudah ada (`user_list.role` /
  `admin_list.role`).

---

## 5. Frontend — Struktur Modul

```
src/
├── modules/
│   ├── absensi/                    # existing, tidak disentuh
│   └── pengadaan/                  # modul baru
│       ├── components/
│       │   ├── NotaPengadaanForm.jsx     # input nota + banyak item barang
│       │   ├── ItemBarangRow.jsx          # baris item, bisa tambah/hapus
│       │   ├── ProgresDashboard.jsx       # dashboard progres (semua pegawai)
│       │   ├── UpdateStatusSpj.jsx        # checklist status (khusus bendahara)
│       │   └── RekapPeriode.jsx           # rekap & export laporan
│       ├── hooks/
│       │   └── usePengadaanApi.js
│       ├── api/
│       │   └── pengadaanApi.js
│       └── constants.js
```

**Menu navigasi (level aplikasi, di luar folder modul):**
- Menu utama: `Absensi` (existing) tetap seperti sekarang
- Menu baru sejajar: `Pengadaan Barang` atau `SIMAPO` — bukan submenu di dalam Absensi
- Di dalam menu `Pengadaan Barang`, ada 3 halaman:
  - **Input Nota** (bendahara saja, tersembunyi dari role lain)
  - **Progres Laporan** (semua pegawai instansi — read-only)
  - **Rekap Periode** (bendahara + atasan, untuk keperluan laporan resmi)

---

## 6. Alur Kerja End-to-End

1. Bendahara belanja barang → dapat 1 nota berisi beberapa item.
2. Bendahara buka **Input Nota**, isi data nota (tanggal, penyedia, no. nota) +
   semua item di nota itu sekaligus → simpan sekali jalan (transaksional, tidak
   setengah-setengah).
3. Nota fisik tetap dimasukkan ke map seperti biasa. Begitu masuk map, bendahara
   centang status di aplikasi → `sudah_di_map` (bukan input ulang).
4. Pegawai lain (mis. Sekretaris/atasan) buka **Progres Laporan** kapan saja untuk
   lihat berapa nota yang masih `belum_dikumpulkan`, tanpa perlu tanya langsung ke
   bendahara.
5. Sistem otomatis (nanti, tahap notifikasi) mengingatkan bendahara kalau ada nota
   yang sudah lebih dari 7 hari belum di-map.
6. Akhir periode (bulanan/triwulanan): buka **Rekap Periode**, data sudah terkelompok
   otomatis sesuai `periode_pelaporan` — tinggal export, tidak rekap manual dari
   tumpukan nota.

---

## 7. Yang Masih Perlu Diputuskan / Dikerjakan

- [ ] Cek struktur routing frontend existing (React Router / manual) — perlu lihat
      `App.jsx`/`main.jsx` project asli (via Claude Code atau upload file).
- [ ] Cek & cocokkan koneksi Postgres (`db/pool`) dan middleware auth existing.
- [ ] Tambah role `BENDAHARA` ke sistem role yang sudah ada.
- [ ] Seed data `kodefikasi_barang`, `rekening_belanja`, `sub_kegiatan` dari Excel
      Permen 47 yang sudah ada (bisa digenerate otomatis dari file yang sudah diupload).
- [ ] Revisi `PengadaanBarangForm.jsx` → pola nota + banyak item (sudah didiskusikan,
      belum dibuat ulang filenya).
- [ ] Rancang notifikasi pengingat (WA/Telegram) untuk nota yang telat di-map —
      metode belum diputuskan (n8n vs cron job Express, karena API sudah custom Express).

---

## 8. File Terkait

- `001_modul_pengadaan_barang.sql` — migration schema lengkap
- `pengadaanRouter.js` — kerangka Express router
- `PengadaanBarangForm.jsx` — versi awal form (perlu direvisi ke pola nota + item)
