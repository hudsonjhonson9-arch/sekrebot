# Native Absensi V5.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menggantikan workflow n8n "Absensi Bot V5.2 Postgres" dengan endpoint Express native (`/api/absen`, `/api/log`, `/api/auth/session`) sekaligus menutup 10 celah keamanan yang teridentifikasi.

**Architecture:** Satu router `server/absen.js` berisi validasi (fungsi murni) + handler Express. Auth Telegram lewat verifikasi HMAC `initData`; auth admin lewat `requireRole` dari `server/auth.js` yang sudah ada. Statistik dihitung ulang dalam-request via UPSERT. Semua SQL diparameterisasi.

**Tech Stack:** Node.js ESM (`"type": "module"`), Express, `pg`, `node:test` + `node:assert/strict`. Tanpa dependency baru.

**Spec:** `docs/superpowers/specs/2026-10-04-native-absen-v52-design.md`

## Global Constraints

- Toleransi offline **86400 detik** (24 jam) — bukan 3600 seperti bug workflow lama.
- `Log_Absen.tanggal` & `jam` selalu dari **jam server (WITA, UTC+8)**; nilai client disimpan di kolom `client_jam`.
- `request_id` unik → `INSERT ... ON CONFLICT (request_id) DO NOTHING`.
- `statistik_pegawai` PK = `nip` → `ON CONFLICT (nip) DO UPDATE`.
- `role` dan `instansi_id` **selalu** dari `user_list`, abaikan dari body.
- `_signature` tidak diverifikasi (kunci lamanya string literal `"undefined"`).
- Perbandingan token meja memakai `crypto.timingSafeEqual`, bukan `===`.
- `PULANG LUAR` **tetap** divalidasi radius + IP; `skip_radius_check` dari client diabaikan.
- Tidak ada static token. Tidak ada `Access-Control-Allow-Origin: *`.
- Kontrak respons harus persis: `validasi.is_valid` boolean, `keterangan`, `nama_lokasi` / `kode_tolak`.
- Ikuti gaya import test yang sudah ada: stub `globalThis.fetch`, pin nilai ENV di dalam file test (jangan baca `.env` nyata).
- Jangan `git add -A` — `www/` untracked/WIP.

---

### Task 1: Verifikasi `initData` Telegram

Fondasi auth untuk `/api/absen` dan `/api/auth/session`. Fungsi murni, tanpa I/O — paling mudah diuji dan paling tinggi risikonya kalau salah.

**Files:**
- Create: `server/telegram.js`
- Test: `server/telegram.test.js`

**Interfaces:**
- Consumes: `TELEGRAM_BOT_TOKEN` dari `process.env`
- Produces:
  - `verifyInitData(initData, botToken, { maxAgeSeconds })` → `{ ok: true, user }` | `{ ok: false, reason }`
  - `user` = `{ id: number, firstName, lastName, username }`
  - `reason` ∈ `'missing' | 'malformed' | 'bad_signature' | 'expired' | 'no_user'`

- [x] **Step 1: Write the failing test**

Buat `server/telegram.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyInitData } from './telegram.js'; // belum ada -> RED = ERR_MODULE_NOT_FOUND

// Token di-pin di dalam test: bot token sungguhan tidak boleh masuk output CI.
const BOT = '123456:TESTTOKEN-not-real';
const USER_ID = 987654321;

// Reimplementasi signer agar test benar-benar menguji verifier kita,
// bukan implementasi yang sama persis. Keluarannya harus berupa query string
// apa adanya — kalau dibungkus base64url, URLSearchParams tidak akan pernah
// melihat pasangan `hash=` dan test gagal walau verifier-nya benar.
//
// Semua pair wajib ikut ke query string. Kalau hanya `query_id`/`user` yang
// dikeluarkan padahal HMAC dihitung atas seluruh pair, `auth_date` hilang dari
// initData dan verifier menghitung ulang checksum yang berbeda -> signature
// yang sah ikut ditolak.
function sign(payloadPairs) {
  const dataCheckString = Object.entries(payloadPairs)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHash('sha256').update(BOT).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
  return `${new URLSearchParams(payloadPairs).toString()}&hash=${hmac.toString('hex')}`;
}

function goodPairs(over = {}) {
  return {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAH',
    user: JSON.stringify({ id: USER_ID, first_name: 'Budi', username: 'budi' }),
    ...over,
  };
}

test('initData valid menghasilkan user', () => {
  const r = verifyInitData(sign(goodPairs()), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, true);
  assert.equal(r.user.id, USER_ID);
});

test('hash ditolak', () => {
  const bad = sign(goodPairs()).replace(/hash=.*/, 'hash=' + '0'.repeat(64));
  const r = verifyInitData(bad, BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});

test('auth_date kedaluwarsa ditolak', () => {
  const lama = Math.floor(Date.now() / 1000) - 90000;
  const r = verifyInitData(sign(goodPairs({ auth_date: String(lama) })), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('initData kosong dan rusak ditolak', () => {
  assert.equal(verifyInitData('', BOT, {}).reason, 'missing');
  assert.equal(verifyInitData('!!!', BOT, {}).ok, false);
});

test('tanpa field user ditolak', () => {
  const r = verifyInitData(sign({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAH' }), BOT, {});
  assert.equal(r.ok, false);
});

test('token bot salah menolak signature yang mirip', () => {
  const r = verifyInitData(sign(goodPairs()), '999:OTHER', { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test server/telegram.test.js`
Expected: FAIL — `Cannot find module './telegram.js'`

- [x] **Step 3: Write minimal implementation**

Buat `server/telegram.js`:

```javascript
import crypto from 'node:crypto';

// Verifikasi initData Telegram Mini App (HMAC-SHA256).
// docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData, botToken, { maxAgeSeconds = 86400 } = {}) {
  if (typeof initData !== 'string' || !initData.trim()) return { ok: false, reason: 'missing' };
  if (!botToken) return { ok: false, reason: 'bad_signature' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'malformed' };

  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash' && k !== 'signature')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (expected !== hash.toLowerCase()) return { ok: false, reason: 'bad_signature' };

  if (maxAgeSeconds > 0) {
    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate)) return { ok: false, reason: 'malformed' };
    if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
      return { ok: false, reason: 'expired' };
    }
  }

  let raw;
  try {
    raw = JSON.parse(params.get('user'));
  } catch {
    return { ok: false, reason: 'no_user' };
  }
  if (!raw || !Number.isInteger(raw.id)) return { ok: false, reason: 'no_user' };

  return {
    ok: true,
    user: {
      id: raw.id,
      firstName: raw.first_name ?? null,
      lastName: raw.last_name ?? null,
      username: raw.username ?? null,
    },
  };
}
```

