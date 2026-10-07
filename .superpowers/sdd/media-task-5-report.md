# Task 5 Report — Write routes: face photo and signature

Repo `D:\Code\absensi_refactored_v6`, branch `master`.
Deliverable commit: `c1ea4fa` (fix round) on top of `c1290a0` (task implementation).

**Status: DONE_WITH_CONCERNS.**

The task requirements (D-1..D-8) are implemented and pinned, and all six review
findings on `c1290a0` are fixed with real mutation-proven tests. The concerns are
scoped and listed at the end: an unreachable residual asymmetry in the F-5 scope
form (one-clause fix identified, deliberately carried forward), a concurrency
window left as a known cost of Drive-first ordering, and a pre-existing cosmetic
artifact in an untouched comment line.

---

## 1. Scope and baseline

The brief's stated baseline (`91 passing / 0 failing`, `24 in server/media.test.js`)
predates the Task 5 implementation. Task 5 (`c1290a0`) added the router and its
tests, so the correct baseline for this fix round is the state at `c1290a0`:

| Run | at `c1290a0` | after `c1ea4fa` |
|---|---|---|
| `node --test server/media.test.js` | 50 pass / 0 fail | **57 pass / 0 fail** |
| `node --test` (repo root) | 117 pass / 0 fail | **124 pass / 0 fail** |

`+7` tests. One pre-existing test was changed (the `face: UPDATE 0 baris` case moved
from 403 to 500 per the mandated F-2 behavior); every other existing test is
unchanged. All 50 pre-Task-fix media tests still pass against the pre-fix
`media.js` in the mutation run below, which shows the baseline was genuinely 50 and
that the new tests did not loosen anything.

---

## 2. D-1 .. D-8 — what was implemented and how a test pins it

Identifiers below are in `server/media.js` (final, 277 lines).

### D-1 — self-comparison
Implemented in `inScope()` (media.js:50-54): `norm(user.id) === norm(target.id)`
on both sides, where `norm` is `value == null ? '' : String(value)`. `user_list.id`
is `bigint` and Task 4 makes `req.user.id` a string; comparing them raw is the
original defect.
Pinned by **test 25** `face: pemanggil menulis fotonya sendiri -> 200 (regresi D-1)`
and **test 30** `face: user tanpa ('') instansi hanya boleh dirinya sendiri`.
Mutation proof in section 6: breaking the self-comparison reddens test 30 (the case
where `sameInstansi` cannot cover self); the plan's full defect (D-1 + D-3 together)
reddens the named regression test 25.

### D-2 — `canManageAll` is never set
Not added. `requireRole` sets only `{ id, nip, role, instansi_id }`; the router reads
`req.user.role` and calls `sameInstansi` directly (`scopeParams`, media.js:56-58).
There is no field to test in isolation; the behavior is pinned by **test 29**
`face: SUPERADMIN boleh menulis untuk pegawai instansi mana pun` and by the negative
case **test 28** (instansi lain -> 403).

### D-3 — `sameInstansi` argument order
Correct order at media.js:53: `sameInstansi(user, norm(target.instansi_id))`.
Pinned by **test 27** (same instansi -> 200), **test 29** (SUPERADMIN), **test 41**
(signature seinstansi -> 200). Section 6 mutation shows the swapped order reddens
tests 27, 29, 40, 41, 54.

### D-4 — signature route had no authorization
The signature route resolves the target from `user_list` by NIP first
(`SIGNATURE_TARGET_SQL`, media.js:26-29, `LEFT JOIN tanda_tangan`), rejects an
unknown NIP (404) and a duplicate NIP (403, never picks one), then applies the same
`inScope` rule as the face route (media.js:221-225).
Pinned by **test 43** `signature: NIP instansi lain -> 403 dan Drive tidak dipanggil
(regresi D-4)`, plus **test 41** (seinstansi -> 200), **test 45** (unknown -> 404),
**test 46** (duplicate NIP -> 403).

### D-5 — test helper used a deleted export and a rejected token
`parseToken` is gone. The helper `post()` sends a real 192-hex token
(`Authorization: Bearer <TOKEN>`), with a comment stating the header is read by the
test `requireRole`. Pinned by **test 9** `isSessionToken hanya menerima 192 hex huruf
kecil` and **test 11** (legacy `usr_<id>_<ts>` rejected).

