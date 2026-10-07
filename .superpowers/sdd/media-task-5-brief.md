# Task 5 Brief — Write routes: face photo and signature

Repo: `D:\Code\absensi_refactored_v6` (exact spelling `refactored`). Branch `master`, HEAD `88c3cc1`.

## What already exists — read these first

- `server/auth.js` — Task 4, done and reviewed. Read it in full. It is the **only** source of truth for auth. `parseToken` no longer exists.
- `server/media-payload.js` — Task 3, `decodeDataUrl`, `fileIdFromDriveUrl`.
- `server/gas.js` — Task 3, `gasUpsert`.
- `server/db.js` — Task 1, the `query` helper.
- `server/media.test.js` — 24 tests. Append only.

## The plan's Task 5 code is WRONG. Do not implement it as written

Plan lines 814–1063 contain eight defects that would cause a production outage, a cross-instansi data leak, or both. They are enumerated below with the correction. Ignore the plan's code block; implement from this brief.

## Verified facts you may rely on

Confirmed read-only against the live database this session. `postgres-mcp_query` is available if you want to re-check anything.

`user_list`
- `id` — `bigint` / `int8`. **Task 4 casts it: `req.user.id` is a STRING.**
- `NIP` — `text`, **uppercase in the actual schema**, 47 rows, 47 distinct, 0 null. There is no lowercase `nip` column, so quote it as `u."NIP"`.
- `role` — `varchar`. `instansi_id` — `text`.

`tanda_tangan`
- `nip` — `text NOT NULL`, and `tanda_tangan_nip_key` is a **UNIQUE** btree index, so `ON CONFLICT ("nip")` is valid.
- `instansi_id` — `text`, **nullable**. So the signature row can carry scope.
- `saved_by` — `bigint`, nullable. `saved_at` / `updated_at` — `timestamptz`.

The plan's `NOW()::text` for `saved_at` writes text into a `timestamptz`. Use `NOW()` directly.

## Defect list — the eight corrections

**D-1 · self-comparison is always false.** Plan line 993 does `targetId !== req.user.id` where `targetId = Number(user_id)` is a number and `req.user.id` is a string. `'1383864355' !== 1383864355` is always true, so **every non-SUPERADMIN user gets 403 when uploading their own face photo.** Compare with `String(...)` on both sides, or normalise once and compare the normalised values. Add a test where a plain ADMIN uploads their own photo and expects 200 — that test is the one that would have caught this.

**D-2 · `req.user.canManageAll` is never set.** Plan lines 993, 1011, 1036 read it. Task 4's `requireRole` sets only `{ id, nip, role, instansi_id }`, so it is always `undefined` and every branch using it silently takes the non-superadmin path. Do not add this field. Use the role and `sameInstansi()` directly.

**D-3 · `sameInstansi` is called with the wrong argument order.** Its real signature is `sameInstansi(user, targetInstansiId)`. Plan line 1324 and its siblings pass `sameInstansi(req.user.instansi_id, rows[0].instansi_id)`, so `user.role` is `undefined`, the `SUPERADMIN` bypass never fires, and the comparison degenerates to comparing two instansi strings. Pass `req.user` as the first argument.

**D-4 · the signature route has NO authorization at all.** Plan lines 1045–1063 take any `nip` from the body and write to it. Any allowlisted user could overwrite the signature of any employee in any instansi. Resolve the target employee first, then apply the same rule as the face route. A `tanda_tangan` row may not exist yet, so the scope has to come from `user_list` — join or look up by NIP to get the target's `id` and `instansi_id`, then authorize.

**D-5 · the test helper imports a deleted export and sends a rejected token.** Plan line 831 imports `parseToken`, which no longer exists — that is an `ERR`, not a failure. Plan lines 926 and 1224 send `Authorization: Bearer usr_${USER_ID}_1`, which `isSessionToken()` rejects. The existing tests inject `req.user` directly and bypass `requireRole`, so the header value is irrelevant there; if you keep a header at all, make it a syntactically valid 192-hex token so it stops implying the wrong thing.

**D-6 · internal error text is returned to the client.** Plan line 1025 returns `Upload gagal: ${e.message}`. The message can carry the Apps Script URL, file ids, or a database error string. Log the detail server-side; return a fixed message to the client. The same applies to `Simpan DB gagal`.

**D-7 · a bare Drive id in the column silently duplicates the file.** Plan line 1017 does `String(previous||'').startsWith('data:') ? null : fileIdFromDriveUrl(previous)`. `fileIdFromDriveUrl` matches on `/file/d/`, so a stored bare id such as `1AbCdEfGhIjKl` yields `null` and the upload creates a second Drive file instead of overwriting. Task 3's reviewer flagged this exact case and it is still open. Decide explicitly how to treat a non-empty, non-`data:`, non-URL value, handle it deliberately, and pin the decision with a test. Do not leave it to fall through.

**D-8 · no orphan compensation.** `gasUpsert` succeeds and then the database write can fail, leaving a Drive file nobody references and the column still pointing at the old URL. You cannot make these two systems atomic. Decide what the route does in that window and state it. A rejected write that leaves an orphan is a known cost of this ordering; an unreported one is a bug. Do not invent a rollback that deletes Drive files — a wrong delete is worse than an orphan.

