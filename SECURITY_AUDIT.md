# Security Audit — Absensi Refactored v6 (Bapperida Sumba Barat)

Tanggal audit: 2026-08-02
Cakupan: SPA + Capacitor Android (`js/`, `www/`), backend n8n (`n8n/*.json`), DB PostgreSQL/Supabase (`migrations/`).

Kesimpulan: **lapisan "session + HMAC + role" seluruhnya dapat dipalsukan dari sisi client** — aplikasi praktis tanpa autentikasi server yang bermakna. Semua kompensasi (radius GPS, IP CIDR, anti-Fake-GPS, liveness wajah) memvalidasi nilai yang diklaim client sendiri, sehingga bisa dilewati dengan memalsukan isi request.

---

## 🔴 KRITIS — Autentikasi / Identitas

### K1. Token "session" bukan session — dapat dipalsukan total
Client membuat token sendiri: `usr_<id>_<Date.now()>` (`js/auth.js:107,320,386`).
Gate server `Validate Session Absen` / `Validate Session User-List` (`n8n/AbsensiBot V.5.1.json`) hanya menjalankan:

```sql
SELECT "id", "role", "instansi_id" FROM "user_list"
WHERE "id" = split_part('<bearer>', '_', 2)::bigint LIMIT 1;
```

- Token **tidak pernah** dicocokkan ke tabel `auth_sessions`.
- Tidak ada cek kedaluwarsa, tidak ada signature token.
- Siapa pun yang tahu ID korban bisa kirim `Authorization: Bearer usr_<id>_<apa_pun>` dan server menganggapnya user tersebut (termasuk admin).

### K2. Kunci HMAC anti-spoofing = string `"undefined"`
`Security Gate Absen` membangun `expectedBase = `${reqId}${nip}${lat}${lng}${ts}${token}``, tetapi **variabel `token` tidak pernah dideklarasikan** di workflow. Akibatnya `token` bernilai `undefined` → `expectedSig = sha256(reqId+nip+lat+lng+ts + "undefined")`.

Kunci HMAC berupa konstanta publik yang diketahui semua orang → signature 100% bisa dipalsukan. "Anti-Spoofing" hanya teater.

### K3. Self-escalation role + SQL injection di `n8n/session_login_wf.json`
Node login (baris 18, 28) mengambil `role` langsung dari body/query request:

```
const role = (q.role || body.role || 'USER').replace(/'/g, "''");
...
SELECT create_session('${d.nip}','${d.user_id}','${d.role}','${d.instansi_id}') AS session_token;
```

- Kirim `role=ADMIN` → session dibuat dengan role ADMIN. Esensi priviledge escalation.
- Query dibangun dengan interpolasi string; escaping hanya `.replace(/'/g,"''")` — pola ini bukan proteksi SQLi yang aman (backslash, panjang, dan konteks interaksi rentan).
- `session_token` di `UPDATE auth_sessions ... WHERE session_token='${d.session_token}'` juga di-interpolasi.

### K4. Semua 30 webhook tanpa autentikasi + CORS `*`
Semua node `n8n-nodes-base.webhook` di `n8n/AbsensiBot V.5.1.json` punya `authentication: undefined` (None). Endpoint publik: `absen`, `user-list`, `user-add`, `user-edit`, `user-delete`, `admin-add`, `admin-delete`, `admin-list`, `lokasi-*`, `jam-absen`, `jam-periode-*`, `libur-*`, `log-*`, `rekap-absen`, `add-employee`, `instansi-list`, `bidang-list`, `signature-*`. Respons gate juga menetapkan `Access-Control-Allow-Origin: *`.

### K5. Static token hardcoded masih ada
Gate duplikat (`n8n/AbsensiBot V.5.1.json` baris 4363, 4443):
```js
const VALID_TOKEN = 'BAPPERIDA_SECURE_TOKEN_2025';
if (token !== VALID_TOKEN) { ... 'Unauthorized: token tidak valid' }
```
Token kerasandi dalam source — bocor lewat repo / bundle, gate bisa di-bypass total oleh siapa pun.

---

## 🟠 TINGGI — Integritas absen

### T1. Bypass validasi lokasi penuh via `PULANG LUAR`
`n8n/AbsensiBot V.5.1.json` (VALIDASI ABSEN v16, baris 3038):
```js
// Jika frontend menyatakan ini PULANG LUAR
if (body.jenis_absen === 'PULANG LUAR' && body.skip_radius_check === true) jenisAbsen = 'PULANG LUAR';
...
if (jenisAbsen === 'PULANG LUAR') {
  return terima('PULANG LUAR', 'Lapangan', ...);   // tanpa cek radius / IP sama sekali
}
```
Komentar header mengklaim "FIX: PULANG LUAR tidak lagi bypass validasi", tapi kode mengeksekusi bypass lokasi penuh. `jenis_absen` dan `skip_radius_check` keduanya dikendalikan client → siapa pun bisa absen "Pulang dari Lapangan" dari lokasi mana pun.

### T2. Semua data lokasi/waktu berasal dari client
`tanggal_iso`, `jam`, `latitude`, `longitude`, `accuracy`, `gps_fingerprint`, `network_info` semua dibaca dari `body`. Heuristik anti-Fake-GPS (accuracy ≤3 tanpa altitude, null-count fingerprint, dst.) memvalidasi **nilai yang diklaim client sendiri**. Server tidak pernah memakai jam server → mengubah jam HP = backdate/forward absen seenaknya.