### D-6 — internal error text leaked to the client
Every client-facing failure uses a fixed string; the detail goes to `console.error`.
`decodeDataUrl` throws are the one exception and are surfaced on purpose: they are
caller-controlled input validation messages, not internal state.
Pinned by **test 49** `D-6: detail error internal tidak bocor ke klien tapi masuk log
server`, and re-asserted for the DB-unavailable path in the fix-round test F-1
(body must not contain `ECONNREFUSED` or the port).

### D-7 — a bare Drive id in the column silently duplicated the file
Decision (see section 3) implemented in `driveFileId()` (media.js:84-102):
accepts a `/file/d/` URL, a `uc?export=view&id=` URL on a Drive host, or a bare token
matching `/^[-\w]{5,200}$/` that contains a digit; rejects sentinels and non-Drive
hosts (create new instead of a permanent 502).
Pinned by **test 24** `id polos bukan URL -> Apps Script buat duplikat diam-diam`,
**test 47** `URL lama uc?export=view&id=<id> diteruskan`, **test 48** (every stored
shape mapped explicitly, no fall-through), and the fix-round test F-4.

### D-8 — no orphan compensation
Decision (see section 3). Ordering is Drive first, database second. `gasUpsert`
failure -> 502 and zero DB writes (test 36). `gasUpsert` success + DB write failure
-> 500 and `reportOrphan(...)` logs the Drive `fileId`; nothing is deleted.
Pinned by **test 50** `D-8: gagal simpan DB -> 500 pesan tetap, file Drive yatim
tercatat, tidak ada delete`, plus fix-round F-2 / the changed 0-row test (both
routes log the orphan on a 0-row result).

---

## 3. Design decisions and open questions

### Router is not mounted in `server/index.js`
Kept, per the brief. `js/auth.js:386` mints a client-side `tg_<id>_<ts>` token that
is not an `auth_sessions` row and carries `role: 'USER'` (not in `MEDIA_ROLES`).
Mounting before Task 12 and the login fix would 401/403 every Telegram WebApp user.
Creating the router and testing it in isolation is safe. Carried forward to Task 12.

### D-7 decision and justification
For a stored, non-empty, non-`data:` value, `driveFileId` returns a Drive id only
when one is actually there, and `null` (= create a new file) otherwise:

| Stored value | Result |
|---|---|
| `https://drive.google.com/file/d/<id>/view` | `<id>` (via `fileIdFromDriveUrl`) |
| `https://drive.google.com/uc?export=view&id=<id>` | `<id>` |
| bare token `/^[-\w]{5,200}$/` containing a digit | the token |
| `undefined` / `DELETED` / `NOT_SET` | `null` |
| URL on a non-Drive host | `null` |
| `data:...`, empty, whitespace | `null` |

Justification, from live read-only queries:

- `tanda_tangan` has **48 rows, all 48** matching
  `^https://drive\.google\.com/uc\?export=view&id=`, **0** containing `/file/d/`,
  **0** empty. `fileIdFromDriveUrl` matches only `/file/d/`, so without the `?id=`
  branch every signature re-upload would silently create a second Drive file. The
  `?id=` branch is load-bearing for production today.
- The bare-id branch exists because a non-empty, non-`data:`, non-URL value is
  ambiguous; treating it as a Drive id (when it is shaped like one) is the
  overwrite-preserving choice, and Task 3's reviewer flagged exactly this.
- The digit requirement rejects the sentinel words. Passing `'undefined'` to
  `DriveApp.getFileById()` throws inside Apps Script, which surfaces as a permanent,
  un-actionable 502 for that employee. Failure direction matters: `null` = create a
  new file (storage cost, availability preserved); the alternative = the employee
  can never save media (availability lost).
- Non-Drive hosts are rejected for the same reason: Code.gs already fail-closes on
  files outside the operator folder, so this is an availability guard, not security.

