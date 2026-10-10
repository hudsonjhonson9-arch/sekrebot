# Desain: Gabung Arsip ke Absensi (proxy `/arsip/`, tanpa login arsip)

Tanggal: 2026-10-10
Status: Disetujui user (pendekatan **A** = proxy nginx, via tanya-jawab brainstorming)

Produk:
- **Absensi** `D:\Code\absensi_refactored_v6` (deploy Coolify, prod
  `https://absensi.mindcloud.my.id`, 1 container nginx + Express).
- **Arsip** `D:\Code\peta-ekonomi` (React + Vite SPA + Express, prod
  `https://arsipdigital.mindcloud.my.id`, repo `hudsonjhonson9-arch/peta-ekonomi.git`).

Bergantung pada WS2 (SSO cookie `arsip_session`) & WS3 (tema) yang **sudah
selesai** — lihat `2026-10-10-import-aset-arsip-menu-tema-design.md`.

---

## Ringkasan

Menu "Arsip" di absensi berhenti memakai **iframe** ke subdomain arsip. Sebagai
gantinya absensi (nginx) **mem-proxy** `/arsip/` ke aplikasi arsip, sehingga
arsip tampil di **satu URL** (`https://absensi.mindcloud.my.id/arsip/`) dengan
sesi absensi yang sudah ada — **tanpa layar login arsip**. Aplikasi arsip
digunakan apa adanya (reuse penuh); hanya tiga perubahan kecil di sisi arsip
(`base` Vite, prefix API, buang layar login).

---

## Latar & fakta terverifikasi

- **DB sama**: arsip & absensi memakai PostgreSQL `n8n_storage` (host
  `43.133.142.177` / `mindcloud.my.id`, user `n8n_admin`). Tabel arsip
  (`bapperida_dokumen`, `user_credentials`, `audit_logs`, dll.) sudah ada.
- **Auth arsip** (`peta-ekonomi/server/index.js:115-143`) memuat user dari
  `user_credentials c LEFT JOIN user_list u ON u."NIP"=c.nip` per `sub`.
  Cek DB prod: `user_list`=47, `user_credentials`=47, overlap NIP=**46**; role
  arsip: Staf 32 / Reviewer 8 / Admin 7. → gate arsip **sudah** mengizinkan 46
  user tanpa penyemaian apa pun. 1 user tanpa baris credential → user arsip
  (follow-up).
- **Routing arsip** = **hash-based** (`#page`, `#dokumen/<id>`, `#/publik?`;
  `src/App.jsx:114,123,126,282-337`) → prefix path tidak mengganggu navigasi.
  Ada SPA fallback (`server/index.js:3838`, prod-only).
- **Panggilan API arsip** semuanya absolut `/api/...` (`src/hooks.js:3`,
  `BankData.jsx`, `DocPages.jsx`, `Pages.jsx`, `App.jsx`, `LoginPage.jsx`,
  `PublicShare.jsx`, dll.) → satu pembungkus `window.fetch` cukup; tak perlu
  ubah ~40 call-site.
- **Absensi = 1 container**: nginx `:80` (statis + proxy `/api/` →
  `127.0.0.1:8081`) + Express via `docker/supervisord.conf`.
- **Tombol nav Arsip** sekarang: `#nav-arsip-desk` (`index.html:367`) &
  `#more-arsip` (`:406`), keduanya `class="... admin-only"
  onclick="switchTab('arsip',true)"`. Panel iframe `#panel-arsip`
  (`:415-417`). Logika tab di `js/ui.js:184` (`tabs.push('arsip')`) &
  `:301-308` (lazy-load `#arsipFrame`). `ARCHIVE_URL` di `js/config.js:132`.

---

## Keputusan desain

1. **Upstream proxy = host publik arsip** `https://arsipdigital.mindcloud.my.id/`
   (bukan container-internal) → tidak butuh pengaturan Docker-network Coolify.
   Hairpin lewat Traefik; dapat diterima.
2. **Menu Arsip tampil untuk semua user yang login** (bukan admin-only lagi);
   otorisasi per-route tetap ditegakkan gate arsip (Staf/Reviewer/Admin).
