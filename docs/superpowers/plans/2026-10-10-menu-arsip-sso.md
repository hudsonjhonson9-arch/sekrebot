# Plan: Menu Arsip (iframe) + SSO cookie (WS2)

> Spec: `docs/superpowers/specs/2026-10-10-import-aset-arsip-menu-tema-design.md` — section **WS2 — Menu Arsip (iframe) + SSO cookie**.
> Repo absensi: `D:\Code\absensi_refactored_v6`. Arsip (peta-ekonomi): `D:\Code\peta-ekonomi`, target `https://arsipdigital.mindcloud.my.id`.
> **Tidak ada** perubahan kode di peta-ekonomi.

## Mengapa

User admin yang sudah login di absensi (web atau Telegram WebApp) bisa membuka menu "Arsip" dan
melihat aplikasi arsip di iframe **tanpa login ulang**. Karena `absensi.mindcloud.my.id` dan
`arsipdigital.mindcloud.my.id` satu registrable domain (`mindcloud.my.id`) dan keduanya HTTPS,
cookie ber-atribut `Domain=.mindcloud.my.id` dikirim browser ke iframe arsip → arsip memverifikasi
token-nya sendiri dengan `peta-ekonomi/server/session.js` yang sudah ada.

## Bagaimana

- Server absensi meng-*issue* cookie `arsip_session` **hanya** saat login absensi sukses, memakai
  format token arsip (`peta-ekonomi/server/session.js`): `b64url(JSON {sub, exp}).<hmac-sha256>`.
- Rahasianya dari env baru Coolify absensi `ARSIP_SESSION_SECRET` = `SESSION_SECRET` peta-ekonomi.
  Jika env kosong → jangan set cookie (fail-open; iframe sekedar menampilkan layar login arsip).
- Klien: tambah tab "Arsip" (role admin) dengan `<iframe>`; `ARCHIVE_URL` di `js/config.js`.

## Prasyarat

- Nilai `SESSION_SECRET` peta-ekonomi dari Coolify (user menyediakan). Wajib ≥16 char
  (`session.js`) dan TIDAK boleh sama dengan `UPLOAD_API_KEY` (`periksaPemisahanSecret`).
- Memahami titik integrasi (sudah digrounding):
  - `server/auth-session.js` — `createAuthSessionRouter({ query })`; login web `POST /api/auth/login`
    (:67) dan sesi Telegram `POST /api/auth/session`; ada route logout. Router di-mount TANPA
    requireRole di `server/index.js:50`.
  - `js/ui.js` — `getAllTabs()` (:178), `switchTab()` (:200), `applyAdminVisibility()` (:134, toggle `.admin-only`).
  - `index.html` — nav desktop (`switchTab('simapo', true)`, `.nav-item.desktop-only`), `moreMenuOverlay` (mobile), panel `<div class="panel" id="panel-<tab>">`.

---

## Fase 1 — Server: util token + cookie (TDD)

### Task 1.1 — Port util `server/arsip-sso.js`
Baca verbatim `D:\Code\peta-ekonomi\server\session.js` (`buatToken`, HMAC, b64url, `lepasCookie`,
nama cookie, masa jam) lalu port fungsi murni ke `server/arsip-sso.js`:
- `buatTokenArsip(nip, secret, { jam = 8 } = {})` → string persis format arsip.
- `pasangArsipCookie(res, nip, { secret, origin, ttlMs })` → `res.cookie('arsip_session', token,
  { httpOnly:true, sameSite:'lax', secure:true, domain:'.mindcloud.my.id', path:'/', maxAge })`.
  `secure:true` karena absensi selalu HTTPS di prod; `origin` (host request) tidak dipakai untuk domain (domain tetap `.mindcloud.my.id`) — simpan paramnya nanti bila perlu.
- `lepasArsipCookie(res)` → `res.clearCookie('arsip_session', { domain:'.mindcloud.my.id', path:'/' })`.
- `bersihkanSecret(s)` → trim; kembalikan '' bila < 16 (guard fail-open).
Catatan: **jangan** import dari peta-ekonomi (beda repo/deploy) — salin formulanya, dan test
memastikan hasil berpadan.