### Orphan window (D-8) decision
Drive and PostgreSQL cannot be made atomic from here, and the brief fixes the
ordering (Drive first). In the window where `gasUpsert` succeeds and the DB write
does not, the route returns 500 and logs
`[media/<tag>] <reason>, file Drive yatim fileId=<id>` — the same sentence shape for
both orphan classes (DB error, and 0 rows). It never deletes. Rationale: a wrong
delete is worse than an orphan, and an unreported orphan is the actual bug. The 0-row
class is an invariant violation, not authorization: authorization is decided by
`inScope` before upload and returns 403. After the F-5 normalization, a 0-row result
means the `WHERE` clause and the JS rule disagree (e.g. `instansi_id` changed between
the SELECT and the UPDATE), which is a 500 and is logged.

### Other decided questions
- Unknown NIP -> **404** (test 45), distinguished from 403. A duplicate NIP in
  `user_list` -> **403**, never an arbitrary pick (test 46).
- Caller with `instansi_id = ''` writes **only their own** media; `sameInstansi`
  fails closed, so this is enforced both in JS and in the SQL `WHERE` (test 30).

---

## 4. Fix round — review findings on `c1290a0`

All six findings fixed in `c1ea4fa`. `server/media.js` + `server/media.test.js` only.

| ID | Severity | Fix | Test |
|---|---|---|---|
| F-1 | CRITICAL | Whole async handler body wrapped in `try/catch` (both routes); unexpected rejection -> 503, detail logged | `F-1: lookup target menolak -> 503...` |
| F-2 | MEDIUM | 0-row branch logs the orphan `fileId` (same shape as catch) and returns **500**, not a silent 403 | changed `face: UPDATE 0 baris...` + new `F-2: signature upsert 0 baris...` |
| F-3 | MEDIUM | `targetUserId()` accepts only a safe positive integer or a pure `/^[1-9]\d*$/` string; value stays text | `F-3` x2 (coercion rejected; >2^53 exact) |
| F-4 | LOW | `driveFileId()` rejects sentinels and non-Drive `?id=` hosts; `uc?export=view&id=` kept | `F-4: kata sentinel dan ?id= non-Drive...` |
| F-5 | LOW | Scope `WHERE` uses `COALESCE("instansi_id",'') IS NOT DISTINCT FROM $n` in both statements | `F-5: scope SQL dinormalisasi...` + `F-5: kasus luar-instansi biasa tetap 403...` |
| — | — | Report (this file) | — |

**F-1** (the CRITICAL). Pre-fix, `await query(...)` sat outside any `try`, so a
rejected lookup escaped as an `unhandledRejection` (Express 4 does not forward async
rejections) — the request hung, or the process died. Fixed by wrapping the entire
handler; a new test asserts the response is 503, the request does not hang (a 2 s
deadline turns a hang into a red test rather than an infinite one), no internal
detail leaks, and no rejection escapes (`process.on('unhandledRejection')` probe).
Mutation evidence in section 6 shows the pre-fix code fails this test with
`failureType: 'unhandledRejection'` at `media.js:86`.

**F-5** changed `WHERE "instansi_id" IS NOT DISTINCT FROM $n` to
`COALESCE("instansi_id",'') IS NOT DISTINCT FROM $n` in both writes. Live proof
(read-only): `('' IS NOT DISTINCT FROM '')` = true;
`(NULL::text IS NOT DISTINCT FROM '')` = false (old form);
`(COALESCE(NULL::text,'') IS NOT DISTINCT FROM '')` = true (new form);
`COALESCE('bapperida','') IS NOT DISTINCT FROM 'bapperida'` = true;
`... 'dpmptsp'` = false. Ordering is also pinned: `params[5]/[3]` is the scope string
and `params[6]/[4]` is `role === 'SUPERADMIN'`.

---

## 5. Verification (raw output)

```
$ git log --oneline -2
c1ea4fa fix(media): tutup rejection yang lolos, samakan scope SQL, ketatkan user_id + Drive id
c1290a0 feat(media): router tulis foto wajah + tanda tangan (Task 5)

$ git show --stat HEAD
commit c1ea4fa2a283c33be4e07ef266dac504f38e898c
 server/media.js      | 273 ++++++++++++++++++++++++++++++++++-----------------
 server/media.test.js | 188 +++++++++++++++++++++++++++++++++--
 2 files changed, 363 insertions(+), 98 deletions(-)

$ node --test server/media.test.js
# tests 57
# pass 57
# fail 0

$ node --test            # repo root
# tests 124
# pass 124
# fail 0
```

