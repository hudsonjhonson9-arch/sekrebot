# Desain: Import Data Aset + Menu Arsip (iframe peta-ekonomi) + Tema Mengikuti Arsip

Tanggal: 2026-10-10
Status: Disetujui user (semua 3 workstream, via tanya-jawab brainstorming)

Produk: `D:\Code\absensi_refactored_v6` (SIMAPO/absensi, deploy Coolify, prod
`https://absensi.mindcloud.my.id`). Sumber data: `D:\Code\aset-bapperida`
(Flask + SQLite `data\aset.db`). Arsip: `D:\Code\peta-ekonomi`
(React/Express, prod `https://arsipdigital.mindcloud.my.id`).

---

## Ringkasan

Tiga workstream terpisah, satu doc:

1. **WS1 — Import aset** : ganti seluruh data aset SIMAPO dengan data
   aset-bapperida (277 aset, 47 pegawai, 14 ruangan), lengkap dengan QR.
2. **WS2 — Menu Arsip** : menu "Arsip" (admin) di aplikasi absensi yang
   menampilkan arsip (`arsipdigital.mindcloud.my.id`) di dalam iframe; login
   absensi cukup, tanpa login ulang di arsip.
3. **WS3 — Tema** : seluruh tema absensi mengikuti tema arsip (palet + font),
   layout absensi tidak berubah.

---

## WS1 — Import Data Aset

### Tujuan
Data aset SIMAPO di produksi diganti menjadi 277 aset dari aset-bapperida,
setiap aset punya QR sehingga bisa discan. Ruangan diganti (14). Pegawai
digabungkan (upsert) ke `public.user_list` per NIP — akun login yang sudah ada
tidak dihapus dan password/role-nya tidak disentuh.

### Sumber → target

SQLite `aset-bapperida/data/aset.db`:

- `aset` (277 baris): nama, kategori, kode_barang, merk_type, model_jenis,
  warna, tahun_pembuatan, tahun_pembelian, harga, no_rangka, no_mesin,
  no_polisi, roda, kondisi, keterangan, no_register, bahan, asal_usul,
  masa_manfaat, ukuran, kib, sumber, pegawai_id, ruangan_id.
- `ruangan` (14): kode, nama, keterangan.
- `pegawai` (47): nama, nip, jabatan, alamat (default 'Waikabubak').

Target Postgres schema `SIMAPO` (berdasar `server/simapo-native-extra.js`):

| Mapping | Keterangan |
|---|---|
| `aset` → `"SIMAPO".barang` | kodebarang=kode_barang, nama, jenisbarang='Aset Tetap', satuan='Unit', hargasatuan=harga, kategoriid dari `"SIMAPO".kategori_barang` (lookup/buat per kategori/KIB), stok_saat_ini=1, minimumstok=0, isactive=true, instansi_id='bapperida' |
| `aset` → `"SIMAPO".unit_aset` | nomorinventaris=no_register (fallback `<kode>-<seq>`), kondisi, statuspinjam=false, tahunperolehan=tahun_pembelian, nilaiperolehan=harga, pegawai_id=NIP pegawai terpetakan, ruangan_id=uuid ruangan terpetakan, no_polisi/no_rangka/no_mesin/roda/merk_type/model_jenis/warna/tahun_pembuatan, **qrcode** = `https://absensi.mindcloud.my.id/?qr=SIMAPO-<unit_id>` (sesuai format `js/simapo-ext.js` `generateQRCode`; scan → `/unit-by-qr` cocok via `REPLACE(...,'SIMAPO-','')`) |
| `ruangan` → `"SIMAPO".ruangan` | kode, nama, keterangan, instansi_id; **ganti semua** (hapus lalu insert) |
| `pegawai` → `public.user_list` | upsert per `"NIP"`: username=nama, "Jabatan"=jabatan, instansi_id; baris yang NIP-nya sudah ada **tidak** diubah password/role; hanya tambah yang belum ada (tanpa password → tidak bisa login, cukup jadi pemegang/P1) |
| `kategori` + `kib` → `"SIMAPO".kategori_barang` | lookup nama; buat bila belum ada (upsert `ON CONFLICT`) |

Pegawai di `aset-bapperida` tanpa NIP: dilewati, asetnya tetap dimasukkan
dengan `pegawai_id` null.

