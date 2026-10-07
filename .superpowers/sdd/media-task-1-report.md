# Task 1 report — Backend skeleton (Express, pg pool, token parsing, health route)

**Status:** DONE_WITH_CONCERNS (all work complete; concerns are informational, no blockers)
**Plan:** `docs/superpowers/plans/2026-10-02-media-drive.md`, Task 1
**BASE commit:** `07ebdd8` (master)
**Task commit:** `73a2b6dacbb364c40152bbb7885bacbbb63405b3`
**Date:** 2026-10-02

---

## Files created / modified

| File | Action | Notes |
|---|---|---|
| `package.json` | modified | Added `start` + `test` scripts; added `express`, `pg`, `dotenv` to `dependencies` |
| `package-lock.json` | modified | From `npm install` |
| `server/db.js` | created | `getPool()`, `query(text, params)`, `closePool()` |
| `server/auth.js` | created | `parseToken(token)`, `bearerToken(req)` (pure, no DB) |
| `server/index.js` | created | `createApp()`, `/api/health`, listen-only-when-run-directly |
| `server/media.test.js` | created | 4 tests, verbatim from the brief |

Not touched: schema, anything under `js/`, `www/`, `dist/`, android assets, Docker/Coolify config, no `.env` created or read, no `.env.example` needed for this task (nothing consumes a new env var yet).

## Dependencies installed

```
npm install express@^4.21.2 pg@^8.13.1 dotenv --no-audit --no-fund
→ added 88 packages in 10s
```

Resolved into `package.json`:

```
"dotenv":   "^18.0.5"
"express":  "^4.22.3"
"pg":       "^8.23.1"
```

## TDD trace

1. Wrote `server/media.test.js` first.
2. Ran it — failed as required:
   `Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\Code\absensi_refactored_v6\server\auth.js'`
   (`# tests 1 / # fail 1`)
3. Installed deps, wrote `db.js`, `auth.js`, `index.js`.
4. Ran the file — `# tests 4 / # pass 4 / # fail 0`.
5. Ran the full suite — no regressions.

## Exact test commands run

```powershell
cd D:\Code\absensi_refactored_v6
node --test server/media.test.js
npm test            # npm test -> node --test, from repo root
```

(`node --test tests` was NOT used — that form fails on this machine with `Cannot find module ...\tests`.)

### Counts — new file only

```
ok 1 - parseToken membaca user id dari token sesi
ok 2 - parseToken menolak bentuk token lain
ok 3 - parseToken menolak prefix yang bukan usr
ok 4 - bearerToken membaca header Authorization
# tests 4
# pass 4
# fail 0
```

### Counts — full suite (`npm test`)

```
# tests 58
# suites 0
# pass 58
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

**Baseline before my change: `# tests 54 / # pass 54 / # fail 0`.**
After: **58 pass / 0 fail** = 54 baseline + 4 new. No existing test broken, skipped, or removed.

> The brief predicted "53 baseline + 4 = 57". The actual baseline on `07ebdd8` is **54**, so the real target is **58**. The brief was off by one; the run is otherwise exactly as specified (0 fail, nothing skipped).

## Extra verification beyond the brief

```powershell
node --check server\db.js; server\auth.js; server\index.js; server\media.test.js   # all exit 0
node -e "import('./server/index.js')..."                                           # createApp exported, no port bound on import
node -e "<spawn server/index.js, fetch /api/health>"                               # status 200 {"ok":true,"service":"absensi-media"}
```

Confirms the `isMain` guard keeps the module import-safe for future tests.

## Deviations from the brief

### 1. `bearerToken` in `server/auth.js` — rewritten (REQUIRED: brief's code contradicts brief's own test)

The brief's `bearerToken` snippet returns `null` for the test case
`bearerToken({ headers: { authorization: 'usr_1_2' } }) === 'usr_1_2'`, because
`raw.split(' ')` yields `['usr_1_2']`, so `rest` is empty and `value` is `''`,
which hits the `if (!value) return null` guard. Code and test cannot both be right.

Per the standing rule that prose/assertions beat the code block, the **test wins** and the
implementation was minimally adjusted:

```js
export function bearerToken(req) {
  const raw = (req.headers?.authorization || '').trim();
  if (!raw) return null;
  const sp = raw.indexOf(' ');
  if (sp === -1) return raw;                                  // no scheme -> whole value is the token
  return raw.slice(0, sp).toLowerCase() === 'bearer' && raw.slice(sp + 1).trim()
    ? raw.slice(sp + 1).trim()
    : null;                                                   // any other scheme rejected
}
```

Behaviour verified against all four brief assertions:
`'Bearer usr_1_2'` → `'usr_1_2'`; `'usr_1_2'` → `'usr_1_2'`; `{}` → `null`; `'Basic abc'` → `null`.
Security is unchanged for real traffic: a scheme word that is not `bearer` still yields `null`,
so a header like `Basic usr_1_2` is rejected. The only newly accepted shape is a **scheme-less**
raw token, which the brief's own test demands.

`parseToken` is byte-for-byte the brief's version — no change was needed there.

### 2. `dotenv` installed but not yet imported

The task context requires `dotenv` in `dependencies`; the brief's code never imports it, and
prose beats code, so no `import 'dotenv/config'` was added. It is therefore currently an unused
dependency. It becomes live as soon as a later task needs `DATABASE_URL` / `PGSSL` from a `.env`
file — at that point add `import 'dotenv/config'` at the top of `server/index.js` (one line).
Flagging so nobody wonders why it is there.

### 3. Installed versions are newer than the brief's floors

`^4.21.2` → resolved `^4.22.3`, `^8.13.1` → resolved `^8.23.1` (latest matching). Semver-compatible
with the brief's intent; no pinning change requested.

## Concerns / known ceilings (not blockers)

- **Test-count drift in the brief** (53 vs 54 baseline) — see above. Anyone re-checking Task 1
  should expect **58**, not 57.
- **`isMain` detection in `server/index.js` compares basenames.** It works (verified) because
  `process.argv[1]` ends in `server/index.js` when run via `npm start`, but any *other* module also
  named `index.js` that imports this file would make it bind a port spuriously. If a future task adds
  another `server/*/index.js` entry point, replace the line with
  `import.meta.url === pathToFileURL(process.argv[1]).href`.
- **`server/db.js` never connects at import time** (lazy pool), so the test suite needs no
  `DATABASE_URL`. Nothing exercised the pool in Task 1 — the first real query lands in Task 2/3.
  `query()`/`closePool()` are therefore unproven against a live DB until then.
- **`express.json({ limit: '8mb' })` is in place but unused by Task 1** — it exists for the media
  upload routes in later tasks. Ponytail note: drop it if no upload route ever arrives.
- **Pool is capped at `max: 5`** and errors are logged-and-dropped on idle clients. If media
  concurrency later needs more, that knob is the place to turn.
- The `tests/*.test.mjs` suite includes live n8n webhook smoke tests (they print `# PASS summary …`
  lines that are app console output, not test results). They passed on this run.

## Report file

This file (`.superpowers/sdd/media-task-1-report.md`) was written **after** the commit and is
deliberately **not** part of commit `73a2b6d`.

---

## Fix round 1

Fixes the 4 **Important** findings from `media-task-1-task-review.md` (the spec-compliance verdict
was PASS, so only I-1..I-4 are in scope). The 5 Minor findings (M-1..M-6) are **not** touched here.

**Commit:** `0ef3fc0` (on top of task commit `73a2b6d`)
**Files changed:** `server/index.js`, `server/db.js`, `server/auth.js` — nothing else.
**Tests added or changed:** none. `server/media.test.js` is untouched and its 4 assertions are unmodified.

---

### I-1 · `server/index.js` — async signal handler could hang shutdown and raise an unhandled rejection

**Finding.** `process.on(sig, async () => { await closePool(); process.exit(0); })` — `process.on`
discards the promise returned by an async listener, so nothing awaits it. If `p.end()` rejected, the
rejection was unhandled **and** `process.exit(0)` (which sat after the `await`) never ran, so the
process hung until SIGKILL. In-flight requests also could not drain, because `createApp().listen(...)`
discarded the server handle.

