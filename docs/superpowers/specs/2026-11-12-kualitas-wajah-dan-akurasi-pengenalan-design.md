# Desain: Pendaftaran/Update Wajah Lebih Detail + Akurasi Pengenalan Pegawai

Tanggal: 2026-11-12
Status: disetujui user (brainstorming selesai)

## Konteks

Saat ini pendaftaran, update, absensi, dan verifikasi wajah menangkap **1 frame → 1 descriptor**
tanpa penilaian kualitas. Tombol "Ambil Foto" aktif setelah 3 detik meski wajah belum terlihat.
Hasilnya referensi wajah mudah terekam buram/gelap/terlalu kecil, dan pencocokan (threshold
default 0.55) bisa salah kenali. Kontrak penyimpanan: **1 descriptor array per user**
(`server/media.js` → `gasUpsert` → kolom descriptor `user_list`), inferensi Human.js berjalan
**di browser** — server/GPU tidak memengaruhi akurasi.

## Keputusan desain (hasil brainstorming dengan user)

1. **Paket penuh**: gerbang kualitas live + burst 3 foto (digabung jadi 1 descriptor) + layar
   preview "Pakai/Ulang" — semuanya.
2. **Sebaran**: semua alur kamera (daftar, update, absensi, verifikasi, mode meja/kiosk).
3. **Kiosk ikut preview** (sentuh "Pakai/Ulang") — kiosk berubah dari hands-free ke interaktif.
4. **Tombol darurat**: setelah 10 detik belum lolos gate, capture tetap boleh dipaksa —
   tidak ada alur yang terblokir total.
5. **Pendekatan**: modul baru murni `js/face-quality.js` (bukan logika menumpuk di face.js).
6. **Pencocokan ikut dioptimasi**: penolakan ambigu, cek tumpang-tindih saat daftar, panduan
   threshold di UI admin.
7. **Kiosk idle**: mode meja saja — preview tidak disentuh 15 detik → auto-"Pakai".
   Alur daftar/absen tetap manual penuh.
8. **Engine**: tetap Human.js (embedding 512-dim, liveness, landmarks). Tidak ada model/layanan
   baru, tidak ada upgrade server.

## Arsitektur

### File baru: `js/face-quality.js` (+ mirror `www/js/face-quality.js`)

Modul murni tanpa DOM, ditulis agar bisa diuji unit di Node (guard `module.exports` di bawah —
aman di browser karena `module` tidak ada). API:

- `evaluateFrameQuality(metrics, opts)` → `{ pass: boolean, reasons: string[], score: number }`
  - `metrics = { faceRatioH, centerOffset, brightness, stableMs, livenessScore }`
  - `opts = { livenessEnabled, thresholds }`
  - `score` dipakai untuk memilih frame terbaik dari burst
- `mergeDescriptors(list)` → 1 array (**rata-rata elemen per indeks saja, TANPA normalisasi
  L2** — penting: jalur 128-dim klien memakai `1 − euclidean/1.5` yang sensitif skala &
  threshold 0.55 dibangun di atasnya; cosine (jalur 512) justru kebal skala. Rata-rata 3 vektor
  se-mirip itu tetap ber-skala seperti 1 vektor). Bekerja untuk 512 (human) dan 128 (faceapi);
  panjang beda / input <1 → kembalikan elemen pertama apa adanya
- konstanta ambang diekspor untuk ditest

### State machine overlay (`js/face.js`, berlaku semua alur)

```
SCANNING → [gate lolos + user tekan tombol / match di meja] → SHOOTING (3 frame @ ~700ms)
   ↑                                                              ↓
   └──────────── Ulang ←── PREVIEW (Pakai / Ulang) ←──────────────┘
                                          │ Pakai
                                          ↓
                              onDone({dataUrl, descriptor, faceOk, livenessOk}) — seperti hari ini
```

Titik sentuh di `face.js` (semua di dalam file, pemanggil `openCamOverlay` tidak berubah):

- `startDetectLoop` (~1194): hitung metrik per frame (box Human.js untuk ukuran/pusat,
  luminansi canvas kecil 32×32, stabilitas posisi, skor liveness), panggil
  `evaluateFrameQuality`, tampilkan `setCamStatus` dengan **alasan spesifik** yang kurang,
  enable tombol capture hanya saat `pass` atau lewat 10 detik (force)
