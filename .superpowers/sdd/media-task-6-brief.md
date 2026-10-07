# Task 6 Brief — Read routes and authenticated image proxy (CORRECTED)

Source of truth: `docs/superpowers/plans/2026-10-02-media-drive.md` Task 6 (lines 1169–1436),
corrected against as-built Task 4 (`server/auth.js`) and Task 5 (`server/media.js`).
**Do not copy the plan's code blocks verbatim — they are stale. This brief wins.**

## Why this correction exists

The plan was written before Tasks 4 and 5 landed. It calls helpers and token formats that no
longer exist, and its `/raw/:fileId` ownership check silently 404s on 100% of real signatures.
Audited 2026-10-03.

## Files

- Modify: `server/media.js`
- Modify: `server/media.test.js`
- Do NOT modify: `server/auth.js`, `server/db.js`, `server/index.js`, `server/gas.js`,
  `server/media-payload.js`, `js/**`, `www/**`, `dist/**`, Docker/Coolify files, `.env*`.

## Interfaces to produce

Mounted under the existing router prefix (Task 5 established `router`):

- `GET /face/:user_id` → `{ ok, photoUrl }`
- `GET /signature/:nip` → `{ ok, signature }`
- `GET /signatures` → `{ ok, rows: [{ nip, signature }] }`
- `GET /raw/:fileId` → raw image bytes

## MANDATORY corrections (read before writing any code)

### C-1 — Auth: `canManageAll` does not exist

Task 4 deleted `req.user.canManageAll`. The plan still uses it at four places. Replace every one:

```js
// WRONG (plan):  if (!req.user.canManageAll && !sameInstansi(...))
const isSuper = req.user.role === 'SUPERADMIN';
```

Use `isSuper` consistently in `/face/:user_id`, `/signature/:nip`, `/signatures`, `/raw/:fileId`.
Do not reintroduce a `canManageAll` property, getter, or alias.

### C-2 — Auth: `sameInstansi` argument order

Task 4's signature is `sameInstansi(user, targetInstansiId)` — the **user object first**.
The plan passes `(req.user.instansi_id, rows[0].instansi_id)`, which silently compares two
strings and will not throw, so this fails open rather than erroring. Always:

```js
sameInstansi(req.user, rows[0].instansi_id)
```

### C-3 — Auth: test tokens must be real opaque sessions

The plan's `get()` helper sends `Authorization: Bearer usr_${USER_ID}_1`. That legacy format was
removed in Task 4; `requireRole` expects a **192-hex opaque token**. Every test request must carry
a syntactically valid opaque token. See "Test harness" below for how to mint one.

### C-4 — `:user_id` must not go through `Number()`

`user_list.id` is `bigint`. Task 5 (finding D-3) established that `Number()` silently loses
precision above 2^53 and that arrays/booleans/hex strings must be rejected with 400.
Reuse the same strict digit-string parse Task 5 uses for target IDs. Do not introduce
`Number(req.params.user_id)`.

### C-5 — CRITICAL: `/raw/:fileId` ownership check 404s on every real signature

The plan builds one LIKE needle:

```js
const needle = `%/file/d/${fileId}/%`;   // ONLY matches the canonical form
```

But **all 48** live `tanda_tangan.signature` rows are stored as:

```
https://drive.google.com/uc?export=view&id=<FILE_ID>
```

`LIKE '%/file/d/<id>/%'` matches none of them. As written, `/raw/:fileId` returns 404 for every
real signature in the database. This is the same URL-shape class of bug Task 5 fixed on the write
path (finding D-7).

The ownership query MUST match **both** stored shapes. Use two needles and an OR, or one needle
per URL form:

```sql
SELECT u."instansi_id" FROM "user_list" u
 WHERE u."face_photo" LIKE $1 OR u."face_photo" LIKE $2
UNION
SELECT u."instansi_id" FROM "tanda_tangan" t
  JOIN "user_list" u ON u."nip" = t."nip"
 WHERE t."signature" LIKE $1 OR t."signature" LIKE $2
 LIMIT 50
```

with `$1 = '%/file/d/<id>/%'` and `$2 = '%export=view&id=<id>%'`.

**Required test:** a row whose `signature` is the real `uc?export=view&id=` shape must be found by
the ownership query and proxied. Without this test the bug ships again.

