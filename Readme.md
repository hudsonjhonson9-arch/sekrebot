# 📋 Absensi Digital — BAPPERIDA Sumba Barat

Sistem absensi digital berbasis Telegram Mini App & PWA untuk pegawai instansi pemerintah Kabupaten Sumba Barat. Mendukung verifikasi wajah AI, validasi GPS/WiFi kantor, dan mode offline — tersedia juga sebagai aplikasi Android native via Capacitor.

---

## ✨ Fitur Utama

### Absensi Pegawai
- **Absen Masuk & Pulang** dengan foto wajah, GPS, dan validasi jaringan WiFi kantor
- **Verifikasi Wajah AI** menggunakan [@vladmandic/human](https://github.com/vladmandic/human) (512-dim descriptor, liveness detection)
- **Anti-Spoofing GPS** — skor akurasi GPS, deteksi fake location
- **Validasi IP Publik** — hanya bisa absen dari jaringan WiFi resmi kantor (server-side)
- **Tanda Tangan Digital** — ditandatangani langsung di layar saat absen
- **Zoom Kamera** — hardware zoom (jika didukung) dan software zoom CSS fallback

### Meja Absen (1:N Matching)
- Mode identifikasi otomatis tanpa perlu input manual
- Kamera statis di meja/lobi, pegawai cukup berdiri di depan kamera
- Passive liveness detection via Human.js
- Cache database wajah di IndexedDB untuk startup instan

### Keterangan & Izin
- Pengajuan **IZIN / SAKIT / TUGAS** dengan rentang tanggal
- Upload bukti foto (kamera atau galeri), batas 5 MB
- Izin jam parsial (mis. izin hanya 08.00–10.00)
- Alur approval Admin — SAKIT & TUGAS auto-approve, IZIN butuh konfirmasi
- Edit & hapus pengajuan selama masih PENDING
- **Offline Queue** — tersimpan di IndexedDB dan terkirim otomatis saat online

### Rekap & Laporan
- Rekap absensi per bulan, per pegawai, per bidang
- Export **PDF** (jsPDF + autotable) dan **Excel** (SheetJS/xlsx)
- Kirim rekap ke Telegram group secara langsung

### Panel Admin
| Modul | Fungsi |
|---|---|
| Manajemen Pegawai | Tambah, edit, hapus, kelola data pegawai |
| Manajemen Lokasi | Atur radius, CIDR IP, koordinat lokasi absen |
| Manajemen Jam Absen | Set jam masuk/pulang & periode khusus |
| Manajemen Hari Libur | Input hari libur nasional & cuti bersama |
| Registrasi Wajah | Daftarkan/reset data wajah pegawai (admin) |
| Log Absensi | Tambah & edit riwayat absen secara manual |
| Konfirmasi Keterangan | Approve/tolak pengajuan izin pegawai |
| Manajemen Admin | Kelola role superadmin/admin/kepala |
| Seragam | Atur jadwal seragam harian |

### SIMAPO (Manajemen Aset Terintegrasi)
- Katalog & master barang
- Peminjaman dan pengembalian aset
- Tiket kerusakan
- Mutasi stok & Stok Opname
- Manajemen kategori barang

### Lainnya
- **Tugas & Lembur** — pencatatan penugasan dinas luar dan lembur dengan arsip
- **Info Cuaca** — widget cuaca real-time
- **Profil Pegawai** — foto profil, data jabatan, pangkat, tanda tangan
- **Mode Desktop** — tampilan widescreen untuk digunakan di PC/laptop
- **Debug Mode** — panel diagnostik untuk troubleshooting (admin only)

---

## 🛠️ Teknologi

| Layer | Teknologi |
|---|---|
| Frontend | Vanilla JS (modular, 30+ file), HTML5, CSS3 |
| AI / Face Recognition | [@vladmandic/human](https://github.com/vladmandic/human) v3.2.1 (WebGL/WASM backend) |
| Peta & GPS | Leaflet.js |
| Date Picker | Flatpickr |
| PDF Export | jsPDF + jsPDF-AutoTable |
| Excel Export | SheetJS (xlsx.full.min) |
| Notifikasi UI | SweetAlert2 |
| Telegram | Telegram Web App SDK |
| Backend/API | n8n (self-hosted webhook) → Supabase PostgreSQL |
| Offline Storage | IndexedDB (via `idb` helper) |
| Mobile App | Capacitor v8 (Android) |
| OTA Update | Capgo (CapacitorUpdater) |
| CI/CD | GitHub Actions (build APK otomatis) |
| PWA | Service Worker + Web App Manifest |

---

## 📁 Struktur Proyek

```
absensi_refactored_v6/
├── index.html                  # Entry point SPA
├── service-worker.js           # PWA Service Worker
├── manifest.json               # Web App Manifest
├── capacitor.config.json       # Konfigurasi Capacitor (Android)
├── package.json                # Dependencies (Capacitor, pg)
├── version.json                # Versi app & OTA info
│
├── css/
│   ├── styles.css              # Stylesheet utama
│   └── lib/                    # Leaflet CSS, Flatpickr dark theme
│
├── js/
│   ├── app.js                  # Init & bootstrap aplikasi
│   ├── config.js               # Konfigurasi server, endpoint P.*, IndexedDB, apiFetch
│   ├── constants.js            # Konstanta (timezone, jam, threshold face, dll)
│   ├── state.js                # State global bersama
│   ├── auth.js                 # Autentikasi Telegram & login
│   ├── api.js                  # Helper apiGet / apiPost
│   ├── network.js              # Deteksi koneksi & fallback server
│   ├── offline.js              # Offline queue sync via IndexedDB
│   ├── face.js                 # Face recognition, Human.js, kamera overlay
│   ├── meja.js                 # Mode Meja Absen (1:N face matching)
│   ├── meja-handler.js         # Handler event & UI Meja Absen
│   ├── absen.js                # Logic absen masuk/pulang
│   ├── keterangan.js           # Pengajuan & manajemen izin/keterangan
│   ├── rekap.js                # Rekap absensi & tabel
│   ├── rekap-pdf.js            # Export PDF rekap
│   ├── tugas_lembur.js         # Modul tugas & lembur
│   ├── signature.js            # Tanda tangan digital
│   ├── profil.js               # Tampilan profil pegawai
│   ├── log.js                  # Log riwayat absen
│   ├── weather.js              # Widget cuaca
│   ├── desktop.js              # Mode tampilan desktop
│   ├── ui.js                   # Helper UI umum
│   ├── dom.js                  # Utility DOM
│   ├── helpers.js              # Fungsi utilitas (compress image, dll)
│   ├── errors.js               # Error handling & kode error
│   ├── debug.js                # Panel debug admin
│   ├── admin.js                # Panel admin utama
│   ├── admin-pegawai.js        # Manajemen data pegawai
│   ├── admin-lokasi-v9.js      # Manajemen lokasi absen
│   ├── admin-face.js           # Registrasi wajah via admin
│   ├── admin-libur.js          # Manajemen hari libur
│   ├── admin-log.js            # Manajemen log absen (edit manual)
│   ├── admin-mgmt.js           # Manajemen role admin
│   ├── admin-seragam.js        # Jadwal seragam
│   ├── simapo.js               # SIMAPO — katalog & peminjaman (user)
│   ├── simapo-admin.js         # SIMAPO — admin panel
│   ├── simapo-ext.js           # SIMAPO — fitur extended
│   └── lib/                    # Library lokal (Flatpickr, jsPDF, Leaflet, SheetJS, SweetAlert2)
│
├── android/                    # Project Android (Capacitor)
│   └── app/src/main/
│       ├── java/com/bapperida/absensi/MainActivity.java
│       └── assets/public/      # Web assets yang di-bundle ke APK
│
├── n8n/                        # Workflow n8n (JSON export)
│   ├── AbsensiBot V.5.1.json   # Workflow utama
│   ├── face recognition wf.json
│   ├── Ket absensi wf.json
│   ├── tugas_lembur_wf.json
│   ├── kirimrekapabsen.json
│   └── simapo/                 # Workflow SIMAPO terpisah
│
├── scripts/
│   ├── migration_001_critical_fixes.sql
│   ├── migration_002_security_fk.sql
│   └── setup-capacitor.js      # Script setup Capacitor untuk CI/CD
│
└── .github/workflows/
    └── build-apk.yml           # GitHub Actions — build APK otomatis
```

---

## ⚙️ Konfigurasi

Semua konfigurasi utama ada di `js/config.js`:

```js
// Server n8n (primary + fallback)
const SERVER_1 = 'https://mindcloud.my.id';
const SERVER_2 = 'https://n8n-sp8dtwslkxal.jkt3.sumopod.my.id';

// Supabase (untuk akses langsung, migrasi dari n8n)
const SUPABASE_URL = 'https://[PROJECT_ID].supabase.co';
const SUPABASE_KEY = 'ey-ANON-KEY';

// Token autentikasi webhook
const API_TOKEN = 'BAPPERIDA_SECURE_TOKEN_2025';

// Validasi WiFi kantor
const WIFI_CHECK_ENABLED = true; // IP range diatur di tabel lokasiabsen (CIDR)
```

Konfigurasi threshold AI dan GPS ada di `js/constants.js`:

```js
const FACE_THRESHOLD     = 0.55;  // Threshold kemiripan wajah (0–1)
const GPS_MAX_ACCURACY_M = 500;   // Akurasi GPS maksimal yang diterima (meter)
const GPS_FAKE_SCORE_THRESHOLD = 30; // Skor anti-spoofing GPS
const MEJA_COOLDOWN_MS   = 20_000;  // Cooldown Meja Absen antar-match
```

---

## 🚀 Instalasi & Deployment

### Web / Telegram Mini App
1. Hosting semua file ke web server statis atau Vercel/Netlify
2. Daftarkan URL sebagai Telegram Mini App via BotFather
3. Isi konfigurasi server n8n dan Supabase di `js/config.js`
4. Import workflow n8n dari folder `n8n/` ke instance n8n Anda
5. Jalankan migrasi SQL dari folder `scripts/` ke database Supabase

### Aplikasi Android (APK)

**Build Manual:**
```bash
npm install
node scripts/setup-capacitor.js
npx cap sync
npx cap copy android
cd android && ./gradlew assembleDebug
```
APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

**Build Otomatis (GitHub Actions):**
Setiap push ke branch `main` atau `master` akan otomatis men-trigger build APK via workflow `.github/workflows/build-apk.yml`. APK tersedia sebagai artifact di tab **Actions** di GitHub.

### OTA Update (Capgo)
Aplikasi menggunakan Capgo untuk update over-the-air tanpa perlu rilis APK baru. Pastikan `CAPGO_TOKEN` tersedia di GitHub Secrets dan uncomment langkah upload di `build-apk.yml`.

---

## 🗄️ Database (Supabase PostgreSQL)

Tabel-tabel utama:

| Tabel | Fungsi |
|---|---|
| `log_absen` | Riwayat absensi harian pegawai |
| `user_list` | Data master pegawai |
| `lokasiabsen` | Lokasi & IP range WiFi kantor |
| `jam_absen` | Konfigurasi jam masuk/pulang (key: `jam_absen_global`) |
| `ket_temp` | Pengajuan keterangan/izin sementara |
| `face_data` | Descriptor wajah & foto pegawai |
| `tanda_tangan` | Data tanda tangan digital |
| `libur_nasional` | Daftar hari libur |
| `admin_list` | Daftar NIP admin & role |
| `instansi` | Data instansi (multi-tenant) |
| `penugasan` | Penugasan dinas luar |
| `lembur_archive` | Arsip data lembur |

Script migrasi tersedia di `scripts/migration_001_critical_fixes.sql` dan `scripts/migration_002_security_fk.sql`.

---

## 🔐 Keamanan

- **Token Autentikasi**: Setiap request ke webhook n8n menyertakan header `X-App-Token`
- **HMAC Signature**: Payload absen ditandatangani dengan SHA-256 sebagai anti-spoofing tambahan
- **Server-side IP Validation**: Validasi IP publik dilakukan di sisi n8n (support CIDR range)
- **GPS Anti-Spoofing**: Skor akurasi GPS dihitung dan divalidasi sebelum absen dikirim
- **Face Liveness Detection**: Human.js memeriksa keaslian wajah (bukan foto/video) sebelum capture
- **Idempotency Key**: Setiap pengajuan keterangan menyertakan `request_id` unik untuk mencegah duplikasi

---

## 📱 Mode Deployment

| Mode | Deskripsi |
|---|---|
| **Telegram Mini App** | Dibuka dari bot Telegram, otentikasi via `initData` |
| **PWA (Browser)** | Bisa diinstall ke homescreen, mendukung offline |
| **Android APK** | Native app via Capacitor, distribusi via link download langsung |

---

## 📝 Catatan Pengembangan

- Proyek ini hasil refactoring dari monolith HTML tunggal (~15.000 baris) menjadi arsitektur modular 30+ file JS
- Backend masih didominasi n8n webhook; migrasi bertahap ke Supabase direct sedang berjalan
- Face recognition beralih dari **face-api.js** (128-dim) ke **@vladmandic/human** (512-dim) — descriptor lama harus didaftarkan ulang
- Folder `scratch/` berisi script utilitas patch satu-kali yang dipakai selama proses migrasi (tidak perlu di-deploy)
- `isTest = false` di `config.js` — ubah ke `true` untuk mengarahkan semua request ke webhook test n8n

---

## 📞 Kontak & Pemeliharaan

Dikembangkan untuk **BAPPERIDA Kabupaten Sumba Barat**, Nusa Tenggara Timur.

App ID Android: `com.bapperida.absensi`