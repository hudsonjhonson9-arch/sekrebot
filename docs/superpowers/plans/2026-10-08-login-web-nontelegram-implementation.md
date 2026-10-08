# Login Web NIP non-Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login web via NIP (tanpa password, non-Telegram) menerbitkan sesi native 192-hex sehingga seluruh endpoint `/api/*` jalan di Chrome tanpa error "Sesi native tidak tersedia".

**Architecture:** Satu endpoint baru `POST /api/auth/login` di `auth-session.js` (mount sudah tanpa `requireRole`) memvalidasi NIP, menolak NIP ambigu, menerbitkan sesi 12 jam, dan mengembalikan baris `user_list`. Frontend mengganti `apiGet(P.userList)` + token palsu `usr_` dengan panggilan endpoint itu, menyimpan `session_token` sebagai `_native_token` dan `_sess_token`, lalu menjalankan face-verify (kini dengan token) dan reload.

**Tech Stack:** Express (route factory pattern yang sudah ada), `node:test` untuk test server, vanilla JS frontend, PostgreSQL via injected `query`.

**Spec:** `docs/superpowers/specs/2026-10-08-login-web-nontelegram-design.md`

## Global Constraints

- Tanpa password, sesuai keputusan user; face-verify per-instansi tetap opsional (toggle lama).
- NIP ambigu (>1 baris `user_list`) → **409**; NIP tidak ada → **404**; tanpa NIP → **400**. Jangan pernah memilih baris sembarangan.
- Role/instansi sesi **selalu dari baris DB**, bukan body request.
- Token sesi = `crypto.randomBytes(96).toString('hex')` (192 hex huruf kecil), masa berlaku 12 jam, via `INSERT_SESSION_SQL` yang sudah ada.
- Route baru DI DALAM `createAuthSessionRouter` (sudah ter-mount tanpa `requireRole`), path absolut `/api/auth/login`.
- Test pakai helper `drive()` yang sudah ada di `server/auth-session.test.js` — JANGAN tulis test server baru dari nol.
- `www/js/*` = salinan `js/*` — setiap edit `js/` wajib di-sync ke `www/js/`.
- PowerShell TIDAK dukung heredoc `<<'PY'`.
- Jangan ubah `/api/auth/session` (Telegram) atau device token `dv_`.
- Setiap langkah berakhir dengan `npm test`/`node --test` hijau (kalaupun ada test yang memang belum relevan, catat hasil apa adanya).

---

### Task 1: Endpoint `POST /api/auth/login` (server)

**Files:**
- Modify: `server/auth-session.js` (tambah 1 konstanta SQL + 1 route; sisanya tidak disentuh)
- Test: `server/auth-session.test.js` (tambah 6 test case, `drive()` sudah ada)

**Interfaces:**
- Produces: `POST /api/auth/login` body `{nip}` → `200 {ok, session_token, user}`; error `400/404/409 {ok:false, message}`.
- Konsumsi oleh Task 2 (frontend `P.webLogin`).

- [ ] **Step 1: Tulis test yang gagal dulu**

Tambahkan di bagian akhir `server/auth-session.test.js` (setelah test `logout menolak token dengan bentuk salah`):