**Changed.** The `listen()` handle is now captured, and the handler is non-async so the exit path is
unconditional:

```js
const server = createApp().listen(port, () => console.log(`[media] listening on :${port}`));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => closePool().finally(() => process.exit(0)));
  });
}
```

Clean-shutdown behaviour is preserved (HTTP closes, pool drains, exit 0); the only change is that a
rejecting `closePool()` can no longer skip the exit. Capturing the handle also lets in-flight requests
drain before the exit, which the discarded handle made impossible.

**Verified** by executing the handler body with a rejecting `closePool()` (see *Verification notes* —
signals themselves cannot be delivered on Windows):

| shape | exit code | unhandled rejection |
|---|---|---|
| new (`server.close` → `closePool().finally(exit)`) | `0` | none |
| old (`await closePool(); process.exit(0)`) | — | `UNHANDLED: simulated p.end() failure` |

---

### I-2 · `server/db.js` — pool had no connect or query timeout

**Finding.** `new Pool({ connectionString, ssl, max: 5 })` set neither `connectionTimeoutMillis` nor
`query_timeout`; both default to *no timeout*. A refused connection fails fast, but a black-holed or
dropped connection (firewall DROP, severed container network) left `pool.query()` pending forever.
With `max: 5` the first five requests hang, every later request queues behind them, and **nothing is
logged** — the existing `pool.on('error')` listener only covers *idle* clients, not in-flight queries.

**Changed.** Two lines added to the existing pool options, using pg's own documented option names and
conservative values inside the range the review suggested:

```js
connectionTimeoutMillis: 10000,
query_timeout: 30000,
```

Connect timeout 10s (top of the suggested 5–10s band), query timeout 30s (top of the suggested
15–30s band). `query_timeout` is the client-side timer that converts the silent stall into a thrown
error for the caller, which is exactly the failure mode I-2 describes. A server-side
`statement_timeout` is deliberately **not** added (see *Skipped*).

---

### I-3 · `server/db.js` — `dotenv` never imported; missing `DATABASE_URL` silently targeted localhost

**Finding.** `server/db.js` read `process.env.DATABASE_URL`, but `dotenv` was installed and never
imported, so `.env` was never loaded — and `getPool()` did not check the variable. With `DATABASE_URL`
unset, `pg` fell back to its own defaults (`localhost:5432` as the OS user), so a misconfigured deploy
did not crash; it opened connections to the wrong database, silently.

**Changed.** `import 'dotenv/config'` at the top of `server/db.js`, plus a fail-fast guard. The import
goes in `db.js` rather than `index.js` so that *any* consumer of the module gets `.env` loaded — and
it stays inside a file Task 1 owns.

**The critical constraint: the throw must not happen at module import time.** The test suite imports
these modules with `DATABASE_URL` unset, and the pool is created lazily. The guard therefore sits
inside `getPool()`, **not** at module scope:

```js
export function getPool() {
  if (!pool) {
    // Fail-fast di sini, bukan di import: test suite meng-import modul tanpa DATABASE_URL.
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ /* ...unchanged... */ });
```

**Verified explicitly**, all from the repo root with no `DATABASE_URL` in the environment:

| check | result |
|---|---|
| `import('./server/db.js')` | `import OK, exports: closePool,getPool,query` — **no throw** |
| `import('./server/index.js')` | `index import OK, createApp: function` — **no throw** |
| `getPool()` | `getPool threw: DATABASE_URL is not set` |

So the module imports cleanly and the fail-fast fires only where the pool is actually created.
`query()` goes through `getPool()` and inherits the same guard. No `.env` file was created or read.

---

### I-4 · `server/auth.js` — `bearerToken` accepted trailing junk; a scheme with no token returned `'Bearer'`

**Finding.** `Authorization: Bearer usr_1_2 junk` parsed to the string `'usr_1_2 junk'`, which
`parseToken` then resolved to user `1` (it inspects only the first two `_`-separated fields, so
everything after is discarded). And `Authorization: Bearer` — a scheme with no credentials — returned
the literal string `'Bearer'`, rejected only downstream by `parseToken`'s luck rather than by the parser.