- `doCapture` (~1421): menjadi orkestrator burst → preview → finalize (jalur meja vs non-meja
  tetap seperti sekarang setelah "Pakai")
- `openCamOverlay` / `closeCamOverlay`: reset & bersihkan semua timer (shot interval,
  force-timer 10s, idle-timer 15s meja)
- `skipVerifikasi` (~1534): tetap ada, tapi ikut burst+preview (bypass liveness saja)

## Gerbang kualitas (SCANNING)

| Kriteria | Lolos kalau | Pesan saat gagal |
|---|---|---|
| Ukuran wajah | tinggi wajah 30–95% frame | "Terlalu kecil — dekatkan ke kamera" |
| Terpusat | pusat wajah ±12% dari pusat bingkai | "Geser wajah ke tengah bingkai" |
| Cahaya | rata-rata terang 60–210 (skala 0–255) | "Terlalu gelap — pindah ke tempat lebih terang" / "Terlalu terang" |
| Stabil | wajah diam ≥ ~300 ms | "Diam sejenak…" |
| Liveness | skor ≥ `FS_LIVENESS_SCORE` | "Verifikasi keaslian…" |

- Ambang di konstanta `js/face-quality.js` (bisa disetel di satu tempat).
- Liveness **mengikuti config admin** `liveness_enabled`; OFF → kriteria dilewati.
- Tombol "Ambil Foto" aktif hanya saat semua kriteria lolos.
- Lewat **10 detik** belum lolos → tombol diaktifkan juga, status: "Kualitas belum ideal —
  boleh tetap ambil" (force capture; syarat no-block).

## SHOOTING (3 foto)

- Pemicu: tekan "Ambil Foto" (gate lolos); di mode meja: match + gate lolos (otomatis).
- Burst **3 frame, jeda ~700 ms**, status "Menangkap 1/3 … 3/3".
- Gate dinilai ulang per frame; frame gagal **dibuang**. Setelah ~3 detik belum dapat 3 frame
  bagus → pakai yang ada, **minimal 1** (kalau 0 → jalur error lama "Gagal Ekstraksi" dan loop
  nyala lagi).
- `mergeDescriptors` → **1 array** → payload `POST /face` **tidak berubah**.
- Foto tersimpan = frame dengan `score` terbaik, kompresi seperti sekarang (640px, JPEG).
- Force capture: burst tetap jalan, frame tanpa wajah tidak lolos — hasil tetap best effort.

## PREVIEW (Pakai / Ulang)

- Elemen `camPreview` yang sudah ada dipakai ulang (tidak bikin modal baru).
- Isi: foto hasil terbaik +, di mode meja, identitas hasil match + skor ("Cocok: Budi · 82%").
- Tombol **Pakai Foto Ini** (utama) / **Ambil Ulang**.
  - Pakai → tutup overlay → `onDone(...)` → jalur lama (daftar: loading Swal + simpan;
    absen: submit; meja: finalisasi absensi).
  - Ulang → buang hasil, reset hitungan, kembali SCANNING; tanpa batas percobaan.
- Mode meja: **15 detik** tidak disentuh → auto-"Pakai" (kiosk tidak macet).
- Esc / ✕ tetap batal seperti sekarang.

## Optimasi pencocokan

1. **Tolak ambigu** — `matchMejaCandidate` juga menghitung skor kandidat ke-2; kalau
   selisih best−runner-up **< 0.05** → tidak dikenali: "Wajah menyerupai lebih dari satu
   orang — coba lagi" (berlaku absen & meja).
