# Native Absensi V5.2 — Migrasi n8n ke Express

Status: disetujui (implementasi)
Tanggal: 2026-10-04
Sumber: `n8n/AbsensiBot V.5.1.json` — nama internal workflow `"Absensi Bot V5.2 Postgres"` (206 node)

---

## 1. Tujuan

Menjadikan alur absensi native di Express/PostgreSQL, dan sekaligus menutup celah
keamanan yang ditemukan audit. Empat endpoint dipindah:

| Endpoint lama | Endpoint native | Auth |
|---|---|---|
| `POST /webhook/absen` | `POST /api/absen` | `initData` Telegram (HMAC) |
| `POST /webhook/log-add`, `/webhook/log-edit` | `POST /api/log` | sesi admin native |
| `POST /webhook/session-login` | `POST /api/auth/session` | `initData` Telegram (HMAC) |
| trigger `Sync Statistik Pegawai` | di dalam `POST /api/absen` & `POST /api/log` | — |

Cakupan parity untuk `/api/absen`: 21 node, 9 query, 611 baris JS, termasuk cabang
`KONTROL`, `meja_absen`, WFH, weekend, offline queue, dan `PULANG LUAR`.

---

## 2. Keputusan desain

### 2.1 Struktur

Satu router `server/absen.js`. Validasi tetap satu fungsi murni di file yang sama —
tidak dipecah jadi modul. Ringkas, karena belum ada alasan untuk abstraksi.

### 2.2 Autentikasi `/api/absen` dan `/api/auth/session`

`initData` Telegram diverifikasi HMAC-SHA256 memakai `TELEGRAM_BOT_TOKEN`:

1. Cek `Authorization: Bearer` **hanya keberadaannya** (kompatibilitas client).
2. Verifikasi `init_data` → `user_id` bot.
3. Lookup pegawai berdasarkan `NIP` dari body.
4. `init_data.user_id` harus sama dengan `user_list.id`. Tidak ada fallback.

`user_list` tidak punya kolom `telegram_id`; `id` berperan sebagai Telegram ID.

**Role selalu dari `user_list`**, abaikan `role` dari body — menutup K3 (self-escalation).

### 2.3 `_signature` — dibuang

Signature lama dibuat dari SHA-256 atas `request_id + nip + lat + lng + timestamp + token`,
dengan `token` **tidak pernah dideklarasikan** di workflow, sehingga kunci HMAC-nya
adalah string literal `"undefined"`. Tidak ada secret server sama sekali. Field tetap
diterima demi kompatibilitas client, tetapi tidak dipercaya dan tidak diverifikasi.

### 2.4 Perbaikan keamanan (dipilih: perbaikan sekalian)

| # | Temuan | Perbaikan native |
|---|---|---|
| K1 | Token `usr_<id>_<ts>` bisa dipalsukan total | Auth `initData` HMAC, bukan token buatan client |
| K2 | Kunci HMAC = `"undefined"` | HMAC asli dari `TELEGRAM_BOT_TOKEN` |
| K3 | `role` dari body → priviledge escalation | Role dari `user_list` |
| K4 | 30 webhook tanpa auth, CORS `*` | Auth per endpoint; CORS-Allow-Origin tidak `*` |
| K5 | Static token hardcoded | Tidak ada static token |
| T1 | `skip_radius_check` → bypass radius/IP penuh | `PULANG LUAR` tetap divalidasi radius + IP |
| T2 | `tanggal`/`jam` dari client → bisa backdate | Jam server (WITA) sebagai nilai resmi |
| T3 | `meja_token` hanya `!!body.meja_token` | Token meja validasi server (lihat 2.6) |
| T4 | Impersonasi pegawai lain | `initData.user_id` harus cocok `user_list.id` |
| S3 | Tidak ada idempotensi | `ON CONFLICT (request_id) DO NOTHING` |

Komentar baris 7-8 di workflow mengklaim *"FIX: PULANG LUAR tidak lagi bypass validasi"*,
tetapi baris 206 dan 247-248 justru menjalankannya. Bypass itu tidak dipindahkan.

### 2.5 T2 — jam server

`Log_Absen.tanggal` & `jam` diisi dari jam server (WITA, UTC+8). Nilai dari client
disimpan terpisah sebagai `client_jam` untuk audit. Ini menutup backdate/forward absen.

> Konsekuensi UX: layar dapat berbeda dari catatan server bila jam HP salah zona.
> Nilai server-lah yang benar secara data.

### 2.6 T3 — token meja

Tidak ada tabel token meja di database. Token meja diperlakukan sebagai **secret
environment** (`MEJA_TOKENS`, daftar token yang sah, dipisah per instansi), bukan
baris DB — sesuai temuan bahwa tidak ada entity token di schema.

Perbandingan dilakukan `timingSafeEqual`, bukan `===`.

### 2.7 Offline & idempotensi

