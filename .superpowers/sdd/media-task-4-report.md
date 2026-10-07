# Task 4 Report — Authentication middleware

Commit `6a9864d`. Baseline before work: **78 pass / 0 fail**. After: **93 pass / 0 fail**
(root), `server/media.test.js` **11 → 26**.

## The plan's code was not implemented

`docs/superpowers/plans/2026-10-02-media-drive.md:652-810` specifies a `parseToken` that
splits `usr_<id>_<ts>` and a `defaultLookup` that queries `user_list` by `id`. Verified
against the live DB that this is wrong on both counts:

```
pg_get_functiondef('public.create_session'):
  v_token := encode(gen_random_bytes(48), 'hex');   -- 192 hex, opaque
  v_expires := now() + interval '24 hours';
  insert into auth_sessions (session_token, nip, user_id, role, instansi_id, expires_at)
```

So the real credential is 192 hex chars, and the join key is `nip`, not `id`. The plan's
`parseToken` returns `null` for every real token → 401 for every real user.

`information_schema.columns` on `auth_sessions` confirms the brief's table exactly:
`session_token text NOT NULL`, `nip text NOT NULL`, `user_id text NULL`,
`role text NOT NULL DEFAULT 'USER'`, `instansi_id text NOT NULL DEFAULT ''`,
`expires_at timestamptz NOT NULL`, `is_active boolean NOT NULL DEFAULT true`.

Indexes: `auth_sessions_session_token_key UNIQUE btree (session_token)` → the lookup is
indexed, no migration needed.

## The query, and why the live role wins

```sql
SELECT u.id, u."NIP" AS nip, u.role, u.instansi_id
FROM auth_sessions s
JOIN user_list u ON u."NIP" = s.nip
WHERE s.session_token = $1 AND s.is_active AND s.expires_at > now()
LIMIT 1
```

`auth_sessions.role` is a snapshot taken at login (`create_session(..., p_role, ...)`).
Authorising off it means a user demoted mid-session keeps the old privilege until their
24h token expires. So the allowlist decision reads `u.role` — the live row.

The `user_list` column is `NIP` (mixed-case identifier, must be double-quoted); there is
no lowercase `nip` column on that table. `user_list."NIP"` is unique across all 47 rows,
so the join is 1:1. **No fallback to the session snapshot when the join misses** — a
deleted user yields zero rows → 401.

Executed read-only against the live DB (dummy token) — parses and runs, returns no rows:

```
[]   -- postgres-mcp_query, exact SQL above
```

## Decision: empty-string `instansi_id` target is fail-closed

The plan returns `true` for a `null`/`undefined` target. In this schema `instansi_id` is
`''` and `NOT NULL`, so "no scope requested" and "this row has no instansi" are different
values that would otherwise collide. Treating `''` as "no filter" makes **every user
without an instansi match every target without an instansi** — a cross-instansi leak.
So:

- `SUPERADMIN` → `true`
- `null`/`undefined` target → `true` (caller asked for no scoping)
- `''` target → **`false`** (except SUPERADMIN)
- otherwise `String(user.instansi_id) === String(target)`

Pinned by `sameInstansi: target kosong fail-closed, bukan lolos`. Mutation: flipping that
one line to `return true` fails exactly that test.

## The legacy `usr_<id>_<ts>` format is rejected

`requireRole` never calls `parseToken`. `bearerToken` is reused unchanged for header
parsing, then `/^[0-9a-f]{192}$/` gates the value *before* any database access. So
`Bearer usr_7_1`, `Bearer usr_1_1750000000000`, 191/193-hex, uppercase hex and non-hex
all return 401 with `calls.count === 0` — proven by an injected `lookup` that increments
a counter and throws. The three legacy tokens are asserted individually.

`parseToken` is still exported (its 3 tests predate this task) but is now documented as
**not** authentication, and a `⚠️ risiko diketahui` test asserts `parseToken('usr_1_0') === 1`
so nobody quietly starts trusting it. That closes M-1's precondition without deleting a
test.

## Messages