```js
// ── Login NIP (web, non-Telegram, tanpa password) ──

test('login NIP valid menerbitkan sesi 192 hex dan baris user', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return { rows: [{ id: '9', nip: '200206302025061002', role: 'SUPERADMIN', instansi_id: 'bapperida', nama: 'Achmad' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'd'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '200206302025061002' });
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
  assert.match(out.body.session_token, /^[0-9a-f]{192}$/);
  assert.equal(out.body.user.nip, '200206302025061002');
  assert.equal(out.body.user.nama, 'Achmad');
  const ins = seen.find((s) => /INSERT INTO auth_sessions/i.test(s.sql));
  assert.ok(ins.params.includes('SUPERADMIN'), 'role harus dari baris DB');
  assert.ok(ins.params.includes('bapperida'), 'instansi harus dari baris DB');
});

test('login NIP tidak terdaftar ditolak 404', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => ({ rows: [] }) });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '00000' });
  assert.equal(out.status, 404);
  assert.equal(out.body.ok, false);
});

test('login NIP ambigu ditolak 409, bukan memilih baris pertama', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  let dbTouched = 0;
  const r = createAuthSessionRouter({
    query: async (sql) => {
      if (/user_list/i.test(String(sql))) { dbTouched++; return { rows: [{ id: '1', nip: 'X' }, { id: '2', nip: 'X' }] }; }
      dbTouched++;
      return { rows: [] };
    },
  });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: 'X' });
  assert.equal(out.status, 409);
  const onlyLookup = dbTouched === 1;
  assert.ok(onlyLookup, 'baris ambigu harus berhenti di lookup, tidak boleh INSERT');
});

test('login tanpa NIP ditolak 400 tanpa menyentuh DB', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  let called = 0;
  const r = createAuthSessionRouter({ query: async () => { called++; return { rows: [] }; } });
  for (const nip of [undefined, '', '   ']) {
    const out = await drive(r, 'POST', '/api/auth/login', { nip });
    assert.equal(out.status, 400, `nip ${JSON.stringify(nip)} harus 400`);
  }
  assert.equal(called, 0, 'DB tidak boleh disentuh untuk input kosong');
});

test('login mengabaikan role/instansi yang disuntik di body', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return { rows: [{ id: '7', nip: 'NIP1', role: 'USER', instansi_id: 'bapperida' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'e'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: 'NIP1', role: 'SUPERADMIN', instansi_id: 'lain' });
  assert.equal(out.status, 200);
  const ins = seen.find((s) => /INSERT INTO auth_sessions/i.test(s.sql));
  assert.ok(ins.params.includes('USER'), 'role dari body tidak boleh dipakai');
  assert.ok(!ins.params.includes('SUPERADMIN'), 'role body harus diabaikan');
});

test('login tidak membaca init_data Telegram (pure NIP)', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'x'.repeat(30);
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => ({ rows: [] }) });
  // Tanpa init_data pun harus tetap 404 (NIP tak dikenal), bukan 401.
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '99999' });
  assert.equal(out.status, 404);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `node --test server/auth-session.test.js`
Expected: FAIL — `route not found` (route `/api/auth/login` belum ada).

- [ ] **Step 3: Implementasi minimal**

Di `server/auth-session.js`, tambahkan konstanta SQL setelah `DEACTIVATE_SQL` (baris ~15):

```js
// NIP tidak unik di user_list: ambil SEMUA baris, lalu tolak yang ambigu
// (singleSessionRow). Memilih baris pertama = menerbitkan sesi identitas salah.
const USERS_BY_NIP_SQL = `
  SELECT * FROM user_list WHERE "NIP" = $1`;
```

Di dalam `createAuthSessionRouter`, tambahkan route setelah `router.post('/api/auth/session', ...)` (sebelum `router.post('/api/auth/logout')`), dan tambahkan import `singleSessionRow`:

```js
import { singleSessionRow } from './auth.js';
```

```js
  // Login web non-Telegram: NIP saja, tanpa password (keputusan pengguna).
  // ponytail: NIP-only berarti siapa pun yang tahu NIP orang lain bisa mengambil
  // sesinya — celah yang sudah ada sejak alur lama juga NIP-only. Mitigasi yang
  // berjalan: face-verify sesuai toggle instansi di sisi klien, otorisasi tetap
  // dari sesi, NIP ambigu ditolak. Upgrade path kalau perlu lebih: rate-limit,
  // wajib face-verify untuk web, atau PIN/OTP per pegawai.
  router.post('/api/auth/login', async (req, res) => {
    const nip = String(req.body?.nip || '').trim();
    if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib diisi.' });

    const { rows } = await query(USERS_BY_NIP_SQL, [nip]);
    const user = singleSessionRow(rows);
    if (!user) {
      return res.status(rows.length ? 409 : 404).json({
        ok: false,
        message: rows.length ? 'NIP ambigu di user_list' : 'NIP tidak terdaftar.',
      });
    }

    const token = crypto.randomBytes(96).toString('hex');
    const ins = await query(INSERT_SESSION_SQL, [token, user.nip, user.id, user.role, user.instansi_id]);
    if (!ins.rows.length) return res.status(500).json({ ok: false, message: 'Gagal membuat sesi.' });

    return res.status(200).json({ ok: true, session_token: ins.rows[0].session_token, user });
  });