> Perbandingan `expected !== hash` memakai perbandingan string biasa, bukan `timingSafeEqual`. Keduanya adalah nilai publik (hash dikirim client), bukan secret — jadi tidak ada timing attack yang relevan. `timingSafeEqual` tetap dipakai di Task 2 untuk `MEJA_TOKENS`, karena di sana token memang rahasia server.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test server/telegram.test.js`
Expected: PASS 6 tests

- [ ] **Step 5: Commit**

```bash
git add server/telegram.js server/telegram.test.js
git commit -m "feat(absen): verifikasi initData Telegram HMAC"
```

---

### Task 2: Jam server WITA & token meja

Dua primitif yang dipakai Task 3. Kecil tapi harus benar — zona waktu salah berarti absen tercatat di tanggal yang salah.

**Files:**
- Create: `server/absen-util.js`
- Test: `server/absen-util.test.js`

**Interfaces:**
- Produces:
  - `witaNow(now = new Date())` → `{ tanggal: 'YYYY-MM-DD', jam: 'HH:MM:SS', isoWita }`
  - `hariIndonesia(now = new Date())` → `'senin' | 'selasa' | ... | 'minggu'` (mengikuti `lokasiabsen.hari`)
  - `isValidMejaToken(token, instansiId)` → `boolean` (baca `MEJA_TOKENS` dari env)

- [x] **Step 1: Write the failing test**

Buat `server/absen-util.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { witaNow, hariIndonesia, isValidMejaToken } from './absen-util.js';

test('witaNow memakai UTC+8 regardless of host timezone', () => {
  // 2026-10-04T17:30:00Z = 2026-10-05 01:30 WITA
  const r = witaNow(new Date('2026-10-04T17:30:00Z'));
  assert.equal(r.tanggal, '2026-10-05');
  assert.equal(r.jam, '01:30:00');
});

test('witaNow tidak bergeser di tengah malam UTC', () => {
  // 2026-10-04T20:00:00Z = 2026-10-05 04:00 WITA
  const r = witaNow(new Date('2026-10-04T20:00:00Z'));
  assert.equal(r.tanggal, '2026-10-05');
  assert.equal(r.jam, '04:00:00');
});

test('witaNow menolak input tidak valid', () => {
  assert.throws(() => witaNow(new Date('bukan tanggal')), /tanggal tidak valid/i);
});

test('hariIndonesia memakai nama yang sama dengan lokasiabsen.hari', () => {
  assert.equal(hariIndonesia(new Date('2026-10-05T00:00:00Z')), 'senin');
  assert.equal(hariIndonesia(new Date('2026-10-04T00:00:00Z')), 'minggu');
  assert.equal(hariIndonesia(new Date('2026-10-09T00:00:00Z')), 'jumat');
});

test('isValidMejaToken menolak token asing dan kosong', () => {
  process.env.MEJA_TOKENS = JSON.stringify({ bapperida: ['RAHASIA-1'] });
  assert.equal(isValidMejaToken('RAHASIA-1', 'bapperida'), true);
  assert.equal(isValidMejaToken('RAHASIA-2', 'bapperida'), false);
  assert.equal(isValidMejaToken('RAHASIA-1', 'dpmptsp'), false);
  assert.equal(isValidMejaToken('', 'bapperida'), false);
  assert.equal(isValidMejaToken(undefined, 'bapperida'), false);
});

test('isValidMejaToken fail-closed saat MEJA_TOKENS rusak', () => {
  process.env.MEJA_TOKENS = 'bukan json';
  assert.equal(isValidMejaToken('apa saja', 'bapperida'), false);
});