All four 401 paths (no token / malformed / unknown / expired) return the identical body
`{ ok: false, message: 'Unauthorized' }`. Asserted by `semua jalur 401 memakai pesan yang
sama`. The 500 body is asserted not to contain `ECONNREFUSED` or the port. Nothing is
logged at all, so nothing can leak through logs.

## Exact commands and real output

```
$ node --test server/media.test.js
# tests 26
# pass 26
# fail 0

$ node --test            # from D:\Code\absensi_refactored_v6
# tests 93
# pass 93
# fail 0

$ npx eslint server/auth.js server/media.test.js
✖ 8 problems (8 errors, 0 warnings)
```

The 8 lint errors are **pre-existing**: every one is `'process'/'Buffer' is not defined`
at lines 37, 38, 58, 122, 126, 194, 195, 202 — all Task 3 code, shifted +8 by the
8-line import block. Zero lint errors in code added by this task.

## Mutation results

Each mutant applied to `server/auth.js`, suite run, file restored byte-identical
(`restored-identical: true`).

| # | mutation | result |
|---|---|---|
| A2 | `catch { next(); return; }` instead of the 500 | `not ok 17` — `expected: 500, actual: 0` |
| A3 | `500` → `403` | `not ok 17` — `expected: 500, actual: 403` |
| A1 | `try/catch` removed entirely | 1 failure, unhandled rejection (see caveat) |
| B | `isSessionToken` guard deleted | `not ok 13, 14, 15, 22` — 4 failures |
| D | `sameInstansi('')` → `true` | `not ok 24` |
| E | SQL `u.role` → `s.role` | `not ok 20` |
| F | SQL drops `is_active` + `expires_at` | `not ok 20` |

A2 is the honest load-bearing case for the brief's "500, and `next` is never called": it
fails on a clean `AssertionError`. A1 also fails (1 of 26), but **caveat**: with the
`try/catch` gone the middleware's promise rejects, and Node attributes the unhandled
rejection to a neighbouring test — deterministically test 16 or test 17 depending on the
exact mutant text (3/3 identical runs each way). The mutant is always caught; the
attribution is an artefact of rejection timing, not of which assertion fired. A2 and A3
are the assertions that actually pin the behaviour.

## Deliberately not done

- `requireSelfOrAdmin` — in the plan's interface list, never implemented there. Skipped;
  Task 5 decides.
- No logging on the 500 path. `db.js:19` already logs pool errors; adding a request-scoped
  log line is unrequested surface. Add when ops needs request correlation.
- No `deps.query` seam — only `deps.lookup`, which is what the brief specifies and is the
  only seam the tests need.

## Could not verify

- **`defaultLookup` was never executed.** There is no `.env` in the repo, so `DATABASE_URL`
  is unset and `server/db.js:11` throws by design. The SQL was verified by executing the
  identical string through `postgres-mcp_query` instead, and the parameterised wiring is
  `query(SESSION_LOOKUP_SQL, [sessionToken])` — a one-line path with no branching.
- **`auth_sessions` has 0 rows**, so the join could not be exercised against a real
  session row. The join direction and uniqueness were verified via `user_list` alone
  (47 rows, 47 distinct `NIP`).
- Whether uppercase-hex tokens are ever legitimately issued — `encode(..., 'hex')` in
  PostgreSQL is always lowercase, so the gate rejects uppercase. If a token is ever
  inserted by hand in uppercase it will 401; the fix would be to normalise at insert, not
  to loosen the gate.
- No route wiring yet, so the middleware has never run inside real Express. Express 4
  does not catch rejected promises from async middleware; the implementation guarantees
  this is safe because the only `await` is inside the `try`, and every other branch is a
  plain `return`. That reasoning is from the code, not from an observed Express run.

## Fix round 1

Commit `88c3cc1` on top of `6a9864d`. Files touched: `server/auth.js`,
`server/media.test.js`. Nothing else — no migration, no schema change, no database
write, no protected file.

Baseline before the round (measured, not quoted from the review):
`node --test server/media.test.js` → 26/26; `node --test` from the repo root → 93/93.

### Test counts after the round

