# Login Web NIP tanpa Password (non-Telegram) — Design

**Date:** 2026-10-08
**Status:** Approved inline oleh user ("tetap tanpa password yaa" + instruksi lanjut)

## Goal

Bikin login web di `https://absensi.mindcloud.my.id/` (dibuka di Chrome, di luar
Telegram) benar-benar masuk dan memuat data. Kini login web gagal karena backend
native menerima hanya token sesi 192-hex, sedangkan `finalizeLogin` membuat token
palsu `usr_<id>_<ts>` dan `_native_token` tak pernah terbentuk → `nativeFetch` throw
sebelum fetch → dashboard "Gagal memuat".

## Root cause (terverifikasi)

1. `js/auth.js` `handleAuthAction('login')` → `apiGet(P.userList?nip=)` untuk validasi
   NIP, lalu `finalizeLogin` membuat token **palsu** `usr_<id>_<ts>` dan panggil
   `setSession(token, ...)` yang hanya menulis `_sess_token`.
2. `requireRole` (`SESSION_TOKEN_RE=/^[0-9a-f]{192}$/`) menolak bentuk itu; 401.
3. `ensureNativeSession()` (config.js) membaca `_nativeToken` (null), `_deviceToken`
   (null), lalu init_data Telegram (kosong di Chrome) → null → `nativeFetch` throw.
4. Bonus: `/api/user-list` dan `/api/media/face-toggle` ada di balik `requireRole`,
   jadi alur login lama (validasi NIP via userList) tak akan pernah jalan tanpa token
   apapun.

## Approach (disetujui)

Satu endpoint server baru yang sekaligus: validasi NIP, resolve single row, terbitkan
sesi native, dan kembalikan objek user — sehingga frontend tidak lagi butuh
`/api/user-list` sebelum login. Frontend memakai token 192-hex itu sebagai
`_native_token` dan `_sess_token`.

Face-verify per-instansi (toggle) tetap berjalan, tapi **setelah** token didapat,
sehingga panggilannya tidak lagi 401. Logout, restore session, dan alur Telegram
tidak berubah.

## Server — `server/auth-session.js` (tambah route, tanpa file baru)

`POST /api/auth/login` (mount sudah tanpa `requireRole` via `createAuthSessionRouter`):

- Body `{ nip }` saja. Tanpa password — sesuai keputusan user.
- `nip` wajib (trim), kosong → `400 { ok:false, message:'NIP wajib diisi.' }`.
- Resolve: `SELECT * FROM user_list WHERE "NIP" = $1` + `singleSessionRow(rows)`.
  - 0 baris → `404 { ok:false, message:'NIP tidak terdaftar.' }`
  - >1 baris → `409 { ok:false, message:'NIP ambigu di user_list' }` (NIP tak unik;
    menolak ambigu = tidak terbitkan token untuk identitas yang salah).
- Terbitkan sesi via `INSERT_SESSION_SQL` (192-hex acak, 12 jam). Role/instansi diambil
  dari baris DB, **bukan** body (sama seperti `/api/auth/session`).
- Sukses → `200 { ok:true, session_token, user }` — `user` = baris lengkap dari
  `user_list` (nama, role, instansi_id, face_histogram, face_descriptor, foto_base64,
  dll — semua yang dipakai face-verify frontend). Face data sudah terekspos via
  `userList` sebelumnya, jadi tidak ada cakupan baru.

### Security note (wajib ditandai di kode)

Login NIP-only berarti siapa pun yang mengetahui NIP orang lain bisa mengambil sesi
atas namanya. Ini celah yang **sudah ada** sejak lama (alur lama juga NIP-only), bukan
regresi baru. Mitigasi berlapis yang sudah mengikuti: face-verify sesuai toggle
instansi; otorisasi tetap dari sesi; NIP ambigu ditolak. Upgrade path bila nanti
dibutuhkan: batasi laju (`express-rate-limit`), atau wajibkan face-verify untuk web,
atau PIN/OTP per pegawai. Tandai dengan komentar `ponytail:`.

## Frontend

### `js/config.js`
- Tambah `P.webLogin = '/api/auth/login'`.
- Tambah setter kecil:
  ```js
  function setNativeToken(token) {
    _nativeToken = token;
    try { localStorage.setItem('_native_token', token); } catch {}
  }
  ```
  (memisahkan "set token dari auth" vs "set dari ensureNativeSession"; pakai juga di
  dalam `ensureNativeSession` untuk DRY — opsional.)

### `js/auth.js` — `handleAuthAction('login')`
- Ganti blok validasi `apiGet(P.userList?nip=)` dengan:
  ```
  POST P.webLogin { nip }
  → { session_token, user }
  ```
  Error: `!ok` → pakai status (400/404/409) → message dari body, tampilkan alert.
- `window.MY_ID = user.id`; simpan `user` di variabel (tidak perlu userList lagi).
- Face-toggle & face-verify: **panggil `setNativeToken(session_token)` dulu**, baru
  jalankan blok face existing (kini token ada, `apiGet(P.faceToggle)` tidak 401).
- `finalizeLogin` baru:
  ```js
  const finalizeLogin = async () => {
    setNativeToken(session_token);
    setSession(session_token, { nip: userNip, role: user.role || 'USER', instansi_id: user.instansi_id || '' });
    window.MY_ID = user.id;
    localStorage.setItem(STORAGE_KEYS.USER_ID, window.MY_ID);
    localStorage.setItem('MY_NIP', userNip);
    localStorage.setItem('MY_ROLE', String(user.role || 'USER').toUpperCase());
    localStorage.setItem('MY_NAME', String(user.nama || 'User'));
    localStorage.setItem(STORAGE_KEYS.USER_OBJ, JSON.stringify(user));
    const finalInst = (user.instansi_id || user.Instansi_Id || '').trim();
    if (finalInst) localStorage.setItem('MY_INSTANSI', finalInst);
    else localStorage.removeItem('MY_INSTANSI');
    location.reload();
  };
  ```

### `www/js/*`
- Sinkronkan `js/config.js` dan `js/auth.js` ke `www/js/*` (PWA/APK pakai salinan itu).

## Out of scope

- **Register** (`mode==='register'`, auth.js:261-347): tetap jalur `usr_` legacy + n8n,
  tidak disentuh (admin yang menambah pegawai). Bila mau native juga, terbitkan
  `/api/auth/login` sehabis `user-add`; task terpisah.
- Telegram auth (`/api/auth/session`, `ensureNativeSession` init_data): tidak berubah.
- Device token `dv_` Meja Absen: tidak berubah.
- Simplifikasi Docker (nginx+supervisord→Express tunggal): task ops terpisah,
  diadakan setelah login terverifikasi.

## Verification

1. `node --test server/auth-session.test.js` (+ `server/auth.test.js`) hijau.
2. Browser (Chrome via browser-harness) di `https://absensi.mindcloud.my.id/`:
   - Login NIP `200206302025061002` (SUPERADMIN bapperida) → reload → tidak ada error
     "Sesi native tidak tersedia"; dashboard memuat data (LOG ABSEN HARI INI terisi).
   - Network: `/api/*` request memakai `Authorization: Bearer <192-hex>`.
3. NIP tak dikenal → alert "NIP tidak terdaftar."; tanpa NIP → alert wajib diisi.
4. Redeploy + push ke `sekrebot` (live) + `origin` (sekrebot-test).