test('isValidMejaToken fail-closed saat MEJA_TOKENS kosong', () => {
  delete process.env.MEJA_TOKENS;
  assert.equal(isValidMejaToken('apa saja', 'bapperida'), false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test server/absen-util.test.js`
Expected: FAIL — `Cannot find module './absen-util.js'`

- [x] **Step 3: Write minimal implementation**

Buat `server/absen-util.js`:

```javascript
import crypto from 'node:crypto';

const WITA_OFFSET_MS = 8 * 3600 * 1000;

// T2: nilai resmi tanggal/jam absen berasal dari server, bukan body client.
export function witaNow(now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(ms)) throw new Error('tanggal tidak valid');

  const wita = new Date(ms + WITA_OFFSET_MS);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return {
    tanggal: `${wita.getUTCFullYear()}-${pad(wita.getUTCMonth() + 1)}-${pad(wita.getUTCDate())}`,
    jam: `${pad(wita.getUTCHours())}:${pad(wita.getUTCMinutes())}:${pad(wita.getUTCSeconds())}`,
    isoWita: wita.toISOString(),
  };
}

// Nama hari harus persis sama dengan isi kolom lokasiabsen.hari
// ("senin,selasa,rabu,kamis,jumat"), lowercase, tanpa koma.
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

export function hariIndonesia(now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(ms)) throw new Error('tanggal tidak valid');
  return HARI[new Date(ms + WITA_OFFSET_MS).getUTCDay()];
}

// T3: token meja divalidasi server-side. Tidak ada tabel token di DB,
// jadi sumber kebenaran adalah env MEJA_TOKENS (JSON: instansi -> [token]).
export function isValidMejaToken(token, instansiId) {
  if (typeof token !== 'string' || !token) return false;

  let map;
  try {
    map = JSON.parse(process.env.MEJA_TOKENS || '{}');
  } catch {
    return false; // fail-closed
  }

  const list = map?.[instansiId];
  if (!Array.isArray(list) || list.length === 0) return false;

  const a = Buffer.from(String(token));
  return list.some((t) => {
    const b = Buffer.from(String(t));
    // timingSafeEqual butuh panjang sama, else throw
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test server/absen-util.test.js`
Expected: PASS 7 tests

- [ ] **Step 5: Commit**

```bash
git add server/absen-util.js server/absen-util.test.js
git commit -m "feat(absen): jam server WITA + validasi token meja timing-safe"
```

---

### Task 3: Migrasi database

Harus jalan sebelum endpoint apa pun yang butuh `ID_Log` default.

**Files:**
- Create: `scripts/migration_008_native_absen.sql`

> **Lokasi & nomor:** bukan `migrations/migration_010_*`. Folder `migrations/`
> berisi migrasi domain SIMAPO dengan format `00N_nama.sql` (002–005), sedangkan
> migrasi schema aplikasi (absensi/auth/face) ada di `scripts/` dengan format
> `migration_00N_nama.sql` (003–007). Migration ini memakai `public."Log_Absen"`
> dan `statistik_pegawai`, jadi Domainsaya `scripts/`, nomor berikutnya **008**.

**Interfaces:**
- Consumes: tabel `Log_Absen`, `statistik_pegawai` yang sudah ada
- Produces: kolom baru `Log_Absen.client_jam`; statistik orphan terhapus

> **Schema terverifikasi (lihat `information_schema`, 2026-10-04):**
> `Log_Absen` kolomnya: `ID_Log` (bigint, **sudah punya DEFAULT `nextval('"Log_Absen_ID_Log_seq"')`**), `ID`, `Nama`, `NIP`, `Tanggal` (text), `Jam` (text), `"Jenis Absen"`, `Lokasi`, `Ket`, `koordinat` (text gabungan), `instansi_id`, `pangkat`, `bidang`, `request_id` (UNIQUE).
> **Tidak ada** kolom `PostedDate`, `IP`, `latitude`, `longitude`, `accuracy`, `keterangan`, `tanggal`, `jenis_absen`. Sequence sudah ada — jangan dibuat ulang.

- [x] **Step 1: Tulis migrasi**

Buat `scripts/migration_008_native_absen.sql`:

```sql
-- Native Absensi V5.2 — audit jam client + bersihkan statistik orphan.
-- Idempotent: aman dijalankan ulang.

-- T2: jam resmi (Tanggal/Jam) tetap diisi dari server; nilai yang diklaim
-- client disimpan terpisah supaya bisa diaudit tanpa dipercaya.
ALTER TABLE public."Log_Absen"
  ADD COLUMN IF NOT EXISTS client_jam text;

-- Statistik tanpa pegawai = sisa workflow lama. Bersihkan supaya UPSERT
-- berbasis recompute tidak pernah menghidupkan kembali baris yatim.
DELETE FROM public.statistik_pegawai s
  WHERE NOT EXISTS (SELECT 1 FROM public.user_list u WHERE u."NIP" = s.nip);
```

- [ ] **Step 2: Terapkan migrasi di luar MCP**

`postgres-mcp` **read-only** (`CREATE`/`ALTER`/`DELETE` ditolak), jadi migrasi
tidak bisa dijalankan lewat MCP. `ALTER TABLE` menambah kolom dan mengunci
`Log_Absen` — jalankan di luar jam sibuk:

```bash
# dari mesin yang punya kredensial DB (Coolify shell / psql), bukan via MCP
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration_008_native_absen.sql
```

> **Status 2026-10-04: belum dijalankan — TERBLOKIR.** Dua sebab:
> 1. `psql` tidak terpasang di mesin dev ini (`Get-Command psql` → tidak ada).
> 2. `postgres-mcp` kebetulan juga timeout saat diakses, jadi angka impacted
>    row belum bisa diukur dari sisi sini.
>
> Perlu$: install psql, atau jalankan lewat Coolify shell, atau seeding lewat
> SQL node n8n. **Jangan jalankan tanpa konfirmasi** — `ALTER TABLE` mengunci
> `Log_Absen` penuh selama durasi, dan `DELETE` menghapus baris.

- [ ] **Step 3: Verifikasi sequence bawaan masih sinkron**

Sequence sudah ada, jadi tugasnya memastikan tidak tertinggal dari `max(ID_Log)`:

```sql
SELECT last_value, is_called FROM public."Log_Absen_ID_Log_seq";
SELECT max("ID_Log") FROM public."Log_Absen";
```

Expected: `last_value >= max(ID_Log)`. Kalau belum, samakan sekali saja:

```sql
SELECT setval('public."Log_Absen_ID_Log_seq"', COALESCE((SELECT max("ID_Log") FROM public."Log_Absen"), 1));
```

Lalu verifikasi sisanya — cukup SELECT, ini boleh lewat `postgres-mcp`:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name='Log_Absen' AND column_name='client_jam';
SELECT count(*) AS orphan FROM public.statistik_pegawai s
  WHERE NOT EXISTS (SELECT 1 FROM public.user_list u WHERE u."NIP"=s.nip);
```

Expected: `client_jam` ada, `orphan` = `0`. Jalankan migrasi dua kali — hasil tidak berubah.

- [ ] **Step 4: Commit**

```bash
git add scripts/migration_008_native_absen.sql
git commit -m "feat(absen): kolom client_jam + bersihkan statistik orphan"
```

---

### Task 4: Fungsi validasi absen

Jantung sistem. Fungsi murni: masuk = facts server + payload client, keluar = `{ ok, jenisAbsen, ... }`. Tanpa I/O agar bisa diuji penuh.

**Files:**
- Create: `server/absen-validate.js`
- Test: `server/absen-validate.test.js`

**Interfaces:**
- Consumes: `server/absen-util.js` → `isValidMejaToken(token, instansiId)` dari Task 2
- Produces:
  - `validateAbsen({ payload, serverTime, employee, settings })` → `{ ok: true, jenisAbsen, namaLokasi, keterangan }` | `{ ok: false, kodeTolak, keterangan }`
  - `employee` = `{ id, nip, role, instansi_id, status }` dari `user_list`
  - `settings` = `{ hariIni, jamMasuk, jamPulang, tengahHari, lokasi }`

> **Koreksi terhadap n8n canonical (hasil baca node `Validasi Absen`, 338 baris).**
> Plan versi awal salah pada tiga hal. Semuanya sudah dikoreksi di implementasi — jangan dikembalikan.
>
> 1. **WFH adalah baris `lokasiabsen` bernama `'WFH'`**, bukan flag `payload.wfh`. Baris WFH melewati radius *dan* IP, tetapi **tetap wajib hari kerja**. `payload.wfh` diabaikan sepenuhnya.
> 2. **Empat pita waktu, bukan tiga** — ada `TENGAH_HARI = 12*60`:
>    `<= jamMasuk` → MASUK · `<= 720` → DI LUAR JAM MASUK · `< jamPulang` → DI LUAR JAM PULANG · else PULANG.
>    Operator `<=` lalu `<` memang tidak konsisten, tapi itu yang n8n kirim; mengubahnya diam-diam akan menggeser catatan absensi lama.
> 3. **`PULANG LUAR` tidak melewati cek GPS** (n8n baris 246-249 me-return sebelum blok lokasi).
>    Komentar header n8n (`tidak lagi bypass validasi`) **bertentangan dengan kodenya sendiri**; yang dipakai adalah kodenya.
>    Tetap wajib `keterangan` nonblank — n8n diam-diam memakai default `'Pulang dari lapangan'`.
>
> Plan versi awal mengklaim `PULANG LUAR` wajib lolos radius, dan test-nya memakai `payload.wfh`
> sebagai cara melewati radius. Keduanya bertentangan dengan kode produksi. Keputusan: **parity — tanpa
> cek GPS, keterangan wajib.** Pelajaran: test harus ditulis dari node workflow, bukan dari asumsi.
>
> Yang juga hilang di plan awal dan sekarang ikut diimplementasikan (kehati-hatian anti-fake GPS,
> tidak boleh hilang saat migrasi): `GPS_ACCURACY_ZERO`, `GPS_WEAK`, `GPS_ACCURACY_TOO_PERFECT`,
> `GPS_FAKE_FINGERPRINT`, `KOORDINAT 0,0`, `PEGAWAI_NONAKTIF`, serta `MEJA_TOKEN_INVALID` yang
> mengecek **nilai** token (n8n hanya mengecek keberadaan `body.meja_token` — itu lubang K3).
>
> Gate berbasis DB (`DUPLIKAT_ABSEN` ±1 menit, `SUDAH_ABSEN`, `SUDAH_ADA_KETERANGAN`, `BELUM_MASUK`)
> **tidak** masuk validator murni — ditaruh di router Task 5 yang sudah meng-query `Log_Absen`.

- [x] **Step 1: Write the failing test**

Buat `server/absen-validate.test.js` — 35 test,RED/module missing. Cakupannya:

| Kelompok | Yang diuji |
|---|---|
| `PULANG LUAR` | parity: `skip_radius_check:true` + koordinat jauh → **diterima**, `namaLokasi` `Lapangan`; keterangan wajib; tanpa `skip_radius_check` → dihitung dari jam |
| Radius | `44 m` dari pusat ditolak (bukan default); tepat di dalam diterima |
| Meja (T3) | token salah → `MEJA_TOKEN_INVALID`; benar → `MEJA`; tidak diminta koordinat/accuracy |
| Hari | di luar `lokasiabsen.hari` → `BUKAN_HARI_KERJA`; `hari:''` berlaku semua hari |
| WFH | baris `WFH` bebas radius+IP; hari tetap wajib; `payload.wfh` tanpa baris WFH **tidak** melewati radius |
| `KONTROL` | diprioritaskan, tidak butuh keterangan |
| IP | `/8` overseas ditolak; dalam range diterima; IP persis tanpa prefix diterima |
| Identitas | `NIP_REQUIRED`; `PEGAWAI_NONAKTIF` |
| Koordinat | nonnumerik & `0,0` → `LOKASI_INVALID`, tidak throw |
| Anti-fake GPS | accuracy `0` / `600` / `1,5` tanpa altitude / 4 flag `false` |
| T2 waktu | 7 pita including boundary: `07:15`→MASUK, `12:00`→DI LUAR JAM MASUK, `14:30`→PULANG |
| T2 client | `jam:'23:59'` + `jenis_absen:'PULANG'` diabaikan, jam server yang menentukan |
| Keterangan | `IZIN` whitespace → `KETERANGAN_WAJIB` |

- [x] **Step 2: Run test to verify it fails**

Run: `node --test server/absen-validate.test.js`
Hasil: `ERR_MODULE_NOT_FOUND` — `absen-validate.js` belum ada.

- [x] **Step 3: Write minimal implementation**

Buat `server/absen-validate.js`. Urutan eksekusi:

1. `NIP_REQUIRED` → `PEGAWAI_NONAKTIF`
2. Meja Absen: validasi nilai token → `terima('MEJA', ...)` (short-circuit, tanpa GPS)
3. Anti-fake GPS → koordinat `LOKASI_INVALID`
4. Empat pita dari `serverTime.jam` → override `PULANG LUAR` (perlu `skip_radius_check===true`) & `KONTROL`
5. `KETERANGAN_WAJIB` untuk `PULANG LUAR` / `IZIN` / `SAKIT` / `TUGAS`
6. `PULANG LUAR` → `terima('PULANG LUAR', 'Lapangan')` **tanpa cek lokasi**
7. Filter lokasi by hari → pilih yang radius-nya cocok (WFH lolos) → cek IP kalau `ip_range` terisi

> Source of truth ada di `server/absen-validate.js`, bukan di dokumen ini.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test server/absen-validate.test.js`
Hasil: **35/35 pass**. `npm test` → **182/182 pass**. `npx eslint server/` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/absen-validate.js server/absen-validate.test.js
git commit -m "feat(absen): validasi parity n8n — 4 pita jam server, WFH sebagai baris lokasi, anti-fake GPS"
```
---

### Task 5: Router `/api/absen` + `/api/log` + statistik

Menggabungkan semua pieces. Terlama, tapi satu deliverable yang bisa diuji end-to-end.

**Files:**
- Create: `server/absen.js`
- Test: `server/absen.test.js`

**Interfaces:**
- Consumes: `verifyInitData` (T1), `witaNow`/`isValidMejaToken` (T2), `validateAbsen` (T4), `requireRole` dari `server/auth.js`, `query` dari `server/db.js`
- Produces: `createAbsenRouter({ query, deps })` → Express router

- [ ] **Step 1: Write the failing test**

Buат `server/absen.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BOT = '123456:TESTTOKEN-not-real';
const TG_ID = 987654321;

function signInitData(userId, authDateSec = Math.floor(Date.now() / 1000)) {
  const pairs = {
    auth_date: String(authDateSec),
    query_id: 'AAH',
    user: JSON.stringify({ id: userId, first_name: 'Budi' }),
  };
  const dcs = Object.entries(pairs).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHash('sha256').update(BOT).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const p = new URLSearchParams({ ...pairs, hash });
  return p.toString();
}

// Router Express nyata dipakai supaya supertest tidak perlu dependency baru:
// req/res minimal di-drive langsung lewat handler.
async function callRouter(router, method, url, { body, headers } = {}) {
  const req = { method, url, headers: headers || {}, body: body || {} };
  let status = 200, payload = null;
  const res = {
    statusCode: 200,
    status(c) { status = c; return this; },
    json(p) { payload = p; return this; },
    set() { return this; },
    end() { return this; },
  };
  // Cari handler route yang cocok, lalu panggil chain-nya.
  const layer = router.stack.find((l) => l.route?.path && l.route.methods[method] && url.startsWith(l.route.path));
  if (!layer) throw new Error('route not found: ' + method + ' ' + url);
  const handlers = layer.route.stack;
  let i = 0;
  const next = async (err) => {
    if (err) throw err;
    const h = handlers[i++];
    if (!h) return;
    await h.handle(req, res, next);
  };
  await next();
  return { status, body: payload };
}

// Stub baris sesuai schema asli: lokasiabsen + jam_absen.
const LOC_STUB = {
  id: '1', Nama_Lokasi: 'Kantor Bapperida',
  latitude: -9.6000, longitude: 120.1000,
  hari: 'senin,selasa,rabu,kamis,jumat',
  radius: '30', ip_range: '',
};
const JAM_STUB = { masuk: '7:15', pulang: '14:30' };

// `hari` dibuat mencakup semua hari supaya test tidak bergantung pada hari dijalankan.
const SEMUA_HARI = 'senin,selasa,rabu,kamis,jumat,sabtu,minggu';
const stubQuery = async (sql) => {
  if (/FROM\s+user_list/i.test(sql)) return { rows: [{ id: String(TG_ID), nip: '12345', username: 'Budi', role: 'USER', instansi_id: 'bapperida', pangkat: '', bidang: '' }] };
  if (/FROM lokasiabsen/i.test(sql)) return { rows: [{ ...LOC_STUB, hari: SEMUA_HARI }] };
  if (/FROM jam_absen/i.test(sql)) return { rows: [JAM_STUB] };
  if (/SELECT "Jenis Absen"/i.test(sql)) return { rows: [] };
  if (/ON CONFLICT/i.test(sql)) return { rowCount: 1, rows: [{ id_log: '900' }] };
  return { rows: [], rowCount: 0 };
};

test('POST /api/absen menolak tanpa init_data dengan 401', async () => {
  const { createAbsenRouter } = await import('./absen.js');
  const r = createAbsenRouter({ query: stubQuery });
  const out = await callRouter(r, 'POST', '/api/absen', { body: { nip: '12345' }, headers: { authorization: 'Bearer x' } });
  assert.equal(out.status, 401);
});

test('POST /api/absen menolak init_data yang user_id-nya beda dengan user_list', async () => {
  const { createAbsenRouter } = await import('./absen.js');
  const query = async (sql, params) => {
    if (/FROM\s+user_list/i.test(sql)) return { rows: [{ id: '999', nip: '12345', username: 'Budi', role: 'USER', instansi_id: 'bapperida', pangkat: '', bidang: '' }] };
    return stubQuery(sql, params);
  };
  const r = createAbsenRouter({ query });
  const out = await callRouter(r, 'POST', '/api/absen', {
    body: { nip: '12345', init_data: signInitData(TG_ID) },
    headers: { authorization: 'Bearer x' },
  });
  assert.equal(out.status, 401);
});

test('POST /api/absen menolak init_data kedaluwarsa', async () => {
  const { createAbsenRouter } = await import('./absen.js');
  const r = createAbsenRouter({ query: stubQuery });
  const lama = Math.floor(Date.now() / 1000) - 90000;
  const out = await callRouter(r, 'POST', '/api/absen', {
    body: { nip: '12345', init_data: signInitData(TG_ID, lama) },
    headers: { authorization: 'Bearer x' },
  });
  assert.equal(out.status, 401);
});

test('sukses menulis Log_Absen dengan jam server dan client_jam terpisah', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAbsenRouter } = await import('./absen.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/ON CONFLICT/i.test(sql)) return { rowCount: 1, rows: [{ id_log: '900' }] };
    return stubQuery(sql, params);
  };
  const r = createAbsenRouter({ query, notify: async () => {} });
  const out = await callRouter(r, 'POST', '/api/absen', {
    body: {
      nip: '12345', init_data: signInitData(TG_ID),
      latitude: -9.60005, longitude: 120.10005,
      jam: '99:99:99', keterangan: '', request_id: 'req-abc-1',
    },
    headers: { authorization: 'Bearer x' },
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.validasi.is_valid, true);

  const ins = seen.find((s) => /INSERT INTO "Log_Absen"/i.test(s.sql));
  assert.ok(ins, 'INSERT Log_Absen harus terjadi');
  // params: id, nama, nip, Tanggal, Jam, client_jam, jenis, lokasi, ket, koordinat, instansi, pangkat, bidang, request_id
  assert.match(String(ins.params[3]), /^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus tanggal server');
  assert.match(String(ins.params[4]), /^\d{2}:\d{2}:\d{2}$/, 'Jam harus jam server');
  assert.equal(ins.params[5], '99:99:99', 'jam client disimpan di client_jam');
  assert.ok(!String(ins.params[4]).includes('99:99'), 'jam client tidak boleh jadi nilai resmi');
});

test('request_id yang sama tidak double-record', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAbsenRouter } = await import('./absen.js');
  const query = async (sql, params) => {
    if (/ON CONFLICT/i.test(sql)) return { rowCount: 0, rows: [] }; // conflict
    return stubQuery(sql, params);
  };
  const r = createAbsenRouter({ query, notify: async () => {} });
  const out = await callRouter(r, 'POST', '/api/absen', {
    body: { nip: '12345', init_data: signInitData(TG_ID), latitude: -9.60005, longitude: 120.10005, request_id: 'req-abc-1' },
    headers: { authorization: 'Bearer x' },
  });
  assert.equal(out.body.ok, true);
  assert.match(out.body.message, /Idempotent/);
});

test('kegagalan Telegram tidak menggagalkan absensi', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAbsenRouter } = await import('./absen.js');
  const r = createAbsenRouter({ query: stubQuery, notify: async () => { throw new Error('telegram mati'); } });
  const out = await callRouter(r, 'POST', '/api/absen', {
    body: { nip: '12345', init_data: signInitData(TG_ID), latitude: -9.60005, longitude: 120.10005, request_id: 'req-2' },
    headers: { authorization: 'Bearer x' },
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.validasi.is_valid, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/absen.test.js`
Expected: FAIL — `Cannot find module './absen.js'`

- [ ] **Step 3: Write minimal implementation**

Buat `server/absen.js`:

```javascript
import express from 'express';
import { verifyInitData } from './telegram.js';
import { witaNow, hariIndonesia } from './absen-util.js';
import { validateAbsen } from './absen-validate.js';
import { requireRole, sameInstansi } from './auth.js';
import { query as realQuery } from './db.js';

// Schema terverifikasi 2026-10-04. Nama kolom Log_Absen pakai kapital +
// spasi, jadi selalu diapit kutip ganda.
const EMPLOYEE_SQL = `
  SELECT id::text AS id, "NIP" AS nip, username AS nama, role, instansi_id,
         COALESCE(pangkat, '') AS pangkat, COALESCE(bidang, '') AS bidang
  FROM user_list WHERE "NIP" = $1 LIMIT 1`;

const LOCATIONS_SQL = `
  SELECT id::text, "Nama_Lokasi", latitude, longitude, hari,
         radius::text AS radius, COALESCE(ip_range, '') AS ip_range
  FROM lokasiabsen
  WHERE instansi_id = $1 OR instansi_id = 'all'`;

// jam_absen.key = 'jam_absen_global' adalah sumber batas jam yang sebenarnya.
// (jam_periode hanya berisi periode khusus Limited tanggal, diabaikan di sini.)
const JAM_SQL = `
  SELECT masuk, pulang FROM jam_absen
  WHERE key = 'jam_absen_global' AND instansi_id = $1 LIMIT 1`;

// face_recognition = '0' untuk ketiga instansi dan verifikasi wajah/liveness
// server-side adalah S4 (di luar cakupan, lihat "Rencana Lanjutan"). Jadi tidak
// ada query ke `pengaturan` di sini — menambahkannya tanpa consumer hanya
// jadi dead code. Kalau suatu saat diaktifkan, gate-nya menyusul di scope S4.

const INSERT_SQL = `
  INSERT INTO "Log_Absen"
    ("ID","Nama","NIP","Tanggal","Jam",client_jam,"Jenis Absen","Lokasi","Ket",
     koordinat,"instansi_id","pangkat","bidang",request_id)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  ON CONFLICT (request_id) DO NOTHING
  RETURNING "ID_Log"::text AS id_log`;

// Recompute per hari dari log. Semua counter stats_pegawai yang ada di DB.
const STATS_SQL = `
  INSERT INTO statistik_pegawai
    (nip, instansi_id, total_masuk, total_pulang, total_terlambat, total_lebih_awal,
     akum_menit_terlambat, akum_menit_lebih_awal, total_izin, total_sakit,
     total_tugas, total_tubel, total_cuti, total_alpa, updated_at)
  SELECT $1, $2,
         count(*) FILTER (WHERE "Jenis Absen" = 'MASUK'),
         count(*) FILTER (WHERE "Jenis Absen" = 'PULANG'),
         count(*) FILTER (WHERE "Jenis Absen" = 'DI LUAR JAM MASUK'),
         count(*) FILTER (WHERE "Jenis Absen" = 'DI LUAR JAM PULANG'),
         0, 0,
         count(*) FILTER (WHERE "Jenis Absen" = 'IZIN'),
         count(*) FILTER (WHERE "Jenis Absen" = 'SAKIT'),
         count(*) FILTER (WHERE "Jenis Absen" = 'TUGAS'),
         count(*) FILTER (WHERE "Jenis Absen" = 'TUBE'),
         count(*) FILTER (WHERE "Jenis Absen" = 'CUTI'),
         count(*) FILTER (WHERE "Jenis Absen" = 'ALPA'),
         now()
  FROM "Log_Absen" WHERE "NIP" = $1 AND "Tanggal" = $3
  ON CONFLICT (nip) DO UPDATE SET
    total_masuk = EXCLUDED.total_masuk,
    total_pulang = EXCLUDED.total_pulang,
    total_terlambat = EXCLUDED.total_terlambat,
    total_lebih_awal = EXCLUDED.total_lebih_awal,
    total_izin = EXCLUDED.total_izin,
    total_sakit = EXCLUDED.total_sakit,
    total_tugas = EXCLUDED.total_tugas,
    total_tubel = EXCLUDED.total_tubel,
    total_cuti = EXCLUDED.total_cuti,
    total_alpa = EXCLUDED.total_alpa,
    updated_at = now()`;

const DUPLICATE_SQL = `
  SELECT "Jenis Absen" FROM "Log_Absen"
  WHERE "NIP" = $1 AND "Tanggal" = $2
    AND "Jenis Absen" IN ('MASUK','PULANG')
  ORDER BY "ID_Log" DESC LIMIT 1`;

export function createAbsenRouter({ query = realQuery, notify } = {}) {
  const router = express.Router();

  router.post('/api/absen', async (req, res) => {
    const { nip, init_data: initData, request_id: requestId } = req.body || {};

    if (!req.headers.authorization) {
      return res.status(401).json({ validasi: { is_valid: false, kode_tolak: 'UNAUTHORIZED', keterangan: 'Header Authorization wajib.' } });
    }

    const auth = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN, { maxAgeSeconds: 86400 });
    if (!auth.ok) {
      return res.status(401).json({ validasi: { is_valid: false, kode_tolak: 'AUTH_INVALID', keterangan: 'Bukti identitas tidak valid.' } });
    }

    const employee = (await query(EMPLOYEE_SQL, [nip || ''])).rows[0];
    if (!employee || employee.id !== String(auth.user.id)) {
      return res.status(401).json({ validasi: { is_valid: false, kode_tolak: 'IDENTITAS_COCOK', keterangan: 'Bukti identitas tidak cocok dengan pegawai.' } });
    }

    // Dua query independen → paralel.
    const [lokasiR, jamR] = await Promise.all([
      query(LOCATIONS_SQL, [employee.instansi_id]),
      query(JAM_SQL, [employee.instansi_id]),
    ]);

    const serverTime = witaNow();
    const jam = jamR.rows[0] || {};
    const v = validateAbsen({
      payload: { ...req.body, clientIp: req.ip },
      serverTime,
      employee,
      settings: {
        hariIni: hariIndonesia(new Date()),
        jamMasuk: jam.masuk,
        jamPulang: jam.pulang,
        lokasi: lokasiR.rows,
      },
    });

    if (!v.ok) {
      return res.status(200).json({ validasi: { is_valid: false, kode_tolak: v.kodeTolak, keterangan: v.keterangan } });
    }

    // Duplikasi: jenis yang sama belum boleh terulang di hari yang sama.
    const dup = await query(DUPLICATE_SQL, [employee.nip, serverTime.tanggal]);
    if (dup.rows.length && dup.rows[0]['Jenis Absen'] === v.jenisAbsen) {
      return res.status(200).json({ validasi: { is_valid: false, kode_tolak: 'SUDAH_ABSEN', keterangan: `Anda sudah tercatat ${v.jenisAbsen} hari ini.` } });
    }

    const ins = await query(INSERT_SQL, [
      employee.id,
      employee.nama,
      employee.nip,
      serverTime.tanggal,
      serverTime.jam,
      req.body.jam || null,
      v.jenisAbsen,
      v.namaLokasi,
      v.keterangan || null,
      req.body.latitude != null && req.body.longitude != null
        ? `${req.body.latitude},${req.body.longitude}` : null,
      employee.instansi_id,
      employee.pangkat,
      employee.bidang,
      requestId || null,
    ]);

    if (ins.rowCount === 0) {
      return res.status(200).json({ ok: true, message: 'Data sudah tercatat (Idempotent)' });
    }

    // Statistik: fire-and-forget setelah insert sukses.
    query(STATS_SQL, [employee.nip, employee.instansi_id, serverTime.tanggal]).catch((e) =>
      console.error('[absen] stats gagal', e.message));

    // Notifikasi: fire-and-forget, kegagalan tidak menggagalkan absensi.
    if (notify) {
      Promise.resolve(notify({ chatId: employee.id, text: v.keterangan || `${v.jenisAbsen} tercatat di ${v.namaLokasi}` }))
        .catch((e) => console.error('[absen] notifikasi gagal', e.message));
    }

    return res.status(200).json({
      validasi: { is_valid: true, keterangan: v.keterangan, nama_lokasi: v.namaLokasi },
    });
  });

  router.post('/api/log', requireRole(['ADMIN', 'SUPERADMIN'], { query }), async (req, res) => {
    const b = req.body || {};
    if (!b.id_log && !b.ID_Log) {
      return res.status(400).json({ validasi: { is_valid: false, kode_tolak: 'ID_LOG_REQUIRED', keterangan: 'ID_Log wajib diisi.' } });
    }
    if (!b.tanggal || !b.jam || !b.jenis_absen) {
      return res.status(400).json({ validasi: { is_valid: false, kode_tolak: 'FIELD_REQUIRED', keterangan: 'tanggal, jam, jenis_absen wajib diisi.' } });
    }

    const target = (await query(EMPLOYEE_SQL, [b.nip || ''])).rows[0];
    if (!target) {
      return res.status(404).json({ validasi: { is_valid: false, kode_tolak: 'NIP_NOT_FOUND', keterangan: 'Pegawai tidak ditemukan.' } });
    }
    if (!sameInstansi(req.user, target.instansi_id)) {
      return res.status(403).json({ validasi: { is_valid: false, kode_tolak: 'FORBIDDEN', keterangan: 'Pegawai di luar instansi Anda.' } });
    }

    const idLog = String(b.id_log || b.ID_Log);
    const params = [target.nip, b.tanggal, b.jam, b.jenis_absen, b.keterangan || null, idLog];

    const sql = b.mode === 'insert'
      ? `INSERT INTO "Log_Absen" ("NIP","Tanggal","Jam","Jenis Absen","Ket","instansi_id",request_id,"ID_Log")
         VALUES ($1,$2,$3,$4,$5,$6, gen_random_uuid()::text, $6)
         ON CONFLICT (request_id) DO NOTHING RETURNING "ID_Log"`
      : `UPDATE "Log_Absen" SET "Tanggal"=$2, "Jam"=$3, "Jenis Absen"=$4, "Ket"=$5
         WHERE "NIP"=$1 AND "ID_Log"=$6 RETURNING "ID_Log"`;
    const logParams = b.mode === 'insert'
      ? [target.nip, b.tanggal, b.jam, b.jenis_absen, b.keterangan || null, target.instansi_id, idLog]
      : params;

    const res2 = await query(sql, logParams);
    if (!res2.rowCount) {
      return res.status(404).json({ validasi: { is_valid: false, kode_tolak: 'LOG_NOT_FOUND', keterangan: 'Log tidak ditemukan.' } });
    }

    query(STATS_SQL, [target.nip, target.instansi_id, b.tanggal]).catch((e) =>
      console.error('[absen] stats gagal', e.message));

    return res.status(200).json({ validasi: { is_valid: true, keterangan: 'Log tersimpan.' } });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/absen.test.js`
Expected: PASS 6 tests

- [ ] **Step 5: Mount router di server/index.js**

Buka `server/index.js`, tambahkan import dan mount setelah `createMediaRouter`:

```javascript
import { createAbsenRouter } from './absen.js';
// ...
app.use(createAbsenRouter({ notify: telegramNotify }));
```

Tambahkan fungsi notifikasi di `server/index.js` bila belum ada:

```javascript
async function telegramNotify({ chatId, text }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN tidak diset');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`telegram HTTP ${r.status}`);
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: semua lulus, tidak ada regresi pada `server/media.test.js`

- [ ] **Step 7: Commit**

```bash
git add server/absen.js server/absen.test.js server/index.js
git commit -m "feat(absen): router /api/absen + /api/log + statistik UPSERT in-request"
```

---

### Task 6: Endpoint `/api/auth/session`

Menutup blokir: `auth_sessions` kosong, jadi `/api/log` tidak akan bisa dipakai tanpa ini.

**Files:**
- Create: `server/auth-session.js`
- Test: `server/auth-session.test.js`

**Interfaces:**
- Consumes: `verifyInitData` (T1), `query` dari `server/db.js`
- Produces: `createAuthSessionRouter({ query })` → Express router

- [ ] **Step 1: Write the failing test**

Buat `server/auth-session.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BOT = '123456:TESTTOKEN-not-real';
const TG_ID = 987654321;

function signInitData(userId) {
  const pairs = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAH', user: JSON.stringify({ id: userId, first_name: 'Budi' }) };
  const dcs = Object.entries(pairs).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHash('sha256').update(BOT).digest();
  return new URLSearchParams({ ...pairs, hash: crypto.createHmac('sha256', secret).update(dcs).digest('hex') }).toString();
}

async function drive(router, method, url, body = {}) {
  const req = { method, url, headers: { authorization: 'Bearer x' }, body, ip: '10.0.0.1' };
  let status = 200, payload = null;
  const res = { statusCode: 200, status(c) { status = c; return this; }, json(p) { payload = p; return this; }, set() { return this; }, end() { return this; } };
  const layer = router.stack.find((l) => l.route?.path && l.route.methods[method] && url.startsWith(l.route.path));
  if (!layer) throw new Error('route not found');
  const handlers = layer.route.stack;
  let i = 0;
  const next = async (e) => { if (e) throw e; const h = handlers[i++]; if (h) await h.handle(req, res, next); };
  await next();
  return { status, body: payload };
}

test('K3: role dari body diabaikan, selalu dari user_list', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return { rows: [{ id: String(TG_ID), nip: '12345', role: 'USER', instansi_id: 'bapperida' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'a'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '12345', role: 'SUPERADMIN' });
  assert.equal(out.status, 200);
  const ins = seen.find((s) => /INSERT INTO auth_sessions/i.test(s.sql));
  assert.ok(ins.params.includes('USER'), 'role harus USER dari DB, bukan SUPERADMIN dari body');
});

test('token yang terbit 192 hex huruf kecil', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const query = async (sql) => {
    if (/user_list/i.test(sql)) return { rows: [{ id: String(TG_ID), nip: '12345', role: 'ADMIN', instansi_id: 'bapperida' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'b'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '12345' });
  assert.match(out.body.session_token, /^[0-9a-f]{192}$/);
});

test('NIP tidak dikenal ditolak 404', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => ({ rows: [] }) });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '99999' });
  assert.equal(out.status, 404);
});