**Keluar:** `node --check server/arsip-sso.js`.

### Task 1.2 — Test util (`server/arsip-sso.test.js`)
- `buatTokenArsip('123', 'secret-16-chars-ok')` → regex `^[A-Za-z0-9_-]+\.[0-9a-f]{64}$`
  (konfirmasi dulu di `session.js`: hex 64 char atau b64url; sesuaikan regex).
- Decode bagian payload → `{ sub:'123', exp:<angka> }`.
- Replika kecil `verifikasiToken` (salin formula verify dari `session.js`) menerima token yang
  dibuat (dengan secret sama) dan menolaknya saat secret salah.

**Keluar:** `npm test -- server/arsip-sso.test.js` hijau.

### Task 1.3 — Hook ke auth-session (TDD)
Ubah `createAuthSessionRouter({ query })` → `createAuthSessionRouter({ query, arsipSso })` dengan
`arsipSso` opsional (object `{ pasangArsipCookie, lepasArsipCookie }`, default = no-op) supaya
test lama tetap jalan. Di dalam:
- Setelah login web sukses (tepat sebelum respons JSON terkirim) — panggil `arsipSso.pasangArsipCookie(res, user.nip, ...)` hanya bila `process.env.ARSIP_SESSION_SECRET` valid.
- Di route sesi Telegram sukses — sama.
- Di route logout — panggil `arsipSso.lepasArsipCookie(res)`.
Tambahkan test di `server/auth-session.test.js` (harness `drive(r,'POST',...)` yang ada):
- injeksi stub `arsipSso` yang merekam argumen → login sukses memanggilnya dengan NIP benar; logout memanggil `lepasArsipCookie`.
- injeksi util ASLI dengan secret dummy → respons punya header `set-cookie` mengandung
  `arsip_session=` dan `Domain=.mindcloud.my.id` dan `HttpOnly`; respons logout menghapusnya
  (`Max-Age=0`).

**Keluar:** `npm test -- server/auth-session.test.js server/arsip-sso.test.js` hijau.

### Task 1.4 — Wiring index.js
`server/index.js:50`: `createAuthSessionRouter({ query, arsipSso })` dengan
`arsipSso = { pasangArsipCookie, lepasArsipCookie }` dari `server/arsip-sso.js`, membaca
`process.env.ARSIP_SESSION_SECRET` sekali (warn bila kosong / <16 char, sekaligus tidak set cookie).

**Keluar:** `npm test` (seluruh) hijau; `node --check server/index.js`.

---

## Fase 2 — Klien: tab Arsip + iframe

### Task 2.1 — Konfigurasi URL
Di `js/config.js` tambah `const ARCHIVE_URL = 'https://arsipdigital.mindcloud.my.id';` dan
ekspos via `AppConfig` (ikuti pola const lain di file itu).

**Keluar:** grep `ARCHIVE_URL` muncul di config + satu tempat pemakaian.

### Task 2.2 — Nav + panel (index.html & www/index.html)
Di `index.html` (dan salinan `www/index.html`, `android/app/src/main/assets/public/index.html`):
1. Nav desktop — sisipkan setelah tombol `#nav-admin-desk`:
   `<button class="nav-item desktop-only admin-only" id="nav-arsip-desk" data-tab="arsip" onclick="switchTab('arsip', true)"><i class="fas fa-archive"></i><span>Arsip</span></button>`
2. `moreMenuOverlay` (mobile) — tambah `<button class="more-item admin-only" id="more-arsip" data-tab="arsip" onclick="switchTab('arsip', true)"><i class="fas fa-archive"></i><span>Arsip</span></button>`
3. Panel — tambah `<div class="panel" id="panel-arsip"><iframe id="arsipFrame" class="arsip-frame" title="Arsip" loading="lazy"></iframe></div>`
   (biarkan `src` kosong; diisi JS supaya URL dari config + tidak memuat sebelum tab dibuka).