- Toleransi offline **24 jam** (`86400` detik). Workflow lama hanya `3600` detik meski
  komentarnya menulis "24 hours tolerance" — bug. Nilai native mengikuti keputusan, bukan kode lama.
- Replay check tetap memakai `timestamp` dari client (hanya untuk penentuan rentang),
  tetapi **nilai resmi yang dicatat adalah jam server**.
- `request_id` unik → `INSERT ... ON CONFLICT (request_id) DO NOTHING`.
- `auth_date` pada `initData` juga membatasi umur initData agar antrean offline
  tidak bisa tumbuh tanpa batas.

### 2.8 Sesi admin (`/api/auth/session`)

`auth_sessions` saat ini **0 baris** — tidak ada sesi aktif, padahal 9 admin ada di
`user_list`. Token 192-hex terbit dari `randomBytes(96).toString('hex')`; `role` dan
`instansi_id` diambil dari `user_list`, bukan dari input. `POST /api/auth/logout`
menonaktifkan sesi (`is_active = false`).

`/api/log` dilindungi `requireRole(['ADMIN','SUPERADMIN'])` dari `server/auth.js`.
`sameInstansi()` membatasi admin biasa agar tidak menyentuh data instansi lain.

### 2.9 Statistik

`statistik_pegawai` PK = `nip`. Terverifikasi: 0 NIP duplikat lintas instansi,
0 mismatch instansi, 48 baris (1 orphan). `ON CONFLICT (nip) DO UPDATE` aman.

Sync berjalan di dalam request yang sama (bukan trigger), dihitung ulang dari
`Log_Absen` untuk NIP terkait.

---

## 3. Migrasi database

```sql
CREATE SEQUENCE IF NOT EXISTS public.log_absen_id_log_seq;
ALTER TABLE public."Log_Absen"
  ALTER COLUMN "ID_Log" SET DEFAULT nextval('log_absen_id_log_seq');
SELECT setval('log_absen_id_log_seq',
              COALESCE((SELECT max("ID_Log") FROM public."Log_Absen"), 0) + 1);

ALTER TABLE public."Log_Absen"
  ADD COLUMN IF NOT EXISTS client_jam text;

DELETE FROM public.statistik_pegawai s
  WHERE NOT EXISTS (SELECT 1 FROM public.user_list u WHERE u."NIP" = s.nip);
```

Trigger `n8n_trigger_*` pada `Log_Absen` **tetap ada** (tidak disentuh) sampai parity
terbukti; stats dihitung oleh Express sehingga trigger n8n cukup dinonaktifkan di
n8n, bukan di database.

---

## 4. Environment

| Variabel | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Verifikasi HMAC + kirim konfirmasi. Wajib. |
| `TELEGRAM_BOT_ID` | ID bot |
| `MEJA_TOKENS` | JSON `{"<instansi>": ["token", ...]}` |
| `DATABASE_URL`, `PGSSL` | Sudah ada |
| `GAS_WEBAPP_URL` | Sudah ada |
| `CORS_ORIGIN` | Origin diizinkan, bukan `*` |

---

## 5. Perilaku respons

Kontrak lama dipertahankan agar client tidak perlu berubah:

- sukses — `{ validasi: { is_valid: true, keterangan, nama_lokasi } }`
- gagal — `{ validasi: { is_valid: false, kode_tolak, keterangan } }`
- idempoten — `{ ok: true, message: "Data sudah tercatat (Idempotent)" }`

> String asli `"Data sudah tercatat (Idempotent)"` dipertahankan agar client tidak berubah.

Konfirmasi Telegram dikirim setelah insert; kegagalan notifikasi **tidak** menggagalkan
absensi. Foto absen hanya dikirim ke Drive bila `pengaturan.face_recognition` ON untuk
`instansi_id` pegawai. Nilainya saat ini `"0"` di `bapperida`, `dpmptsp`, dan
`inspektorat`, sehingga jalur ini belum aktif.
`Log_Absen` tidak punya kolom foto; perlu `foto_url` ditambahkan bila aktivasi diinginkan.

---

## 6. Di luar cakupan

- Migrasi `user_list.face_photo` ke Drive — pekerjaan terpisah setelah ini
- Verifikasi wajah/liveness server-side (S4 masih client-side)
- 25 webhook admin lain (`user-*`, `lokasi-*`, `jam-*`, `libur-*`, `admin-*`)

---

## 7. Lanang cutover

1. Migration DB (idempotent).
2. Deploy Express; `n8n/absen` tetap hidup.
3. Ubah `js/config.js` → arahkan ke `/api/absen`, `/api/log`, `/api/auth/session`.
4. Verifikasi `curl` + satu siklus absen nyata.
5. Nonaktifkan workflow n8n; trigger `statistik_pegawai` ikut mati.
6. Rotasi shared secret Coolify + GAS Script Properties.

Jangan `git add -A` — `www/` untracked/WIP dan `www/js/config.js` berisi teks tidak valid.