test('logout menonaktifkan sesi', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => { seen.push({ sql: String(sql), params }); return { rows: [] }; };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/logout', { session_token: 'c'.repeat(192) });
  assert.equal(out.status, 200);
  assert.ok(seen.some((s) => /is_active\s*=\s*false/i.test(s.sql)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/auth-session.test.js`
Expected: FAIL — `Cannot find module './auth-session.js'`

- [ ] **Step 3: Write minimal implementation**

Buat `server/auth-session.js`:

```javascript
import express from 'express';
import crypto from 'node:crypto';
import { verifyInitData } from './telegram.js';
import { query as realQuery } from './db.js';

const EMPLOYEE_SQL = `
  SELECT id::text AS id, "NIP" AS nip, role, instansi_id
  FROM user_list WHERE "NIP" = $1 LIMIT 1`;

const INSERT_SESSION_SQL = `
  INSERT INTO auth_sessions (session_token, nip, user_id, role, instansi_id, created_at, expires_at, last_used_at, is_active)
  VALUES ($1,$2,$3,$4,$5, now(), now() + interval '12 hours', now(), true)
  RETURNING session_token`;

const DEACTIVATE_SQL = `UPDATE auth_sessions SET is_active = false WHERE session_token = $1`;

export function createAuthSessionRouter({ query = realQuery } = {}) {
  const router = express.Router();

  router.post('/api/auth/session', async (req, res) => {
    const { nip, init_data: initData } = req.body || {};

    // K3: `role` dari body SENGAJA TIDAK dibaca. Role hanya dari user_list.
    const auth = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN, { maxAgeSeconds: 86400 });
    if (!auth.ok) {
      return res.status(401).json({ ok: false, message: 'Bukti identitas tidak valid.' });
    }

    const employee = (await query(EMPLOYEE_SQL, [nip || ''])).rows[0];
    if (!employee || employee.id !== String(auth.user.id)) {
      return res.status(401).json({ ok: false, message: 'Bukti identitas tidak cocok dengan pegawai.' });
    }

    const token = crypto.randomBytes(96).toString('hex');
    const { rows } = await query(INSERT_SESSION_SQL, [token, employee.nip, employee.id, employee.role, employee.instansi_id]);
    if (!rows.length) {
      return res.status(500).json({ ok: false, message: 'Session creation failed' });
    }

    return res.status(200).json({ ok: true, session_token: rows[0].session_token });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const token = req.body?.session_token;
    if (typeof token !== 'string' || !/^[0-9a-f]{192}$/.test(token)) {
      return res.status(400).json({ ok: false, message: 'session_token tidak valid.' });
    }
    await query(DEACTIVATE_SQL, [token]);
    return res.status(200).json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Mount di server/index.js**

```javascript
import { createAuthSessionRouter } from './auth-session.js';
// ...
app.use(createAuthSessionRouter());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test server/auth-session.test.js`
Expected: PASS 4 tests

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: semua lulus

- [ ] **Step 7: Commit**

```bash
git add server/auth-session.js server/auth-session.test.js server/index.js
git commit -m "feat(auth): terbitkan & cabut sesi native, role dari user_list"
```

---

### Task 7: Cutover frontend

**Files:**
- Modify: `js/config.js` (baris ~343, fungsi endpoint)

**Interfaces:**
- Consumes: endpoint dari Task 5 dan Task 6
- Produces: konfigurasi base URL yang menunjuk Express

- [ ] **Step 1: Temukan konfigurasi saat ini**

Run: `grep -n "n8n\|webhook/absen\|log-add\|log-edit\|session-login" js/config.js`

Catat nama variabel yang dipakai (mis. `SERVER_URL`, `SERVER_2`, `ENDPOINT`).

- [ ] **Step 2: Arahkan ke Express**

Ganti agar `/absen`, `/log-*`, dan `/session-login` menunjuk ke base URL Express, dan hapus generator `_signature` karena server tidak memverifikasinya.

Hapus blok ini bila ada:

```javascript
// hapus: signature tidak lagi dipakai server
function generateSignature(...) { ... }
```

Ganti pemanggilnya agar tidak mengirim `_signature`.

- [ ] **Step 3: Verifikasi tidak ada sisa referensi n8n**

Run: `grep -rn "n8n\|webhook/absen\|log-add\|log-edit\|session-login\|_signature" js/ | grep -v node_modules`

Expected: tidak ada hits di `js/` (kecuali komentar yang memang menjelaskan keputusan).

- [ ] **Step 4: Commit**

```bash
git add js/config.js
git commit -m "refactor(frontend): arahkan absen/log/sesi ke Express, buang _signature"
```

---

### Task 8: Dokumentasi & environment

**Files:**
- Create: `docs/native-absen-cutover.md`
- Modify: `.env.example`

- [ ] **Step 1: Tulis runbook cutover**

Buat `docs/native-absen-cutover.md` berisi: urutan migration → deploy → uji `curl` → cutover frontend → nonaktifkan workflow n8n → rotasi secret. Sertakan perintah `curl` untuk `/api/absen`, `/api/log`, `/api/auth/session` beserta contoh payload dan expected output.

- [ ] **Step 2: Tambahkan env baru ke .env.example**

```
TELEGRAM_BOT_TOKEN=
MEJA_TOKENS={"bapperida":["ganti-dengan-token-acak"]}
CORS_ORIGIN=https://domain-anda
```

- [ ] **Step 3: Verifikasi tidak ada secret di repo**

Run: `git grep -nE "TELEGRAM_BOT_TOKEN=[^ ]|MEJA_TOKENS=\{.+" -- ':!.env.example'`

Expected: tidak ada output.

- [ ] **Step 4: Commit**

```bash
git add docs/native-absen-cutover.md .env.example
git commit -m "docs: runbook cutover native absen + env baru"
```

---

## Verifikasi Akhir

- [ ] `npm test` — semua lulus
- [ ] `npx eslint server/` — exit 0
- [ ] Migration idempotent (jalankan 2×, hasil sama)
- [ ] `git status` — tidak ada file `.env` atau `www/` ter-staged

## Rencana Lanjutan (di luar cakupan)

- Migrasi `user_list.face_photo` ke Drive (`face_photo_url`), leveraging `server/media.js` yang sudah ada
- Verifikasi wajah/liveness server-side (S4 masih client-side)
- 25 webhook admin lain (`user-*`, `lokasi-*`, `jam-*`, `libur-*`, `admin-*`) yang masih tanpa auth