## Design

### Do NOT mount the router in `server/index.js` in this task

The plan says to modify `server/index.js`. Do not, and here is the reason you must carry forward:

`js/auth.js:386` mints a session token entirely client-side with no server call:

```js
const token = 'tg_' + window.MY_ID + '_' + Date.now();
setSession(token, { nip: '', role: 'USER',.instansi_id: '' });
```

That token is not a `auth_sessions` row, it is not 192 hex, and `role: 'USER'` is not in `MEDIA_ROLES`. Every Telegram WebApp auto-login will therefore receive 401/403 from these routes. Nothing calls `/api/media/*` until the frontend is switched in Task 12, so building and unit-testing the router is safe — but wiring it into the live server before login goes through `create_session()` would break the app for those users.

Mounting is therefore gated behind Task 12 and the login fix. Build the router and prove it works in isolation.

### Authorization rule

Resolve the target employee — for the face route by `user_id`, for the signature route by `nip` — obtaining the target's `id` and `instansi_id` from `user_list`. Then apply one shared rule to both routes:

```
allowed = String(req.user.id) === String(target.id) || sameInstansi(req.user, target.instansi_id)
```

`sameInstansi` already lets `SUPERADMIN` through and already fails closed on an empty-string `instansi_id`, so an employee with no instansi can only ever write their own media. Do not re-implement any of that inline; call `sameInstansi`.

Keep the scope predicate in the SQL as well, not only in the `if`. A future route that forgets to call the helper should still be constrained by its own `WHERE` clause. That is defence in depth and the plan's stated intent — keep it.

### Scope in the writes

- `user_list` face update: scope with `AND ("instansi_id" = $n OR $superadmin_or_self)`, matching the plan's `FACE_UPSERT` shape. Keep the double-quoted `"user_list"`, `"id"` identifiers — the column really is `"id"`.
- `tanda_tangan`: keep `ON CONFLICT ("nip")`, which the unique index supports. Set `saved_by` to the authenticated user's id. Note `saved_by` is `bigint` and `req.user.id` is a string — pass the string, Postgres will cast it; do not compare it with `===` against a number.
- Neither write may run until `gasUpsert` has succeeded.

### Ordering

Keep Drive first, database second. A failed database write must leave the database untouched — that is testable and worth a test.

## Tests

Append to `server/media.test.js`. At minimum:

1. face upload by the authenticated user for themselves → 200, canonical URL stored — **this is the D-1 regression test**
2. face upload for another employee in the same instansi → 200
3. face upload for an employee in another instansi → 403, and no Drive call
4. `SUPERADMIN` may upload for anyone
5. an employee whose `instansi_id` is `''` may write only their own — the `sameInstansi` fail-closed case
6. `gasUpsert` failing → 502 and zero database writes
7. invalid or non-image payload → 400
8. payload over 5 MB → 400
9. signature upload scoped to the caller's instansi → 200
10. signature upload for another instansi's NIP → 403 — **this is the D-4 regression test**
11. signature with an empty NIP → 400
12. an unknown NIP → 404 or 403, your choice, but decided and pinned
13. the D-7 duplicate decision: a stored bare Drive id must not silently create a second file
14. responses never contain the raw internal error message — **D-6**

Baseline is **91 passing / 0 failing**, and 24 in `server/media.test.js`. Report the real numbers; do not target them.

## Ground rules

- `node --test` from the repo root `D:/Code/absensi_refactored_v6` ONLY. Any other directory collects unrelated tests and reports bogus failures.
- Shell is Windows PowerShell 5.1: no `&&`, no heredocs, no `grep`/`head`/`tail`/`wc`.
- Read-only SQL only. Never write to the database through MCP or SQL.
- Do not touch: frontend `js/` or `www/`, `dist/`, android assets, Docker/Coolify, any `.env`, `google-appscript/`, `server/db.js`, `server/index.js`, `server/auth.js`, `server/gas.js`, `server/media-payload.js`, `package.json`.
- Create exactly one new file, `server/media.js`. Do not add a migration. Do not add a config knob.
- Do not weaken any existing test.
- Commit with a clear message. Do not commit the report file.

## Verify before reporting

Run and read the output of: `node --test server/media.test.js`, `node --test` from the root, `git log --oneline -2`, `git show --stat HEAD`.

Prove D-1 and D-4 are load-bearing by mutation on a temp copy: make the self-comparison use `!==` on a number, and remove the signature-route scope check. Confirm the suite goes red for each.

## Report

Write `D:\Code\absensi_refactored_v6\.superpowers\sdd\media-task-5-report.md`. Include, for each of D-1 through D-8, what you implemented and how a test pins it. Include your D-7 decision and its justification, your orphan-window decision, and your decisions for the open questions above.

## MANDATORY evidence in your reply

A subagent in this session fabricated a completion report and another overstated its test evidence. A claim without raw output will be treated as unverified.

1. `git log --oneline -2`
2. `git show --stat HEAD`
3. `# tests` / `# pass` / `# fail` from both runs
4. The complete final source of `server/media.js`
5. Every SQL string you execute
6. Mutation results for D-1 and D-4

Status: DONE / DONE_WITH_CONCERNS / BLOCKED.