### T3. `meja_token` hanya cek truthiness
```js
const validMejaToken = !!(body.meja_token);
if (isMejaAbsen && !validMejaToken) return tolak('MEJA_TOKEN_INVALID', ...);
```
Nilai `"x"` apa pun lolos. Meja Absen (bebas koordinat/IP) bisa diakses dengan token asal-asalan.

### T4. Impersonasi pegawai lain
`rawId = user.id || body.telegram_id` dikendalikan client; server memuat data pegawai berdasarkan ID itu. Dengan K1+K2, attacker absen **atas nama pegawai mana pun**.

### T5. Deteksi duplikat berbasis jam client
`Math.abs(jamLog - jamSubmit) <= 1` — duplikat dicek terhadap jam yang dikirim client, bukan server.

---

## 🟡 SEDANG

### S1. `requireAdmin()` client-side saja
`js/config.js:17` — cek role dilakukan di browser (`window._session?.role`), bukan di server. Server-side role check didokumentasikan "Optional tapi Recommended" (`n8n/SESSION_GATE_SETUP.md`), dan gate-nya sendiri bisa di-bypass (K1). Pengguna dapat mengubah role di client / melewati gate.

### S2. Bypass auth `admin-list`
`n8n/AbsensiBot V.5.1.json:4283`:
```js
// Ponytail: admin-list is read-only, bypass auth gate
return [{ json: { ...$json, _auth_ok: true } }];
```
Endpoint `admin-list` (dan `user-list` serupa via K1) tanpa autentikasi → siapa pun bisa enumerasi daftar admin/user.

### S3. Replay window mismatch + tidak ada idempotensi
Komentar di `Security Gate Absen`: "Replay Attack Check (24 hours tolerance for Offline Sync)", tapi kode: `Math.abs(now - clientTs) > 3600` (1 jam). Antrian offline (`js/offline.js`) bisa replay dalam 1 jam. Tidak ada idempotensi berbasis `request_id` di server → pengiriman ulang bisa double-record jika batch pertama sukses lalu retry.

### S4. Face recognition & liveness 100% client-side
`js/face.js`:
- `let _skipVerifikasi = false;` + `skipVerifikasi()` (baris 1496) men-set `_livenessState` dan `_isLive = true` tanpa liveness sungguhan.
- Threshold similarity dan keputusan "match" dihitung di browser; payload yang dikirim ke server adalah hasil client.
- Modifikasi bundle / DevTools → lewati verifikasi wajah total. Tidak ada enforcement server.

### S5. XSS — interpolasi tak di-escape
Puluhan `${...}` di dalam `innerHTML` dan atribut `onclick` di `js/admin-*.js` (admin-face, admin-libur, admin-lokasi-v9, admin-mgmt) tanpa `escapeHtml()`. Util `escapeHtml` ada di `js/config.js` tetapi pemakaiannya tidak konsisten. Risiko stored XSS lewat `nama_lokasi`, nama pegawai, dll.

### S6. Data sensitif di localStorage / IndexedDB
- Cache IP & GPS: `bapperida_ip_v1` (TTL 5m), `bapperida_gps_v1` (TTL 2m) di `js/network.js`.
- Antrian absen offline di IndexedDB (`AbsensiOfflineDB`) berisi payload absen mentah yang bisa diedit user sebelum sync.

---

## 🟢 RENDAH / KONFIGURASI

### R1. Drift `js/` vs `www/js/`
Hampir semua file berbeda antara `js/` (source) dan `www/js/` (yang di-deploy ke Android). `admin-lokasi-v9.js` tidak ada di `www/`. Yang diaudit (`js/`) ≠ yang berjalan (`www/`).

### R2. CORS `*` dan header ngrok
`Access-Control-Allow-Origin: *` pada beberapa workflow (mis. `n8n/Absensi Dok Pegawai.json`), plus header `ngrok-skip-browser-warning` → layanan ter-expose via tunnel ngrok.

### R3. Hardcoded admin/chat ID
`[1383864355]` (dan beberapa lainnya) tertanam di workflow — ID telegram admin di hardcode.

### R4. Fallback IP diklaim client
`ipCek = headerIP || realIP || netInfo.ip_public` — jika header proxy kosong, IP publik diambil dari body yang dikirim client (bisa dipalsukan untuk lolos cek CIDR).

---

## Rekomendasi prioritas
1. **K1/K2/K3/K5**: Ganti token self-made dengan session sungguhan — token di-generate & divalidasi server (tabel `auth_sessions` + `validate_session()` sudah ada di `migrations/migration_004_auth_sessions.sql`); definisikan secret HMAC di environment, bukan literal; hapus `role` dari input client dan static token.
2. **T1/T3**: Hapus `skip_radius_check` client-controlled; `meja_token` harus divalidasi server.
3. **T2**: Gunakan jam server (WITA) sebagai sumber waktu absen, bukan `body.jam`.
4. **S1/S2**: Terapkan role check server-side (sesuai `SESSION_GATE_SETUP.md`) ke semua endpoint admin, hapus bypass `admin-list`.
5. **S4**: Verifikasi wajah → edge function server-side; jangan percaya hasil client.
6. **R1**: Sinkronkan `js/` → `www/` sebelum build; buang file stale.
