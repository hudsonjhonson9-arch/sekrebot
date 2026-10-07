# Task 1 review — Backend skeleton (Express, pg pool, token parsing, health route)

**Base:** `07ebdd8` → **Task commit:** `73a2b6d`
**Reviewer scope:** spec compliance + code quality (per-task gate)
**Reviewed artefacts:** `media-task-1-brief.md`, `media-task-1-report.md`, `media-task-1-review.md`, plus the working tree at `73a2b6d` (re-measured independently).

---

## 1. Verdict summary

| Gate | Verdict |
|---|---|
| Spec compliance | **✅ PASS** (one declared deviation adjudicated and accepted; test-count drift is the brief's error, not the implementer's) |
| Code quality | **APPROVED with 4 Important + 5 Minor findings.** Nothing blocks Task 2. Three of the four Important items are 1–3 line fixes that belong in this file set before the first real DB query lands in Task 2/3. |

---

## 2. Spec compliance

### 2.1 File list — all present, all changed, nothing extra

| Brief | Status | Evidence |
|---|---|---|
| Modify `package.json` | ✅ | `+start`, `+test` scripts; `+dotenv`, `+express`, `+pg` in `dependencies` |
| Create `server/db.js` | ✅ | 29 lines, matches Step 5 code verbatim |
| Create `server/auth.js` | ✅ | 16 lines, `parseToken` verbatim, `bearerToken` deviates (see 2.3) |
| Create `server/index.js` | ✅ | 25 lines, matches Step 7 code verbatim |
| Create `server/media.test.js` | ✅ | 24 lines, verbatim from Step 1 |
| `package-lock.json` | ✅ (implied by Step 3/10) | +1021 lines |

Verified via `git diff --stat 07ebdd8 73a2b6d -- . ':(exclude)package-lock.json'`:

```
 package.json         |  7 ++++++-
 server/auth.js       | 16 ++++++++++++++++
 server/db.js         | 29 +++++++++++++++++++++++++
 server/index.js      | 25 ++++++++++++++++++++++
 server/media.test.js | 24 +++++++++++++++++++++++
 5 files changed, 100 insertions(+), 1 deletion(-)
```

**Forbidden paths untouched — confirmed.** No `js/`, `www/`, `dist/`, android asset, or Docker/Coolify file appears in the commit. No `.env` was created (`Test-Path .env` → False, and it is not in `git status`). No `.env.example` was created either.

### 2.2 Produced interfaces — all present with the declared signatures

- `query(text, params)` → `Promise<pg.QueryResult>` — `server/db.js:19`
- `closePool()` → `Promise<void>` — `server/db.js:23`
- `parseToken(token)` → `number | null` — `server/auth.js:1`
- `bearerToken(req)` → `string | null` — `server/auth.js:10`
- `createApp()` → `express.Application` — `server/index.js:4`

`getPool()` is exported but is **not** in the brief's "Produces" list. It appears in the brief's Step 5 code block, so this is spec-consistent, and it is not dead code (`query()` calls it). No action.

`requireRole` was correctly **not** added (brief defers it to Task 4). No speculative interface, no config for a value that never changes, no premature abstraction. This is the right amount of code for this task.

### 2.3 Adjudication of the declared `bearerToken` deviation — **ACCEPTED**

The brief is self-contradictory: its Step 6 `bearerToken` cannot satisfy its own Step 1 assertion `bearerToken({ headers: { authorization: 'usr_1_2' } }) === 'usr_1_2'`. Diagnosis is correct — `'usr_1_2'.split(' ')` yields one element, so `rest` is empty, `value` is `''`, and the `if (!value) return null` guard fires. Assertions beat illustrative code, so the test wins. Correct call.

I re-derived the behavioural delta between the brief's version and the implemented version by executing both against the same input matrix:

| `authorization` | brief's code | implemented | `parseToken` result |
|---|---|---|---|
| `Bearer usr_1_2` | `usr_1_2` | `usr_1_2` | `1` |
| `usr_1_2` | `null` ❌ | `usr_1_2` ✅ | `1` |
| `''` / `{}` | `null` | `null` | `null` |
| `Basic abc` | `null` | `null` | `null` |
| `BEARER usr_1_2` | `usr_1_2` | `usr_1_2` | `1` |
| `bearer   usr_1_2` | `usr_1_2` | `usr_1_2` | `1` |
| `Bearer usr_1_2 junk` | `usr_1_2 junk` | `usr_1_2 junk` | `1` |
| `Bearer` (scheme only) | `null` | `Bearer` | `null` (rejected downstream) |
| `  usr_1_2  ` | `null` | `usr_1_2` | `1` |