`.admin-only` sudah otomatis di-toggle `applyAdminVisibility()` — tidak perlu kode visibilitas baru.

**Keluar:** elemen ada di ketiga index.html; `?v=` belum diubah di task ini.

### Task 2.3 — switchTab + lazy load (js/ui.js)
1. `getAllTabs()`: `tabs.push('arsip')` (selalu terdaftar; visibilitas lewat `.admin-only`, sama pola `simapo`).
2. Di `switchTab`, tambah blok:
   `if (tab === 'arsip') { const f = $('arsipFrame'); if (f && !f.src) f.src = (window.AppConfig?.ARCHIVE_URL) || 'https://arsipdigital.mindcloud.my.id'; }`

**Keluar:** buka tab Arsip → iframe mengisi `src` sekali.

### Task 2.4 — CSS iframe (3 salinan styles.css)
Tambah di `css/styles.css` (dan `www/css/styles.css`, `android/app/src/main/assets/public/css/styles.css`):
```
.arsip-frame { width:100%; height: calc(100vh - 128px); border:0; background: var(--navy); }
@media (min-width:768px){ .arsip-frame { height: 100vh; } }
```
(angka 128px = tinggi header+bottomnav mobile; verifikasi visual, sesuaikan bila perlu).

**Keluar:** iframe memberi tinggi penuh tanpa scroll luar.

---

## Fase 3 — Verifikasi & deploy

### Task 3.1 — Cek framing lintas-origin
`curl -sI https://arsipdigital.mindcloud.my.id | Select-String -Pattern "x-frame-options|content-security-policy"`
- Jika TIDAK ada `X-Frame-Options: DENY` / CSP `frame-ancestors` yang melarang → iframe aman
  (Express default tidak set). Jika ADA → lapor user; jangan paksa (di luar scope WS2).

**Keluar:** keputusan jelas boleh/tidak; bila tidak, hentikan dan tanyakan.

### Task 3.2 — Smoke lokal
`npm run dev` (atau server lokal) → login admin → buka tab Arsip.
- Header `set-cookie` untuk `arsip_session` ada saat login (periksa devtools → Application → Cookies).
- Iframe memuat; bila arsip menampilkan login (secret belum diset lokal) → wajar di lokal.
- Non-admin: tombol Arsip TIDAK muncul (applyAdminVisibility).

**Keluar:** kedua poin sesuai harapan.

### Task 3.3 — Deploy + env
1. Set env Coolify absensi `ARSIP_SESSION_SECRET` = `SESSION_SECRET` peta-ekonomi (minta user).
2. Commit & push `git push origin master:main` (pesan tanpa `>`/`"`), redeploy.
3. Smoke prod: login absensi admin → menu Arsip → iframe tampil TANPA layar login arsip.
   Cek cookie `arsip_session` ter-set untuk domain `.mindcloud.my.id` (devtools).
   Sebagai pembanding token: dari server, `node -e` (via file, bukan inline) bisa
   memverifikasi token pakai `session.js` arsip — cukup bila ragu.

**Keluar:** smoke prod hijau. Bila iframe menampilkan login → periksa: secret sama? ≥16 char?
`Domain` benar? cookie HttpOnly tidak bocor?

---

## Rollback

Hapus `ARSIP_SESSION_SECRET` di Coolify → cookie tidak lagi di-issue (fail-open). Kode tab Arsip
tidak berbahaya sendirian (iframe arsip tampil layar login sendiri). Commit terpisah per fase
memudahkan revert.

## Checkpoint

- **C1 (akhir Fase 1):** cookie ter-issue & terhapus, test hijau, belum deploy.
- **C2 (akhir Fase 2):** tab Arsip tampil untuk admin, iframe load, non-admin tak melihat.
- **C3 (sebelum 3.3):** env `ARSIP_SESSION_SECRET` tersedia; cek framing (3.1) lulus.