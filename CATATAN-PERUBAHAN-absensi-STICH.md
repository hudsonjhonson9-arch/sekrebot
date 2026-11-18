# Catatan Perubahan — absensi-STICH

> Semua perubahan belum dijalankan. Lakukan `npm test` dan uji manual di browser, lalu cek `git diff` (edit tool kemungkinan mengubah CRLF → LF).

## Login & Logout (`js/auth.js`, `js/stitch-auth.js`)
- Modal login baru ditutup **setelah** data pegawai berhasil dimuat; bila gagal, sesi dibatalkan dan pesan error tampil.
- Setelah login, bootstrap dijalankan ulang (sebelum login kini ditolak 401).
- Logout menghapus **semua** kunci sesi (`native_token`, `stitch_active_nip`, `MY_NAME`, dll), memakai dialog Swal, timeout 4 dtk, dan `location.replace`.
- Sesi kedaluwarsa (401 saat memegang token) memunculkan modal login lagi / kembali ke `login.html`.

## Keamanan server (`server/index.js`, `server/stitch-api.js`)
- `/api/stitch` sekarang wajib login (`requireRole`).
- `keterangan/approve`, `admin-lokasi`, `admin/monitoring-today`, `rekap-tpp`: khusus admin.
- `user-data`, `absen`, pengajuan keterangan: hanya untuk NIP sendiri (kecuali admin); daftar keterangan non-admin hanya miliknya.
- Angka kehadiran palsu dihapus (`hadirDays || 10`, `Math.max(hadirCount, 18)`); jam kerja mingguan dihitung dari data nyata.

## Admin disatukan (`js/admin-core.js`)
- Satu logika untuk `admin.html` (desktop) dan `index.html#admin` (mobile): monitoring, persetujuan keterangan, lokasi/geofence.
- Tampilan dinamis: tabel ≥768px, kartu <768px.
- Simpan lokasi kini ke database (dulu hanya `localStorage`); status disamakan `DISETUJUI`/`DITOLAK`; output di-escape; tombol memakai `data-` atribut.
- Kode lama dikomentari (`LEGACY` di `index.html`, `type="text/plain"` di `admin.html`) — aman dihapus setelah verifikasi.

## Overlay kamera (`js/face-mount.js`)
- Tema mengikuti aplikasi: Plus Jakarta Sans, biru-600, kartu putih/slate-900, radius besar, dark mode via `.dark`. Mode kiosk tetap gelap.

## Mode halaman
- Tiap fitur tetap file sendiri (refresh tetap di halaman yang sama). Pengalihan ke `index.html` hanya bila `AdminCore.setMode('mobile')`; `'auto'` mengikuti lebar layar.

## Modularisasi `index.html` & Penerapan Fitur `D:\Code\absensi`
- Seluruh CSS & JS inline di `index.html` (±5.000 baris) telah dipisahkan ke:
  - `css/stitch-mobile.css`
  - `js/stitch-app.js`
  - `js/stitch-presensi.js`
  - `js/stitch-rekap.js`
  - `js/stitch-layanan.js`
  - `js/stitch-aset-arsip.js`
- **Satu Tombol Presensi (`js/stitch-presensi.js`)**: menangani Masuk, Pulang di Kantor, dan Pulang dari Lapangan (`PULANG LUAR`), memblokir presensi bila ada keterangan disetujui hari ini (`STATUS: IZIN / CUTI`), serta memvalidasi *Anti-Spoofing / Fake GPS v3* dan verifikasi wajah Human.js (`matchFace()`).
- **Biometrik Wajah & Spesimen TTD (`js/stitch-app.js`, `server/stitch-api.js`)**: pendaftaran/pembaruan Wajah AI (`POST /api/stitch/face-save`) dan kanvas TTD (`POST /api/stitch/signature-save`) langsung dari tab Profil.
- **Menu Rekap & Cetak PDF Resmi F4 (`js/stitch-rekap.js`, `server/stitch-api.js`)**:
  - Tab *Riwayat* diubah menjadi **Rekap** dengan ringkasan disiplin bulanan (mengecualikan hari libur `libur_nasional`).
  - Cetak PDF **Daftar Hadir Harian** (`GET /api/stitch/rekap-harian`), **Rekap Bulanan Pegawai**, dan **Rekap Rentang Tanggal** (`GET /api/stitch/rekap-range`) ukuran F4 berkop resmi lengkap dengan paraf per baris dan blok tanda tangan Kepala Badan.
- **Jam Kerja, Hari Libur, Kiosk, TPP & Navigasi Responsif**:
  - Endpoint `POST /api/stitch/admin-jam-absen`, `POST /api/stitch/admin-libur`, dan `POST /api/stitch/admin-libur/delete` sudah terhubung ke `AdminCore`, `admin.html`, dan `#view-admin`.
  - `/api/stitch/bootstrap` tidak lagi mengirim `face_photo` base64 seluruh pegawai (diganti boolean `has_face`).
  - `js/kiosk-controller.js` dan `submitKioskBiometric()` tidak lagi memakai simulasi pegawai acak, melainkan terhubung ke `/api/stitch/bootstrap` dan `/api/stitch/absen`.
  - `cetak-tpp.html` dan `downloadTppPdf()` kini memuat data nyata dari `/api/stitch/rekap-tpp` (dengan hari kerja efektif & TTD Kepala Badan).
  - Halaman desktop bersidebar (`admin.html`, `rekap.html`, `layanan.html`, `aset-kir.html`, `arsip.html`, `desktop.html`) otomatis memuat `js/stitch-responsive-nav.js` untuk tampilan layar kecil (<1024px) dengan *floating bottom nav*.