Note `face_photo` is currently a `data:` URL for 25 rows; those will not match either needle. That
is expected and correct — the raw proxy serves Drive files, and Task 12 migrates the data URLs to
Drive first. Do not widen the needle to match `data:` URLs.

### C-6 — Reuse `driveFileId` instead of a new bare-ID regex

The plan validates with `/^[\w-]{5,200}$/`. Task 5 introduced `driveFileId()` in
`server/media-payload.js`, which is host-anchored and already rejects sentinels, non-Drive query
IDs, and non-ID sentinels. Reuse it. Do not add a second, weaker file-ID regex.

### C-7 — Test counts in the plan are stale

The plan says "Expected: 25 passing" and "84 passing". Those predate Task 5. Baseline entering
Task 6 is **57 passing** in `server/media.test.js` and **124 passing** for `npm test`. Report
actual numbers; do not assert the plan's numbers.

### C-8 — The plan's `getRaw` helper is three contradictory drafts

Plan lines 1245–1283 show a placeholder, then a `Map`-based stub, then a `Headers`-based stub.
Only the last is coherent. But it mutates `globalThis.fetch` process-wide, which races if tests
ever run concurrently. Inject the Drive fetch as a dependency on the router factory instead of
stubbing a global. If you must keep the global stub, restore it in a `finally` and keep the
suite sequential.

## Ordering and error handling

- Every handler must be wrapped so a rejected `query()` cannot crash the process. Task 5's
  review found that Express 4 does **not** catch async rejections: an unguarded `await query(...)`
  in a handler becomes an unhandled rejection and kills the process. Follow the same
  try/catch shape Task 5 established, including:
  - target/ownership lookup failure → **503** (DB unreachable)
  - 0 rows on the ownership lookup → 404
  - Drive fetch failure → 502
  - Drive returns non-`image/*` → 415
- Never log the full data URL or signature value; log identifiers only.

## Security notes

- `/raw/:fileId` is an open proxy risk. The ownership lookup is the only thing keeping it scoped.
  Keep it, and keep it correct (C-5). If the lookup is bypassed, this endpoint will serve any
  Drive file whose ID is known.
- `Cache-Control: private, max-age=3600` is already correct for biometric data. Keep `private`.

## Test harness requirements

- Mint test tokens as 192-hex opaque strings. `server/auth.js` `parseBearer` accepts a bare token
  with no `Bearer ` prefix, which is the simplest way to satisfy `requireRole` in tests. Match
  the convention already used by `server/media.test.js` — read the current file and reuse its
  token/session stubs rather than inventing a new mechanism.
- `USER` in the existing suite is instantiated with a known `instansi_id`; cross-instansi
  refusal tests must use a target on a different `instansi_id`.
- A test asserting "no `SELECT *`" must inspect the captured SQL text and assert the explicit
  `"nip"` and `"signature"` columns are present.
- Cover: canonical photo URL passthrough, null photo, both signature URL shapes in `/raw`,
  suspicious fileId → 400, non-image content-type → 415, Drive non-OK → 502, DB rejection → 503
  (with the process still alive), cross-instansi → 403, SUPERADMIN bypass, bulk `signatures`
  restricted to own instansi.

## Verification (raw output required)

```
cd D:\Code\absensi_refactored_v6
node --test server/media.test.js
npm test
git status --porcelain --untracked-files=no
```

Rules:
- Run from repo root.
- PowerShell 5.1: no `&&`, no heredocs, no `grep`/`head`/`tail`/`wc`.
- Paste the **actual** final output. Do not paraphrase.
- `git status --porcelain --untracked-files=no` must be empty before committing.
- Do NOT commit `.superpowers/**`, untracked assets, or anything outside the two files listed
  under Files.

## Commit

Single commit, only if the full suite passes:

```
git add server/media.js server/media.test.js
git commit -m "feat(server): add media read routes and authenticated image proxy"
```

## Definition of done

1. All four read routes exist and pass real HTTP tests.
2. `/raw/:fileId` finds ownership for BOTH `/file/d/<id>/view` and `uc?export=view&id=<id>`.
3. No occurrence of `canManageAll` anywhere in the diff.
4. Every `sameInstansi` call passes the user object first.
5. No `Number()` on any id param.
6. No unguarded `await query(...)` in a handler.
7. `npm test` green, raw output pasted.
8. Unrelated files untouched.