# Native Backend Migration — Phase 2 & 3

Tanggal: 2026-10-04

## Tujuan

Memindahkan business logic Phase 2 dan Phase 3 dari webhook n8n ke Express/PostgreSQL.
Workflow n8n lama **tidak dihapus**; tetap disimpan sebagai referensi/fallback sampai cut-over production selesai.

## Phase 2 — Data Absensi

Native routes:

- `POST/GET /api/keterangan`
- `POST /api/keterangan/edit`
- `POST /api/keterangan/delete`
- `POST /api/keterangan/approve`
- `GET/POST /api/dokumen`
- `POST /api/dokumen/delete`
- `GET /api/dokumen/file`
- `GET /api/rekap-absen`
- `POST /api/kirim-rekap`
- `/api/media/face*`
- `/api/media/signature*`
- `/api/media/face-toggle`
- `/api/media/face-settings`

Implementasi:

- `server/attendance-data.js`
- `server/notify.js`
- `server/media.js`
- `scripts/migration_010_rekap_lembur.sql`

## Phase 3 — Penugasan & Lembur

Native routes:

- `GET/POST /api/penugasan`
- `GET /api/lembur`
- `POST /api/lembur/archive`
- `GET /api/lembur/archive`
- `POST /api/lembur/archive/delete`

Implementasi:

- `server/overtime.js`

## Frontend cut-over

`js/config.js` dan `www/js/config.js` sekarang mengarahkan endpoint Phase 2/3 ke `/api/*` native.

Workflow n8n yang menjadi sumber referensi:

- `n8n/Ket absensi wf.json`
- `n8n/face recognition wf.json`
- `n8n/face-settings-wf.json`
- `n8n/Absensi Dok Pegawai.json`
- `n8n/kirimrekapabsen.json`
- `n8n/tugas_lembur_wf.json`
- `n8n/lembur_archive_workflow.json`

## Database

Jalankan migration sebelum cut-over production:

```text
scripts/migration_010_rekap_lembur.sql
```

Tabel `ket_temp`, `dokumen_pegawai`, `pengaturan`, `penugasan`, dan tabel absensi lainnya diasumsikan sudah tersedia dari database existing.

## Telegram dan Google Drive

Keduanya tetap boleh digunakan sebagai **layanan eksternal**. Yang dihilangkan adalah n8n sebagai perantara:

```text
Express -> Telegram Bot API
Express -> Google Apps Script / Drive
```

bukan:

```text
Express -> n8n -> Telegram/Drive
```

## Validasi

- `npm test`: 297/297 lulus.
- ESLint backend yang berubah: lulus.
- `vite build`: belum dapat dijalankan pada lingkungan arsip karena `node_modules` tidak memiliki native binding Rolldown/Vite yang diperlukan. Ini masalah artefak `node_modules`, bukan error syntax source.

## Catatan deployment

1. Backup database.
2. Jalankan migration 010.
3. Deploy Express.
4. Pastikan `TELEGRAM_BOT_TOKEN` tersedia untuk `/api/kirim-rekap`.
5. Uji endpoint Phase 2/3 dengan akun USER dan ADMIN.
6. Monitor error log.
7. Setelah stabil, nonaktifkan workflow n8n terkait secara bertahap.
