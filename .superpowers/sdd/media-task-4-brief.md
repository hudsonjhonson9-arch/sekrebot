# Task 4 Brief — Authentication middleware (CORRECTED, do not follow the plan's code)

Repo: `D:\Code\absensi_refactored_v6` (exact spelling `refactored`). Branch `master`, HEAD `e633bd7`.

## Read this first — the plan's Task 4 is built on a wrong premise

Plan lines 652–810 specify a `parseToken` that splits `usr_<id>_<ts>` and a `defaultLookup` that queries `user_list`. **Do not implement that.** I verified the real token format against the live database.

`public.create_session(nip, user_id, role,_instansi_id)` returns:

```sql
v_token := encode(gen_random_bytes(48), 'hex');   -- 192 hex chars, opaque, random
v_expires := now() + interval '24 hours';
insert into auth_sessions (session_token, nip, user_id, role, instansi_id, expires_at) ...
```

So the real session token is **192 hex characters of cryptographic randomness**, stored in `auth_sessions` alongside `nip`, `user_id`, `role`, `instansi_id`, `expires_at`, `is_active`.

The plan's `parseToken` would return `null` for every real token and 401 every real user. Its `usr_<id>_<ts>` format appears only in `n8n/face-settings-wf.json`, a separate and weaker legacy gate that parses the user id straight out of an unsigned token. That legacy pattern is exactly what this task must NOT copy.

Good news: the correct implementation is genuinely secure and simpler. A 48-byte random token with server-side expiry cannot be forged or replayed past expiry, so there is no HMAC to invent and no timestamp to parse.

`auth_sessions` has a unique btree index on `session_token`, so the lookup is indexed. No migration needed.

Table facts you need (verified):

| column | type | notes |
|---|---|---|
| `session_token` | `text` | NOT NULL, unique-indexed, 192 hex |
| `nip` | `text` | NOT NULL — the join key to `user_list` |
| `user_id` | `text` | nullable |
| `role` | `text` | NOT NULL, default `'USER'` — a snapshot taken at login |
| `instansi_id` | `text` | NOT NULL, default `''` — **empty string, not null** |
| `expires_at` | `timestamptz` | NOT NULL |
| `is_active` | `boolean` | NOT NULL, default `true` |

## Files

- Modify `server/auth.js` — keep `parseToken` and `bearerToken` exported if other code imports them; check first. Three files were touched so far (`server/index.js`, `server/db.js`, `server/auth.js` from Task 1) — read them before changing anything.
- Modify `server/media.test.js` — append only, do not rewrite existing tests.

No new files. No routes yet. No schema change.

## Interfaces

- `MEDIA_ROLES` — `Set` of `'ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN'`
- `requireRole(roles, deps)` → Express async middleware
- `sameInstansi(user, targetInstansiId)` → boolean

`requireSelfOrAdmin` is listed in the plan's interfaces but the plan never implements it. **Skip it** — Task 5 will show whether it is actually needed. Do not build it speculatively.

## Implementation

### Extracting the token

Keep `bearerToken(req)` as it already behaves. Reuse it; do not reinvent header parsing.

Add a small guard that the extracted token is a plausible `auth_sessions` value before querying — a 192-hex token. Reject anything else immediately with 401, without touching the database. This is a cheap rejection of junk and of any legacy `usr_...` token still floating around.

### The lookup

One query. It must:

- match on `session_token`
- require `is_active`
- require `expires_at > now()`
- join `user_list` on `nip` to obtain the **live** role and `instansi_id`

Use the live role from `user_list`, not the snapshot on the session row. A user demoted after logging in must lose access immediately; a snapshot keeps their old privilege until the 24h token expires. If the join misses — user deleted — return no user, so the request is rejected. Do **not** fall back to the session snapshot in that case.

Write it as a single parameterised statement. Reuse the existing `query` helper from `server/db.js`, including its timeout and error handling. Read `server/db.js` first and follow its established pattern.

### Middleware behaviour

- no token, malformed token, unknown token, or expired token → **401**, `ok: false`
- lookup throws (database down) → **500**, `ok: false`. Never fall through to `next()` on a database error — that would turn an outage into an authorization bypass.
- role not in the allowlist → **403**, `ok: false`
- otherwise attach the resolved identity to the request and call `next()`

Messages must be generic enough not to leak whether a token exists or which role failed. Do not echo the token, the role, or the user id into the response or into logs.

### sameInstansi

Per the plan: `SUPERADMIN` bypasses; a `null`/`undefined` target passes. Note that `instansi_id` is `''` and not null in this schema — decide deliberately how an empty-string target behaves and **write a test that pins your decision**. A fail-open on empty string could be a cross-instansi leak, since every user without an instansi would compare equal. The plan's version returns `true` for both `null` and `undefined`; think about what `''` should do and justify it in the report.

## Tests

Append to `server/media.test.js`. Cover at minimum:

1. `MEDIA_ROLES` contains exactly the six roles
2. no `Authorization` header → 401
3. malformed / legacy `usr_7_1` token → 401 **without a database call**
4. token that is not 192 hex → 401 without a database call
5. lookup returns nothing (unknown or expired session) → 401
6. lookup throws → **500, and `next` is never called**
7. role outside the allowlist → 403
8. role inside the allowlist → calls `next`, and the resolved identity is attached to `req`
9. live role from `user_list` wins over the stale role on the session row
10. `sameInstansi` — including the empty-string target case and the `SUPERADMIN` bypass

Inject the lookup via `deps.lookup` as the plan does, so tests never touch the database.

`server/media.test.js` currently has 11 tests. Report your exact final count for that file and for the full suite; the plan's stated numbers (13 and 72) are stale and wrong.

## Ground rules

- `node --test` from the repo root ONLY. From any other directory it silently collects unrelated tests and reports bogus failures.
- Baseline is **78 passing / 0 failing**.
- Shell is Windows PowerShell 5.1: no `&&`, no heredocs, no `grep`/`head`/`tail`/`wc`, no Unix env-prefix syntax.
- Do NOT touch frontend `js/` or `www/`, `dist/`, android assets, Docker/Coolify, any `.env`, `google-apps-script/`, `server/db.js`, `server/index.js`, `server/gas.js`, `server/media-payload.js`, or `package.json`.
- Do not weaken any existing test to make your change pass.
- Do not run any SQL that writes. Read-only queries only.
- Commit with a clear message. Do not commit the report file.

## Verify before reporting

Actually run and read the output of:
- `node --test server/media.test.js`
- `node --test` from the repo root
- `git log --oneline -2` and `git show --stat HEAD`

Also confirm by mutation on a temp copy that the 500-not-403 and 401-not-next cases are genuinely load-bearing.

## Report

Write `D:\Code\absensi_refactored_v6\.superpowers\sdd\media-task-4-report.md`. Include:
- the query you used and why the live role wins over the session snapshot
- your decision on the empty-string `instansi_id` target, with justification
- confirmation that the legacy `usr_<id>_<ts>` format is now rejected
- exact commands and real output
- anything you could not verify

## MANDATORY evidence in your reply

A previous subagent in this session fabricated a completion report. Verify before claiming DONE.

1. `git log --oneline -2`
2. `git show --stat HEAD`
3. `# tests` / `# pass` / `# fail` from both the single-file and full root runs
4. The full source of your `server/auth.js`
5. The exact SQL string you execute
6. Mutation results for the two fail-closed cases

Status: DONE / DONE_WITH_CONCERNS / BLOCKED.