No tracked working-tree changes remain (only pre-existing untracked files, including
`.superpowers/`). This report is **not** committed, as the brief requires; note it is
also **not** gitignored.

Hashes for the committed artifacts (working tree):
`server/media.js` git blob `5531d2f0137ef925a3be9c71c8dee5d4518fd9b6`,
sha256 `6fe546e5eacb065fadaa1b6d8bd450c0ec3115f941f7ed114005a42214ded448`;
`server/media.test.js` sha256 `5f1220ee69bc829623218ec8ae42a222e0df4e570504dafb2c29f0540cbd48a5`.

---

## 6. Mutation proofs

All mutations are applied to a scratch copy under the repo root (so ESM resolves
`express`), then removed.

### 6a. The six review findings — new tests vs. pre-fix `media.js`
Ran the **final test file** against **`c1290a0`'s `media.js`** (`git show
HEAD~1:server/media.js`). Exactly the fix tests go red; all 50 pre-existing tests
stay green:

```
not ok 38 - face: UPDATE 0 baris -> 500 + fileId yatim tercatat (bukan 403 senyap)
not ok 51 - F-1: lookup target menolak -> 503, tidak menggantung, tidak ada rejection lolos
not ok 52 - F-2: signature upsert 0 baris -> 500 + fileId yatim tercatat
not ok 53 - F-3: user_id yang dipaksa Number() ditolak 400, tanpa menyentuh database
not ok 54 - F-3: user_id > 2^53 diteruskan persis sebagai teks, tanpa pembulatan
not ok 55 - F-4: kata sentinel dan ?id= non-Drive tidak pernah jadi fileId
not ok 56 - F-5: scope SQL dinormalisasi COALESCE di kedua statement, parameternya teks
# tests 57   # pass 50   # fail 7
```

F-1's failure is the measured defect, not an incidental mismatch:

```
not ok 51 - F-1: lookup target menolak -> 503, tidak menggantung, tidak ada rejection lolos
  failureType: 'unhandledRejection'
  error: 'connect ECONNREFUSED 127.0.0.1:5432'
  stack:
    query (media.test.js:984:19)
    query (media.test.js:560:25)
    media.js:86:27                       <-- unguarded await query (pre-fix)
    Layer.handle [as handle_request] (express/lib/router/layer.js:95:5)
```

### 6b. D-1 (self-comparison) — brief-mandated
Mutation: `if (norm(user.id) === norm(target.id)) return true;`
-> `if (Number(user.id) === target.id) return true;` (number vs string).

```
applied mutation D1
not ok 30 - face: user tanpa ('') instansi hanya boleh dirinya sendiri
# tests 57   # pass 56   # fail 1
```

Test 30 is the case where `sameInstansi` fails closed and only the self-comparison
can allow the write, so it isolates the clause. The brief's named D-1 regression
test (test 25, self within the same instansi) is additionally covered by
`sameInstansi`; in the plan's original code it went red because D-3 also swapped the
`sameInstansi` arguments — proven by 6d.

### 6c. D-4 (signature scope) — brief-mandated
Mutation: the signature route's `if (!inScope(req.user, target)) return fail(...403)`
removed.

```
applied mutation D4
not ok 43 - signature: NIP instansi lain -> 403 dan Drive tidak dipanggil (regresi D-4)
# tests 57   # pass 56   # fail 1
```

Note: the SQL `WHERE` still contains the scope predicate, so with only the JS check
removed the out-of-instansi upsert matches 0 rows and the route returns 500 rather
than leaking — defence in depth held. The test still goes red because the contract
changed (403 -> 500), confirming it is load-bearing.

### 6d. D-3 (argument order) — supplementary
Mutation: `sameInstansi(user, norm(target.instansi_id))` -> swapped arguments.

```
applied mutation D3
not ok 27 - face: pegawai lain dalam instansi yang sama -> 200
not ok 29 - face: SUPERADMIN boleh menulis untuk pegawai instansi mana pun
not ok 40 - face: nama file Drive memakai NIP dari user_list, bukan dari body
not ok 41 - signature: NIP seinstansi -> 200 dan upsert berdasarkan nip
not ok 54 - F-3: user_id > 2^53 diteruskan persis sebagai teks, tanpa pembulatan
# tests 57   # pass 52   # fail 5
```

---

## 7. SQL strings executed

Four statements, all parameterized, all in `server/media.js`.

`FACE_TARGET_SQL` (media.js:9-10)
```sql
SELECT "id"::text AS id, "NIP" AS nip, "instansi_id", "face_photo"
  FROM "user_list" WHERE "id" = $1::bigint
