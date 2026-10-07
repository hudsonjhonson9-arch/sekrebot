# Task 4 Review — Authentication middleware

Commit `6a9864d` vs base `e633bd7`. Branch `master`. Reviewer ran all commands itself; the
implementer's report was treated as a claim to check, not as evidence.

## Verdict: APPROVED_WITH_FINDINGS

Every stated requirement is met, and the two cases the brief called load-bearing ("500, and
`next` is never called" / "401, not next") are genuinely pinned — I re-ran 10 independent
mutations and all 10 were caught. Nothing blocks Task 5. Two Important findings and one
carry-forward that will bite Task 5 in production.

## Real evidence

### `git show --stat 6a9864d`

```
commit 6a9864d159d0b380a3300ef23a4d7ecf105332c3
Author: hudsonjhonson9-arch <hudsonjhonson9@gmail.com>
Date:   Sat Oct 3 08:25:50 2026 +0800

    feat(server): validate opaque session token against live user_list role allowlist

 server/auth.js       |  82 ++++++++++++++++
 server/media.test.js | 257 ++++++++++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 338 insertions(+), 1 deletion(-)
```

`git show --name-only` → `server/auth.js`, `server/media.test.js`. Nothing else. No
protected file touched (`js/`, `www/`, `google-apps-script/`, `server/db.js`,
`server/index.js`, `server/gas.js`, `server/media-payload.js`, `package.json` all untouched).
Zero `INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER` in the diff. No database write anywhere.

### Test counts (from repo root `D:\Code\absensi_refactored_v6`)

```
$ node --test
# tests 93
# suites 0
# pass 93
# fail 0
# cancelled 0
# skipped 0
# todo 0

$ node --test server/media.test.js
# tests 26
# pass 26
# fail 0
```

Matches the report exactly. Baseline holds.

### ESLint

```
$ npx eslint server/auth.js server/media.test.js
  37:17  error  'process' is not defined  no-undef
  38:1   error  'process' is not defined  no-undef
  58:15  error  'Buffer' is not defined   no-undef
  122:15 error  'Buffer' is not defined   no-undef
  126:56 error  'Buffer' is not defined   no-undef
  194:19 error  'process' is not defined  no-undef
  195:12 error  'process' is not defined  no-undef
  202:7  error  'process' is not defined  no-undef
✖ 8 problems (8 errors, 0 warnings)
```

All eight are inside the pre-existing Task 3 block (which ends at line 253). Zero in the
block this task added. The report's claim is accurate.

### No test was weakened

The only deletion in the entire commit is the import line, which was widened:

```
-import { parseToken, bearerToken } from './auth.js';
```

All 11 pre-existing tests survive byte-identical.

## Spec compliance

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | `MEDIA_ROLES` = exactly the six roles | **Met** | `server/auth.js:3-10`; pinned exactly (sorted set + `instanceof Set`) at `media.test.js:292-298` |
| 2 | 401 on absent / malformed / unknown / expired | **Met** | `auth.js:67` (gate), `auth.js:76` (`!row`); expiry also filtered in SQL `auth.js:51` |
| 3 | 403 on role outside allowlist | **Met** | `auth.js:78-80` |
| 4 | 500 on lookup failure | **Met** | `auth.js:71-75` |
| 5 | `next()` never called on any failure path | **Met, and load-bearing** | mutations M1, M8, M9 all caught (§Mutation below) |
| 6 | DB outage must not become an authz bypass | **Met** | `auth.js:71-75` returns 500; M1 (`catch { next(); return; }`) fails the suite |
| 7 | `sameInstansi`: SUPERADMIN bypass | **Met** | `auth.js:91`; `media.test.js:473` |
| 8 | `''` target decided deliberately + pinned by a test | **Met** | `auth.js:97` fail-closed; `media.test.js:482-491`; mutation M6 caught |
| 9 | Role from live `user_list`, not the session snapshot | **Met** | `auth.js:48` selects `u.role`; M4 and M7 caught |
| 10 | A missed join rejects, never falls back | **Met** | `auth.js:50` is an INNER `JOIN`; M7 (delete the JOIN) caught |
| 11 | Legacy `usr_<id>_<ts>` rejected before any DB call | **Met** | `auth.js:15` gate applied at `auth.js:67`, outside and before the `try`; M3 caught 3 tests |
| 12 | No token / role / user id in responses or logs | **Met** | `auth.js:86-88` single helper, all four 401 paths identical; static 403/500 bodies; **zero** `console.*` in `auth.js` |

`sameInstansi` decision on `''` is right and the reasoning is right: in this schema
`instansi_id` is `''` not `NULL`, so `''`-means-"unfiltered" would make every
instansi-less user match every instansi-less target. Fail-closed is the correct call and
`SUPERADMIN` retains the bypass.

## SQL review

```sql
SELECT u.id, u."NIP" AS nip, u.role, u.instansi_id
FROM auth_sessions s
JOIN user_list u ON u."NIP" = s.nip
WHERE s.session_token = $1 AND s.is_active AND s.expires_at > now()
LIMIT 1
```

Verified against the live database (read-only):

* **It runs.** Executed through `postgres-mcp_query` with a dummy 192-hex token → `[]`.
  Parses, plans, returns zero rows. ✔
* **The join key is right and the quoting is mandatory.** `user_list` has **no** lowercase
  `nip` column — `information_schema` returns `"NIP" text`, `id bigint`, `role varchar`,
  `instansi_id text`. The double-quoted `"NIP"` is required and present. ✔
* **Join direction is right**: `auth_sessions.nip` → `user_list."NIP"`, not the reverse. ✔
* **INNER JOIN is the security control.** A deleted user produces zero rows → 401. There is
  no code path that reaches the session snapshot. ✔
* **Indexed.** `auth_sessions_session_token_key UNIQUE btree (session_token)`, plus a
  redundant `idx_sessions_token` and a partial `idx_sessions_nip_active`. A valid-shaped
  wrong token is a single index probe. ✔

**Is a valid-shaped-but-wrong token reaching the DB acceptable?** Yes, and it is
unavoidable — you cannot know a token is valid without looking it up. The pre-filter's only
job is to reject junk and the legacy format for free, which it does. No oracle is created:
all 401s are byte-identical in both status and body, so an attacker cannot distinguish
"wrong token" from "expired token" from "no token" from timing either (identical code path
shape, single index probe).

**Does `LIMIT 1` hide anything given NIP is unique?** It hides something, but not a
privilege escalation. `user_list."NIP"` is **not** uniqueness-constrained — `pg_indexes`
shows only a plain `CREATE INDEX idx_user_list_nip` (non-unique). Uniqueness today is a
data property (47 rows / 47 distinct NIP / 0 null, confirmed). If a duplicate NIP is ever
inserted, the join fans out and `LIMIT 1` picks an arbitrary row. This cannot be used to
gain privilege (anyone who can insert a `user_list` row can already write `role` on it), but
it does make authorization nondeterministic on bad data. → Minor finding M-1 below.

## `bearerToken` scheme-less — inherited, unnecessary, not a Task 4 defect

Checked every place the app constructs the header. All three use the `Bearer` scheme:

* `js/api.js:70` — `hdrs['Authorization'] = 'Bearer ' + window._session.token;`
* `js/config.js:382` — `finalHeaders['Authorization'] = 'Bearer ' + window._session.token;`
* `www/js/api.js:70` — `hdrs['Authorization'] = 'Bearer ' + window._session.token;`

**Nothing needs the scheme-less form.** But `bearerToken`'s body is untouched by this
commit — the diff only appends after line 33 — and the brief said *"Keep `bearerToken(req)`
as it already behaves. Reuse it; do not reinvent header parsing."* Task 1's committed test
also asserts `bearerToken({ authorization: 'usr_1_2' }) === 'usr_1_2'`
(`media.test.js:29`). So this is Task 1 behaviour, already adjudicated in the Task 1 review,
correctly preserved rather than re-litigated.

Security impact today: **nil**. A scheme-less value must still pass the 192-hex gate and the
DB lookup, so it is not an escalation — the token is the credential either way. It is
unnecessary tolerance, and it is the kind that would keep a future bug exploitable if the
192-hex gate were ever dropped. Verdict: leave it, do not block Task 4 on it, and do not
count removing it as Task 4 work. → Minor finding M-2.

## `parseToken` — a real footgun, still worth deleting

`parseToken` (`auth.js:20-26`) is exported, is called by nothing in `server/` except its own
tests, and is documented in-file as a forgeable auth bypass. Verified unreachable: the only
references to it in `server/` are its own definition and `media.test.js`.

Its mitigation is a comment plus a test that **asserts the hazard**
(`media.test.js:493-500`: `parseToken('usr_1_0') === 1`). That is the weakest of the three
available options:

1. **Delete it.** Removes the only function in the codebase that turns an attacker-chosen
   string into a user id. Cost: ~10 lines + 4 tests (3 Task 1 + the risk-note).
2. **Keep it, comment only.** Honest, zero churn, still a loaded gun.
3. **Keep it and pin the forgeability in a test.** (What was done.) The test does not guard
   anything — it *documents broken behaviour as if intended*, and a maintainer skimming
   test names sees a green check next to `parseToken`.

The stated reason for choosing 3 was churn ("its 3 tests predate this task"). Weighed: the
churn is small and the tests are the implementer's own to change, since the brief explicitly
scoped `media.test.js` as append-with-license. And `parseToken` has no consumer anywhere —
the plan's own later tasks do not call it (grep of the plan shows `parseToken` only in Task 1
and Task 4 sections). → Important finding I-2. Not Critical: it cannot be reached by any
request path today.

