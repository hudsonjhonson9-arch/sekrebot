# absensi-STICH — Instruksi Agent

## 1. Alur Graph & Referensi Wajib

**WAJIB baca graph sebelum menjawab pertanyaan arsitektur / cara kerja app atau sebelum mengubah kode:**

1. Baca `graphify-out/GRAPH_REPORT.md` (god nodes, komunitas, alur utama).
2. Untuk pertanyaan spesifik gunakan `graphify query "<pertanyaan>"`, `graphify path "A" "B"`, atau `graphify explain "X"` (jalankan dari folder ini), daripada membaca file HTML secara utuh.
3. Setelah mengubah kode, perbarui graph: `graphify update .` (tanpa LLM).
4. Baca `CATATAN-PERUBAHAN-absensi-STICH.md` untuk riwayat perubahan dan daftar pekerjaan yang belum selesai.
5. Aplikasi referensi fitur: `D:\Code\absensi` (porting logika fitur dari sana ke sini, bukan tampilannya).

## 2. Arsitektur & Peta Modul Aktif

**Jangan menaruh logika/CSS baru di dalam `index.html` atau halaman HTML lain.** Gunakan modul terpisah berikut:

### Frontend (`css/` & `js/`)

- `css/stitch-mobile.css` — styling jam analog, animasi ringan Rekap, Presensi, dan modal.
- `css/stitch-swal.css` — tema SweetAlert2 bergaya Stitch (Mobile & Desktop, Light & Dark).
- `js/stitch-auth.js` — auth shim token sesi native pada request `/api/stitch/*`, `/api/media/*`, `/api/dev/*`, penanganan 401/logout terpusat (`StitchSession`), serta `StitchRoute` (auto-routing desktop `>= 1024px` ke `desktop.html` dengan anti-loop `?mode=mobile`, `#admin`, `#kiosk`, dan `stitch_admin_mode=mobile`).
- `js/stitch-desktop-shell.js` — shell sidebar desktop (hover-expandable, pinnable, resizable) + drawer admin mobile.
- `js/stitch-responsive-nav.js` — injektor rail sidebar desktop & floating bottom nav responsif untuk halaman portal desktop pada layar `< 1024px`.
- `js/stitch-pickers.js` — custom Stitch picker (dropdown, tanggal, waktu) pengganti kontrol native (`<select>`, `<input type="date">`, `<input type="time">`) yang mempertahankan ID, `.value`, dan event `change`.
- `js/stitch-app.js` — auth, state, bootstrap DB, profil biometrik/TTD, jam WITA, view switcher, kiosk, TPP, dan utilitas.
- `js/stitch-presensi.js` — alur 1-tombol presensi masuk/pulang/lapangan, anti-spoofing GPS v3, kalender strip, dan E-Slip.
- `js/stitch-rekap.js` — rekap bulanan, kartu riwayat harian, serta ekspor PDF harian & bulanan berkop + paraf/TTD.
- `js/stitch-layanan.js` — SPPD, pemeliharaan aset KIR, serta drawer pengajuan keterangan/izin dan notifikasi.
- `js/stitch-aset-arsip.js` — aset mobile SIMAPO, pemindai QR, dan bank arsip digital.
- `js/stitch-admin-mobile.js` — admin mobile: Master Pegawai & Biometrik AI serta kelola role & hak akses.
- `js/stitch-admin-rekap.js` — panel admin rekap kehadiran semua pegawai (rentang/bulanan, harian, log), preview berkop/paraf/TTD, serta ekspor PDF F4 & Excel (`.xlsx`).
- `js/admin-core.js` — logika admin bersama (`admin.html` & `index.html#admin`): monitoring, persetujuan keterangan, lokasi/geofence, jam kerja, dan hari libur.
- `js/admin-controller.js` — controller halaman admin desktop (`admin.html`): pengaturan geofence, jam kerja, Face AI (`/api/media/face-settings`), dan metrik via `AdminCore`.
- `js/kiosk-controller.js` — controller mode Kiosk Lobi (`kiosk.html`) berbasis live PostgreSQL (`/api/stitch/bootstrap`, monitoring, presensi `/api/stitch/absen`, telemetri GPS & audio).
- `js/eslip-controller.js` — controller struk digital E-Slip (`e-slip.html`).
- `js/dev-tools.js` — tracker diagnostik kesehatan fitur, pengujian otomatis, dan log aktivitas (`createDevTracker`).

