# Desain: Developer Diagnostics, Redesain Admin Grid, Arsip Agenda/SPPD & Sidebar Desktop (UI/UX Pro Max)

Tanggal: 2026-11-15  
Status: Menunggu Persetujuan  
Target Modul:
1. Panel Admin (`#panel-admin`): Fitur Developer Diagnostics & Activity Logs + Redesain Menu Grid per Grup (`/ui-ux-pro-max`)
2. Arsip Digital (`#panel-arsip`): Restrukturisasi Agenda & SPPD (mengacu pada `D:\Code\peta-ekonomi`) + In-flow Top Back Button
3. Desktop Sidebar (`#tabsBar`): Redesain navigasi desktop dengan visual hierarchy berkelas (`/ui-ux-pro-max`)

---

## 1. Latar Belakang & Tujuan

Aplikasi absensi BAPPERIDA telah berkembang mencakup banyak fitur kompleks: presensi AI face recognition, geofencing GPS, perizinan, lembur, aset SIMAPO, dan arsip digital. Namun terdapat beberapa kendala UX dan operasional:
1. **Tidak ada visibilitas kesehatan fitur bagi developer/admin:** Saat terjadi kendala (mis. kegagalan koneksi PostgreSQL, cache model AI corrupt, GPS ditolak, atau webhook gagal), developer tidak memiliki dashboard status real-time atau log mendetail untuk melacak letak kegagalan.
2. **Panel Admin menumpuk ke bawah (cluttered):** Modul-modul di Panel Admin ditumpuk dalam satu scroll vertikal panjang di bawah 3 tab flat (`ops`, `user`, `config`), membuat navigasi melelahkan.
3. **Tombol "Kembali" di panel Arsip mengambang canggung:** Tombol `.arsip-back` melayang di pojok kiri bawah (`fixed: bottom 74px`) yang menutupi konten dan tidak intuitif. Pengguna menginginkan tombol kembali in-flow di header pada tampilan arsip native, dan tombol mengambang hanya dipakai saat mode aplikasi penuh (iframe).
4. **Modul Agenda Surat & SPPD di Arsip masih minim:** Perlu diperkaya agar memiliki standar fungsionalitas dan tampilan terstruktur seperti pada referensi `D:\Code\peta-ekonomi`.
5. **Sidebar Desktop perlu diperbarui:** Sidebar desktop masih terlihat seperti bottom-nav yang dimiringkan tanpa hierarki grup yang jelas, membutuhkan sentuhan profesional `ui-ux-pro-max` tanpa AI-slop.

---

## 2. Pendekatan Arsitektur (Approaches)

### Pendekatan 1: Perubahan Minimalis (Inline Script Saja)
- Hanya menambahkan kartu log baru di tab Konfigurasi admin dan memperbaiki posisi CSS tombol arsip.
- *Kelemahan:* Panel admin tetap berantakan dan menumpuk; sidebar tetap monoton; fitur tracking developer terisolasi dan tidak komprehensif.

### Pendekatan 2 (Dipilih): Modular Architecture dengan UI/UX Pro Max & Integrated Developer Suite
- **Admin Grid Router:** Membagi Panel Admin ke dalam Grid Menu per Grup fungsional dengan drill-down ke layar modul dan header "← Kembali ke Menu Admin".
- **Developer Suite:** Menghadirkan subsistem diagnostik lengkap:
  - *Health Matrix*: Monitoring live 8 subsistem (DB, Backend API, Face AI, GPS, IndexedDB, Media, Telegram, n8n).
  - *Automated Diagnostic Runner*: Pengujian otomatis end-to-end dengan indikator status & latency.
  - *Detailed Log Console*: Log viewer interaktif dengan filter level (ERROR, WARN, INFO, DEBUG), pencarian teks, ekspor JSON/TXT, dan pembersihan log.
- **Arsip Native Navigation:** Memindahkan tombol kembali ke header atas in-flow untuk layar native (Agenda, SPPD, Dokumen), sedangkan floating pill hanya aktif pada fullscreen iframe.
- **Arsip Agenda & SPPD:** Mengadopsi struktur `D:\Code\peta-ekonomi` dengan KPI metrics ringkas, filter tahun/status, dan registrasi surat & SPPD.
- **Desktop Sidebar:** Restrukturisasi sidebar desktop dengan 3 grup logis (Utama, Layanan, Administrasi), indikator aktif berkelas, dan interaksi collapse halus.

---

## 3. Rincian Desain Komponen

### 3.1. Developer Diagnostics & Detailed Activity Log
- **File:** `js/dev-tools.js` (baru) + endpoint `server/core-admin.js` (`/api/dev/health`).
- **Endpoint Backend:**
  - `GET /api/dev/health`: Mengecek koneksi PostgreSQL pool, latency kueri `SELECT 1`, status uptime proses Node.js, dan memori heap.
- **Frontend Logger & Monitor (`DEV_TRACKER`):**
  - Merekam log lokal (`INFO`, `WARN`, `ERROR`, `DEBUG`) dengan timestamp WITA, sumber modul, aksi, detail objek/pesan.
  - Menangkap `window.onerror` dan `unhandledrejection` otomatis ke dalam log developer.
  - Menyimpan histori hingga 200 entri terakhir di `localStorage`/IndexedDB.