```
$ node --test server/media.test.js
# tests 24
# pass 24
# fail 0

$ node --test            # from D:\Code\absensi_refactored_v6
# tests 91
# suites 0
# pass 91
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The real arithmetic: **-4** deleted (`parseToken`), **+2** added (`singleSessionRow`,
non-Set `roles`). 26 − 4 + 2 = 24; 93 − 4 + 2 = 91. The id-as-string coverage was added
as assertions inside the two existing tests that already assert the SQL and the attached
identity, rather than as a fifth new test, so it does not move the count.

ESLint, unchanged from the review: 8 errors, all `process`/`Buffer` `no-undef` inside the
pre-existing Task 3 block of `media.test.js`. Zero new.

### I-1 — `u.id::text AS id`, and the fixtures now say what production says

`user_list.id` is `bigint` / `udt_name = int8` (OID 20), re-verified read-only:

```
{"max_id":"9999999999","rows":"47","distinct_nip":"47"}
{"column_name":"id","data_type":"bigint","udt_name":"int8"}
```

`max_id = 9999999999 > 2147483647`, so `::int` would have thrown at runtime on real data.
`::text` it is. The reviewer's alternative (`Number(row.id)`) is also safe numerically
(< 2^53) but was not chosen: it keeps the contract dependent on a driver default, which
is the actual defect — the type was implicit rather than declared.

Downstream consumers. `req.user.id` is consumed by Task 5 for route lookups and
`sameInstansi` comparisons. `server/auth.js` contains **no** `===` against a number for
`id`; `sameInstansi` already coerces both sides with `String(...)` at `auth.js:105`, and
`instansi_id` is `text` in the schema, so a numeric-looking string id and text
`instansi_id` compose without type hazards. A comment at `auth.js:87` records the rule
for Task 5, and the SQL-shape test now rejects any narrowing cast
(`/u\.id::(int|integer|int4|bigint|numeric)/i`) so the overflow trap cannot be re-armed.

Test changes: fixtures at the 403 test, the pass-through test and the live-role test now
use `id: '7'`; the `deepEqual` on `req.user` expects `id: '7'`; and the pass-through test
adds `assert.equal(typeof req.user.id, 'string')` plus `assert.ok(!Object.is(req.user.id, 7))`.

**Mutation proof that I-1 is load-bearing** — reverted `u.id::text AS id` → `u.id AS id`,
suite went red:

```
not ok 16 - requireRole meneruskan request dan menempelkan identitas untuk role yang diizinkan
  name: 'AssertionError'
  actual: 'SELECT u.id AS id, u."NIP" AS nip, u.role, u.instansi_id FROM auth_sessions s
           JOIN user_list u ON u."NIP" = s.nip
           WHERE s.session_token = $1 AND s.is_active AND s.expires_at > now()'
