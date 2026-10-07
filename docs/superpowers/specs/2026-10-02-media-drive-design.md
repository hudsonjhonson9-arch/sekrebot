# Pindahkan Media (Wajah & Tanda Tangan) ke Google Drive

Tanggal: 2026-10-02 · Status: Disetujui · Cakupan: Fase 1 (wajah + tanda tangan)

---

## 1. Latar Belakang

Dua kolom menyimpan binary sebagai base64 di PostgreSQL:

- `user_list.face_photo` — 25 dari 47 baris terisi, total 1.707.015 byte
- `tanda_tangan.signature` — jumlah & ukuran belum terukur (query timeout)

Base64 menambah ukuran ~33% dan membuat setiap `SELECT` menanggung beban tidak
terukur. Skema `view_user_mgmt` dan `Get Admin List` sama-sama menyertakan kolom ini.

Selain itu, `n8n/google-drive-upload.workflow.json` sudah ada tapi rusak: credential
masih placeholder, dan node Google Drive mencari binary `data` sementara node
preparasi hanya menghasilkan `_buffer`.

## 2. Keputusan

| Pertanyaan | Keputusan |
|---|---|
| Cakupan | Wajah + tanda tangan saja. Berita/slider/inovasi jadi spec terpisah. |
| Akses file | Publik (`ANYONE_WITH_LINK`), sama seperti `peta-ekonomi`. |
| Penyimpanan | Google Apps Script, beradaptasi dari `D:\Code\peta-ekonomi`. |
| Backend | Express + `pg` baru, khusus endpoint media. n8n tetap menjalankan modul lain. |
| Deployment | Docker → Coolify. |
| Database | Postgres yang sama dengan n8n sekarang. |

## 3. Arsitektur

```
BROWSER ──POST /api/media/face {user_id, histogram, foto_base64, face_model}──►
BROWSER ──POST /api/media/signature {nip, signature}───────────────────────►
                                    │
                                    ▼
              EXPRESS  (server/, Docker → Coolify, :3001)
                1. validasi Bearer → SELECT id, role, instansi_id FROM user_list
                2. cek role terhadap allowlist
                3. POST ke Google Apps Script  → { fileId, url }
                4. tulis url ke Postgres
                                    │
                                    ▼
              GOOGLE APPS SCRIPT ──► GOOGLE DRIVE (ANYONE_WITH_LINK)
                                    └── kembali { fileId, url } ke Express

BROWSER ◄── <img src="https://drive.google.com/uc?export=view&id=…">   (nol beban server)
BROWSER ◄── GET /api/media/raw/:fileId   (khusus rekap-pdf, butuh CORS)
```

### Deviasi dari `peta-ekonomi`

Peta-ekonomi memanggil GAS langsung dari browser lewat `VITE_GAS_WEBAPP_URL`, lalu GAS
yang memanggil balik Express untuk menyimpan metadata. Pola itu membiarkan URL GAS
terekspos sehingga siapa pun bisa POST dan mengisi Drive.

Di sini urutannya dibalik: **browser → Express → GAS → Postgres**. Token divalidasi
sebelum ada Drive write.

## 4. Skema Data

**Tidak ada perubahan skema.** Dua kolom lama dipakai ulang:

| Tabel | Kolom | Nilai lama | Nilai baru |
|---|---|---|---|
| `user_list` | `face_photo` | `data:image/png;base64,…` | `https://drive.google.com/file/d/<ID>/view` |
| `tanda_tangan` | `signature` | `data:image/png;base64,…` | `https://drive.google.com/file/d/<ID>/view` |

Baris lama dan baru dibedakan lewat prefix `data:` — tidak perlu kolom baru.

Kolom `user_list.face_histogram`, `face_saved_at`, dan `face_model` **tidak** berubah;
descriptor tetap disimpan lokal karena dipakai untuk pencocokan tanpa perlu unduh foto.

### Bentuk URL

`file.getUrl()` menghasilkan `https://drive.google.com/file/d/<ID>/view` — itu halaman
HTML, **bukan gambar**, dan tidak bisa dipakai langsung sebagai `<img src>`.

Karena itu frontend memanggil helper kecil:

```js
// js/helpers.js
function driveDirectUrl(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : '';
}
```

URL kanonik tetap disimpan di DB karena itu tautan yang bisa dibuka manusia di Drive.

## 5. Kontrak Endpoint

Semua endpoint membalas JSON `{ ok, … }` atau `{ ok:false, error, code }`.
`Authorization: Bearer <token>` wajib pada semua kecuali `GET /api/media/raw/:fileId`.

| Method | Path | Body / Param | Respons |
|---|---|---|---|
| POST | `/api/media/face` | `{user_id, histogram, foto_base64, face_model}` | `{ok, photoUrl}` |
| POST | `/api/media/signature` | `{nip, signature}` | `{ok, url}` |
| GET | `/api/media/face/:user_id` | — | `{photoUrl, face_model, savedAt}` |
| GET | `/api/media/signature/:nip` | — | `{url}` |
| GET | `/api/media/signatures` | — | `{ok, data:[{nip, url}]}` |
| GET | `/api/media/raw/:fileId` | — | `image/*` + `Access-Control-Allow-Origin` |

