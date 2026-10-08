# Task Fix N1 — Report

**Status:** DONE
**Commit:** `a1f29a2` (main, on top of `8e6ad08`)
**Repo:** `D:\Code\absensi_refactored_v6_native_full`

## What changed

### 1. N1 — `face_histogram: '[]'` truthy → lockout (js/auth.js:167)

Root cause: after the login refactor the response is the FULL `user_list` row, so
`user.face_histogram` now exists and can be the stored-empty literal `'[]'` (guarded
as empty at `server/media.js:347` and in `hasFace` at `js/auth.js:98-101`). `'[]'`
is truthy → the photo-regeneration fallback at line 170 never ran →
`JSON.parse('[]')` → `refDim === 0` → lockout "Data biometrik wajah Anda di
database rusak" even though `face_photo` exists.

Fix (local `const` arrow immediately before use, not hoisted to module scope; no
identical-named helper existed in file scope — grepped `descriptorOrEmpty` → 0 hits):

```js
// '[]'/'null'/'' = stored-empty (sama dgn guard hasFace di atas) → anggap null
const descriptorOrEmpty = (v) => (v && v !== '[]' && v !== 'null') ? v : null;
let refDescRaw = descriptorOrEmpty(user.face_histogram) || descriptorOrEmpty(user.face_descriptor) || descriptorOrEmpty(user.descriptor) || descriptorOrEmpty(user.histogram) || null;
```

Chain now treats `'[]'`, `'null'`, and `''` as null for every source field, so the
existing `if (!refDescRaw && (user.foto_base64 || user.face_photo) && …)` fallback
runs and regenerates the descriptor from the photo.

### 2. Cache-buster

`js/auth.js?v=20261008a` → `js/auth.js?v=20261008b` at `index.html:3126` **and**
`www/index.html:3126` (verified both).

### 3. Sync

`Copy-Item js\auth.js www\js\auth.js -Force` → SHA-256 identical:
`0E1121213B8C8F54EA3BA63DF29532C27610D55CCD455E8DF07D77FF897D5CD7` (both files).

### 4. Test: close prior finding #1 (full-row contract)

In `server/auth-session.test.js`, the 200-success test
(`login NIP valid menerbitkan sesi 192 hex dan baris user`, ~line 154):

- Mock row extended with `face_histogram: '[0.1,0.2]'` and
  `face_photo: 'data:image/jpeg;base64,AAA'`.
- New assertions:
  - `assert.ok('face_histogram' in out.body.user, 'kontrak full-row: face_histogram wajib ada')`
  - `assert.ok('face_photo' in out.body.user, 'kontrak full-row: face_photo wajib ada')`
  - `assert.equal(out.body.user.face_histogram, '[0.1,0.2]')` (equals mock value)

A future narrowing of `USERS_BY_NIP_SQL` (`SELECT *, "NIP" AS nip, username AS nama …`)
to a column subset now fails this test.

### 5. Hygiene: env restore + trailing newline

- Last test (`login tidak membaca init_data Telegram (pure NIP)`) now takes the
  `t` context, saves `prevToken`, and restores via `t.after(() => …)` (delete if it
  was undefined, else set back) — no leak of `TELEGRAM_BOT_TOKEN = 'x'.repeat(30)`.
- File previously ended `});` with **no** trailing newline (bytes `125,41,59`);
  appended `\n` (bytes now `41,59,10`), UTF-8 no BOM preserved
  (first bytes still `105,109,112,111` = `impo`).

## Commands + output

```
> node --check js/auth.js
auth.js SYNTAX OK

> node --check server/auth-session.test.js
test SYNTAX OK

> node --test 'server/*.test.js'
# tests 252 / pass 252 / fail 0   (exit 0)

> npm test
# tests 322
# pass 322
# fail 0                          (exit 0 — matches expected 322)

> (Get-FileHash js\auth.js).Hash vs www\js\auth.js
0E1121213B8C8F54EA3BA63DF29532C27610D55CCD455E8DF07D77FF897D5CD7
0E1121213B8C8F54EA3BA63DF29532C27610D55CCD455E8DF07D77FF897D5CD7   (identical)

> Select-String index.html,www/index.html 'auth.js?v='
index.html:3126   <script src="js/auth.js?v=20261008b"></script>
www/index.html:3126  <script src="js/auth.js?v=20261008b"></script>

> git add js/auth.js www/js/auth.js index.html www/index.html server/auth-session.test.js
> git commit -m "fix: guard face_histogram kosong di fallback face-verify + kontrak full-row test"
[main a1f29a2] 5 files changed, 22 insertions(+), 7 deletions(-)
```

Note: bare `node --test` (default discovery, not the project's `npm test`) reports
10 failures in `temp_qr/package/**` and `tests/pks.test.mjs` — pre-existing, outside
`npm test`'s file list, unrelated to this change.

## Self-review

- Fix is scoped to the exact block requested: 3 added lines at `js/auth.js:167-169`,
  no module-scope hoisting, no other call sites touched (grep showed the helper name
  was new).
- `git diff` reviewed hunk-by-hunk: only the intended lines changed in all 5 files;
  `index.html`/`www/index.html` diffs are single-line (no encoding damage from the
  PowerShell replace — diff would have shown the whole file otherwise).
- Helper semantics match the existing `hasFace` guards (`'[]'`, `''`) plus `'null'`,
  consistent with `js/auth.js:98-101` and `server/media.js:347`.
- Staged exactly the 5 requested files; `.superpowers/sdd/*` scratch changes left
  unstaged/untracked.
- Test assertions use the mock row itself as the source of truth (no hardcoded
  constant duplicated outside the mock).
- Verification run **after** commit confirms suite still 322/322 and hashes still match.