```

Catatan: `singleSessionRow` sudah di-export dari `./auth.js` (baris 92), dipakai juga oleh `auth-device.js`.

- [ ] **Step 4: Jalankan test, pastikan hijau**

Run: `node --test server/auth-session.test.js`
Expected: PASS — semua test (lama + 6 baru) hijau.

- [ ] **Step 5: Jalankan seluruh test server**

Run: `node --test server/`
Expected: semua test hijau (tidak ada regresi di `index.test.js`, `auth.test.js`, dsb.).

- [ ] **Step 6: Commit**

```bash
git add server/auth-session.js server/auth-session.test.js
git commit -m "feat: POST /api/auth/login - sesi native dari NIP tanpa password"
```

---

### Task 2: Frontend — `P.webLogin` + `setNativeToken` (config.js)

**Files:**
- Modify: `js/config.js` (`P` map ~baris 245; tambah fungsi setelah `clearSession` ~baris 232)
- Modify: `www/js/config.js` (sync)

**Interfaces:**
- Produces: `P.webLogin` = `'/api/auth/login'`; fungsi global `setNativeToken(token)` yang menulis ke `_nativeToken` DAN `localStorage._native_token` (dipakai Task 3).

- [ ] **Step 1: Tambah `webLogin` ke P map**

Di `js/config.js`, tambahkan setelah `sessionLogin: '/api/auth/session',` (baris 246):

```js
  sessionLogin: '/api/auth/session',
  webLogin: '/api/auth/login',