```

`FACE_UPDATE_SQL` (media.js:20-24); `$6` = normalized scope, `$7` = `SUPERADMIN`
```sql
UPDATE "user_list"
  SET "face_photo" = $5, "face_descriptor" = $2, "face_saved_at" = $3,
      "face_model" = $4, "updated_at" = NOW()
  WHERE "id" = $1::bigint
    AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $6 OR $7::boolean)
```

`SIGNATURE_TARGET_SQL` (media.js:26-29)
```sql
SELECT u."id"::text AS id, u."NIP" AS nip, u."instansi_id", t.signature
  FROM "user_list" u
  LEFT JOIN "tanda_tangan" t ON t.nip = u."NIP"
  WHERE UPPER(u."NIP") = UPPER($1)
```

`SIGNATURE_UPSERT_SQL` (media.js:34-39); `$4` = normalized scope, `$5` = `SUPERADMIN`
```sql
INSERT INTO "tanda_tangan" ("nip","signature","saved_by","saved_at","updated_at")
  SELECT $1, $2, $3::bigint, NOW(), NOW()
  FROM "user_list"
  WHERE "NIP" = $1 AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $4 OR $5::boolean)
  ON CONFLICT ("nip") DO UPDATE SET "signature" = EXCLUDED."signature",
    "saved_by" = EXCLUDED."saved_by", "updated_at" = NOW()
```

Read-only verification queries run via `postgres-mcp_query` (no writes):
- `information_schema.columns` for `user_list.id` (`bigint`, NOT NULL) and
  `user_list.instansi_id` (`text`, **nullable**).
- `IS NOT DISTINCT FROM` / `COALESCE` probes (results in section 4, F-5).
- `user_list`: 47 rows, 0 NULL `instansi_id`, 0 empty, `max(id)` = 9999999999.
- `tanda_tangan`: 48 rows, 48 matching `uc?export=view&id=`, 0 `/file/d/`, 0 empty.

---

## 8. Deliberately not done / carried forward

- **Not mounted in `server/index.js`** — gated behind Task 12 and the login fix
  (`js/auth.js:386`). See section 3.
- **No rollback/delete for orphaned Drive files** — intentional (D-8).
- **Blast-radius awareness for F-5's normalization.** Fix helpers touch shared
  behavior: `inScope`/`scopeParams` (both routes) and `driveFileId` (both routes).
  This is the root-cause fix rather than a per-route guard, but it means both routes
  are affected by any future change to those helpers.
- **F-5 residual asymmetry (known, unreachable via these routes).**
  `'' IS NOT DISTINCT FROM ''` is true, so the normalized SQL still permits a
  non-self `'' -> ''` write that `inScope()` denies. It is unreachable on these two
  routes because `inScope()` runs first (403) before upload, and the SQL is only
  defence in depth; defence-in-depth predicates are allowed to be looser than the JS
  gate, never looser than the security boundary. If strict equivalence is wanted
  later, one clause does it: `AND ("id" = $callerId::bigint OR COALESCE(...))`. Left
  out here to avoid changing behavior beyond the review's scope.
- **Concurrency window.** No guard against two concurrent uploads for the same
  employee interleaving SELECT/UPDATE; last write wins and a prior orphan may be
  left untracked beyond its log line. A per-key lock is out of scope for this task.
- **UI/UX / i18n / docs** — untouched.
- **Pre-existing cosmetic artifact (not fixed, not mine).**
  `server/media.test.js:694` contains a single non-Indonesian character middle
  (present in `c1290a0`). It is inside an untouched comment; fixing it would be
  unrelated churn to a passing test's wording, so it was left as found.

---

## Appendix — final source of `server/media.js`

```js
import express from 'express';
import { decodeDataUrl, fileIdFromDriveUrl } from './media-payload.js';
import { sameInstansi } from './auth.js';

