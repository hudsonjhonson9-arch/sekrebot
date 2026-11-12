# Multi-Photo Enrollment — Design Spec

Tanggal: 2026-11-12
Status: approved for implementation (user men-delegasikan review ke commit akhir)
Scope yang disepakati: **A — semua titik pendaftaran**

## 1. Latar & Tujuan

Saat ini setiap enrolmen menyimpan **tepat 1 descriptor 512-dim** per pegawai
(`user_list.face_histogram`), diambil sekali tembak. Satu foto buram/berubah
pose = template jelek = pengenalan sering miss. Tujuan: tiap enrolmen
menghasilkan **rata-rata 3 foto berkualitas (pose sedikit berbeda)** dalam 1
descriptor, tanpa mengubah API, skema DB, atau alur verifikasi/absen.

Ukuran keberhasilan:

- Enrolmen (daftar akun, regen login, panel wajah, capture admin) meminta 3
  foto berurutan; `POST /api/media/face` tetap mengirim 1 descriptor hasil merge.
- Alur verifikasi (login biometric), absen, mode meja, dan bukti foto tetap
  **1 tembak — tidak berubah perilaku maupun signature**.
- Suite regresi hijau penuh + mirror `js/`↔`www/js/` 0 beda + cache-buster ikut
  naik untuk tiap file berubah.

## 2. Desain Inti (satu titik-dorong)

### 2.1 Choke point

Semua alur kamera user lewat `openCamOverlay(onDone)` → preview `Pakai/Ulang`
→ `_previewUse()` → `_finishUserCapture(result)` → callback
(`js/face.js:874, 1649-1663`). Loop multi-shot ditaruh **hanya di
`_previewUse`/state overlay**, sehingga semua pemanggil mendapat fitur tanpa
mengubah masing-masing alur.

### 2.2 Opt-in per pemanggil (bukan global)

`openCamOverlay` menerima varian objek baru: `openCamOverlay({ onDone, shots: N })`.

- State: `_enrollShots` (default `1`) dan `_enrollTaken` (array descriptor +
  kandidat dataUrl) — di-reset di `openCamOverlay` seperti `_gate`.
- Pemanggil enrolmen melewatkan `shots: 3`:
  1. `auth.js` login-regen (`onDone` sekitar baris 180)
  2. `auth.js` pendaftaran (`onDone` sekitar baris 356)
  3. `face.js` panel wajah / alur register internal (pemanggilan
     `openCamOverlay` yang non-meja untuk enrolmen)
  4. `adminCaptureFaceFor` (dipakai `admin-pegawai.js:306`)
- Pemanggil verifikasi/absen/bukti **tidak diubah** (tetap tembak tunggal).
  Form `cb` lama (function / `'meja'` / `{onDone}` tanpa `shots`) tetap valid —
  backward compatible.

### 2.3 Loop capture

Konstanta `ENROLL_SHOTS = 3` (tetap, bukan konfigurasi).

Pada `_previewUse` mode enrolmen (`_enrollShots > 1`):

1. Simpan `p.result.descriptor` + `p.result.dataUrl` ke `_enrollTaken`.
2. Bila `_enrollTaken.length < _enrollShots`:
   - sembunyikan preview, tampilkan lagi video,
   - perbarui progres pada status kamera: `Foto n/3 terkunci — ambil lagi,
     geser sedikit posisi` (hint pose lewat copy saja),
   - re-arm gate (`_gate = {pass:false}`, tombol + force-timer 10 dtk seperti
     `_previewRetry` lakukan hari ini),
   - set `btnCapture` label `Ambil Foto (n+1)/3`.
3. Bila sudah 3: `descriptor = mergeDescriptors(sedangkanArray)` (rata-rata —
   helper sudah ada di `js/face-quality.js`), `dataUrl` = foto dengan skor
   kualitas tertinggi di antara 3 (argmax skor gate; bila skor tak tersedia di
   hasil capture, pakai shot pertama), lalu
   `_finishUserCapture({ dataUrl, descriptor, ... })` — kontrak hasil sama
   seperti sekarang.

`_previewRetry` mode enrolmen: hanya menolak shot pada preview yang sedang
terbuka (shot itu belum pernah masuk `_enrollTaken`); shot yang sudah terkunci
tetap tersimpan, user tinggal mengulang shot itu saja.

### 2.4 Batas & keputusan sadar

- **Penyimpanan: 1 descriptor hasil merge** (bukan N template). Tanpa migrasi
  DB, tanpa perubahan `POST /api/media/face`, matching tidak berubah.
- Cancel di tengah loop (tutup overlay setelah 1/2 foto) = **buang semua**,
  callback tidak dipanggil (sama seperti cancel hari ini).
- Wajib 3/3 untuk menyelesaikan; escape tiap shot tetap ada via force-timer
  10 dtk (`Tetap Ambil`) bila gate belum pass.
- **Tidak ada** guard kesamaan antar-shot (pose mirip) di v1 — threshold
  similarity antar-shot belum terkalibrasi, false-reject lebih merugikan;
  diversifikasi didorong lewat copy hint saja. `shortcut: v1 tanpa pose-diversity
  guard, tambah bila data menunjukkan 3 foto ternyata identik semua`.
- Tidak ada perubahan server/DB/n8n.

## 3. Di Luar Cakupan

- Multi-template (N descriptor per user, argmax saat matching) — ditolak:
  sentuh skema, API, collision check, dan seluruh loop match.
- Enrolmen ulang massal 45 pegawai existing (operasional, bukan kode).
- Kalibrasi threshold, model embedding baru, perubahan server.

## 4. Pengujian

1. **Unit (murni):** helper akumulasi/merge enrolmen di
   `js/face-quality.js` (mis. `enrollShotReducer` atau fungsi sejenis):
   terima 3 descriptor → keluarkan merged 512-dim (rata-rata), dataUrl = shot
   terbaik; < 3 → belum selesai; input bukan 512-dim → buang shot itu
   (kontrak seperti gate lama). Test file baru/lanjutan mengikuti pola
   `tests/*.test.mjs` yang ada.
2. **Kontrak pemanggil:** assert opt-in `shots` hanya pada 4 pemanggil
   enrolmen; pemanggil verifikasi (`auth.js` verify, meja, bukti) tetap tanpa
   `shots` (uji via pembacaan sumber/pola seperti test edit-fix yang sudah ada).
3. **Regresi penuh:** seluruh suite `node --test` hijau; mirror js/css 0 beda;
   tag cache-buster tiap file berubah tepat 1× per file di dua `index.html`,
   tanpa BOM, `index.html` drift ≈ jumlah baris yang memang diubah saja.

## 5. Risiko

- `face.js` sudah besar (1714 baris) — perubahan di area preview; diff dijaga
  sempit di `_previewUse`/`openCamOverlay`/`_previewRetry` saja.
- Alur admin (`adminCaptureFaceFor`) perlu dipastikan memang memanggil
  `openCamOverlay` (cek saat implementasi; kalau jalurnya berbeda, ikutkan jalur
  itu dengan pola opt-in yang sama).
- UX 3 tembak menambah ~20-30 detik per pendaftaran — disetujui sebagai
  tradeoff kualitas; bila keluhan nyata, jalur ringan (`shots: 2`) mudah diturunkan.
