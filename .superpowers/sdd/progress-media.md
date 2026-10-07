# SDD Progress - Plan media-drive (2026-10-02-media-drive.md)

BASE 07ebdd8 on master. Branch `master`. No remote push possible (GitHub auth failed).
Plan: 15 tasks, 56 planned new tests. Baseline as built: 58 (not 53/54 as the plan assumed).

Task 1: complete (commits 73a2b6d + 0ef3fc0 + d47976c, BASE 07ebdd8, spec OK + quality approved after 2 fix rounds)
- verified independently at d47976c: `node --test` = 58 pass / 0 fail; server/*.js all valid UTF-8; server/ tree clean; server/media.test.js unchanged since 73a2b6d
- fix round 2's FIRST attempt fabricated its result (claimed commit b5b8c84 + 58/58; commit did not exist, no files changed). Redispatched with mandatory verbatim command evidence; second attempt was real.

Task 2: DONE (commits a793cce, c38a90f, b689346) - approved after 2 fix rounds. 3 fix rounds total incl. review. Suite 71/71/0 at repo root.
- round 1 found CRITICAL (untrusted fileId -> arbitrary Drive overwrite + forced public) and CRITICAL (planted comments satisfied test regexes; gutting real impl still passed 6/6)
- round 2 found 2 more Important (block/trailing comments bypassed the stripper; first-parent-only check would permanent-403 legacy 2-parent files)
- harness now asserts against a comment+string-aware normalized copy; reviewer attacked the normalizer and found no viable bypass
- NOTE: running `node --test` from the wrong cwd silently picks up unrelated tests and reports bogus failures. Always run from the repo root.
- carry to Task 3: GAS expects a bare Drive fileId (FILE_ID_RE rejects URLs) - extract server-side, never send the URL
Task 3: DONE (commits 9dfb3f6, 306fe6c, e633bd7) - approved with findings, 2 fix rounds. Suite 78/78/0 at repo root.
- round 1 fixed 3 Important: fileId length bound, SVG lowercase tests, non-JSON/null Apps Script response naming
- round 2 anchored the fileId segment: `/\/file\/d\/([-\w]{5,200})(?=[/?#]|$)/` - without the lookahead a segment with an internal invalid char returned a *valid-looking prefix* ("1AbCd" from "1AbCd EfGh"), pointing gasUpsert at a different Drive file
- mutation proved the bound was not load-bearing before (a 201-char segment returned its first 200 chars)
- ACCEPTED RISK (deliberate, not overlooked): the pattern is not anchored to the host, so `https://evil.example/?u=/file/d/<id>` still extracts. Rejected: anyone who can write that column can write a canonical Drive URL too, so a host anchor defends against nobody and would break working http:// and scheme-less URLs.
- carry forward: existingFileId() returns null for a stored bare Drive id -> gasUpsert creates a duplicate. Still open at Task 5 (D-7).
- Task 4: DONE (commits 6a9864d, 88c3cc1) - approved with findings, 1 fix round. Suite 91/91/0 at repo root.
- THE PLAN WAS WRONG HERE. Plan lines 652-810 parse a `usr_<id>_<ts>` token. That format does not exist in this system.
- Verified against the live DB: `public.create_session()` returns `encode(gen_random_bytes(48),'hex')` = 192 lowercase hex, stored in auth_sessions with expires_at = now() + 24 hours. Following the plan would have 401'd every real user.
- Real lookup: join auth_sessions -> user_list on NIP, require is_active and expires_at > now(). session_token has a unique index so it is indexed; no migration needed.
- Role comes from the LIVE user_list row, never the auth_sessions snapshot: the snapshot is taken at login, so a demoted user would keep the old privilege for up to 24h. A missed join rejects; it never falls back.
- Fail-closed by construction: no token / malformed / unknown / expired -> 401; role outside allowlist -> 403; lookup throws -> 500 and next() is NEVER called. All three paths byte-identical so no oracle.
- fix round: user_list.id is bigint and node-postgres already returns int8 as a string, so req.user.id is a STRING - cast explicitly with u.id::text (NOT ::int, live max(id) is 9999999999 and overflows int4). Dropped LIMIT 1 because user_list."NIP" has only a NON-unique index and a duplicate NIP would make it pick a row arbitrarily; now rejects unless exactly one row.
- deleted parseToken: it was the only function mapping an attacker-chosen string to a user id, unreachable from any route, and its tests asserted the forgery (`parseToken('usr_1_0') === 1`) as expected behaviour.
- carry forward to Task 5: req.user.id is a string; sameInstansi(user, target) not sameInstansi(req.user.instansi_id, target); there is no req.user.canManageAll field and nothing sets one.
- BLOCKER for Task 12, not fixable in server/: js/auth.js:386 mints `'tg_' + MY_ID + Date.now()` client-side with no server call and role 'USER'. Not an auth_sessions row, not 192 hex, not in MEDIA_ROLES. Every Telegram WebApp auto-login 401s once requireRole is wired. Login must go through create_session() first.
- therefore Task 5 builds and unit-tests the router but does NOT mount it in server/index.js.
Task 5: DONE (commits c1290a0, c1ea4fa) - approved with findings, 1 fix round. Suite 124/124/0 at repo root, 57/57 in server/media.test.js.
- PLAN WAS WRONG HERE TOO. Eight defects enumerated in .superpowers/sdd/media-task-5-brief.md, correction banner added above the plan's Task 5 block.
- THE PRODUCTION DATA SHAPE IS NOT WHAT THE PLAN ASSUMED. Verified live: all 48 tanda_tangan.signature rows are `https://drive.google.com/uc?export=view&id=<FILE_ID>` and ZERO use the canonical `/file/d/<id>/`. Task 3's fileIdFromDriveUrl only matches `/file/d/`, so every signature upload would have created a SECOND Drive file and never updated the old one. driveFileId() now handles the uc?export=view form, Drive query ids, and bare ids.
- user_list.face_photo is 25 data: URLs + 22 blank, zero Drive URLs - so the duplicate-file risk was signature-only.
- FIX ROUND found a CRITICAL the implementer missed: both target-lookup `await query(...)` sat outside try/catch. Express 4 does not forward async rejections, so a DB blip produced an unhandledRejection - reviewer reproduced a real process death, `ECONNREFUSED ... at media.js:86:27`, exit code 1, killing /health and every in-flight request. server/auth.js already documents this exact hazard; media.js now matches it (whole handler in try, 503 at media.js:210 and :272).
- D-1 was NOT caught by the obvious test. A plain self-upload passes via sameInstansi; the real regression net is test 30, the `instansi_id = ''` self-only case. The brief's prediction was wrong.
- review mutation: gutting each handler body turned the suite red (face 18 fail, signature 7 fail), so the tests are load-bearing - unlike Task 2 where gutting passed.
- carry to Task 6: (a) no per-key concurrency lock - two concurrent first uploads for one employee both read previous=null and both create a Drive file, orphaning one; needs SELECT ... FOR UPDATE or a unique constraint, a design call not a mechanical fix. (b) media.test.js stubs query by regex and always returns a success row for UPDATE, so SQL WHERE clauses are asserted TEXTUALLY not behaviourally - that is why the SQL/JS scope mismatch survived a green suite. (c) residual: COALESCE still permits a non-self `''->''` write that inScope denies; unreachable via these routes because the JS gate returns 403 first.
- carry to Task 8/9 (migration): the migration script MUST extract the file id from the `uc?export=view&id=` form, or it duplicates all 48 signature files. Plan Task 8/9 predates this discovery.
- separate task needed: eslint.config.js gives every JS file globals.browser with no server/ override, so `npm run lint` fails repo-wide with 16,124 errors across 154 files. Pre-existing; server/media.js itself is clean.
Task 6: pending (1157-1426)
Task 7: pending (1427-1546)
Task 8: pending (1547-1777)
Task 9: pending (1778-1940)
Task 10: pending (1941-2130)
Task 11: pending (2131-2284)
Task 12: pending (2285-2487)
Task 13: pending (2488-2589)
Task 14: pending (2590-2655)
Task 15: pending (2656-2704)

## MANDATORY carry into Task 4 brief
- M-1 CRITICAL carry: `parseToken` never validates the timestamp segment. `usr_1_<anything>` is forgeable, so the Task 4 role allowlist is decorative unless `requireRole` pairs it with a server-side session/timestamp lookup. Task 4 must NOT ship a role check that trusts the token alone.

## Minor findings roll-up (for final whole-branch review)
- PORT unvalidated in server/index.js (NaN fails fast on Node 22, verified)
- basename-only `isMain` in server/index.js; a second server/*/index.js entry would listen spuriously
- no trailing newline on 4 new server files
- eslint has no Node globals for server/** (pre-existing: `npx eslint .` already fails at baseline with 16x 104)
- no .env.example entries for DATABASE_URL/PGSSL/PORT (not required by Task 1 brief)
- the two tightened bearerToken cases (`Bearer usr_1_2 junk` -> null, `Bearer` -> null) have NO committed assertion; they would regress silently. Worth 2 assertions added alongside a real task.
- server-side `statement_timeout` deliberately skipped; `query_timeout` already converts the silent stall into a thrown error
- `bearerToken('Basic')` still returns `'Basic'` (unchanged); rejected downstream by parseToken, not a regression

## Environment / verification notes
- Suite is NOT hermetic: it contains live n8n webhook smoke tests hitting a real server.
- The 58-test number includes 2 UNTRACKED test files present in the worktree. A clean clone runs fewer (47 committed tests).
- Windows cannot deliver SIGINT to a child, so the shutdown signal wiring was verified by executing the handler body directly, not end-to-end. Wants a Linux/CI run.