## Are the 15 new tests meaningful?

`media.test.js` 11 → 26. All pass. I ran 10 independent mutations against a temp copy of
`server/` (repo untouched; verified `restored-identical: True`) to check the failure paths
are genuinely pinned rather than merely asserted:

| # | Mutation to `server/auth.js` | Result |
|---|---|---|
| M1 | `catch { next(); return; }` instead of the 500 | **caught** — 1/26, the 500 test |
| M2 | `500` → `403` | **caught** — 1/26, the 500 test |
| M3 | drop the 192-hex gate (`if (!token)`) | **caught** — 3/26 (legacy, non-hex, uniform-401) |
| M4 | `u.role` → `s.role` | **caught** — 1/26, the SQL-shape test |
| M5 | drop `is_active` + `expires_at > now()` | **caught** — 1/26, the SQL-shape test |
| M6 | `sameInstansi('')` → `true` | **caught** — 1/26, the fail-closed test |
| M7 | delete the `JOIN` (simulate snapshot fallback) | **caught** — 1/26, the SQL-shape test |
| M8 | 401 path also calls `next()` | **caught** — 1/26, the unknown-session test |
| M9 | 403 path also calls `next()` | **caught** — 2/26 |
| M10 | remove the `try`/`catch` entirely | **caught** — 1/26, the 500 test |

