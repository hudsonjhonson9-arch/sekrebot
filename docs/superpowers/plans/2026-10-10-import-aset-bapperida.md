# Plan: Import Data Aset Bapperida ke SIMAPO (WS1)

> Spec: `docs/superpowers/specs/2026-10-10-import-aset-arsip-menu-tema-design.md` — section **WS1 — Import Data Aset**.
> Sumber: `D:\Code\aset-bapperida\data\aset.db` (SQLite; `node:sqlite`, Node v22.22.0). Target: PostgreSQL `n8n_storage` via API aplikasi.
> Pola impor lama yang bisa dipakai ulang: `scripts/import-bast-data.js` (sudah membaca aset.db via `DatabaseSync`, mapping kategori, normalisasi NIP).

## Mengapa

Data aset Bapperida (277 aset, 47 pegawai, 14 ruangan) harus pindah penuh ke SIMAPO di
`absensi.mindcloud.my.id` tanpa kehilangan kolom identitas, dan **setiap unit aset wajib
punya QR** (`?qr=SIMAPO-<id>`). Angka-angka di atas adalah angka maksimal dari operasi
sebelumnya — angka sebenarnya dicek ulang saat task 1.

## Bagaimana

- Route **`POST /api/simapo/import-bapperida`** ditambahkan di `server/simapo-native-extra.js`
  (sudah di-mount `MEDIA_ROLES` di `server/index.js:119`). Seluruh operasi dalam SATU
  `withTransaction` (sudah ada di `server/db.js:35` — dipakai jg oleh `aset-kosongkan`).
- Semantik direktif tersebut (disetujui user): hapus ganti ruangan + aset; **cocokkan** pegawai
  ke `public.user_list` lewat NIP (TANPA insert — lihat koreksi di Fase 1.3); upsert kategori by nama.
- **KOREKSI [dikonfirmasi dari kode]:** `user_list.id` = telegram id (bigint) dan di produksi
  TIDAK punya default sequence; `"NIP"` hanya ber-index NON-unique (`server/auth.js:72`) sehingga
  `ON CONFLICT ("NIP")` akan GAGAL. Karena aset.db tak punya telegram id, route **tidak boleh**
  membuat baris user_list — pegawai hanya di-map NIP→id yang sudah ada. Pemegang yang NIP-nya tak
  ketemu → `pegawai_id = null` (dilaporkan di `pegawai_dilewati`).
- Script **`scripts/import-aset-bapperida.mjs`** membaca `aset.db`, me-login via
  `${BASE}/api/auth/login` (NIP admin dari env `SIMAPO_NIP`) untuk bearer token, lalu POST payload
  ke route import. Ada `--dry-run` dan guard `IMPORT` internal (pertahanan lapis dua).

## Prasyarat

- Node ≥ 22 (node:sqlite). Repo: `D:\Code\absensi_refactored_v6`.
- NIP admin untuk login script (env `SIMAPO_NIP`) — dari user saat eksekusi.
- Untuk produksi: konfirmasi ulang dari user DIPERLUKAN sebelum menjalankan (operasi merusak).

---

## Fase 1 — Route import (TDD)

### Task 1.1 — Detail skema yang dipakai route
Baca verbatim dan catat (jangan edit dulu):
1. `server/simapo-native-extra.js` — route `aset-kosongkan` (sekitar baris 117): sekuens DELETE
   yang harus dimirror (riwayat_pemeliharaan → unit_aset → barang) dan kolom `barang`/`unit_aset`
   yang diinsert oleh `bulkAsset` (~baris 99) + bagaimana `qrcode` di-set untuk unit yang ada.
2. Kolom `"SIMAPO".ruangan` dan `public.user_list` (grep `INSERT INTO "SIMAPO".ruangan` dan
   `INSERT INTO public.user_list` di `server/`). Tulis ke catatan, beri nama kolom PK/unique.
3. Format QR: `js/simapo-ext.js` (sekitar baris 818) `generateQRCode` — payload
   `origin + path + '?qr=SIMAPO-' + id`. Route baru pakai `process.env.APP_ORIGIN || (req.protocol + '://' + req.get('host'))`.

**Keluar (quit):** daftar kolom + sekuens DELETE tercatat di komentar route; siap dilanjut.

### Task 1.2 — Tulis test route (merah pertama)
Tambahkan ke `server/simapo-native-extra.test.js` pola harness `stubApp(query, withTransaction)`
(mirror test yang ada untuk pks — `stubApp` memakai prefiks `/api/simapo`). Test:
1. Body tanpa `confirm: 'IMPORT-BAPPERIDA'` → **400**, DB tidak tersentuh (`query` stub menambah
   counter; assert 0 panggilan).