### Urutan eksekusi (transaksi tunggal, penggantian idempoten)

1. Hapus `"SIMAPO".ruangan` untuk instansi (kode/nama bapperida).
2. Hapus riwayat turunan: `riwayat_pemeliharaan` + `unit_aset` + `barang`
   untuk instansi (reuse logika `POST /api/simapo/aset-kosongkan`).
3. Insert `kategori_barang` baru (bila ada kategori baru).
4. Import 14 ruangan, upsert 47 pegawai.
5. Insert 277 `barang` + 277 `unit_aset` (dengan `qrcode` terbentuk dari
   `unit_aset.id` yang baru). Pegawai/ruangan dirujuk sesuai pemetaan.
6. Laporkan ringkasan: jumlah barang, unit, ruangan, pegawai ditambah, pegawai
   yang sudah ada, aset yang di-skip (tanpa data esensial).

Riwayat BAST (`"SIMAPO".bast`) menyimpan `daftar_aset` sebagai snapshot JSON —
tidak dihapus, tidak patah oleh penggantian aset.

### Komponen

- `scripts/import-aset-bapperida.mjs` (baru): baca SQLite via driver sqlite
  (gunakan `node:sqlite` bila Node di server mendukungnya, fallback
  `better-sqlite3` devDep bila perlu — cek dulu; paling ideal: baca via
  `SELECT * FROM aset/pegawai/ruangan`). Petakan → `POST /api/simapo/import-bapperida`.
- `server/simapo-native-extra.js`: route baru
  `POST /api/simapo/import-bapperida` (admin-only):
  - body `{ confirm:'IMPORT', instansi_id, rows: { barang:[...], ruangan:[...], pegawai:[...] } }` (JSON dari script).
  - logika + urutan di atas dalam satu `withTransaction`.
  - script lokal hanya mengirim; seluruh tulis DB lewat route app (sesuai
    AGENTS.md: tulis lewat endpoint aplikasi, bukan SQL langsung).

### Error handling
- Validasi: `confirm !== 'IMPORT'` → 400; daftar kosong → 400.
- Rollback penuh bila salah satu step gagal (`withTransaction`).
- Baris dengan kode_barang/nama kosong di-skip dan dihitung.
- Batas ukuran body: 277 baris berisi teks; naikkan `express.json({limit})`
  bila perlu untuk route ini.

### Testing (WS1)
- `node --check` kedua file.
- Unit test route menggunakan harness query-stub (pola `simapo-native-extra.test.js`): panggil route dengan payload contoh; assert urutan SQL (kosongkan → ruangan → pegawai upsert → barang/unit + qrcode) dan format `qrcode`.
- Smoke: jalankan `import-aset-bapperida.mjs` di lingkungan dev/dummy bila ada; untuk prod, eksekusi hanya setelah konfirmasi (aksi destruktif).

---

## WS2 — Menu Arsip (iframe) + SSO cookie

### Tujuan
Pengguna yang sudah login di absensi (web atau Telegram WebApp) dengan role
admin dapat membuka menu "Arsip" dan melihat aplikasi arsip di dalam iframe
tanpa login lagi di arsip.

### Mengapa SSO ini memungkinkan
- Sesuatu `arsip` (`peta-ekonomi/server/session.js`): cookie `arsip_session`,
  token `<b64url({sub:NIP, exp})>.<hmac-sha256(isi, SESSION_SECRET)>`, role
  dibaca dari DB (`user_list`) per request — token hanya perlu `sub` + `exp`
  yang sah.
- `absensi.mindcloud.my.id` dan `arsipdigital.mindcloud.my.id` satu
  **registrable domain** (`mindcloud.my.id`) + keduanya HTTPS → **same-site**;
  `Set-Cookie` dengan `Domain=.mindcloud.my.id` dan `SameSite=Lax` dikirim ke
  iframe arsip oleh browser.
- DB sama (`n8n_storage`, `public.user_list`), NIP sama.

### Mekanisme
Server absensi (Express):