**The deviation changes exactly one input** (the one the brief's test demands) plus the two whitespace/scheme-only corners. On every multi-word input the two versions are byte-identical — including the messy `Bearer usr_1_2 junk` case, so the report's claim that security is unchanged is accurate in substance. The implementation is, if anything, *tighter* than the brief: it rejects any scheme other than `bearer` unconditionally, and it no longer returns a leading-space-laden value.

**Is it a correct, safe HTTP `Authorization` parser?** Not strictly — RFC 9110 §11.1 defines `Authorization = credentials`, and `credentials` requires an `auth-scheme`; a scheme-less header is not a conformant `Authorization` value. But:

1. The brief's own test mandates the scheme-less shape, so this is a spec-level requirement, not implementer leniency.
2. It is not a privilege-escalation surface. The token *is* the credential; anything an attacker can send as `Bearer X junk` they can equally send as bare `X`. Every value that leaves `bearerToken` still has to survive `parseToken`'s shape gate, and the scheme-bearing rejections (`Basic …`, `Digest …`) are intact.
3. The one genuine laxity — a bare scheme word with no credentials (`Bearer` → `'Bearer'`) — is caught only incidentally by `parseToken`, not by the parser. That is luck, not design, and is trivially tightened (finding I-4).

Verdict: **the deviation is correct, minimal, and safe. Accept it.** Tighten opportunistically as noted, but do not block Task 2 on it.

### 2.4 Adjudication of the test-count claim — **58 IS CORRECT; the brief is wrong**

The brief predicted "57 passing (53 baseline + 4 new)". The implementer reports 58 (54 + 4). I measured it independently three ways rather than taking the report's word:

1. **Full suite, as committed:** `node --test` → `# tests 58 / # pass 58 / # fail 0 / # cancelled 0 / # skipped 0 / # todo 0`.
2. **Same suite with `server/media.test.js` temporarily removed:** `# tests 54 / # pass 54 / # fail 0`. Delta is exactly **+4**.
3. **Per-file enumeration of everything `node --test` discovers from the repo root:**

   | test file | tests | tracked at `07ebdd8`? |
   |---|---:|---|
   | `scripts/test-aset-data.mjs` | 1 | yes (a *script*, not a test — pre-existing noise) |
   | `tests/aset-emoji.test.mjs` | 6 | yes |
   | `tests/aset-markup.test.mjs` | 10 | yes |
   | `tests/aset-nav.test.mjs` | 9 | yes |
   | `tests/aset-router.test.mjs` | 7 | yes |
   | `tests/aset-screens.test.mjs` | 5 | yes |
   | `tests/pks.test.mjs` | 9 | yes |
   | `tests/aset-kondisi.test.mjs` | 3 | **no — untracked in the worktree** |
   | `tests/n8n-face.test.mjs` | 4 | **no — untracked in the worktree** |
   | `server/media.test.js` | 4 | new in this commit |

   47 committed + 7 untracked-in-worktree = **54 baseline**; 54 + 4 = **58**. The arithmetic closes exactly.

**The delta is exactly the 4 tests in `server/media.test.js` — no duplicated test, no missing test, nothing silently skipped** (`# skipped 0`, `# todo 0`, `# cancelled 0` all confirm). The brief's "53" was an authoring error; the implementer detected and documented it rather than bending the run to hit a wrong number. Correct behaviour.

Two side notes worth carrying forward to later gates:

- The 54 baseline depends on **two untracked test files** that exist only in this working tree. On a clean clone the baseline is 47 and `npm test` will report **51**, not 58. The report's "expect 58" guidance is correct for this machine only.
- `tests/n8n-face.test.mjs` and `scripts/test-aset-data.mjs` print `# PASS summary …` lines that look like test results but are app console output. Correctly called out in the report.

### 2.5 Gate checks actually run

- Step 2 red-first: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module …\server\auth.js` — plausible and correctly quoted.
- Step 8: `node --test server/media.test.js` → I re-ran: `# tests 4 / # pass 4 / # fail 0`. ✅
- Step 9: `npm test` → I re-ran: `# tests 58 / # pass 58 / # fail 0`. ✅
- The brief's forbidden form `node --test tests` was correctly avoided; `node --test` from repo root is the command that works here.
- `server/index.js` import safety: **re-verified independently.** `import('./server/index.js')` → `createApp: function`, listening `Server` handles after import: **0**. The `isMain` guard holds.

### 2.6 Deviations, restated

- **`bearerToken`** — accepted, see 2.3.
- **`dotenv` installed but unimported** — correct. The task constraint requires it in `dependencies`; the brief's code never imports it. Adding `import 'dotenv/config'` now would have been unrequested scope. Flagged in the report with a one-line follow-up plan. Accept — but see finding I-3, because the *absence* of that import is what makes I-3 dangerous.
- **Newer patch/minor versions** (`express ^4.22.3`, `pg ^8.23.1` vs the `^4.21.2` / `^8.13.1` floors) — semver-compatible, inside the requested range, not pinned. Accept.

---

## 3. Code quality

### 3.1 Checks that passed

| Check | Result |
|---|---|
| **SQL injection surface** | None in Task 1. `query()` is a thin pass-through to `pool.query(text, params)`; `pg` parameterizes `$1` placeholders. No string concatenation into SQL exists anywhere in the diff. Flag for Tasks 2–3: every caller must use placeholders, never interpolation. |
| **Secret leakage in logs** | `server/db.js:15` logs only `e.message`, never the pool, the config, or the connection string. I checked the failure mode: `new Pool({connectionString})` with a malformed `DATABASE_URL` throws from `pg-connection-string`, and its message is literally `Invalid URL` — it does **not** echo the input string. Verified by execution. No secret-leak path. |
| **Secret leakage in commit** | No `.env`, no credentials, no tokens in the diff. `package-lock.json` contains only public registry URLs and integrity hashes. |
| **Unhandled rejection — request path** | None. `query()` returns the promise to its caller; it neither awaits-and-drops nor creates an orphan. (The signal handler *does* have this bug — see I-1.) |
| **Pool error events** | `server/db.js:15` registers a `'error'` listener, so an idle-client error will not crash the process via Node's unhandled-`'error'` behaviour. Correct. |
| **Lazy pool creation** | Good: no connection is attempted at import time, which is exactly why the test suite needs no `DATABASE_URL`. This is the right design and it is why the 58-test run is hermetic. |
| **Resource leak on failure paths** | `closePool()` correctly nulls the module-level `pool` *before* awaiting `p.end()`, so a concurrent `getPool()` during shutdown yields a fresh pool rather than an ending one. (The rejection case is not covered — folded into I-1.) |
| **Dead code** | None. `getPool` is used by `query`; `closePool` is used by the signal handlers; `createApp` is exported per the brief's interface list. `express.json({ limit: '8mb' })` is unused *today* but was brief-specified for the Task 2+ upload routes, so it is not dead. |
| **Health route** | `server/index.js:9-11` returns a static liveness payload. Correct for Task 1; it deliberately does not touch the DB, so it cannot be used as a readiness signal. Worth stating in a later task, not a defect here. |
| **Role allowlist** | Out of scope for Task 1; `requireRole` correctly deferred. |

### 3.2 Findings

#### I-1 · Important · `server/index.js:19-24` — async signal handler can hang shutdown and raise an unhandled rejection

```js
process.on(sig, async () => {
  await closePool();
  process.exit(0);
});
```

`process.on` ignores the promise returned by an async listener, so nothing awaits it. If `p.end()` rejects (a live client that will not drain, an already-closed pool, a socket error), the listener's promise rejects with **no handler** → `UnhandledPromiseRejection`, and because `process.exit(0)` sits *after* the `await`, it never runs. The container then has to be SIGKILLed. Also, `createApp().listen(port, ...)` discards the server handle, so in-flight requests cannot be drained before the hard exit.

Fix:

```js
const server = createApp().listen(port, () => console.log(`[media] listening on :${port}`));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => closePool().finally(() => process.exit(0)));
  });
}
```

#### I-2 · Important · `server/db.js:9-12` — no connect or query timeout; a black-holed DB hangs every request forever

`new Pool({ connectionString, ssl, max: 5 })` sets no `connectionTimeoutMillis` and no `query_timeout`, and both default to *no timeout*. A refused connection fails fast, but a **dropped/black-holed** connection (firewall DROP, severed container network) leaves `pool.query()` pending indefinitely. With `max: 5` the first five requests hang, every later request queues behind them, and **nothing is ever logged** — the `pool.on('error')` listener at line 15 only covers *idle* clients, not in-flight queries. The failure mode is a silent total stall rather than a 500.

Fix — two lines in the Pool options:

```js
connectionTimeoutMillis: 5000,
query_timeout: 15000,
```

#### I-3 · Important · `server/db.js:10` + missing `import 'dotenv/config'` — unset `DATABASE_URL` silently targets localhost instead of failing

`server/db.js` already reads `process.env.DATABASE_URL` in this task, but `dotenv` is installed and **not imported**, so `.env` is never loaded, and `getPool()` does not check the variable. With `DATABASE_URL` unset, `pg` falls back to its own defaults — `localhost:5432` as the OS user — so a misconfigured deploy does not crash; it opens connections to the wrong database. On a host that happens to run a local Postgres (or whose `PGHOST`/`PGUSER` are inherited from the supervisor), that is a silent wrong-target read/write path.

Fix (two one-liners, both already foreshadowed by the report):

```js
// server/index.js, line 1
import 'dotenv/config';
```
```js
// server/db.js, inside getPool() before `pool = new Pool(...)`
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
```

#### I-4 · Important · `server/auth.js:10-16` — `bearerToken` accepts trailing garbage after the token

Verified by execution: `Authorization: Bearer usr_1_2 junk` → `'usr_1_2 junk'` → `parseToken` → **`1`**. `parseToken` only inspects `parts[0]` and `parts[1]`, so anything after the second underscore is discarded. As established in 2.3 this is **not** an escalation (the token is itself the credential) and the brief's original code had the identical behaviour, so it is inherited rather than introduced — but the parser is looser than RFC 9110 permits, and `Authorization: Bearer` (scheme with no credentials) returns the string `'Bearer'`, rejected only by downstream luck.

Fix — two lines, preserves all four brief assertions:

```js
const m = /^Bearer\s+(\S+)$/i.exec(raw);
if (m) return m[1];
return /^\S+$/.test(raw) ? raw : null;
```

Check: `Bearer usr_1_2`→`usr_1_2` ✅ · `usr_1_2`→`usr_1_2` ✅ · `{}`/`''`→`null` ✅ · `Basic abc`→`null` ✅ · `Bearer usr_1_2 junk`→`null` (fixed) · `Bearer`→`null` (fixed).

#### M-1 · Minor · `server/auth.js:1-8` — the timestamp segment is never validated; carry this into the Task 4 brief

Verified: `usr_1_`, `usr_1_junk`, and `usr_1_2_3_4` all parse to `1`. Only `parts[0] === 'usr'`, `parts.length >= 3`, and `Number.isSafeInteger(Number(parts[1])) && > 0` are checked; `parts[2]` is never inspected. This is verbatim brief behaviour, so it is **spec-compliant**, and the interface (`parseToken → number | null`) only promises id extraction.

But it means `parseToken` on its own is **not authentication**: the id is attacker-chosen and the token is trivially forgeable. `Authorization: usr_1_1750000000000` yields user 1. Unless Task 4's `requireRole` pairs this with a server-side session/timestamp lookup, the entire role allowlist (`ADMIN`, `SUPERADMIN`, `KEPALA`, `SEKRETARIS`, `KABID`, `IRBAN`) is bypassable by anyone who can reach the port. **This is the single most important thing to carry into the Task 4 brief.** I have not reviewed Task 4 and cannot confirm whether that check exists.

#### M-2 · Minor · `server/index.js:17` — `PORT` is unvalidated

`Number(process.env.PORT || 8081)`. I tested `PORT=not-a-number`: Node 22 throws `RangeError [ERR_SOCKET_BAD_PORT] … Received type number (NaN)`, so it **fails fast rather than silently binding a random port** — good, and better than I expected. Remaining nits: the surfaced error is a raw internal stack trace rather than a config message, and `PORT=0` still binds an ephemeral port without warning.

Fix:

```js
const port = Number(process.env.PORT ?? 8081);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be an integer 1-65535, got: ${process.env.PORT}`);
}
```

#### M-3 · Minor · `server/index.js:15` — `isMain` compares basenames only

```js
import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
```

Only the final path segment is compared, so *any* entry point whose basename is `index.js` that imports this module would spuriously bind `:8081`. It is correct today — re-verified that importing binds zero servers, and `node --test server/media.test.js` passes because the runner's `argv[1]` is `media.test.js` — and the report flags it honestly. Correct form, stdlib only, same length:

```js
import { pathToFileURL } from 'node:url';
// ...
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
```

#### M-4 · Minor · all four files under `server/` — no trailing newline

`\ No newline at end of file` on `auth.js`, `db.js`, `index.js`, and `media.test.js`. Cosmetic; produces a noisy diff on the next edit that touches any last line.

#### M-5 · Minor / informational — lint config has no Node globals for `server/**`

`npx eslint server/` reports 7 × `no-undef` on `process` (`db.js:10,11`; `index.js:15,17,20,22`). **Not a Task 1 regression** — I measured `npx eslint .` at **16 104 errors on the pre-task tree**, so `npm run lint` was already failing before this commit and is not a usable gate. If it ever becomes one, add a `server/**` block with `languageOptions: { globals: { process: 'readonly' } }`.

#### M-6 · Minor / informational — no `.env.example` for three env reads already in the code

Task 1 introduces reads of `DATABASE_URL`, `PGSSL`, and `PORT`, and `Test-Path .env.example` → False. The brief's file list does not require one and the global constraint only forbids *secret values*, so this is **not** a spec violation and correctly was not created. A later task should add a value-free `.env.example` documenting these three names.

---

## 4. Constraint checklist

| Constraint | Status |
|---|---|
| Double-quoted SQL identifiers | N/A — no SQL in Task 1. Nothing for later tasks to copy wrongly. |
| Token format `usr_<id>_<timestamp>` | ✅ `parseToken` matches. See M-1 on the unvalidated timestamp. |
| Role allowlist | N/A — `requireRole` deferred to Task 4. See M-1. |
| ESM (`"type": "module"`) | ✅ All four files use `import`/`export`; no `require`, no `__dirname`. |
| `node --test` from root (not `node --test tests`) | ✅ Correct form used; verified working. |
| `server/index.js` must not bind on import | ✅ Re-verified independently: 0 listening handles after import. |
| No `.env` created/committed | ✅ No `.env` exists; not in `git status`. |
| `.env.example` free of secrets | ✅ N/A — none created. |
| No new abstraction / speculative interface | ✅ None. `getPool` is brief-specified and internally used. |
| `dotenv` present in `dependencies` | ✅ `"dotenv": "^18.0.5"`. Unimported, correctly — see I-3. |
| Forbidden paths untouched | ✅ Only `package.json`, `package-lock.json`, `server/**` in the commit. |
| No secrets logged/committed | ✅ Verified, including the `pg-connection-string` throw path. |

---

## 5. Recommendation

**Accept Task 1.** Spec compliance is clean, the two self-reported problems in the brief were both real and both handled correctly, and the code is appropriately minimal for a foundation task — no speculative machinery, no premature abstraction, no config for a value that never changes.

Before Task 2 lands its first real DB query, land the cheap half of the quality findings: **I-1, I-2, I-3, I-4** are 1–3 lines each, all inside files this task already owns, and all four are the kind of thing that is a 3am page instead of a review comment once a request is in flight. **M-1 must be resolved in the Task 4 brief**, not here — it is the difference between a role allowlist and a decorative one.

**Reviewer note on process:** verifying the 54-test baseline required temporarily removing `server/media.test.js` from the working tree. During that check a `Copy-Item` restored the file as a stray file named `server`, clobbering the directory. It was detected immediately and repaired with `git checkout -- server/`; `git status --porcelain server` is clean and `node --test server/media.test.js` passes 4/4. No task-1 work was lost — all four files are in commit `73a2b6d`. Flagging it because a review that mutates the tree it is reviewing is a review that can damage it.

---

# Fix round 1 re-review

**Base:** `73a2b6d` → **Fix commit:** `0ef3fc0` (`fix(server): harden shutdown, pool timeouts, env fail-fast, and bearer parsing`)
**Working tree:** `HEAD = 0ef3fc0`, `git status --porcelain` shows only pre-existing untracked entries — **no tracked file modified**. This re-review was read-only; nothing was stashed, checked out, or written inside the repo. Probe scripts were written to `C:\Users\Agil\AppData\Local\Temp\opencode\sigtest\` instead.

## 1. Verdict summary

| Finding | Status |
|---|---|
| I-1 async signal listener | **Resolved** for the stated defect (unhandled rejection + skipped exit). Exit is *not* fully unconditional — see **N-1**. |
| I-2 pool had no timeout | **Resolved.** |
| I-3 `dotenv` unimported / silent localhost fallback | **Resolved**, including the import-time constraint. |
| I-4 `bearerToken` trailing junk / bare scheme | **Resolved.** |

**Final: APPROVED.** N-1 is Important but not blocking (Docker's post-grace SIGKILL bounds it, and the original defect is genuinely gone). N-2 and N-3 are Minor and belong to Task 2/3.

## 2. Per-finding confirmation

### I-1 · Resolved (with N-1 attached)

`server/index.js:18` now captures the `listen()` handle; `:21` the listener is non-async; `:22` `server.close(() => closePool().finally(() => process.exit(0)))`. HTTP closes before the pool — ordering requirement met. The server-handle capture is a genuine improvement: the old code discarded it, so in-flight requests could never drain.

I did **not** take the report's simulation on trust. I extracted the exact expression and ran it in isolation with a rejecting `closePool`:

```
node a-finally-exit.mjs   ->  FINALLY_RAN ; exit_code=0 ; unhandledRejection: none
```

`.finally()` runs on rejection, `process.exit(0)` executes, exit code 0, and no `unhandledRejection` fires (the chained promise rejects, but the synchronous `process.exit` in the `finally` handler terminates first, so the rejection is never reported). The original bug — rejection skipping the exit — is genuinely dead.

The Windows SIGINT limitation is accepted as stated, and it is not a gap in coverage for this fix: `process.emit('SIGTERM')` exercises the identical handler body, which is what I used for N-1. The signal *wiring* (two `process.on` registrations) is trivial and visibly correct at `:19-24`.

### I-2 · Resolved

`server/db.js:16-17`. Verified against the live pool object, not the source text:

```
connectionTimeoutMillis= 10000
query_timeout= 30000
statement_timeout= undefined
max= 5
```

Both are pg's documented option names and both reach `pool.options`. I also closed the gap the original finding raised about *queueing*: pg starts `query_timeout` only once a client is acquired, so an exhausted pool would in principle still queue forever. It does not — an exhausted pool forces a new connection attempt, which `connectionTimeoutMillis` caps at 10s, after which the query rejects. Total stall is now bounded at roughly 10s + 30s. Resolved.

The deliberate omission of server-side `statement_timeout` is correct and honestly disclosed in the report's Skipped table; it is not required to fix I-2.

### I-3 · Resolved, including the import-time constraint

`server/db.js:1` `import 'dotenv/config'`; `:11` `if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');` inside `getPool()`, **not** at module scope. Verified with no `DATABASE_URL` in the environment:

```
import OK; DATABASE_URL= undefined          <- db.js imports cleanly
getPool threw: DATABASE_URL is not set      <- guard fires only at pool creation
createApp type: function | listening Server handles: 0   <- index.js imports + binds nothing
```

This is exactly the required shape: the guard is lazy, so `server/media.test.js` stays hermetic, and `localhost:5432` fallback is now unreachable. Placing the import in `db.js` rather than `index.js` is the better choice — any consumer of the module gets `.env` loaded. dotenv 18.0.5 emits no console banner, so the test output stays clean (verified).

### I-4 · Resolved

Full matrix re-executed against the committed file. Both reported defects are dead and all four brief assertions survive:

| `authorization` | `bearerToken` | `parseToken` | note |
|---|---|---|---|
| `Bearer usr_1_2` | `usr_1_2` | `1` | brief assertion 1 ✅ |
| `usr_1_2` | `usr_1_2` | `1` | brief assertion 2 ✅ scheme-less preserved |
| *(missing header)* / `''` | `null` | `null` | brief assertion 3 ✅ |
| `Basic abc` | `null` | `null` | brief assertion 4 ✅ non-bearer scheme still rejected |
| `Bearer usr_1_2 junk` | **`null`** | `null` | **fixed** |
| `BEARER usr_1_2 junk` | **`null`** | `null` | **fixed** |
| `usr_1_2 junk` | **`null`** | `null` | **fixed** |
| `Bearer` | **`null`** | `null` | **fixed** |
| `bearer   usr_1_2` / `Bearer\tusr_1_2` | `usr_1_2` | `1` | multi-space / tab still fine |
| `BEARER usr_1_2` | `usr_1_2` | `1` | case-insensitive ✅ |
| `  usr_1_2  ` | `usr_1_2` | `1` | trimmed ✅ |
| `Basic` | `Basic` | `null` | unchanged from before; rejected downstream — see N-3 |

The fixer's addition of `&& !/^bearer$/i.test(raw)` beyond the review's suggested patch is **correct and necessary** — the review's own two-line patch would still have returned `'Bearer'`, because a bare word satisfies `/^\S+$/`. The fixer spotted this and said so. Good judgement.

## 3. Constraint re-verification

| Constraint | Result | Evidence |
|---|---|---|
| `server/media.test.js` unchanged, 4 assertions passing | ✅ | `git diff --exit-code 73a2b6d 0ef3fc0 -- server/media.test.js` → **exit 0** (byte-identical). `node --test server/media.test.js` → `# tests 4 / # pass 4 / # fail 0` |
| Scheme-less `usr_1_2` → `usr_1_2` | ✅ | matrix row 2 |
| Non-bearer scheme → `null` | ✅ | matrix row 4 |
| `server/index.js` binds no port on import | ✅ | 0 listening `Server` handles after import |
| No `.env` created or read | ✅ | `Test-Path .env` → False; `Test-Path .env.example` → False; `git ls-files` matches no `env` path |
| No secret values anywhere | ✅ | `git grep -E "postgres://|postgresql://|password|secret|api[_-]?key" -- server/ package.json` → **exit 1**, no matches |
| Nothing outside the backend files touched | ✅ | `git diff --name-status 73a2b6d 0ef3fc0` → `M server/auth.js`, `M server/db.js`, `M server/index.js`. No `js/`, `www/`, `dist/`, android, Docker/Coolify. No `package.json` / `package-lock.json` change either |

## 4. Test evidence — credible

Reproduced both claims verbatim from the repo root:

```
node --test              -> # tests 58  # pass 58  # fail 0  # cancelled 0  # skipped 0  # todo 0
node --test server/media.test.js -> # tests 4  # pass 4  # fail 0
```

`# skipped 0 / # todo 0 / # cancelled 0` confirms nothing was silently disabled to reach the number, and `# fail 0` on a 58-test suite that includes the 7 untracked-in-worktree files noted in §2.4 of the prior review. The reported counts are exact and independently confirmed.

**Suffiency caveat, stated honestly:** the suite covers *none* of the four fixes. 58/58 is a no-regression result, not a correctness result for I-1..I-4. The fixer compensated correctly by probing each fix directly — pool options inspected on the live object, the handler body executed in isolation, the guard exercised at both import and call time — and I re-ran that probing rather than accepting it. For I-1 the compensating probe is the right substitute on Windows. No test was added (correct: the brief's assertion count is a spec constraint), but see N-3.

## 5. New findings introduced by the fix

### N-1 · Important · `server/index.js:22` — exit path is still not unconditional; an in-flight response at signal time hangs shutdown

`process.exit(0)` now sits inside `server.close()`'s callback. That callback fires only once **every** connection has closed. So the exit is gated on a condition the fix itself introduced, and one the pre-fix code did not have — `await closePool(); process.exit(0)` exited regardless of open sockets.

Reproduced with the exact handler shape against a real `http.Server`, client holding a started-but-unended response:

```
  327ms client reading a response that will never end
  328ms signal emitted
 4341ms RESULT: HUNG - exit(0) never ran 4s after signal; unhandled=null
exit_code=9
```

`closePool()` resolved fine in this run — the pool is irrelevant. The hang is purely the open response. This is a new failure mode relative to `73a2b6d`.

**Scope, measured rather than assumed.** Two narrower cases do *not* hang, and I checked each:
- an **idle** keep-alive socket → `close()` callback fires, exit 0 (Node 19+ auto-closes idle connections on `close()`);
- a **stalled request body** (partial POST, response never started) → exit 0;
- only a **started-but-unended response** hangs.

So the exposure is narrow. It is not nothing: this service exists to serve media uploads, and a response that has begun and not finished is exactly what a large in-flight upload looks like. Impact is bounded in practice by Docker sending SIGKILL after the grace period, which is why this is Important and not Critical, and why it does not block Task 2.

Concrete fix — stdlib only, Node ≥18.2 (`closeAllConnections` is a built-in method on `http.Server`, no dependency):

```js
process.on(sig, () => {
  server.close();
  server.closeAllConnections?.();   // abort in-flight, let close() complete
  closePool().finally(() => process.exit(0));
});
```

This keeps the required ordering (HTTP closed first, then pool) and makes the exit genuinely unconditional, which is what I-1 asked for.

### N-2 · Minor · `server/db.js:24` — `query()` now throws synchronously, breaking its declared `Promise` contract for `.catch()` chaining

The brief declares `query(text, params) → Promise<pg.QueryResult>`. The new guard sits in `getPool()`, which `query()` calls *outside* any promise, so a missing `DATABASE_URL` throws at the call site instead of rejecting:

```
query() THREW SYNCHRONOUSLY: DATABASE_URL is not set
```

Inside an `async` Express handler `await query(...)` this is indistinguishable from a rejection. But `query(...).catch(...)` — a natural shape once Task 2/3 have error branches — throws before `.catch` is ever attached, so it escapes as a synchronous throw rather than being handled. Pre-fix this only happened on a malformed `DATABASE_URL`; post-fix it happens on *every* unconfigured call, so it will be hit.

One-word fix, same file:

```js
export async function query(text, params) {
  return getPool().query(text, params);
}
```

### N-3 · Minor / informational · the tightened `bearerToken` behaviour has no committed assertion

`'Bearer usr_1_2 junk'` → `null` and `'Bearer'` → `null` are the *entire point* of I-4, and no test covers either. They were previously wrong, they are now right, and nothing prevents them from silently reverting. The report discloses this accurately in its Skipped table rather than quietly omitting it, and holding the count at 58 was the right call for this round. Add two assertions to `server/media.test.js` in Task 2 — that file is the natural home and the assertions are one line each.

Related, unchanged and **not** a regression: `bearerToken({authorization:'Basic'})` still returns `'Basic'`, because a single bare non-`bearer` word satisfies the `/^\S+$/` fallback. `parseToken` rejects it (`parts[0] !== 'usr'`). Identical to the pre-fix behaviour on this input, and the report lists the scheme-registry alternative under Skipped with a sound rationale.

## 6. Status of the Minor findings

M-1..M-6 are untouched, correctly so for this round. Two notes for the Task 4 brief:

- **M-1 is unchanged and remains the one that matters**: `parseToken` never validates the timestamp segment, so the token is forgeable and the role allowlist is decorative unless `requireRole` pairs it with a server-side session/timestamp lookup. Nothing in this fix touched it, and it should not be allowed to drift another task.
- **M-4 persists** — `\ No newline at end of file` still on all three modified files. Cosmetic; will produce a noisy diff on the next edit that touches a last line.

## 7. Recommendation

**Approve.** All four Important findings are genuinely fixed, not cosmetically addressed — I confirmed each by execution rather than by reading the diff, and the fixer's `&& !/^bearer$/i` clause is a genuine improvement over the review's own suggested patch. The two constraints that mattered most, `server/media.test.js` untouched and no throw at module import, both hold exactly as required, and nothing outside the three backend files moved.

Take **N-1** as a 2-line follow-up before or during Task 2 — it is the only item where the fix is incomplete against its own requirement, and it is cheapest to apply while `server/index.js` is still this small. **N-2** should land with the first real DB query in Task 2/3, before a caller adopts a `.catch()` shape that the sync throw would escape. **N-3** is two assertions whenever the test file is next legitimately edited.