2. `data` bukan objek / array `aset` kosong → **400**.
3. Payload valid (2 aset, 1 ruangan, 1 pegawai) → stub `query` merekam semua `(sql, params)`:
   - ada DELETE ke `riwayat_pemeliharaan`, `unit_aset`, `barang` (urutan benar);
   - tiap INSERT `unit_aset` punya param qrcode yang cocok
     `/https:\/\//` dan mengandung `?qr=SIMAPO-`;
   - TIDAK ADA INSERT ke `public.user_list`, dan TIDAK ADA satu `sql` pun mengandung kata `password`.
4. `withTransaction` stub throw → **500** `{ok:false, message}` tanpa bocor detail error (`DB down`).

**Keluar:** `npm test -- server/simapo-native-extra.test.js` merah pada assertion baris (belum ada route).

### Task 1.3 — Implementasikan route
Di `server/simapo-native-extra.js`, export route baru dalam `createSimapoNativeExtraRouter`
(muncul sebelum `return r` router). Alur dalam satu `withTransaction`:
1. Validasi: `confirm === 'IMPORT-BAPPERIDA'`, tipe `data`, array tidak kosong → 400.
2. `instansi_id = instOf(req, req.body.instansi_id)` (guard yang sudah ada).
3. Ambil peta ruangan (`SELECT ... FROM "SIMAPO".ruangan WHERE instansi_id=$1`) dan peta kategori.
   Upsert ruangan yang beda (by kode), insert kategori baru yang belum ada (by nama, `INSERT (id,nama,deskripsi,createdat,instansi_id)` — mirror `server/simapo.js:94`).
4. Map pegawai: `SELECT id::text id,"NIP" nip FROM public.user_list WHERE "NIP"=ANY($1)` →
   map `aset.db.pegawai.id` → `user_list.id`. **JANGAN insert** (id=telegram id, tak ada di aset.db;
   `ON CONFLICT("NIP")` mustahil karena index non-unique). NIP tak ketemu → `pegawai_id=null`.
5. Hapus data aset instansi ini — sekuens persis `aset-kosongkan`.
6. Loop aset: INSERT `barang` + `unit_aset` (SEMUA kolom: no_polisi, no_rangka, no_mesin, roda,
   merk_type, model_jenis, warna, tahun_pembuatan, kondisi, tahun_perolehan, nilai_perolehan,
   pegawai_id (mapping NIP→id), ruangan_id). Set kolom yang tidak ada di aset.db ke '' default.
   Untuk QR: karena id (uuid) tidak tahu sebelum insert, insert `RETURNING id` lalu
   `UPDATE ... SET qrcode = <origin> + '/?qr=SIMAPO-' + id` per unit — dalam transaksi yang sama.
7. Balas `{ ok:true, summary:{ aset, ruangan, pegawai, kategori } }`.

Catatan: BAST history yang menunjuk unit lama akan tertinggal setelah hapus-ganti. **Checkpoint**
ke user: kalau ada riwayat BAST arsip yang masih dipakai → tanya dulu (opsi snapshot terpisah).
`// ponytail:` beri komentar di dekat DELETE untuk menamai asumsi ini.

**Keluar:** `npm test -- server/simapo-native-extra.test.js` hijau + `node --check server/simapo-native-extra.js`.

### Task 1.4 — Bump versi & nyalakan di indeks (no-op)
- Pastikan `index.js` sudah meng-mount router ({query, withTransaction}); jika belum (untuk kasus
  ini SUDAH ada di :119), tidak perlu ubah apa pun — hanya konfirmasi.
- `npm test` (seluruh) tetap hijau, lint baseline tetap (998).

**Keluar:** seluruh `npm test` hijau.

---

## Fase 2 — Script impor + dry-run

### Task 2.1 — Tulis `scripts/import-aset-bapperida.mjs`
Pola dari `scripts/import-bast-data.js` (reuse! jangan tulis ulang dari nol). Beda:
- Baca `aset`, `pegawai`, `ruangan` dari aset.db via `DatabaseSync` (sudah ada polanya).
- Normalisasi NIP sama dengan `import-bast-data.js` (`norm = s => String(s||'').replace(/\s+/g,'')`).
- Mapping kategori pakai `mapKategori` yang sama (fallback `Aset Tetap`, kendaraan roda 2/4).
- BARU: login dulu — `POST ${BASE}/api/auth/login` body `{ nip: SIMAPO_NIP }` →
  ambil `session_token`, kirim `Authorization: Bearer <token>` ke route import.