// Router ini SENGAJA belum dipasang di server/index.js: js/auth.js:386 membuat
// token 'tg_<id>_<ts>' sendiri (bukan auth_sessions), jadi dipasang sebelum Task 12
// akan memblokir semua pengguna Telegram WebApp.

const FACE_TARGET_SQL = `SELECT "id"::text AS id, "NIP" AS nip, "instansi_id", "face_photo"
  FROM "user_list" WHERE "id" = $1::bigint`;

// COALESCE("instansi_id",'') itu wajib, bukan gaya: user_list.instansi_id nullable, dan
// tanpa normalisasi kedua sisi WHERE ini tidak ekuivalen dengan inScope() di JS dalam
// ARAH MANA pun. ('' IS NOT DISTINCT FROM '') -> true, jadi SQL dulu menganggap setiap
// user tanpa instansi boleh menulis media user tanpa instansi; (NULL IS NOT DISTINCT
// FROM '') -> false, jadi SQL dulu menolak apa yang JS izinkan (mis. menulis untuk
// diri sendiri dengan instansi_id NULL). Klausa ini ada supaya jadi defence in depth —
// route berikutnya yang lupa memanggil inScope() tetap terkunci WHERE-nya sendiri — jadi
// ekuivalensi itu syarat, bukan sesuatu yang harus diasumsikan.
const FACE_UPDATE_SQL = `UPDATE "user_list"
  SET "face_photo" = $5, "face_descriptor" = $2, "face_saved_at" = $3,
      "face_model" = $4, "updated_at" = NOW()
  WHERE "id" = $1::bigint
    AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $6 OR $7::boolean)`;

const SIGNATURE_TARGET_SQL = `SELECT u."id"::text AS id, u."NIP" AS nip, u."instansi_id", t.signature
  FROM "user_list" u
  LEFT JOIN "tanda_tangan" t ON t.nip = u."NIP"
  WHERE UPPER(u."NIP") = UPPER($1)`;

// Dipicu user_list supaya scope ikut jadi WHERE (bukan hanya if di JS), dan ON
// CONFLICT mengikuti index unik tanda_tangan_nip_key. saved_at/updated_at timestamptz
// -> NOW() langsung, tanpa ::text. COALESCE di WHERE: sama seperti FACE_UPDATE_SQL.
const SIGNATURE_UPSERT_SQL = `INSERT INTO "tanda_tangan" ("nip","signature","saved_by","saved_at","updated_at")
  SELECT $1, $2, $3::bigint, NOW(), NOW()
  FROM "user_list"
  WHERE "NIP" = $1 AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $4 OR $5::boolean)
  ON CONFLICT ("nip") DO UPDATE SET "signature" = EXCLUDED."signature",
    "saved_by" = EXCLUDED."saved_by", "updated_at" = NOW()`;

const ok = (res, body) => res.json({ ok: true, ...body });
const fail = (res, code, message) => res.status(code).json({ ok: false, message });

function norm(value) {
  return value == null ? '' : String(value);
}

// Self selalu boleh (kecuali tanpa req.user). Target scope null -> '' supaya
// sameInstansi() tidak fail-open di endpoint global (kolomnya nullable).
function inScope(user, target) {
  if (!user) return false;
  if (norm(user.id) === norm(target.id)) return true;
  return sameInstansi(user, norm(target.instansi_id));
}

function scopeParams(user) {
  return [norm(user?.instansi_id), user?.role === 'SUPERADMIN'];
}

// Bentuk produksi 48/48 baris tanda_tangan = uc?export=view&id=<id>, yang tidak
// dikenali fileIdFromDriveUrl (/file/d/ saja). Tanpa cabut id di sini tiap upload
// membuat file Drive kedua. Batas {5,200} dikunci FILE_ID_RE di Code.gs.
const DRIVE_LIKE_TOKEN = /^[-\w]{5,200}$/;