Every failure path is load-bearing. The report's "500, not 403" and "401, not next" claims
are true. The report's caveat that mutant A1's failure attribution is nondeterministic did
**not** reproduce here — with the `try`/`catch` removed the failure attributed cleanly to
the 500 test, same as every other mutant.

Three weaknesses in the test set:

* `media.test.js:417-424` is the **only** test pinning "live role wins", and it does so by
  regexing a SQL string. It is genuinely load-bearing (M4/M5/M7 all fail it) but it cannot
  prove the database returns what the regex says. The report discloses this honestly under
  "Could not verify" — `defaultLookup` has never been executed. Acceptable for now; a
  single integration test against a real `auth_sessions` row is the eventual closure.
* `media.test.js:426-443` ("role live-nya USER walau snapshot-nya ADMIN") is **not**
  load-bearing for that requirement — M4 left it green, because with an injected lookup the
  middleware only ever sees `row.role` no matter what the SQL says. It is a reasonable
  contract test on the middleware; keep it, but it is not evidence for the live-role rule.
* `media.test.js:403-415` pins a shape `defaultLookup` cannot produce → Important I-1 below.

Not pinned, and cheap to add: `req.user` is left **unset** on 401/403. Obvious from the code
(the assignment at `auth.js:81` is the last statement before `next()`), so low value.

## Carry-forward (not Task 4 defects — record these before Task 5)

* **C-1 · Important · Task 5 blocker.** Nothing in the app currently produces a token this
  middleware accepts. `js/auth.js:386` mints `'tg_' + window.MY_ID + '_' + Date.now()`
  locally and `js/config.js:387` stores it as `window._session.token` with `nip: ''`,
  `role: 'USER'`. That is neither 192-hex nor an `auth_sessions` row, so **every Telegram
  WebApp auto-login will 401 on every media route** once Task 5 wires `requireRole`, while
  Task 5's injected-lookup unit tests stay green. Login must be migrated to
  `public.create_session()` before Task 5 ships, or media routes are dead on arrival.
  Out of Task 4's scope (the brief scoped it to the middleware, no routes), but this is the
  thing that will make Task 5 fail in production.
* **C-2 · Important · Task 6.** The plan calls
  `sameInstansi(req.user.instansi_id, rows[0].instansi_id)` (plan lines 1324, 1340, 1382) —
  two positional args against the implemented `(user, targetInstansiId)` signature. Under
  the real signature that call passes a **string** as `user`, so `user?.role` is `undefined`,
  the `SUPERADMIN` bypass never fires, and `String(user?.instansi_id)` becomes the literal
  `'undefined'` — every comparison fails, so it is fail-closed but wrong. The plan also uses
  `req.user.canManageAll`, which `requireRole` does not set. Task 6 must be written against
  the real signature and the real `req.user` shape.

## Findings

### Critical

None.

### Important

**I-1 · `server/auth.js:48` + `media.test.js:414` — `req.user.id` is a string in production; the test pins a number.**