- **UI Komponen:**
  - *Health Matrix Grid*: 8 kartu status subsistem dengan indikator warna (Hijau = OK, Kuning = Warning, Merah = Error), nilai latensi (ms), dan waktu cek.
  - *Tombol "Uji Seluruh Fitur"*: Menjalankan ping berurutan ke semua subsistem dan menampilkan ringkasan skor kelayakan sistem (0-100%).
  - *Tabel Log Realtime*: Filter level dropdown, input pencarian, tombol "Unduh Log (JSON)", dan tombol "Bersihkan Log".

### 3.2. Redesain Panel Admin dengan Menu Grid per Grup (`ui-ux-pro-max`)
- **Struktur Menu Grid:**
  - **Grup 1: Operasional & Kehadiran**
    - Konfirmasi Keterangan Pegawai (dengan counter antrean pending)
    - Input Keterangan Pegawai (Admin Form)
    - Meja Absen (Terminal Presensi)
  - **Grup 2: Manajemen Kepegawaian**
    - Master Pegawai & Face AI (Pendaftaran wajah, TTD, status pegawai)
    - Kelola Administrator (Akses role admin/superadmin)
  - **Grup 3: Konfigurasi Sistem**
    - Lokasi & Radius Absen (Geofencing Leaflet)
    - Jam Kerja & Periode Khusus (Jam kerja reguler & Ramadhan)
    - Hari Libur Nasional & Daerah (Kalender libur)
    - Mode Seragam Pegawai
    - Notifikasi Telegram
    - Identitas Instansi & Header (Superadmin)
  - **Grup 4: Developer Tools & Diagnostik**
    - Status Kesehatan Seluruh Fitur
    - Pengujian Fitur Otomatis
    - Log Aktivitas & Error Mendetail
- **Drill-down Navigasi:**
  - Saat kartu diklik, tampilan beralih ke modul kartu tersebut.
  - Header modul menampilkan:
    `[ ← Kembali ke Menu Admin ]   Nama Modul (Contoh: "Geofencing & Lokasi Absen")`
  - Tombol kembali mengembalikan tampilan ke menu grid tanpa reload atau reset state form.

### 3.3. Arsip Agenda, SPPD, dan Perbaikan Tombol Kembali
- **Tombol Kembali:**
  - Menghapus ketergantungan tombol floating `.arsip-back` pada tampilan native arsip.
  - Menempatkan tombol `← Kembali ke Beranda Arsip` di bagian atas toolbar/header masing-masing sub-halaman arsip (Dokumen, Agenda, SPPD, Kertas Kerja, Bank Data).
  - Tombol `.arsip-back` melayang hanya dipertahankan saat `body.arsip-fs` (mode fullscreen iframe Aplikasi Lengkap).
- **Arsip Agenda Surat (seperti di `peta-ekonomi`):**
  - KPI Stat Cards: Surat Masuk, Surat Keluar, Total Agenda, Tahun Aktif.
  - Tabs: Surat Masuk & Surat Keluar.
  - Toolbar: Search input, filter status, pilihan tahun.
  - List & Action: Nomor agenda, nomor surat, pengirim/tujuan, perihal, status disposisi, tombol detail & preview lampiran.
- **Arsip Register SPPD (seperti di `peta-ekonomi`):**
  - KPI Stat Cards: SPPD Dalam Daerah, SPPD Luar Daerah, Total Registrasi, Selesai SPJ.
  - Tabs: Dalam Daerah & Luar Daerah.
  - List & Action: Nomor SPT/SPPD, pelaksana dinas, tujuan & tanggal berangkat, status SPJ & verifikasi, tombol cetak/unduh.

### 3.4. Redesain Desktop Sidebar (`ui-ux-pro-max`)
- **Struktur Visual:**
  - **Header Brand:** Logo BAPPERIDA + Teks "BAPPERIDA" / "Absensi Digital" + tombol collapse.
  - **Kategori Navigasi:**
    - *UTAMA:* Presensi (Absen), Keterangan, Rekapitulasi, Profil Saya.
    - *LAYANAN DINAS:* Perjalanan Dinas, Rekap Lembur, Aset SIMAPO, Arsip Digital.
    - *ADMINISTRASI:* Panel Admin (Hanya tampil untuk admin).
  - **Footer:** Toggle tema terang/gelap + status pengguna.
- **Prinsip Anti-Slop:**
  - Indikator aktif: bar vertikal aksen kiri (3px) dengan background tinted halus (`rgba(59, 130, 246, 0.12)`).
  - Tipografi bersih dengan `font-variant-numeric: tabular-nums`.
  - Icon alignment presisi dan transisi hover responsif (150ms).
  - State collapsed tetap rapi dengan tooltip bawaan `data-label`.

---

## 4. Rencana Pengujian (Testing & Verification)

1. **Unit & Integration Tests:**
   - Menambahkan pengujian `tests/admin-grid-and-dev.test.mjs` untuk memverifikasi landmark grid admin, grup menu, router drill-down, dan eksistensi modul developer.
   - Menambahkan pengujian `tests/arsip-nav-header.test.mjs` untuk memverifikasi peletakan tombol kembali in-flow di header arsip dan memastikan floating button hanya muncul di mode fullscreen iframe.
   - Menjalankan seluruh test suite (`npm test`) untuk memastikan seluruh 752 test yang ada tetap 100% lulus (zero regression).
2. **Sinkronisasi Web Root:**
   - Memastikan pembaruan di `index.html`, `js/`, dan `css/` tersinkronisasi ke direktori `www/`.
3. **Verifikasi Fungsional:**
   - Verifikasi pengujian diagnostik live berjalan mulus tanpa runtime crash.
   - Verifikasi log console dapat mencatat error dan dapat diekspor sebagai JSON/TXT.