not ok 17 - role hidup dari user_list menang atas snapshot role di baris sesi
# tests 24
# pass 22
# fail 2
```

Restored afterwards (`last byte: 10`, 24/24 green).

### I-2 — `parseToken` deleted, and four tests that encoded the vulnerability with it

Pre-check, as instructed: `parseToken` and `bearerToken` appear in exactly two files in
the repo — `server/auth.js` and `server/media.test.js`. A repo-wide search for importers
of `auth.js` returns one hit, `media.test.js:11`. Nothing outside `server/` imports it, and
the frontend `js/` / `www/js/` files are browser scripts that cannot reach a server module.
Zero external consumers, so the deletion is contained.

Deleted:
* `parseToken` in `server/auth.js` (was lines 17–26, including the comment that described
  it as forgeable).
* The import at `media.test.js:4`.
* Three Task 1 tests at `media.test.js:13-25`.
* The risk-note test at `media.test.js:493-500`, which asserted
  `parseToken('usr_1_0') === 1`.

Stated plainly, because it is the point and not a side effect: **those four tests encoded
a vulnerability as expected behaviour.** `parseToken` never checked its timestamp, so
`usr_1_<anything>` resolved to user 1 — and the risk-note test asserted exactly that,
passing. A green check next to a known auth bypass teaches a maintainer that the bypass is
the contract. Removing the tests is the fix; keeping them with a comment would have left
the hazard pinned as intended behaviour.

One stale reference was corrected rather than left dangling: the legacy-token test comment
said the request must die "di parseToken", which no longer names anything. It now says
"di gerbang 192-hex". No assertion changed.

### M-1 — `LIMIT 1` removed; more than one row is rejected, never chosen

The SQL no longer contains `LIMIT 1`, and `defaultLookup` delegates the row policy to a new
exported one-liner:

```js
export function singleSessionRow(rows) {
  return rows.length === 1 ? rows[0] : null;
}
```

**Why it is exported rather than inline.** `defaultLookup` has no seam — it calls
`query` directly — so an inline `rows.length !== 1` check would be unpinnable, i.e. exactly
the "documented, not guarded" failure the review flagged in the `parseToken` risk-note. A
one-line pure export is the smallest thing that lets the security-relevant branch be tested
without adding a `deps.query` seam, which would be unrequested surface.

**Why ambiguous → 401, not 500.** Both collapse to `null`, which reaches the existing
`unauthorized(res)` and produces the byte-identical 401 used by every other rejection. A
500 would be *wrong here*: only a token that actually resolves to a row can produce more
than one, so 500 would turn "your token is valid but the data is broken" into a status an
attacker can read. 401 keeps the uniform-401 invariant intact — ambiguity is
indistinguishable from unknown or expired — and fails closed, which is the only safe
direction when a request cannot be attributed to exactly one identity.

`DISTINCT` was rejected as an alternative: the fan-out duplicates differ in `id`, `role`
and `instansi_id`, so `DISTINCT` keeps all of them and collapses nothing. That is recorded
in the comment at `auth.js:41`.

Mutation proof for M-1 as well — `return rows[0] || null` (the old behaviour):

```
not ok 18 - singleSessionRow hanya menerima tepat satu baris, tidak pernah memilih
# tests 24
# pass 23
# fail 1
```

**Recommendation, not applied (no migration this round, per the brief).** A
`CREATE UNIQUE INDEX ON user_list("NIP")` is the better structural fix — it makes the
fan-out impossible rather than merely detected, and it also protects any future query that
joins on NIP. It needs a duplicate sweep first (`47 rows / 47 distinct NIP / 0 null`
today, so it would apply cleanly) and it belongs in `migrations/`, not in this task.

### M-3 — comment corrected, and the hang path closed rather than documented

Both halves of the review's suggestion were taken, because the second one was one line.

The guard was not added as a separate branch; instead `roles.has()` was **moved inside the
existing `try`** along with the `!row` check and the role normalisation, and `next()` was
left outside it. That closes the hang without inventing a new status code or a new branch:
an Array passed as `roles` now throws `TypeError` inside the `try` and becomes the same
500 the DB-outage path already produces. The 500 test and the 403 test are unchanged and
still green, so nothing was weakened.

The comment at `auth.js:64-67` now states what is actually guaranteed: everything fallible
is inside the `try`, so the async function never rejects; Express 4 never sees a rejected
promise from here; `next()` is synchronous and outside. It no longer claims "no `await`
outside the try", which was true but not the conclusion.

Pinned by a new test: `requireRole(['ADMIN'], {lookup})` → 500, `next` not called. That is
the hang path, executed rather than described.

### M-5 — trailing newline

`server/auth.js` now ends with `\n` (last byte `10`, verified with `[System.IO.File]::ReadAllBytes`).

### Left alone, as instructed

* **M-2** — scheme-less `Authorization` is Task 1 behaviour, unchanged by this commit.
* **M-4** — `isSessionToken` stays exported; the tests need it and it is not drifting into
  a second entry point.

### Not carried forward

C-1 (login still mints `tg_<id>_<ts>` locally, so every Telegram WebApp auto-login will 401
on media routes once Task 5 wires `requireRole`) and C-2 (the plan calls
`sameInstansi(req.user.instansi_id, rows[0].instansi_id)`, which does not match the
implemented `(user, targetInstansiId)` signature) are unchanged by this round and still
block Task 5 shipping. Neither is fixable inside `auth.js`.