**Changed.** Replaced the manual `indexOf(' ')` slicing with an anchored regex, plus an explicit
rejection of a bare `bearer` scheme word:

```js
export function bearerToken(req) {
  const raw = (req.headers?.authorization || '').trim();
  if (!raw) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  if (m) return m[1];
  // Skema tanpa kredensial ("Bearer") ditolak; bentuk tanpa skema harus satu kata tanpa spasi.
  return /^\S+$/.test(raw) && !/^bearer$/i.test(raw) ? raw : null;
}
```

The `&& !/^bearer$/i.test(raw)` clause is **not** in the review's suggested patch — that patch alone
would still return `'Bearer'` for input `'Bearer'`, because a single bare word satisfies `/^\S+$/`.
The clause closes that case.

**Verified across the full input matrix.** The first four rows are the committed test assertions, unchanged:

| `authorization` | before | after | expected | ok |
|---|---|---|---|:--:|
| `Bearer usr_1_2` (test 1) | `usr_1_2` | `usr_1_2` | `usr_1_2` | PASS |
| `usr_1_2` (test 2, scheme-less — **must preserve**) | `usr_1_2` | `usr_1_2` | `usr_1_2` | PASS |
| `''` / missing header (test 3) | `null` | `null` | `null` | PASS |
| `Basic abc` (test 4) | `null` | `null` | `null` | PASS |
| `Bearer usr_1_2 junk` | `usr_1_2 junk` (bad) | **`null`** | `null` | **fixed** |
| `Bearer` (scheme, no token) | `Bearer` (bad) | **`null`** | `null` | **fixed** |
| `bearer   usr_1_2` (multi-space) | `usr_1_2` | `usr_1_2` | `usr_1_2` | PASS |
| `BEARER usr_1_2` (case-insensitive) | `usr_1_2` | `usr_1_2` | `usr_1_2` | PASS |
| `  usr_1_2  ` (whitespace-padded) | `usr_1_2` | `usr_1_2` | `usr_1_2` | PASS |
| `null` / `undefined` header | `null` | `null` | `null` | PASS |

Result: `ALL OK`. No assertion was weakened or edited to make this pass. The intentional non-RFC
scheme-less shape is preserved by the `/^\S+$/` fallback.

---

### Tests

**Command, from the repo root** (`node --test tests` does not work on this machine):

```
node --test
```

**Exact output** (summary lines only — the lines before these are app console output from
`tests/n8n-face.test.mjs` and `scripts/test-aset-data.mjs`, not test results):