Tidak ada endpoint `DELETE` — lihat §6.

## 6. Apps Script

Salinan `peta-ekonomi/google-apps-script/Code.gs` **dipangkas**. Kode referensi punya
alur resumable/chunk/multi-file/folder untuk arsip dokumen 30 MB+; tidak ada satu pun
yang dibutuhkan foto 50–200 KB.

| Action | Isi | Sumber |
|---|---|---|
| `health` | `{ok:true}` | `doGet` versi referensi |
| `upsert` | `{folderId, filename, mimeType, fileId?, file}` | `direct` versi referensi |
| `deleteFile` | `{fileId}` | disalin utuh |

### `upsert` dan masalah orphan

Wajah dan tanda tangan = satu file per pegawai. Kalau `fileId` diberikan,
`DriveApp` melakukan `file.setContent(blob)`: **file ID tetap, URL tidak berubah,
file lama tidak pernah menggantung di Drive.**

Kalau `fileId` kosong, `folder.createFile(blob)` seperti biasa.

Dua konsekuensi:

- Tidak ada endpoint `DELETE`, tidak ada cron pembersihan, tidak ada tabel tracking.
- Kalau pegawai dihapus dari `user_list`, file-nya tetap ada di Drive tanpa jejak.
  Diterima pada fase ini (kuota 15 GB lega); lihat §11.

`setSharing(ANYONE_WITH_LINK, VIEW)` dipanggil setiap kali — berlaku untuk file baru
maun yang di-`setContent`.

## 7. Backend Express

### Struktur

```
server/
  index.js   — bootstrap Express, CORS, mount router
  db.js      — Pool `pg` + helper query()
  auth.js    — requireSession(req, roles)
  gas.js     — gasCall(action, payload)
  media.js   — router /api/media
```

Tidak meniru `peta-ekonomi/server/index.js` yang 85 KB dalam satu file.

### Autentikasi

Satu fungsi, dipporting dari pola `Security Gate Face-Register` yang sama dipakai 8
endpoint n8n:

```js
// server/auth.js
const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
const userId = token.split('_')[1];                    // format token sudah memuat id
const { rows } = await query(
  'SELECT id, role, instansi_id FROM user_list WHERE id = $1', [userId]);
```

- token kosong / `userId` bukan angka / tidak ketemu → `401 SESSION_INVALID`
- role tidak ada di allowlist → `403 FORBIDDEN`

Allowlist role mengikuti n8n: `ADMIN`, `SUPERADMIN`, `KEPALA`, `SEKRETARIS`, `KABID`, `IRBAN`.

> `ADMIN_IDS = [1383864355]` yang di-hardcode di beberapa node n8n **tidak** ditiru —
> itu jalur pintas, dan Express sudah bisa membaca dari `role`.

### Otorisasi per-PSU

`instansi_id` diambil dari sesi, bukan dari body request. Query selalu di-scope:

```sql
UPDATE user_list SET … WHERE id = $1 AND instansi_id = $2
```

Ini mencegah admin instansi A menimpa data instansi B.

## 8. Perubahan Frontend

| File | Perubahan |
|---|---|
| `js/config.js` | `P.mediaFace`, `P.mediaSignature`, `P.mediaRaw`, `P.mediaSignatures` |
| `js/helpers.js` | tambah `driveDirectUrl()` |
| `js/face.js` | POST ke Express, bukan `/webhook/face-register` |
| `js/signature.js` | POST ke Express, bukan `/webhook/signature-save` |
| `js/rekap-pdf.js` | ambil byte dari `/api/media/raw/:fileId`, ubah ke base64 untuk `doc.addImage` |
| `js/admin-pegawai.js` | `src` = `driveDirectUrl()`; bukan `dataUrl` langsung |
| `js/admin-face.js` | `src` = `driveDirectUrl()` |
| `js/desktop.js` | deteksi `has_face` dari ada-tidaknya `photoUrl` |

`/media/raw/:fileId` tidak wajib auth agar `<img>` dan `fetch` dari PDF bisa jalan —
file-nya sudah publik. Yang dilindungi adalah endpoint **tulis**.

## 9. Migrasi Data

`scripts/migrate-media-to-drive.mjs`

- Tanpa flag: dry-run. Tidak menyentuh Drive sama sekali, tidak mengubah
  baris DB, hanya mencetak rencana dan menulis dump base64 ke
  `media-dump-<kind>.json` untuk review manual.
- `--apply`: satu-satunya mode yang benar-benar menulis. Tanpa `--apply`,
  `gasUpsert` tidak pernah dipanggil.
- `--kind=face|signature` (default `face`) dan `--limit=N` untuk uji sebagian.
- Idempoten: baris yang isinya sudah `https://` dilewati
- Sumber: `user_list WHERE face_photo LIKE 'data:%'` dan
  `tanda_tangan WHERE signature LIKE 'data:%'`