2. **Cek tumpang-tindih saat daftar/update** — di `POST /face` (server `server/media.js`),
   sebelum menulis: ambil descriptor seluruh user satu instansi
   (`COALESCE(face_descriptor, face_histogram)` seperti `server/core-admin.js`), hitung
   kemiripan dengan **semantik yang sama dengan klien**:
   - 512-dim → cosine similarity (formula `Human.match.similarity` — **diverifikasi dari
     pustaka Human saat implementasi**, jangan karang sendiri)
   - 128-dim → `1 − euclidean/1.5` (persis `js/face.js` jalur faceapi)
   - threshold: config `face_threshold` per instansi yang **sudah dibaca server**
     (`server/media.js:385-396`, default 0.55)
   Hasil ≥ threshold → tulis dibatalkan, balas `ok:false` + `message: "Mirip dengan <Nama>
   lain — daftar ulang dengan pencahayaan/sudut berbeda atau hubungi admin"`.
   **Dikecualikan**: update milik sendiri (uid sama).
   Klien tidak perlu diubah — `syncFaceToServer` sudah menampilkan `body.message` ke Swal.
3. **Panduan threshold di UI admin** — teks bantu singkat di slider `fsThreshold` /
   `fsMejaThreshold` yang sudah ada: "0.55 = seimbang · < 0.5 = longgar (risiko salah kenali) ·
   > 0.65 = ketat (risiko gagal cocok)". Default tetap 0.55.

## Kontrak yang TIDAK berubah

- Body `POST /face`, respons **sukses**, penyimpanan GAS/DB.
  (Penambahan hanya satu jalur tolak `ok:false` + `message` — format yang sudah dipakai klien.)
- Pemanggil `openCamOverlay` (7 tempat), perilaku absensi setelah "Pakai".
- Engine Human.js, threshold default 0.55, config admin yang sudah ada.

## Alur error & edge case

- `liveness_enabled` OFF → kriteria liveness dilewati (gate tetap jalan).
- Nol descriptor valid di burst → "Gagal Ekstraksi — wajah tidak terdeteksi jelas", loop
  nyala lagi, tombol bisa dipakai lagi.
- Update wajah sendiri → cek tumpang-tindih mengecualikan uid yang sama.
- Kamera gagal / video 0px → jalur error lama di `doCapture`.
- Gagal simpan (timeout dst.) → penanganan yang sudah ada (Swal + pesan server).
- Timer apa pun harus dibersihkan di `closeCamOverlay`/`stopDetectLoop` (anti bocor).

## File yang diubah

- **Baru**: `js/face-quality.js`, `www/js/face-quality.js`, `tests/face-quality.test.mjs`
- **Ubah**: `js/face.js`, `www/js/face.js` (gate, burst, preview, ambig),
  `index.html`, `www/index.html` (tag `<script>` + cache-buster),
  `server/media.js` (cek tumpang-tindih), `server/media.test.js` (uji cek),
  `js/admin-face.js` + mirror `www/js/admin-face.js` (teks panduan threshold),
  `package.json` (daftarkan test baru ke skrip `test`)

## Testing

- **Unit murni** (`tests/face-quality.test.mjs`, diimpor via `createRequire`):
  merge rata-rata polos tanpa normalisasi (512/128, input 1 & 3, panjang beda), tiap kriteria
  gate lolos/gagal + `reasons`, pemilihan skor frame terbaik.
- **Server** (`server/media.test.js`): descriptor kembar ≥ threshold → `ok:false` + pesan;
  uid sendiri (update) → tetap lolos; descriptor beda → lolos.
- **Wiring** (source-assert gaya repo): tag script + cache-buster di dua `index.html`,
  force 10s & idle 15s meja ada, ambig < 0.05 dipakai, `mergeDescriptors` dipanggil sebelum kirim.
- `npm test` (706+ test) harus hijau; file test baru ditambahkan ke skrip `test` di
  `package.json`.

## Di luar cakupan (YAGNI)

- Ganti model/engine, server lebih kuat, GPU cloud, multi-referensi per orang,
  storage multiple descriptor, perubahan kontrak GAS/DB.

## Risiko / catatan operasional

- Mode meja berubah jadi interaktif (butuh sentuhan) — keputusan user; auto-15s membatasi
  macetnya kiosk.
- File mirror `www/js/*` harus identik dengan `js/*` (kecuali beda komentar yang sudah ada);
  setiap JS yang diubah → bump `?v=` di **dua** `index.html`.
- Gate membuat absensi butuh kualitas minimal — dimitigasi tombol force 10 detik.