// Host Google yang memang menyajikan file Drive. Nilai kolom yang bisa diurai jadi
// URL tapi hosnya di sini berarti BUKAN file Drive kita: meneruskan id-nya hanya
// membuat DriveApp.getFileById() melempar di dalam Apps Script, yang muncul sebagai
// 502 permanen untuk pegawai itu dan tidak bisa ditindaklanjuti. Code.gs sudah
// fail-closed soal ini (folder operator dicek lewat parents), jadi ini soal
// ketersediaan layanan, bukan otorisasi.
function isDriveHost(host) {
  const h = host.toLowerCase();
  return h === 'google.com' || h.endsWith('.google.com') || h.endsWith('.googleusercontent.com');
}

// Kata sentinel ('undefined', 'DELETED', 'NOT_SET') juga lolos pola id polos, dan
// meneruskannya ke Apps Script = 502 permanen. Id Drive selalu memuat digit (dasar
//nya base64-ish dari server Drive), jadi "ada digit" membedakan keduanya tanpa
// daftar id yang harus/raw dan bisa basi.
function looksLikeDriveId(value) {
  return DRIVE_LIKE_TOKEN.test(value) && /\d/.test(value);
}

function driveFileId(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;

  let url;
  try {
    url = new URL(s);
  } catch {
    url = null;
  }

  if (!url) return looksLikeDriveId(s) ? s : null;
  if (!isDriveHost(url.hostname)) return null;

  const canonical = fileIdFromDriveUrl(s);
  if (canonical) return canonical;
  const query = /[?&]id=([-\w]{5,200})(?=$|[&#])/.exec(s);
  return query ? query[1] : null;
}

// user_list.id itu bigint dan Postgres menyimpan presisi penuh. Number() dulu
// menerima apa saja ([5] -> 5, true -> 1, '0x2a' -> 42, '1e3' -> 1000) dan, lebih
// serius, membulatkan diam-diam di atas 2^53: request untuk 9007199254740993 menulis
// ke 9007199254740992. Itu target yang salah, murni kesalahan koersi sisi server.
// Jadi hanya number yang integer AMAN atau string digit polos, dan nilainya tetap
// teks selamanya supaya tidak pernah menyentuh pembulatan float.
function targetUserId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  // Regex ini juga yang menolak ' 42 ', '0x2a', '1e3', '', dan apa pun non-string
  // (array, boolean, object) — tidak ada normalisasi yang diam-diam mengubah bentuk.
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  return null;
}

async function upload(gasUpsert, { filename, mimeType, buffer, fileId }) {
  return gasUpsert({
    filename,
    mimeType,
    dataBase64: buffer.toString('base64'),
    fileId: fileId || null,
  });
}

// D-8: gasUpsert sudah jadi, jadi file Drive ADA di sana walau penulisan DB ditolak.
// Dua kelas yatim — error dan 0 baris — dicatat dengan bentuk kalimat yang sama
// supaya operator bisa merekonsiliasi keduanya, dan kelas yatim yang hilang
// dari log adalah bug. Delete TIDAK dicoba: file yang salah dihapus lebih buruk dari
// file yatim.
function reportOrphan(tag, fileId, why, e) {
  console.error(`[media/${tag}] ${why}, file Drive yatim fileId=${fileId}`, ...(e ? [e] : []));
}

export function createMediaRouter({ query, gasUpsert }) {
  const router = express.Router();

  router.post('/face', async (req, res) => {
    // SELURUH isi handler ada DI DALAM try, jadi fungsi async ini tidak pernah
    // menolak: Express 4 tidak meneruskan rejected promise ke error handler, dan
    // penolakan yang lolos ke sini akan menggantung request itu selamanya — atau,
    // tanpa listener unhandledRejection, mematikan proses beserta /health dan
    // semua request lain. Pola yang sama dan alasan yang sama di auth.js:64-85.
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      const targetId = targetUserId(req.body?.user_id);
      if (!targetId) {
        return fail(res, 400, 'user_id harus integer positif');
      }

      const target = (await query(FACE_TARGET_SQL, [targetId])).rows[0];
      if (!target) return fail(res, 404, 'Pengguna tidak ditemukan');
      if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');

      let image;
      try {
        image = decodeDataUrl(req.body?.foto_base64);
      } catch (e) {
        return fail(res, 400, e.message);
      }

      const ext = image.mimeType.split('/')[1] || 'png';
      const filename = `face-${target.id}-${target.nip}.${ext}`;
      const previous = driveFileId(target.face_photo);

      let uploaded;
      try {
        uploaded = await upload(gasUpsert, {
          filename,
          mimeType: image.mimeType,
          buffer: image.buffer,
          fileId: previous,
        });
      } catch (e) {
        console.error('[media/face] gasUpsert gagal', e);
        return fail(res, 502, 'Layanan penyimpanan sedang bermasalah');
      }

      try {
        const result = await query(FACE_UPDATE_SQL, [
          targetId,
          JSON.stringify(req.body?.face_descriptor ?? null),
          req.body?.saved_at || new Date().toISOString(),
          req.body?.face_model ?? null,
          uploaded.url,
          ...scopeParams(req.user),
        ]);
        if (result.rows.length === 0) {
          // 0 baris SETELAH inScope() mengizinkan = invarian WHERE dilanggar (mis.
          // instansi_id berubah antara SELECT dan UPDATE), bukan penolakan otorisasi
          // biasa — yang itu sudah tertangkap di atas dan balasnya 403. Jadi laporkan
          // sebagai 500 dan catat fileId-nya, jangan disamarkan jadi 403 yang tenang.
          reportOrphan('face', uploaded.fileId, 'UPDATE 0 baris, invarian scope dilanggar');
          return fail(res, 500, 'Gagal menyimpan foto');
        }
      } catch (e) {
        reportOrphan('face', uploaded.fileId, 'simpan DB gagal', e);
        return fail(res, 500, 'Gagal menyimpan foto');
      }

      return ok(res, { photoUrl: uploaded.url, fileId: uploaded.fileId });
    } catch (e) {
      // 503, bukan 500: ECONNREFUSED atau pool habis berarti "database tidak tersedia",
      // dan itulah yang sebenarnya terjadi. Detail tetap masuk log server (D-6).
      console.error('[media/face] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  router.post('/signature', async (req, res) => {
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      const wanted = String(req.body?.nip ?? '').trim();
      if (!wanted) return fail(res, 400, 'nip wajib diisi');

      const rows = (await query(SIGNATURE_TARGET_SQL, [wanted])).rows;
      if (rows.length === 0) return fail(res, 404, 'Pengguna tidak ditemukan');
      if (rows.length > 1) return fail(res, 403, 'Forbidden');
      const target = rows[0];
      if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');

      let image;
      try {
        image = decodeDataUrl(req.body?.signature);
      } catch (e) {
        return fail(res, 400, e.message);
      }

      const ext = image.mimeType.split('/')[1] || 'png';
      const filename = `signature-${target.id}-${target.nip}.${ext}`;
      const previous = driveFileId(target.signature);

      let uploaded;
      try {
        uploaded = await upload(gasUpsert, {
          filename,
          mimeType: image.mimeType,
          buffer: image.buffer,
          fileId: previous,
        });
      } catch (e) {
        console.error('[media/signature] gasUpsert gagal', e);
        return fail(res, 502, 'Layanan penyimpanan sedang bermasalah');
      }

      try {
        const result = await query(SIGNATURE_UPSERT_SQL, [
          target.nip,
          uploaded.url,
          String(req.user.id),
          ...scopeParams(req.user),
        ]);
        if (result.rows.length === 0) {
          // Sama seperti /face: setelah normalisasi COALESCE, 0 baris = invarian
          // scope yang jebol, bukan penolakan otorisasi.
          reportOrphan('signature', uploaded.fileId, 'upsert 0 baris, invarian scope dilanggar');
          return fail(res, 500, 'Gagal menyimpan tanda tangan');
        }
      } catch (e) {
        reportOrphan('signature', uploaded.fileId, 'simpan DB gagal', e);
        return fail(res, 500, 'Gagal menyimpan tanda tangan');
      }

      return ok(res, { signature: uploaded.url, fileId: uploaded.fileId });
    } catch (e) {
      console.error('[media/signature] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  return router;
}
```