3. Prefix di-strip oleh nginx (`proxy_pass .../`): arsip tetap disajikan di
   **root container-nya**; hanya `base` Vite yang berubah.
4. **Login arsip dihapus dari alur** — sesi datang dari cookie `arsip_session`
   yang diterbitkan login absensi (WS2).

---

## Perubahan repo arsip (`D:\Code\peta-ekonomi`)

### 1. `vite.config.js` — `base: '/arsip/'`
```js
export default defineConfig({
  base: '/arsip/',          // tambahan
  plugins: [react()],
  server: { /* proxy dev tetap */ },
})
```
Efek: `dist/index.html` merujuk `/arsip/assets/*`. Karena nginx men-strip
`/arsip`, request `.../arsip/assets/x.js` → upstream `/assets/x.js` → dilayani
Express statis root dengan benar.

### 2. `src/main.jsx` — prefix API sekali (pembungkus `window.fetch`)
```js
// Arsip disajikan di bawah /arsip/ oleh nginx absensi; semua panggilan API
// memakai path absolut '/api/...'. Prefix di sini sekali, bukan di 40 call-site.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // '/arsip'
if (BASE) {
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    _fetch(typeof input === 'string' && input.startsWith('/api/') ? BASE + input : input, init);
}
```
Hanya string yang mulai `/api/` yang diubah → URL absolut/blob/`http` aman.

### 3. `src/App.jsx:951-953` — buang layar login
```jsx
if (!user) {
  if (cekSesi) return null;
  // Login arsip dihapus: sesi berasal dari aplikasi absensi (cookie arsip_session).
  window.location.replace('/');   // ke root absensi
  return null;
}
```
`publicParams` (`:940`) diproses lebih dulu → **halaman share publik tidak
terpengaruh**. `LoginPage.jsx` dibiarkan tak terpakai (tidak dihapus).

---

## Perubahan repo absensi (`D:\Code\absensi_refactored_v6`)

### 1. `nginx.conf` — blok proxy `/arsip/`
Sisipkan **sebelum** blok statis:
```nginx
# Arsip (peta-ekonomi) disajikan di /arsip/. ^~ wajib: tanpa itu rule regex
# statis di bawah (\.(?:js|css|...)$) akan menyambar /arsip/assets/*.
location = /arsip { return 301 /arsip/; }
location ^~ /arsip/ {
  proxy_pass https://arsipdigital.mindcloud.my.id/;   # slash akhir = strip /arsip
  proxy_ssl_server_name on;
  proxy_set_header Host              arsipdigital.mindcloud.my.id;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 120s;
  client_max_body_size 50m;        # dokumen arsip
}
```
Cookie `arsip_session` (diteruskan nginx apa adanya) masuk ke upstream; arsip
`trust proxy` → `req.secure` benar dari `X-Forwarded-Proto`.

### 2. `index.html` + `www/index.html`
- `#nav-arsip-desk` (`:367`) & `#more-arsip` (`:406`): hapus kelas
  `admin-only`, ubah `onclick` → `location.href='/arsip/'`.
- Hapus panel iframe `#panel-arsip` (`:415-417`).

### 3. `js/ui.js` + `www/js/ui.js`
- Hapus `tabs.push('arsip')` (`:184`). **Penting**: bila `absen_last_tab`
  bernilai `'arsip'` dari sesi lama sementara panel sudah dihapus, tanpa ini
  `switchTab` memilih tab tanpa panel → layar kosong. Tanpa `'arsip'` di
  `getAllTabs`, nilainya jatuh ke fallback `'absen'`.
- Hapus blok lazy-load iframe `if (tab === 'arsip') { … }` (`:301-308`).

### 4. `js/config.js` + `www/js/config.js`
- Hapus `ARCHIVE_URL` (`:132-133`) — tak ada pemakai lagi setelah iframe hilang.
  (Opsional; boleh dibiarkan.)