- Guard `IMPORT=1` wajib supaya keluar tanpa kirim; `--dry-run` hanya menampilkan ringkasan
  (aset, ruangan, pegawai, kategori) tanpa POST.
- `--limit=N` untuk smoke-test sebagian (sudah ada konsepnya di import-bast-data.js).
- env: `BASE` (default `https://absensi.mindcloud.my.id`), `ASET_DB`, `SIMAPO_NIP`.

**Keluar:** `node --check scripts/import-aset-bapperida.mjs` lolos.

### Task 2.2 — Wallet test logika mapping (satu `assert` self-check)
Tambahkan fungsi `buildPayload(rows, maps)` murni + blok `if (import.meta.url === ...)` kecil
(self-check ala ponytail, tanpa framework): casus pair `aset->unit_aset` menghasilkan qrcode-nya,
NIP ternormalisasi ketemu di map, kategori fallback ke `Aset Tetap`.

**Keluar:** jalankan `node scripts/import-aset-bapperida.mjs --limit=3 --dry-run` → ringkasan benar.

### Task 2.3 — Dry-run melawan DB (tanpa menulis)
`node scripts/import-aset-bapperida.mjs --dry-run` (jumlah penuh). Verifikasi RINGKASAN yang
dicetak HARUS sesuai data aset.db (sematkan juga cek via `SELECT count(*)` di postgres-mcp read-only
untuk nilai saat ini — SELALU BAST-check dulu dengan angka dari data nyata).

**Keluar:** ringkasan dry-run sesuai harapan, tanpa error dan tanpa satupun POST tulis.

---

## Fase 3 — Upaya produksi + konfirmasi

### Task 3.1 — Konfirmasi & backup sebelum eksekusi
- Tanya user: (a) bersedia aset/ruangan Bapperida direplace di prod; (b) riwayat BAST yang
  menunjuk unit lama — dibiarkan atau disnapshot? (menunggu jawaban, lalu lanjut).
- Pakai postgres-mcp (baca-saja) untuk snapshot hitung-baris (aset_saat_ini, ruangan, pegawai,
  kategori) → catat sebagai baseline pra-impor.

**Keluar:** user menjawab + baseline tercatat.

### Task 3.2 — Impor penuh (setelah approval)
`$env:SIMAPO_NIP='<NIP admin>'; node scripts/import-aset-bapperida.mjs` di `D:\Code\absensi_refactored_v6`.
Catat `data` respons (`{pegawai_dilewati, ruangan, kategori, barang_baru, unit_baru}`).

**Keluar:** summary sesuai baseline/ekspektasi.

### Task 3.3 — Verifikasi post-impor
1. `SELECT count(*), count(qrcode) FILTER (WHERE qrcode LIKE '%?qr=SIMAPO-%'), count(DISTINCT pegawai_id), count(DISTINCT ruangan_id) FROM "SIMAPO".unit_aset ...` → semua aset punya QR, ruangan+megang terisi (pegawai sesuai yang NIP-nya ada di user_list).
2. `user_list` tak tersentuh: jumlah baris sebelum = sesudah (route tak pernah INSERT ke user_list).
3. Scan smoke: buka `https://absensi.mindcloud.my.id/?qr=SIMAPO-<id sampel>` → katalog menampilkan unit.

**Keluar:** ketiga poin hijau. Jika tidak → rollback tidak ada (transaksi penuh) → laporkan ke user.

---

## Checkpoint

- **C1 (akhir Fase 1):** route berfungsi + test hijau, tanpa deploy.
- **C2 (akhir Fase 2):** dry-run tanpa tulis, ringkasan akurat.
- **C3 (sebelum Fase 3):** approval DESTRUKTIF dari user (kesepakatan di Fase 3.1).

## Git & deploy

- Commit terpisah per fase: `feat(simapo): route import-bapperida + qrcode`, `feat(scripts): import data aset bapperida`. Pesan commit TANPA `>` / `"`. Push `git push origin master:main` (dengan `GIT_TERMINAL_PROMPT=0`).
- Redeploy di Coolify setelah Fase 1 (route perlu live untuk script prod).
- Monitoring: `server` log tidak meledak; ulangi impor idempoten (guard confirm di query berarti
  boleh diulang — `aset-kosongkan`-semantik menghapus dulu).