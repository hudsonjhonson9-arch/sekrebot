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

