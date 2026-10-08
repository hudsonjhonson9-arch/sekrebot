# Task 1 Report — `POST /api/auth/login` (server)

**Status:** DONE_WITH_CONCERNS (1 minor tooling concern, see below)
**Commit:** `ee9cdb3` — feat: POST /api/auth/login - sesi native dari NIP tanpa password (branch `main`)

## What was implemented

Exactly the brief, nothing more:

- `server/auth-session.js`:
  - `import { singleSessionRow } from './auth.js'`
  - `USERS_BY_NIP_SQL` (`SELECT * FROM user_list WHERE "NIP" = $1`) added after `DEACTIVATE_SQL`
  - `POST /api/auth/login` route inside `createAuthSessionRouter`, between `/api/auth/session` and `/api/auth/logout`:
    - empty/whitespace NIP → `400`, no DB call
    - 0 rows → `404`; >1 rows → `409` (via `singleSessionRow`, never picks first row)
    - token = `crypto.randomBytes(96).toString('hex')` (192 hex), inserted via existing `INSERT_SESSION_SQL` with role/instansi from the DB row only
    - `200 {ok, session_token, user}` with full DB row (incl. `nama`)
- `server/auth-session.test.js`: the 6 tests from the brief appended verbatim after `logout menolak token dengan bentuk salah`, using the existing `drive()` helper.

No changes to `/api/auth/session`, device tokens, or any file outside the two task files. No rate limiting / extra routes (not in brief; ponytail comment documents the known NIP-only tradeoff and upgrade path).

## TDD evidence

### RED

Command: `node --test server/auth-session.test.js` (after adding tests, before implementation)

```
# tests 13
# pass 7
# fail 6
...
not ok 8 - login NIP valid menerbitkan sesi 192 hex dan baris user
  error: 'route not found'
not ok 9 - login NIP tidak terdaftar ditolak 404
  error: 'route not found'
not ok 10 - login NIP ambigu ditolak 409, bukan memilih baris pertama
  error: 'route not found'
not ok 11 - login tanpa NIP ditolak 400 tanpa menyentuh DB
  error: 'route not found'
not ok 12 - login mengabaikan role/instansi yang disuntik di body
  error: 'route not found'
not ok 13 - login tidak membaca init_data Telegram (pure NIP)
  error: 'route not found'
```

Expected failure: route `/api/auth/login` did not exist yet (`drive()` throws `route not found`), all 7 pre-existing tests still green.

### GREEN

Command: `node --test server/auth-session.test.js` (after implementation)

```
1..13
# tests 13
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

All 7 old + 6 new tests pass.

## Full suite

Command: `node --test 'server/*.test.js'`

```
1..252
# tests 252
# pass 252
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1327.625
```

No regressions (`index.test.js`, `auth.test.js`, `media.test.js`, etc. all green). The `# [media/face] ... Error: pool habis` lines are pre-existing expected-diagnostic output inside passing tests.

## Files changed

- `server/auth-session.js` (+32): import, SQL constant, route
- `server/auth-session.test.js` (+84): 6 tests

## Self-review

- Completeness vs brief: tests and implementation transcribed verbatim from the brief; verified against `global-constraints.md` (400/404/409, role from DB row, 192-hex token, route inside `createAuthSessionRouter`, reuses `singleSessionRow`/`INSERT_SESSION_SQL`/`drive()`).
- YAGNI: no rate limiting, no extra abstractions, no files touched outside the task.
- Test output pristine: focused 13/13, full 252/252, zero failures.
- Diff reviewed (`git diff`): only intended additions; `/api/auth/session` untouched.
- Not committed: `.superpowers/sdd/task-1-brief.md` (modified) and `.superpowers/sdd/global-constraints.md` (untracked) — pre-existing orchestrator files, not part of this task.

## Concerns

1. **`node --test server/` does not discover files on this machine** (Windows, Node v22.22.0): it reports a single `ok 1 - server` entry in ~250ms without running any test file. The equivalent working command is `node --test 'server/*.test.js'`, which ran all 12 test files (252 tests). The brief's Step 5 command should be replaced with the glob form; full-suite result above was obtained with the glob form. (Possibly a Node-on-Windows directory-discovery quirk; not investigated further.)
2. NIP-only login means anyone knowing a NIP can obtain that person's session — accepted product decision (global constraints), documented in the route's `ponytail:` comment with mitigation/upgrade path.

## Fix round 1

Critical review finding: `USERS_BY_NIP_SQL` was `SELECT * FROM user_list WHERE "NIP" = $1`, but `public.user_list` has columns `NIP` (uppercase) and `username` — no `nip`, no `nama`. node-postgres returns field names verbatim, so `user.nip` at the `INSERT_SESSION_SQL` call was `undefined` (violates `auth_sessions.nip` NOT NULL → every valid login threw; async Express 4 handler has no try/catch → unhandled rejection), and the `{ok, session_token, user}` response contract could never deliver `user.nip`/`user.nama`. Existing tests were green only because their mocks fabricated lowercase `nip`/`nama` keys.

**What changed**

- `server/auth-session.test.js` — covering test file. Login-route `user_list` mocks rewritten to the REAL row shape (`nip`→`NIP`, `nama`→`username`, `id`/`role`/`instansi_id` kept) via a small `userListRows(sql, ...rows)` helper that mimics the real DB: alias columns appear in the result only when the SQL text requests them (`"NIP" AS nip`, `username AS nama`). Assertions stay on the response contract (`out.body.user.nip`, `out.body.user.nama`). Session-route mocks (`EMPLOYEE_SQL` already aliases `"NIP" AS nip`) untouched.
- `server/auth-session.js` — `USERS_BY_NIP_SQL` only: `SELECT *, "NIP" AS nip, username AS nama FROM user_list WHERE "NIP" = $1`. Full row kept (frontend face-verify reads `user.face_histogram`/`user.face_photo` from the login response); no other line touched.

**Commands run**

```
node --test server/auth-session.test.js          # focused (RED, then GREEN)
node --test 'server/*.test.js'                   # full suite (GREEN)
```

**RED (mocks updated, SQL not yet fixed)**

```
not ok 8 - login NIP valid menerbitkan sesi 192 hex dan baris user
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    + undefined
    - '200206302025061002'
  operator: 'strictEqual'
# tests 13
# pass 12
# fail 1
```

**GREEN (alias fix applied)**

```
# tests 13
# pass 13
# fail 0
```

**Full suite**

```
# tests 252
# pass 252
# fail 0
# cancelled 0
```