```
# tests 58
# pass 58
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Identical to the pre-change baseline of 58 pass / 0 fail — these are defect fixes, so the count is
intentionally unchanged and **no new test was added**.

Targeted run of the file covering the changed parser:

```
node --test server/media.test.js
# tests 4
# pass 4
# fail 0
```

`server/media.test.js` was not modified: `git status --porcelain -- server/` listed only `auth.js`,
`db.js`, `index.js`.

---

### Verification notes

- **Signals cannot be delivered on Windows.** A first attempt to verify I-1 end-to-end (spawn
  `node server/index.js`, then `kill('SIGINT')`) returned `exit code=null signal=SIGINT` — on Windows
  `child.kill('SIGINT')` terminates the target outright instead of delivering the signal to the JS
  listener, so that attempt measures nothing about the handler. I-1 was therefore verified by running
  the **exact new handler body** with a rejecting `closePool()` in-process (see the I-1 table). The
  signal *wiring* itself is unverified on this platform; it is a straight substitution of a non-async
  listener plus the `.finally()` exit guard, and wants a Linux or CI run to prove end to end.
- **I-3 import safety was verified explicitly** (table above) precisely because a throw at module
  scope would have broken all 58 tests.
- **Not verified:** the I-2 timeouts were not exercised against a real or black-holed database — that
  needs a live Postgres and a DROP rule. They are pg's documented options; their effect is asserted
  from the option semantics, not measured.

---

### Skipped

| Skipped | Why | Add when |
|---|---|---|
| Server-side `statement_timeout` | `query_timeout` already converts the silent stall I-2 describes into a thrown error for the caller. A second timeout only matters for a statement that stays alive server-side after the client gives up. | `pg_stat_activity` shows long-lived server-side statements after a client timeout. |
| General scheme registry in `bearerToken` (rejecting bare `Basic`/`Digest`/…) | Only `bearer` is specified, and any bare scheme word is already rejected downstream by `parseToken` (it requires `usr_<id>_<ts>`). A registry would be speculative machinery. | A second auth scheme is ever added to this service. |
| Tests for these four fixes | Out of scope by instruction — this round must stay at 58. Note the consequence: the tightened cases (`'Bearer usr_1_2 junk'` → `null`, `'Bearer'` → `null`) are covered by **no committed assertion** and would regress silently. | Worth 2 assertions in `server/media.test.js` in a later task; flagged here rather than added unilaterally. |
| Minor findings M-1..M-6 | Out of scope for this round. **M-1 remains the significant one** — the review is explicit that `parseToken`'s timestamp segment is never validated, so the token is forgeable and the Task 4 role allowlist is decorative unless `requireRole` pairs it with a server-side session/timestamp lookup. | M-1 → the Task 4 brief, before `requireRole` lands. |

---

## Fix round 2

Two review findings against commit `0ef3fc0`, both in the graceful-shutdown / DB-access surface.

### N-1 (Important) — `server/index.js`, shutdown could hang forever

**Finding.** The signal handler was:

```js
server.close(() => closePool().finally(() => process.exit(0)));
```

`server.close()`'s callback only fires once *every* connection has ended. A client that holds a
response that has been started but not ended — exactly what a hung/aborted media upload does — keeps
its socket open, so the callback never fires, so `closePool()` is never reached and
`process.exit(0)` never runs. Verified reproduction: the process hangs on `SIGINT`/`SIGTERM`.

**Change.** Dropped the callback dependency entirely, in the order the finding specifies — stop
accepting, force-drop lingering connections, then close the pool and exit unconditionally:

```js
process.on(sig, () => {
  server.close();
  server.closeAllConnections?.();
  closePool().finally(() => process.exit(0));
});
```

`closeAllConnections` is called optionally (`?.`) so a Node build that does not expose it degrades
to the old `server.close()` behaviour instead of throwing. `closePool().finally(...)` means the exit
still happens if pool teardown rejects. `server.close()` keeps its no-arg form; the previous
callback existed only to sequence the exit, and sequencing is now explicit.

### N-2 (Minor) — `server/db.js`, `query()` threw synchronously

**Finding.** `export function query(text, params)` delegated straight to `getPool()`, whose
`DATABASE_URL` guard is a plain `throw`. So a caller writing the natural

```js
try { await query(...) } catch { /* handle */ }
```

was fine, but a caller writing `query(...).catch(handler)` got the error thrown *before* any
Promise existed, so the `.catch` was bypassed and the rejection surfaced at the call site instead —
an unhandled throw rather than a handled rejection.

**Change.** `export function query` → `export async function query`. The guard now surfaces as a
rejected Promise, which is what `.catch` callers expect. Nothing else moved:

- Error message is byte-identical (`'DATABASE_URL is not set'`).
- The pool stays lazy. The guard still lives inside `getPool()`'s `if (!pool)` block, so it fires
  only on first pool creation, never at module import. This is required: `server/media.test.js`
  imports these modules with no `DATABASE_URL` set, so a module-level throw would fail the whole
  suite at import time. Verified — the suite still passes.

### Test run

Command (from the repo root; `node --test tests` does not work on this machine):

```
node --test
```

```
1..58
# tests 58
# suites 0
# pass 58
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 8834.6758
```

58 pass / 0 fail, matching the baseline. No test file was edited and no test was added, so neither
fix has a committed assertion pinning it — N-1 and N-2 are both verified by inspection only. Worth
one shutdown-handler test and one `query()`-rejects test in a later task.