### Backend (`server/`)

- `server/stitch-api.js` — router inti `/api/stitch/*` (bootstrap, user-data, absen, admin lokasi/jam/libur, keterangan, SPPD, notifikasi, monitoring, face/TTD).
- `server/stitch-api-rekap.js` — modul rute rekap `/api/stitch/rekap-tpp`, `/rekap-range`, dan `/rekap-harian`.
- `server/stitch-api-aset-arsip.js` — modul rute aset & arsip `/api/stitch/aset/*` dan `/arsip/mobile-data`.
- `server/auth.js` — otentikasi & otorisasi berbasis role (`ABSEN_ROLES`, `MEDIA_ROLES`, `SIMAPO_ROLES`), `createRequireRole` dengan scoped session cache TTL 15 detik, serta dukungan query `?token=` khusus untuk `GET /api/media/raw/*`.
- `server/auth-device.js` — router `/api/auth/devices` (khusus `SUPERADMIN`) untuk penerbitan, daftar, dan pencabutan token perangkat Meja Absen (`dv_*`).
- `server/core-admin.js` — router master/core absensi (`/api/*`: instansi, bidang, lokasi, jam kerja, hari libur, profil & kontrol instansi).
- `server/log.js` — router `/api/log` untuk pembacaan riwayat absen pribadi dan tambah/koreksi log manual (khusus `MEDIA_ROLES`, SQL berparameter).

## 3. Aturan Teknis & Verifikasi Pra-Commit (WAJIB)

- **Encoding & Karakter:** Seluruh file wajib **UTF-8 tanpa BOM** dan **nol emoji** di kode, UI copy, komentar, maupun dokumentasi.
- **Kontrol Input Kustom:** 100% gunakan custom Stitch pickers (`js/stitch-pickers.js`); dilarang memakai kontrol native `<select>`, `<input type="date">`, atau `<input type="time">`.
- **Dialog & Alert:** SweetAlert2 wajib bertema Stitch melalui `css/stitch-swal.css` (Mobile & Desktop, Light & Dark).
- **Verifikasi Sebelum Commit:** Pastikan semua perintah berikut lulus sebelum commit:
  1. `npm test`
  2. `npm run lint`
  3. `npm run build`
  4. `graphify update .`

## 4. Gaya UI/UX & Animasi (WAJIB)

- UI/UX **selalu mengikuti gaya `absensi-STICH`** (Plus Jakarta Sans, biru-600, kartu putih/slate-900, radius besar, dark mode via `.dark`). Dari `D:\Code\absensi` hanya logikanya yang dipindahkan, bukan tampilannya.
- Gunakan **banyak animasi yang ringan**: hanya `transform` dan `opacity`, durasi 150–300 ms, hormati `prefers-reduced-motion`. Animasi harus bermakna (umpan balik, perubahan state, fokus), bukan dekorasi.

### 20 Prinsip UX & Animasi
1. Squash & stretch — tombol/elemen lentur sedikit saat ditekan.
2. Anticipation (wind-up) — gerak persiapan singkat sebelum aksi utama.
3. Staging the focus — arahkan mata ke satu fokus utama per layar.
4. Pose to pose — definikan keyframe awal dan akhir yang jelas.
5. Follow through — elemen berhenti halus, tidak mendadak.
6. Slow in & slow out — easing, bukan linear.
7. Moving in arcs — gerak alami melengkung, bukan garis kaku.
8. Secondary action — gerak pendukung (ikon, bayangan) memperkuat aksi utama.
9. Snappy timing — respons cepat dan tegas.
10. Exaggerated feedback — konfirmasi sukses/gagal jelas terlihat.
11. Solid drawing in 3D — kedalaman, bayangan, dan lapisan konsisten.
12. Overall appeal — tampilan menarik dan rapi.
13. Fitts's law — target penting besar dan dekat dengan jempol.
14. Bigger hit areas — area sentuh minimal 44x44 px.
15. Hick's law — kurangi jumlah pilihan per layar.
16. Miller's law — kelompokkan info maksimal 7 item.
17. Doherty threshold — respons < 400 ms; tampilkan skeleton/loading bila lebih lama.
18. Postel's law — longgar pada input pengguna, ketat pada output.
19. Jakob's law — ikuti pola yang sudah dikenal pengguna dari aplikasi lain.
20. Frequency of use — aksi yang sering dipakai (presensi) paling mudah dijangkau.