```

- [ ] **Step 2: Tambah `setNativeToken`**

Di `js/config.js`, tambahkan setelah fungsi `clearSession()` (sebelum `function _getSessionRole()`):

```js
// Sesi web/NIP: token 192 hex dari /api/auth/login disimpan sebagai _native_token
// supaya nativeFetch memakainya, dan di localStorage supaya bertahan reload.
function setNativeToken(token) {
  _nativeToken = token;
  try { localStorage.setItem('_native_token', token); } catch { /* mode privat */ }
}
```

- [ ] **Step 3: Sync ke www/**

Run (PowerShell):
```powershell
Copy-Item js\config.js www\js\config.js -Force
```
Expected: tidak ada output error; `www/js/config.js` identik dengan `js/config.js`.

- [ ] **Step 4: Cek tidak ada syntax error**

Run: `node --check js/config.js; node --check www/js/config.js`
Expected: tidak ada output error.

- [ ] **Step 5: Commit**

```bash
git add js/config.js www/js/config.js
git commit -m "feat: P.webLogin + setNativeToken untuk sesi web"
```

---

### Task 3: Frontend — alur login pakai `/api/auth/login` (auth.js)

**Files:**
- Modify: `js/auth.js` — `handleAuthAction('login')`, khususnya: blok validasi `apiGet(P.userList)` (baris 50-71), penambahan `setNativeToken` sebelum face-toggle (baris 73), dan `finalizeLogin` (baris 106-119).
- Modify: `www/js/auth.js` (sync)

**Interfaces:**
- Konsumsi: `P.webLogin` dan `setNativeToken` (Task 2).
- Produksi: `window.MY_ID`, `_sess_*`, `_native_token` terisi dari respons server; alur face-verify tidak berubah (masih memanggil `openCamOverlay`).

- [ ] **Step 1: Ganti blok validasi NIP + token palsu**

Di `js/auth.js`, GANTI keseluruhan blok dari `const res = await apiGet(\`${P.userList}?nip=${nip}\`);` (baris 50) sampai akhir `finalizeLogin` (baris 119) dengan kode berikut.

Blok LAMA yang dihapus dimulai persis dengan:

```js
          const res = await apiGet(`${P.userList}?nip=${nip}`);
```

dan berakhir dengan (baris 118-119):

```js
            location.reload();
          };
```

Blok BARU:

```js
          // Login NIP (web, non-Telegram): satu panggilan menerbitkan sesi native
          // dan mengembalikan baris user; tidak lagi butuh /api/user-list (yang
          // berada di balik requireRole dan tak terjangkau sebelum punya token).
          const loginRes = await fetch(API_BASE + P.webLogin, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip }),
          });
          const loginBody = await loginRes.json().catch(() => ({}));
          if (!loginRes.ok) throw new Error(loginBody?.message || 'Login gagal. Coba lagi.');

          const user = loginBody.user;
          if (!user || !user.id) throw new Error('Data pegawai tidak lengkap. Hubungi admin.');

          const sessionToken = loginBody.session_token;
          const userNip = String(user.nip || '').trim();
          const targetId = String(user.id);

          // Token native harus siap SEBELUM panggilan face-toggle/face lain agar
          // tidak 401 (endpoints media dibalik requireRole).
          setNativeToken(sessionToken);

          // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
          // Check per-instansi face toggle from pengaturan table
          let isFaceEnabled = false;
          try {
            const userInstansi = (user.instansi_id || user.Instansi_Id || '').trim();
            console.log('[FaceToggle] userInstansi:', userInstansi);
            if (userInstansi) {
              const faceRes = await apiGet(P.faceToggle, { instansi_id: userInstansi });
              console.log('[FaceToggle] faceRes:', faceRes);
              if (faceRes.ok) {
                const rawFT = faceRes.rows?.length ? faceRes.rows[0] : (faceRes?.data ?? {});
                const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
                console.log('[FaceToggle] parsed:', d);
                isFaceEnabled = d?.enabled === true || d?.enabled === '1' || d?.enabled === 1 || d?.value === '1';
                console.log('[FaceToggle] isFaceEnabled:', isFaceEnabled);
              } else {
                console.warn('[FaceToggle] API not ok:', faceRes.status);
              }
            } else {
              console.warn('[FaceToggle] instansi_id empty on user');
            }
          } catch (e) {
            console.warn('[FaceToggle] error:', e);
          }
          // Ponytail: API error/timeout → safe default = OFF, no face required

          const hasFace = !!(user.face_histogram && user.face_histogram !== '[]' && user.face_histogram !== '')
            || !!(user.face_photo && user.face_photo !== '' && user.face_photo !== 'null')
            || !!(user.foto_base64 && user.foto_base64 !== '')
            || !!(user.descriptor && user.descriptor !== '[]');

          const finalizeLogin = async () => {
            setNativeToken(sessionToken);
            setSession(sessionToken, { nip: userNip, role: user.role || 'USER', instansi_id: user.instansi_id || '' });
            window.MY_ID = targetId;
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

Setelah blok ini, sisa fungsi (blok `if (isFaceEnabled && typeof openCamOverlay === 'function')` sampai akhir) tetap SAMA — hanya memastikan tidak ada referensi `rawData`/`res`/`userList` yang tersisa. Blok itu sudah memakai `user`, `userNip`, `targetId`, `hasFace`, `finalizeLogin`, `isFaceEnabled` — semuanya ada di definisi baru.

- [ ] **Step 2: Verifikasi tidak ada sisa referensi lama**

Run (PowerShell):
```powershell
Select-String -Path js\auth.js -Pattern 'rawData|res\.rows|res\.data|P\.userList\?nip' | Select-Object LineNumber, Line
```
Expected: tidak ada baris yang match (blok `P.userList` hanya mungkin tersisa di cabang **register** — itu di luar scope dan boleh ada; cabang register memakai `cek.rows` dari `apiGet(P.userList)` — string persis `cek = await apiGet`). Kalau `Select-String` menemukan `P.userList?nip=${nip}` di dalam cabang login, ulangi Step 1 (blok lama belum terganti sempurna).

Catatan: pemakaian `P.userList` di **cabang register** (`const cek = await apiGet(\`${P.userList}?nip=${payload.nip}\`);`) sengaja dibiarkan — di luar scope.

- [ ] **Step 3: Cek syntax**

Run: `node --check js/auth.js`
Expected: tidak ada output error.

- [ ] **Step 4: Sync ke www/**

Run (PowerShell):
```powershell
Copy-Item js\auth.js www\js\auth.js -Force
```
Expected: tidak ada output error.

- [ ] **Step 5: Commit**

```bash
git add js/auth.js www/js/auth.js
git commit -m "feat: login web pakai /api/auth/login, token native asli"
```

---

### Task 4: Verifikasi end-to-end di Chrome (produksi)

**Files:**
- Tidak ada edit — verifikasi saja via browser-harness di `https://absensi.mindcloud.my.id/`.

**Interfaces:**
- Konsumsi: hasil Task 1-3 yang sudah di-push/di-redeploy (atau lokal kalau sudah cukup).

- [ ] **Step 1: Pastikan perubahan sudah di-push & redeploy**

Run: `git log --oneline -3` dan `git status`
Expected: bersih, 3 commit terakhir (design, server, frontend) ada. Kalau push/redploy belum dilakukan, minta instruksi push ke `sekrebot` (live) + `origin` (test) dan redeploy via Coolify dulu, lalu lanjut.

- [ ] **Step 2: Buka login di Chrome (browser-harness)**

Aksi (via browser-harness): buka `https://absensi.mindcloud.my.id/`, pastikan `#authOverlay` tampil, isi `#loginNip` = `200206302025061002`, klik `#btnLogin`.

Expected: tidak ada alert error; halaman reload; `#authOverlay` hilang; tidak ada pesan "Sesi native tidak tersedia".

- [ ] **Step 3: Cek data ter-load**

Aksi: setelah reload, tunggu render, ambil snapshot/screenshot.

Expected: dashboard memuat data (bagian "LOG ABSEN HARI INI" terisi atau ada baris data), TIDAK muncul "Gagal memuat. Pastikan n8n aktif.".

- [ ] **Step 4: Cek token di Network**

Aksi: periksa request `/api/*` via browser-harness (daftar request).

Expected: header `Authorization: Bearer <192-hex>` (bukan `Bearer usr_...`), dan status 200.

- [ ] **Step 5: Cek jalur error**

Aksi: logout (atau buka tab privat), login dengan NIP `000000`.

Expected: alert "NIP tidak terdaftar." (404), tidak ada sesi yang terbit (cek `localStorage._native_token` tetap kosong).

- [ ] **Step 6: Verifikasi selesai — laporkan hasil**

Kumpulkan: status 4 langkah di atas. Kalau ada yang gagal, catat pesan error + Network status persis, lalu berhenti dan laporkan ke user (jangan lanjut Task 5 sebelum login terbukti jalan).

---

### Task 5: Push ke dua remote + redeploy

**Files:**
- Tidak ada edit kode; git push + instruksi redeploy.

- [ ] **Step 1: Cek keadaan git**

Run: `git status; git log --oneline -5; git fsck --no-reflogs 2>&1 | Select-Object -First 10`
Expected: status bersih; `git fsck` tidak output error (integritas object valid). Kalau `git fsck` keluar `error: invalid object` — STOP, laporkan ke user sebelum push apapun.

- [ ] **Step 2: Push ke dua remote**

Run:
```powershell
git push origin main
git push sekrebot main
```
Expected: kedua push sukses. Kalau gagal, catat pesan persis.

- [ ] **Step 3: Redeploy produksi**

Instruksi user: redeploy aplikasi `absensi` di Coolify (repo `hudsonjhonson9-arch/sekrebot:main`, commit baru) — Build Pack `Dockerfile`, Ports Exposes `80`, env `TRUST_PROXY=2`, `PORT=8081`. (Kalau user memilih simplifikasi Docker 1 proses nanti, instruksi port & TRUST_PROXY berubah — jangan campur sekarang.)

- [ ] **Step 4: Probe produksi**

Run (PowerShell):
```powershell
(Invoke-WebRequest -Uri "https://absensi.mindcloud.my.id/api/health" -UseBasicParsing).StatusCode
(Invoke-WebRequest -Uri "https://absensi.mindcloud.my.id/" -UseBasicParsing).StatusCode
```
Expected: `200` dan `200`.

- [ ] **Step 5: Verifikasi login di produksi (ulangi Task 4 Step 2-4)**

Expected: login NIP sukses, data ter-load, bearer 192-hex.

---

## Self-Review (dijalankan penulis plan)

1. **Spec coverage:**
   - Endpoint `/api/auth/login` (400/404/409, token dari DB, `user` dikembalikan) → Task 1. ✅
   - `P.webLogin` + `setNativeToken` → Task 2. ✅
   - Frontend pakai endpoint, `setNativeToken` sebelum face-toggle, `finalizeLogin` memakai token server → Task 3. ✅
   - Sync `www/js/*` → Task 2 Step 3 & Task 3 Step 4. ✅
   - Security note `ponytail:` → Task 1 Step 3 (komentar di kode). ✅
   - Verifikasi Chrome (token 192-hex, data ter-load, error jalur) → Task 4. ✅
   - Push/redeploy → Task 5. ✅
   - Out of scope (register, Telegram, dv_, Docker) → tidak ada task, sesuai spec. ✅
2. **Placeholder scan:** tidak ada "TBD/TODO/implement later"; semua langkah berisi kode/kommando nyata. ✅
3. **Type consistency:** `setNativeToken(token)`, `P.webLogin`, `session_token`, `user.id`, `user.nip`, `user.role`, `user.instansi_id` — konsisten antar Task 1→2→3. `drive()` dipakai persis seperti di test lama. ✅

## Execution Handoff

Plan tersimpan di `docs/superpowers/plans/2026-10-08-login-web-nontelegram-implementation.md`. Dua opsi eksekusi:

1. **Subagent-Driven (recommended)** — dispatch subagent segar per task, review antar task.
2. **Inline Execution** — eksekusi di sesi ini dengan checkpoint.