1. **Login**: pada `POST /api/auth/login` yang sukses (`server/auth-session.js:67`),
   selain menanggapi JSON token, set cookie:
   `Set-Cookie: arsip_session=<token>; Domain=.mindcloud.my.id; Path=/; HttpOnly; SameSite=Lax; Secure (ikut req.secure); Max-Age=8h`
   dengan `<token>` = format arsip `{sub: NIP, exp: now+8h}` + tag HMAC memakai
   `ARSIP_SESSION_SECRET` (nilai = `SESSION_SECRET` peta-ekonomi, disimpan
   sebagai env baru di Coolify absensi). Implementasi satu util kecil
   (`server/arsip-sso.js`) meniru `session.js` (`buatToken` + HMAC + b64url).
2. **Logout**: pada route logout absensi, `clearCookie('arsip_session', {Domain, Path})`.
3. **Route absensi saat ini tidak berubah**; `arsip_session` hanya cookie
   sampingan untuk iframe.

Client absensi:

4. Tambah item menu "Arsip" (role admin) pada config menu absensi →
   halaman berisi header + `<iframe src="ARCHIVE_URL" ...>` full-height.
   - `ARCHIVE_URL` default `https://arsipdigital.mindcloud.my.id`, dari
     `js/config.js` (bisa dioverride env client).
   - Height: `calc(100vh - <header/bottomnav>)`; highlight aktif menu.
5. Tanpa perubahan kode di `peta-ekonomi` (token diverifikasi oleh `session.js`
   yang sudah ada).

### Konfigurasi baru
- Env Coolify absensi: `ARSIP_SESSION_SECRET` (= `SESSION_SECRET` repo `peta-ekonomi`).
- `js/config.js`: `ARCHIVE_URL`.
- Instruksi jelas bahwa `ARSIP_SESSION_SECRET` wajib ≥16 char (syarat `session.js`)
  dan TIDAK boleh sama dengan `UPLOAD_API_KEY` arsip (periksa `periksaPemisahanSecret`).

### Keamanan
- Cookie `arsip_session` hanya dikeluarkan saat login absensi berhasil (pengguna
  sudah punya NIP/role sah). Tidak pernah untuk anonim.
- Tidak ada token arsip baru di localStorage; seluruhnya HttpOnly cookie.
- Jika `SESSION_SECRET` arsip dirotasi, sesi arsip via menu kedaluwarsa (wajar).
- Atribut `sandbox` pada iframe tidak dipakai agar arsip berfungsi penuh;
  pertimbangan dipindah ke catatan risiko.

### Testing (WS2)
- Unit: untik `arsip-sso.js` (buat token → verifikasi arsip `session.js` dapat
  menerima — test imitasi `verifikasiToken` dengan secret sama).
- Unit auth-session: login sukses mengirim `Set-Cookie: arsip_session`;
  logout menghapusnya.
- Smoke prod: login absensi → buka menu Arsip → iframe tampil tanpa layar login.

---

## WS3 — Tema absensi mengikuti tema arsip

### Tujuan
Warna & tipografi absensi di kedua mode (dark base + `html.light-theme`) menyamai
tema `peta-ekonomi` (`src/theme.js`). Layout absensi (bottom-nav, kartu, dll.)
tidak diubah — hanya warna/font.

### Patch palet (dari `peta-ekonomi/src/theme.js`)

| Token absensi (`css/styles.css`) | Nilai dark (arsip DARK) | Nilai light (arsip LIGHT) |
|---|---|---|
| `--navy` (bg) | `#0F172A` | `#F8FAFC` |
| `--gold` (primary) | `#3B82F6` | `#2563EB` |
| `--gold-dim` | `rgba(59,130,246,.15)` | `rgba(37,99,235,.15)` |
| `--on-gold` | `#F1F5F9` | `#0F172A` |
| `--white` (text) | `#F1F5F9` | `#0F172A` |
| `--muted` | `#94A3B8` | `#64748B` |
| `--card-bg` | `rgba(30,41,59,.85)` | `#FFFFFF` |
| `--border` | `#334155` | `#E2E8F0` |
| `--success` | `#34D399` | `#059669` |
| `--danger` | `#F87171` | `#DC2626` |
| `--warning` | `#FBBF24` | `#D97706` |
| `--admin` | `#A78BFA` (biarkan, aksen) | `#A78BFA` |

Lihat juga bandingkan nilai `:root` saat implementasi (line ~2–17) dan blok
`html.light-theme` (line ~6156+).

