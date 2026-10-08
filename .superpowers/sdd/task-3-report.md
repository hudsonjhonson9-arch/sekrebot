# Task 3 Report — Frontend: alur login pakai `/api/auth/login` (auth.js)

**Status:** DONE
**Commit:** `8e6ad08` — feat: login web pakai /api/auth/login, token native asli

## What changed

### 1. `js/auth.js` (and synced `www/js/auth.js`)

Replaced the entire login validation + fake-token region (old lines 50–119, from `const res = await apiGet(\`${P.userList}?nip=${nip}\`);` through the end of old `finalizeLogin` ending `location.reload();\n};`) with the brief's new block, transcribed verbatim:

- One `POST` to `API_BASE + P.webLogin` with `{ nip }` body; non-OK response throws `loginBody?.message || 'Login gagal. Coba lagi.'`.
- `user = loginBody.user` (must have `.id`), `sessionToken = loginBody.session_token`, `userNip`, `targetId = String(user.id)`.
- `setNativeToken(sessionToken)` called immediately after login (line 70) — BEFORE the face-toggle `apiGet` call, so media endpoints aren't 401.
- Face-toggle check, `hasFace` computation, and `finalizeLogin` kept identical in shape to the brief's new block.
- `finalizeLogin` now: `setNativeToken(sessionToken)` → `setSession(sessionToken, {...})` → localStorage writes → `location.reload()`. **No fabricated `usr_<id>_<ts>` token anywhere in the login path.**

Everything after the replaced block (the `if (isFaceEnabled && typeof openCamOverlay === 'function')` face-verify flow) is untouched — it references `user`, `userNip`, `targetId`, `hasFace`, `finalizeLogin`, `isFaceEnabled`, all provided by the new block.

Register branch untouched (still uses `apiGet(P.userList)` + `usr_` regToken — out of scope per brief).

### 2. Cache-buster bump (controller-resolved ambiguity)

- `index.html:3126` → `<script src="js/auth.js?v=20261008a"></script>` (was `?v=20260706c`)
- `www/index.html:3126` → same bump.

## Verification (commands + output)

1. **Step 2 — leftover old-reference scan:**
   ```
   Select-String -Path js\auth.js -Pattern 'rawData|res\.rows|res\.data|P\.userList\?nip'
   ```
   Output: exactly one line —
   ```
   82   const rawFT = faceRes.rows?.length ? faceRes.rows[0] : (faceRes?.data ?? {});
   ```
   This is `faceRes.rows`/`faceRes?.data` (substring match on `res\.rows`/`res\.data`) and is **verbatim from the brief's own new block** (face-toggle parsing). Not a leftover: no `rawData`, no bare `res` response parsing, no `P.userList?nip` in the login branch (register's `${P.userList}?nip=` doesn't match the pattern `P\.userList\?nip` because of the `}` separator, and is out of scope anyway).

2. **Step 3 — syntax:** `node --check js/auth.js` → no output, exit 0 (SYNTAX OK).

3. **Step 4 — sync:** `Copy-Item js\auth.js www\js\auth.js -Force`; hash compare:
   `SYNC OK C5269EA04AA06863DF9E6E79BAEAC33459E5474551CB4FC76830CBF3BF11BA90` (re-verified after commit: identical).

4. **npm test:** `322 tests / 322 pass / 0 fail / 0 skipped` — all green (no JS frontend tests exist; nothing broke).

5. **Commit:** `git add js/auth.js www/js/auth.js index.html www/index.html` then commit → `8e6ad08 feat: login web pakai /api/auth/login, token native asli` (4 files changed, 48 insertions, 54 deletions). Only those 4 files staged; `.superpowers/*` scratch changes left uncommitted.

## Files changed

- `js/auth.js` — login flow rewritten (48+/54− across both copies)
- `www/js/auth.js` — synced copy (byte-identical)
- `index.html` — auth.js cache-buster `?v=20261008a`
- `www/index.html` — same bump

## Self-review checklist

- [x] No leftover `rawData` / bare `res` response parsing in login path.
- [x] No `P.userList?nip=` in login branch (register's usage left untouched, per scope).
- [x] No fabricated `usr_` token in login path — only remaining `usr_` is register branch line 317 (out of scope) and Telegram `tg_` auto-login in `_checkIdentityOnLoad` (unchanged, per constraints).
- [x] `finalizeLogin` stores the **server-issued** `session_token` via both `setNativeToken()` and `setSession()`.
- [x] `setNativeToken` called before face-toggle/media calls (line 70), and again in `finalizeLogin` (line 104).
- [x] `www/js/auth.js` byte-identical to `js/auth.js`; both `index.html` files bumped.
- [x] `node --check` clean; `npm test` 322/322 green.

## Concerns

- The brief's Step-2 verification pattern (`res\.rows|res\.data`) over-matches `faceRes.rows` — the brief's own replacement code contains that line. Match is benign; noted above so a re-run isn't mistaken for a failure.
- Telegram auto-login (`tg_...` fake token in `_checkIdentityOnLoad`) and register's `usr_...` token remain by design (out of scope; constraints forbid touching `/api/auth/session` Telegram flow).