- Tiap baris: upload via GAS → `UPDATE` kolom dengan URL kanonik
- Kegagalan satu baris dicatat dan dilewati; sisanya tetap berjalan.

Setelah migrasi, kolom berisi URL. Base64 lama hilang — itu tujuannya.

## 10. Penanganan Error

| Situasi | Respons |
|---|---|
| File > 5 MB | `413 FILE_TOO_LARGE` — foto wajah/tanda tangan tidak mungkin sebesar itu |
| `foto_base64` bukan `data:image/*` | `400 INVALID_MIME` |
| `histogram` kosong pada POST face | `400 NO_DESCRIPTOR` — deskripsi tanpa descriptor tidak berguna |
| Session tidak valid | `401 SESSION_INVALID` |
| Role salah | `403 FORBIDDEN` |
| `user_id`/NIP tidak ada | `404 NOT_FOUND` |
| Instansi tidak cocok | `403 WRONG_INSTANSI` |
| GAS error / timeout | `502 DRIVE_ERROR` — **kolom Postgres tidak diubah** |

Urutan upload-then-write dipilih supaya kegagalan tidak meninggalkan kolom DB berisi
link ke file yang tidak ada. Kebalikannya: bila `UPDATE` gagal setelah upload sukses,
file ada di Drive tanpa terpakai — hanya satu file, tertimpa pada register ulang.

## 11. Pengujian

Hanya fungsi murni, `node --test`, tanpa database:

- `server/media.test.mjs`
  - `requireSession` menolak token kosong / id non-numerik
  - validasi MIME menerima `data:image/png;base64,…` dan menolak `data:text/html,…`
  - guard ukuran menolaki payload > 5 MB
  - `driveDirectUrl` mengekstrak ID dari `…/file/d/<ID>/view` dan menolak input bukan-URL

Integrasi diuji manual: daftar CRUD, upload wajah → cek Drive → cek baris DB →
tampil di `admin-face` → PDF rekap.

`pg-mem` tidak dipasang. Mock untuk query yang belum ditulis adalah usaha yang dibuang.

## 12. Deployment

Docker → Coolify, mengikuti `peta-ekonomi`.

Environment:

```
PORT=3001
DATABASE_URL=postgresql://…        # Postgres yang sama dengan n8n
GAS_WEBAPP_URL=https://script.google.com/macros/s/…/exec
GAS_FOLDER_ID=…                    # folder Drive untuk wajah + tanda tangan
FRONTEND_ORIGIN=https://…           # kosongkan bila frontend same-origin
```

Bila frontend di-host same-origin dengan Express, `FRONTEND_ORIGIN` dibiarkan kosong
dan tidak ada header CORS yang dikirim.

## 13. Di Luar Cakupan (YAGNI)

- Migrasi CRUD modul lain keluar dari n8n
- Berita, slider, `bapperida_inovasi.dokumen_dukung`
- Resumable/chunk upload (file < 5 MB)
- Hapus file Drive, pembersihan orphan, akun Drive terpisah untuk service account
- Hapus workflow n8n `/face-register`, `/face-get`, `/signature-*` — dibiarkan sampai
  stabil, baru dibersihkan
- Multi-frame face, kualitas dan reatakan foto, kompresi

## 14. Risiko

1. **Foto wajah menjadi publik permanen.** `ANYONE_WITH_LINK` tanpa batas waktu.
   siapa pun yang memperoleh URL bisa melihat. Tidak dapat dibatalkan tanpa
   menukaruu semua tautan. Ini konsekuensi langsung dari keputusan §2.
2. **`setContent` butuh hak edit.** File harus berada di folder milik akun yang
   menjalankan Web App. Kalau nanti dipakai service account terpisah, foldernya
   harus di-share — belum ada di desain ini.
3. **Kuota Apps Script.** Sekitar 30 file untuk migrasi awal; kuota harian Google
   jauh melampaui itu. Bukan masalah.
4. **File orphan** untuk pegawai yang dihapus (lihat §6).
5. **`AGENTS.md` masih menyatakan produksi hanya boleh menulis lewat n8n.** Aturan itu
   perlu diperbarui agar sesuai dengan §§7–9.

## 15. Lampiran: Alur Yang Diganti

`face-register` (n8n, aktif)

```
Face Register Webhook → Security Gate → Validate Session → Check Role
  → Parse Face Data → Simpan Histogram ke user_list → Respon Face Register
```

`face-get` (n8n, aktif)

```
Face Get Webhook → CORS → Get Pegawai dari user_list → Format Histogram Response → Respon
```

`signature-save` (n8n, aktif)

```
Signature Save Webhook → CORS → Parse Signature Save → If Sig Save Error
  → Upsert Signature → Respond Signature Save
```

Keduanya digantikan oleh router `server/media.js`. Workflow n8n tidak dihapus.