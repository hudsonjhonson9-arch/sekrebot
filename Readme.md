# Absensi v2 - Modern Shift Attendance App (Stitch Redesign)

Proyek terpisah baru yang mengimplementasikan seluruh arsitektur desain UI modern dari **Google Stitch** untuk sistem presensi ASN / Pegawai **BAPPERIDA Sumba Barat**.

Proyek ini mandiri dan terisolasi di `D:\Code\absensi\absensi-v2`, sehingga tidak mengganggu codebase lama di `D:\Code\absensi`.

---

## 🚀 Cara Menjalankan

### Cara 1: Buka Langsung (Tanpa Node.js)
Klik dua kali berkas **`index.html`** di Windows Explorer. Semua navigasi halaman, ikon, dan styling Tailwind sudah terhubung via jalur relatif!

### Cara 2: Jalankan Dev Server (Direkomendasikan)
Klik dua kali **`start-dev.bat`** atau jalankan perintah:
```bash
cd D:\Code\absensi\absensi-v2
npx vite --port 3000 --open
```
Aplikasi akan otomatis terbuka di browser pada: `http://localhost:3000`

---

## 📱 Daftar Halaman & Modul

| Berkas | Modul | Keterangan |
|---|---|---|
| **`index.html`** | Mobile Presensi (Light) | Beranda absensi, live clock WIB, status GPS kantor, tombol Clock In / Out, log harian. |
| **`dark-mode.html`** | Mobile Presensi (Dark) | Versi tema gelap untuk shift malam atau kondisi hemat daya baterai. |
| **`verifikasi.html`** | Scan Biometrik Wajah & GPS | Viewfinder kamera live, radar geofence kantor, deteksi liveness AI. |
| **`e-slip.html`** | Bukti Presensi Digital | Tiket/struk resmi bukti hadir dengan QR Code validasi keaslian. |
| **`jadwal.html`** | Jadwal Shift ASN | Kalender shift harian/mingguan (Shift Pagi, Siang, Malam, Libur). |
| **`riwayat.html`** | Riwayat & Rekap Log | Filter kehadiran, status tepat waktu, keterlambatan, izin/sakit. |
| **`kiosk.html`** | Terminal Meja Absen (Lobi) | Layar tablet khusus meja lobi kantor untuk scan wajah pegawai otomatis. |
| **`admin.html`** | Panel Administrator | Konfigurasi radius GPS, jam toleransi, threshold AI Face Recognition. |
| **`layanan.html`** | Layanan Kedinasan & SPPD | Pengajuan dinas luar, perjalanan dinas, mutasi dan peminjaman aset. |
| **`rekap.html`** | Rekap Laporan & Dokumen TPP | Rekapitulasi bulanan dan pratinjau cetak dokumen resmi TPP Pegawai. |

---

## 🎨 Identitas Desain & Tokens
* **Typography:** `Plus Jakarta Sans`
* **Brand Primary:** `#2563EB` (Royal Blue)
* **Affirmative / Valid:** `#10B981` (Emerald Green)
* **Warning / Shift:** `#F59E0B` (Amber Gold)
* **Alert / Late:** `#EF4444` (Crimson Red)