### 5. Env Coolify absensi
- `ARSIP_SESSION_SECRET` = `SESSION_SECRET` arsip (≥16 char, ≠ `UPLOAD_API_KEY`).
  Tanpa ini, cookie arsip tidak terbentuk → arsip menampilkan redirect ke login
  absensi (fail-aman). Sudah dibutuhkan WS2.

---

## Alur auth (end-to-end)

1. User login absensi (web/Telegram) → `POST /api/auth/login` sukses →
   `server/arsip-sso.js` set `arsip_session` (`Domain=.mindcloud.my.id`,
   HttpOnly, SameSite=Lax, Secure) — WS2.
2. Browser buka `https://absensi.mindcloud.my.id/arsip/` (cookie ikut, same-site).
3. nginx strip `/arsip` → arsip; arsip `/api/auth/me` baca cookie → user valid
   (punya baris `user_credentials`, 46/47) → UI tampil, **tanpa LoginPage**.
4. Tak ada sesi → arsip redirect ke `/` (absensi login).
5. Logout absensi → `clearCookie('arsip_session')` (WS2).

---

## Non-goals

- Tidak menggabungkan repo / tidak membuat bundel multi-stage (itu opsi B).
- Tidak memindahkan data atau DB (sudah satu DB).
- Tidak mengubah gate otorisasi arsip (`kebijakan.js`).
- Tidak menyentuh `n8n/`, `docs/MOCKUP.html`, `css/styles 1.css`.
- Tidak memperbaiki kolom tahun SIMAPO (itu WS6, terpisah).

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Rule regex statis nginx menyambar `/arsip/assets/*` | `location ^~ /arsip/` (wajib) |
| Domain arsip sendiri rusak karena `base=/arsip/` | Pensiunkan root subdomain arsip → redirect ke `absensi.../arsip/` (Coolify / konfigurasi nginx arsip) |
| `window.location.replace('/')` loop bila arsip dibuka di subdomain sendiri | Hanya relevan bila subdomain arsip masih disajikan di root; setelah redirect dipasang, tidak ada loop |
| Link "share publik" (`ShareModal`/`PublicShare` pakai `window.location.origin`/`pathname`) menunjuk origin absensi tanpa `/arsip` | Catatan follow-up: verifikasi & sesuaikan format link share bila fitur dipakai |
| 1 user absensi tanpa baris `user_credentials` | Seed menyusul (bila diperlukan) |
| Body upload besar diblok nginx | `client_max_body_size 50m` di blok `/arsip/` |

## Testing

- **Arsip**: `npm run build` sukses; `dist/index.html` memuat `/arsip/assets/`.
  Unit kecil: pembungkus fetch men-prefix `/api/x` → `/arsip/api/x`, dan
  membiarkan `https://…` serta `/uploads/…` apa adanya.
- **Absensi**: `nginx -t` (dev opsional); assert `grep -r arsipFrame js/ index.html www/`
  = 0 hasil; nav Arsip tampil untuk user non-admin.
- **Smoke prod**: login absensi (non-admin & admin) → klik Arsip → aplikasi arsip
  tampil tanpa layar login; buka dokumen, unggah, ganti tema. Cek refresh
  `/arsip/#dokumen/<id>`.

## Urutan rollout

1. Deploy **arsip** (`peta-ekonomi`) dengan `base=/arsip/` → set redirect root
   `arsipdigital...` → `absensi.../arsip/`.
2. Deploy **absensi** (`nginx.conf` + tombol nav + `ui.js`/`config.js`) dengan
   env `ARSIP_SESSION_SECRET` sudah diset.
   Jendela transien singkat: sampai langkah 2, tautan `/arsip/` belum ada
   (iframe lama juga sudah dibuang) — urutkan sedekat mungkin.

## Asumsi / diverifikasi saat implementasi

- `import.meta.env.BASE_URL` = `/arsip/` saat build produksi.
- Arsip menerima Cookie yang diteruskan nginx (default nginx meneruskan header
  `Cookie`). Tidak ada perubahan `server/index.js` yang diperlukan.
- Host publik arsip dapat di-`proxy_pass` dari dalam container absensi (akses
  HTTPS keluar + DNS + sertifikat valid).