### Sweep literal hardcoded (`css/styles.css`)
Pemetaan programatik old→new (sekali jalan, bukan edit 1-per-1):

- `rgba(201,168,76,A)` → `rgba(37,99,235,A)` (emas → biru primary; alpha dipertahankan).
- `rgba(201,168,76,.15)` varian → iso.
- `#c9a84c` → `#2563EB` (ako in light context; evaluasi per-kontek bila perlu).
- `#d4af37` → `#2563EB`.
- `#0a1628` → `#0F172A`, `#f0f4ff` → `#F1F5F9` (text) — hati-hati: `--white`
  dipakai background di tempat (mis. kartu putih) → ikuti konteks/var.
- `rgba(10,22,40,A)`/`rgba(10, 22, 40, A)` → slate dark `rgba(15,23,42,A)`.
- `#7a90b8` → `#94A3B8`.
- Blok `html.light-theme` (183 aturan): nilai utamanya disamakan ke LIGHT arsip.

Koreksi kecil pasca-sweep: kartu/input/panel yang tadinya semi-transparan
`rgba(…, .85)` dicek kontras di light (arsip pakai `#FFFFFF` solid).

### Font
- `font-family` utama: `'Lexend', 'Source Sans 3', system-ui, sans-serif`
  (sama arsip). Mono tetap `'JetBrains Mono'`.
- Update `<link href="https://fonts.googleapis.com/...">` di `index.html`:
  ganti/Plus Jakarta Sans → Lexend + Source Sans 3 (+ pertahankan JetBrains Mono).
- Evaluasi `letter-spacing`/ukuran tetap (arsip pakai Lexend, kerning sedikit
  beda) — cukup verifikasi visual, tanpa perubahan radius/layout.

### File tersinkron
- Sumber: `css/styles.css`. Salinan yang WAJIB ikut diubah:
  `www/css/styles.css` (untuk build/Telegram) dan
  `android/app/src/main/assets/public/css/styles.css`.
  (`css/styles 1.css`, `www/.../styles 1.css` = sisa lama, diabaikan.)
- Bump `index.html` `css/styles.css?v=9` → `?v=10`.
- `css/lib/runeicons.css` + `icons/*`: tidak berubah (warna `currentColor`).
- Jangan sentuh `css/styles 1.css`, `www/css/styles 1.css`.

### Testing (WS3)
- `node --check` tidak relevan; pakai verifikasi bahwa tidak ada literal emas
  tersisa (`rgba(201,168,76`, `#c9a84c`, `#d4af37`) di `styles.css` hasil.
- Perintah verifikasi: hitung kemunculan peta lama = 0 (sebelumnya ~100).
- Pixel smoke: reload prod + hard refresh; cek navbar/kartu/ikon berwarna biru
  arsip di dark & light, font Lexend.

---

## Non-goals
- Tidak mengubah layout absensi (bottom-nav) menjadi sidebar arsip.
- Tidak mengubah kode `peta-ekonomi` untuk WS2 (SSO via cookie saja).
- Tidak menambah UI "impor massal" baru di SIMAPO (import sekali jalan via script).
- Tidak menghapus akun login / riwayat yang sudah ada.

## Urutan rollout (tiga deploy terpisah)
1. **WS3** (tema) — perubahan statis + bump `?v`; tidak berisiko data.
2. **WS2** (menu Arsip + SSO cookie) — butuh env `ARSIP_SESSION_SECRET` di
   Coolify absensi sebelum deploy; tanpa env, login absensi tetap jalan,
   hanya cookie arsip tidak terpasang (fail-open yang aman: iframe tetap
   menampilkan layar login arsip).
3. **WS1** (import data) — eksekusi setelah dua deploy aman; destruktif,
   butuh konfirmasi `IMPORT` + backup.

## Asumsi / hal yang diverifikasi saat implementasi
- NIP pegawai aset-bapperida yang cocok dengan `user_list` → tidak diubah
  password-nya (hanya nama/jabatan bila kosong).
- Pegawai tanpa NIP di aset-bapperida di-skip (aset tetap masuk).
- `qrcode` memakai host `https://absensi.mindcloud.my.id` (bisa dioverride bila
  domain prod berubah).
- `infra server bug`: anggap `express.json` limit cukup atau dinaikkan per
  route import.