`user_list.id` is `bigint`, and node-postgres returns OID 20 as a **string**:
`pg-types/lib/textParsers.js:167` registers `parseBigInteger` for int8, defined at
`:113-117` as returning `valStr` when the value is all digits. So `defaultLookup` yields
`row.id === '7'`, and `req.user.id` at `auth.js:81` is a string. `media.test.js:414` asserts
`deepEqual(req.user, { id: 7, ... })` — a number the production path can never produce. The
test therefore pins a contract that is wrong, and downstream handlers doing
`req.user.id + 1` or `req.user.id === someInt` will misbehave silently.

Fix: make it explicit in the SQL. **Do not use `::int`** — live `max(user_list.id)` is
`9999999999`, which overflows int4 (max 2147483647), verified read-only. Use
`SELECT u.id::text AS id, ...`, or normalise with `Number(row.id)` in `requireRole`
(safe: 9999999999 < 2^53). Then change the fixtures at `media.test.js:394`, `:407` and the
assertion at `:414` to match whichever contract you choose, so the test states the truth.

**I-2 · `server/auth.js:20-26` — `parseToken` should be deleted, not documented-and-pinned.**

Unreachable today, so not Critical, but it is the one function in the codebase that maps an
attacker-chosen string to a user id, and the chosen mitigation (a test asserting
`parseToken('usr_1_0') === 1`) documents the hazard as though it were intended behaviour
rather than guarding anything. Fix: delete `parseToken`, its 3 Task 1 tests
(`media.test.js:13-25`), the risk-note test (`media.test.js:493-500`) and the import at
`media.test.js:4`. Suite goes 93 → 89. If it must survive for the plan's Task 1/Task 5 text,
drop the risk-note test and let the in-file comment be the only record — do not keep a green
check next to a known auth bypass.

### Minor

**M-1 · `server/auth.js:52` — `LIMIT 1` hides duplicate-`NIP` fan-out.**
`user_list."NIP"` has only a non-unique index (`idx_user_list_nip`); uniqueness is a data
property, not a constraint. If a duplicate NIP is ever inserted, `LIMIT 1` silently picks an
arbitrary row, making authorization nondeterministic. Not escalatable (whoever can insert a
`user_list` row can already set its role). Fix: drop `LIMIT 1` and reject when
`rows.length !== 1` in `defaultLookup`, or add `CREATE UNIQUE INDEX ON user_list("NIP")` as a
separate migration.

**M-2 · `server/auth.js:35` — scheme-less `Authorization` is unnecessary tolerance.**
Inherited from Task 1, unchanged by this commit, and mandated by the brief
("keep `bearerToken` as it already behaves"). All three frontend call sites send `Bearer `.
Not a Task 4 defect and not a blocker; delete it only in a dedicated cleanup that also
updates `media.test.js:29`.

**M-3 · `server/auth.js:61-62` — the comment overstates the guarantee, and there is a real
(unexercised) hang path.**
*"tidak ada await di luar try/catch, jadi Express 4 tidak pernah melihat rejected promise
dari sini"* is true about the `await`s but false as a conclusion: `roles.has(role)` at
`auth.js:78` sits **outside** the `try`, and with `express@^4.22.3`
(`package.json:16`) Express 4 does not forward rejected promises to the error handler. If a
caller passes an Array instead of a Set, `roles.has` is `undefined`, the async function
rejects, and the request **hangs** instead of returning 403/500. Fail-closed, so not a
security hole. Fix: either widen the `try` to cover the whole body, or make the comment say
what is actually true (*"no `await` outside the try"*) and note the Express 4 caveat where
Task 5 wires the route.

**M-4 · `server/auth.js:38-40` — `isSessionToken` is exported but is not in the brief's
interface list.** It exists so the tests can reach it. Acceptable; just don't let it drift
into a second entry point later.

**M-5 · `server/auth.js` — no trailing newline** (last byte is `125`). Makes `git show`
print `\ No newline at end of file` and noisier diffs. `server/db.js` and `server/index.js`
share the trait; `gas.js` and `media-payload.js` do not. Purely cosmetic.

## Code quality

The code is appropriately small and does not speculate: no factory, no interface with one
implementation, no config for a value that never changes. `requireSelfOrAdmin` was correctly
skipped per the brief. `deps` has exactly one seam (`lookup`) — the only one the tests need,
and adding a `deps.query` seam would have been unrequested surface. Comments are in the
repo's existing Indonesian style and, unusually, each one explains *why* rather than
restating the code — the `auth.js:42-46` note on why the join miss must not fall back is
exactly the right thing to leave in the file. `unauthorized()` as a helper is justified: four
call sites must stay byte-identical, and a test enforces that.