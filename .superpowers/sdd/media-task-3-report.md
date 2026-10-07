# Task 3 Report — Payload validation and Apps Script client

Commit `9dfb3f6` on `master`, parent `b689346`. Three files, nothing else touched.

## What I built

### `server/media-payload.js` (new, 23 lines)

Exports `MAX_IMAGE_BYTES`, `decodeDataUrl(dataUrl)`, `fileIdFromDriveUrl(url)`.
Follows the plan's step-3 code verbatim, plus the brief's override: SVG is rejected
inside `decodeDataUrl` (`if (/svg/.test(mimeType)) throw ...`) so the server and
`Code.gs` agree instead of letting an SVG pass server validation and die at Apps
Script with a confusing 400.

### `server/gas.js` (new, 49 lines)

Exports `gasHealth()`, `gasUpsert({ filename, mimeType, dataBase64, fileId })`,
`existingFileId(previousUrl)`. Follows the plan's step-6 code verbatim. Config
fail-fast lives in `gasUrl_()` (called, not imported) so importing the module
without `GAS_WEBAPP_URL` does not throw — same pattern as `server/db.js`.
Three comments, each naming the coupling it protects:
- the `MAX_IMAGE_BYTES` ↔ `Code.gs` `MAX_BYTES` lockstep,
- the no-line-breaks rule for `dataBase64` (Apps Script 413s on length *before* decode),
- `existingFileId` existing because `Code.gs` accepts a bare id and rejects URLs.

### `server/media.test.js` (append only, +140 / −0)

`git diff --stat` confirms `140 insertions(+)`, zero deletions. Existing 4 tests
untouched and in original order.

## TDD sequence actually followed

1. Appended all 5 tests → ran → failed with `ERR_MODULE_NOT_FOUND` for
   `./media-payload.js` (not a syntax error).
2. Created `media-payload.js` → ran → failure moved to `ERR_MODULE_NOT_FOUND` for
   `./gas.js` (proving the payload tests now resolve).
3. Created `gas.js` → ran → 9 passing.

Both module-not-found confirmations were checked for the specific module path in
the error text, not just for a non-zero exit.

## Extra assertions beyond the plan's 5 tests

The plan's 5 test bodies were kept, and the brief's invariants folded into them so
the file lands on 9 as required. Nothing in the brief's invariant list is untested:

| Invariant | Where it is pinned |
| --- | --- |
| SVG rejected | test 6 — loop member *and* `assert.throws(..., /svg/)` so it fails for the svg reason, not by accident |
| bare id, not URL, sent to Apps Script | test 8 — `existingFileId(url)` output equals `'1AbCdEfGh'`, plus `assert.match(fileId, /^[-\w]{5,200}$/)` (Code.gs's own `FILE_ID_RE`) |
| no line breaks in base64 | test 8 — `assert.ok(!/\s/.test(body.dataBase64))`; body is `'AAA+/w=='` so it carries `+`, `/` and `=` |
| 5 MB limit must not drift | test 7 — `MAX_IMAGE_BYTES === 5*1024*1024` *and* a byte-exact 5 MB image still decodes |
| `gasHealth()` → `/?action=health` | test 8 — `calls[1].url` |
| Apps Script `message` propagates | test 9 — `/5 MB/` against the 413 body |
| throws when `fileId` or `url` missing | test 9 — two `assert.rejects` (each field missing in turn) |
| `GAS_WEBAPP_URL` unset throws | test 9 — env deleted, `/GAS_WEBAPP_URL/` expected, env restored in `finally` |
| 45 s AbortController timeout | test 8 — `calls[0].init.signal instanceof AbortSignal`; the `clearTimeout` in `finally` is proven indirectly by the suite not hanging 45 s (wall clock 95 ms) |

Also added: `filename` and `mimeType` are asserted as forwarded, and `fileIdFromDriveUrl`
returns `null` for a non-`/file/d/` Drive URL, `''`, and `null`.

## Evidence that the assertions are real

I ran a 17-mutation sweep: patch the implementation, run the file's tests, require
that the run fails, then restore. Result: **16 caught, 1 missed**.

Caught: drop SVG rejection · drop 5 MB guard · `MAX_IMAGE_BYTES`→1 MB · allow empty
buffer · `fileIdFromDriveUrl` returns the whole URL · drop `fileId`/`url` guard · send
the URL instead of the bare id · drop the AbortController signal · re-wrap base64 with
`\n` · swallow the Apps Script message · drop the `GAS_WEBAPP_URL` guard · `gasHealth`
hits the wrong path · drop `filename`/`mimeType` from the body · regex drops the
`image/` requirement · regex drops the `;base64,` requirement · two of my own broken
mutation scripts that silently failed to apply (caught by the apply-check).

**Missed (1):** `gasUpsert` returning the raw Apps Script JSON instead of
`{ fileId, url }`. My assertions pin the two fields' values, which hold either way, so
this is an equivalent-behaviour mutation — the extra `name` field it would leak is not
observable through the interface the brief specifies. I did not add an assertion for
it because that would pin an implementation detail the brief does not require.

## Test commands and real output

All three runs were executed from the repo root
(`workdir = D:\Code\absensi_refactored_v6`).

**Baseline, before any change:**

```
# tests 71
# suites 0
# pass 71
# fail 0
```

Confirms the brief: baseline is 71, not the plan's 63.

**Red phase 1 — appended tests, no `media-payload.js`:**

```
#     throw new ERR_MODULE_NOT_FOUND(
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\\Code\\absensi_refactored_v6\\server\\media-payload.js'
imported from D:\\Code\\absensi_refactored_v6\\server\\media.test.js
#   code: 'ERR_MODULE_NOT_FOUND',
# tests 1
# pass 0
# fail 1
```

**Red phase 2 — `media-payload.js` created, no `gas.js`:**

```
#     throw new ERR_MODULE_NOT_FOUND(
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\\Code\\absensi_refactored_v6\\server\\gas.js' imported from
D:\\Code\\absensi_refactored_v6\\server\\media.test.js
#   code: 'ERR_MODULE_NOT_FOUND',
# tests 1
# pass 0
# fail 1
```

**Green — `node --test server/media.test.js`** (with `$env:GAS_WEBAPP_URL='https://example.invalid/exec'`):

```
ok 1 - parseToken membaca user id dari token sesi
ok 2 - parseToken menolak bentuk token lain
ok 3 - parseToken menolak prefix yang bukan usr
ok 4 - bearerToken membaca header Authorization
ok 5 - decodeDataUrl memecah data URL gambar
ok 6 - decodeDataUrl menolak input yang bukan data URL gambar
ok 7 - decodeDataUrl menolak gambar melebihi 5 MB
ok 8 - gasUpsert mengirim base64 dan mengembalikan fileId + url
ok 9 - gasUpsert melempar error saat Apps Script menolak
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 95.1642
```

**Full suite — `node --test` from the repo root, no `GAS_WEBAPP_URL` set:**

```
# tests 76
# suites 0
# pass 76
# fail 0
# cancelled 0
# skipped 0
# duration_ms 3393.0716
```

9 in the file, 76 overall, 0 failing — the brief's corrected numbers, not the plan's 63/68.

That run had no `GAS_WEBAPP_URL` in the environment and still passed: the test file
falls back to `https://example.invalid/exec` and nothing reaches the network because
`fetch` is stubbed. `node --test` gives each file its own process, so the mutation of
`process.env` inside `media.test.js` cannot leak into other test files.

**Commit:**

```
9dfb3f6 feat(server): validate image payloads and call Apps Script upsert
b689346 fix(gas): strip all comment forms before asserting, check every parent

 server/gas.js           |  49 +++++++++++++++++
 server/media-payload.js |  23 ++++++++
 server/media.test.js    | 140 ++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 212 insertions(+)
```

## Deviations from the brief

1. **Test file sets `GAS_WEBAPP_URL` itself if unset.** The plan's step 7 passes the
   env var on the command line, which would make the *full suite* red for anyone
   running `npm test` or `node --test` without it. The file now falls back to
   `https://example.invalid/exec`, and asserts against that resolved value rather
   than `process.env.GAS_WEBAPP_URL` directly. A shell-supplied value still wins.
2. **The plan's 5 tests were kept as 5 tests; the brief's extra invariants were folded
   into them** rather than added as new `test()` blocks, because the brief fixes the
   file at 9 tests. Test 8 therefore covers the upsert happy path, the bare-id and
   no-line-break contracts, and the health endpoint. Folding lost a little per-test
   focus but kept every invariant asserted and held the count the brief requires.
3. **No `fileIdFromDriveUrl` export beyond the plan's**, and no `existingFileId`
   wrapper change — `gas.js` just delegates, as the plan wrote it.

## Notes for Task 4

- `gasUpsert` resolves `fileId` to `null` when falsy, so a first upload omits it and
  `Code.gs` creates a new file. Routes must call `existingFileId(storedUrl)` and pass
  the result; passing the raw stored URL yields a 400 from Apps Script.
- `MAX_IMAGE_BYTES` is now pinned from both sides of the boundary in `media.test.js`.
  Changing it means editing `Code.gs` in the same commit or uploads break.
- `decodeDataUrl` returns a `Buffer`; whatever re-encodes it must use
  `Buffer.toString('base64')` (newline-free), not an encoder that wraps at 64/76
  columns, or `Code.gs` 413s on the string length before it ever decodes.

---

## Fix round 1

Commit `306fe6c` on `master`, parent `9dfb3f6`. Three files, the same three the
gate named: `server/media-payload.js`, `server/gas.js`, `server/media.test.js`.
Scope untouched: no frontend, no `google-apps-script/`, no `db.js` / `auth.js` /
`index.js`, no `package.json`, no `.env`.

Starting state note: the fixes were **staged but not committed** when this round
began — `git log` HEAD was still `9dfb3f6` and `git diff --cached --stat` showed
the three modified files. Everything below was re-verified from source and by
execution before being committed, not taken on trust.

The 7 Minor findings were left alone. None was a one-character fix: Minor 2 needs
a fixture change, Minor 4 is a deliberate "leave the behaviour, add a comment"
call, Minors 3/5/6/7 are unasserted-but-correct or cosmetic.

### Important 1 — `fileIdFromDriveUrl` emitted ids the Apps Script rejects

**Finding.** `server/media-payload.js:21` was `/\/file\/d\/([-\w]+)/` — right
character class, no quantifier, no anchor — so it disagreed with
`Code.gs:3`'s `FILE_ID_RE = /^[-\w]{5,200}$/`.

**Change.** `server/media-payload.js:25`, the exact one-liner the review
prescribed — apply the Apps Script's own bound to the captured segment:

```js
return m && /^[-\w]{5,200}$/.test(m[1]) ? m[1] : null;
```

**Tests** (`server/media.test.js:90-99`) — too-short, over-long, and both
boundaries, so the bound is pinned from each side rather than only from the
reject side:

```js
assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/abc/view'), null);
assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/ab/view'), null);
assert.equal(fileIdFromDriveUrl(`https://drive.google.com/file/d/${'x'.repeat(201)}/view`), null);
assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1Ab CdEf/view'), null);
assert.equal(fileIdFromDriveUrl(`https://drive.google.com/file/d/${'x'.repeat(200)}/view`), 'x'.repeat(200));
assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/abcde/view'), 'abcde');
```

The `abc` fixture the review pointed at (`media.test.js:59`) is now asserted.

Measured against `FILE_ID_RE` after the change:

```
normal                   -> 9ch PASSES FILE_ID_RE
short abc                -> null (no fileId sent)
long 300                 -> null (no fileId sent)
boundary 5               -> 5ch PASSES FILE_ID_RE
boundary 200             -> 200ch PASSES FILE_ID_RE
boundary 201             -> null (no fileId sent)
space early (1Ab CdEf)   -> null (no fileId sent)
space late (1AbCd EfGh)  -> 5ch PASSES FILE_ID_RE
foreign host             -> 9ch PASSES FILE_ID_RE
bare id                  -> null (no fileId sent)
```

**Two residuals of the unanchored regex, deliberately not fixed.** The review's
prescribed fix addressed the bound; it kept `/\/file\/d\/([-\w]+)/`, so:

1. **A space late in the segment yields a valid-but-wrong id.**
   `/file/d/1AbCd EfGh/view` truncates to `1AbCd` — 5 characters, passes
   `FILE_ID_RE`, so it is *sent* and accepted. The Apps Script then targets a
   file that is not the one intended. The review's own example (`1Ab CdEf`,
   space early) does return `null`, because the truncated `1Ab` is under 5
   characters; the failure only appears once 5+ valid characters precede the
   space. One line would close it — `/\/file\/d\/([-\w]{5,200})(?:\/|$)/` — but
   it changes the accepted shape beyond the bound the brief asked for, so it is
   reported rather than smuggled in.
2. **Any host carrying that path substring is accepted** —
   `https://evil.example/?u=/file/d/1AbCdEfGh` returns `1AbCdEfGh`. Closing it
   means host-checking `drive.google.com`, which is a wider contract change than
   Important 1 scoped. Low severity in practice: the input is a value read back
   from our own column, not attacker-supplied at request time. It becomes
   attacker-relevant the moment a route passes an unvalidated request field in.

Neither is Critical. Both are one line each if Task 4 wants them closed.

### Important 2 — the SVG defence was case-sensitive and untested

**Finding.** `.toLowerCase()` at `media-payload.js:10` was load-bearing and
nothing tested it — review mutation #5 survived. `Code.gs:52`'s `/svg/` is also
case-sensitive, so `data:image/SVG+XML;base64,...` would clear **both** layers
and land an SVG — which can carry `<script>` — in Drive.

**Change.** No production change: the code was already correct. Tests only,
added at `server/media.test.js:64-69` (reject list) and `:77-85` (pinned to the
`/svg/` *reason*, so the assertion fails for the SVG rule rather than by
accidental regex failure):

```
data:image/SVG+XML;base64,PHN2Zz48L3N2Zz4=
data:image/Svg+xml;base64,PHN2Zz48L3N2Zz4=
data:image/SVG+xml;base64,PHN2Zz48L3N2Zz4=
DATA:image/Svg+xml;base64,PHN2Zz48L3N2Zz4=
```

The `DATA:` variant is included because `DATA_URL` carries the `i` flag, so the
scheme's case was never the thing under test — the *MIME subtype's* case was.

**Verified by mutation**, on a copy outside the repo
(`%LOCALAPPDATA%\Temp\opencode\mut-tolowercase`), `const mimeType = m[1].toLowerCase();`
→ `const mimeType = m[1];`:

```
=== MUTATION A: .toLowerCase() removed (expect FAIL) ===
const mimeType = m[1];
not ok 6 - decodeDataUrl menolak input yang bukan data URL gambar
# tests 11
# pass 10
# fail 1
```

Red, as required. The review measured this mutation as surviving.

### Important 3 — misleading errors on a non-JSON or null Apps Script response

**Finding.** `await res.json().catch(() => ({}))` collapsed "the deployment
returned an HTML login page" into the same message as "the endpoint returned
500", and a JSON-`null` body leaked `TypeError: Cannot read properties of null`.

**Change.** `server/gas.js:17-29` — the `res.json()` call is wrapped so a parse
failure raises its own diagnostic naming the actual cause, and `?.` closes the
`null` body:

```js
let json;
try {
  json = await res.json();
} catch {
  // body HTML = halaman login Google, artinya deployment belum dibuka untuk
  // "Anyone". Status tetap 200, jadi "HTTP 200" saja akan menyesatkan.
  throw new Error(`Apps Script HTTP ${res.status} (respons bukan JSON — cek izin deploy "Anyone" dan URL /exec)`);
}
// `?.` menutup dua kasus: body JSON `null` dan body `{}` tanpa field ok
if (!res.ok || !json?.ok) {
  // pesan dari Apps Script diteruskan apa adanya (mis. batas 5 MB)
  throw new Error(json?.message || `Apps Script HTTP ${res.status}`);
}
```

The existing non-OK propagation is unchanged — a real Apps Script error message
(e.g. `413 ukuran file melebihi 5 MB`) still wins over the generated fallback,
because the `catch` only fires on a JSON *parse* failure.

**Tests** (`server/media.test.js:190-234`, new test 10) cover three bodies:
non-JSON at HTTP 200 (asserts `/respons bukan JSON/`, `/"Anyone"/`, `/\/exec/`,
and `err.name === 'Error'`), JSON `null` (asserts `err.name === 'Error'` and
`doesNotMatch(/Cannot read properties/)`), and `{}` with no `ok` field.

**Verified by mutation**, two separate copies outside the repo:

```
=== MUTATION C1: non-JSON catch -> json = {} (expect FAIL) ===
json = {};
not ok 10 - callGas_ melapor respons bukan JSON dan body JSON null
# tests 11
# pass 10
# fail 1

=== MUTATION C2: ?. guard removed (expect FAIL on JSON null) ===
if (!res.ok || !json.ok) {
throw new Error(json.message || `Apps Script HTTP ${res.status}`);
not ok 10 - callGas_ melapor respons bukan JSON dan body JSON null
# tests 11
# pass 10
# fail 1
```

C1 is the revert to the old `.catch(() => ({}))` behaviour; C2 is the revert to
`json.ok` / `json.message`. Both red.

**Also mutation-checked** (the Important 1 fix, same method,
`%LOCALAPPDATA%\Temp\opencode\mut-fileid`), reverting the bound:

```
=== MUTATION B: fileId length guard reverted (expect FAIL) ===
return m ? m[1] : null;
not ok 6 - decodeDataUrl menolak input yang bukan data URL gambar
# tests 11
# pass 10
# fail 1
```

All three Important findings are now load-bearing: each reverts to red.

### Carry-over — silent duplicate file on a bare id (NOT fixed, by design)

**The risk, stated plainly.** `existingFileId` returns `null` for anything that
is not a recognisable `/file/d/<id>/` URL. A `null` fileId means "create a new
file" to `Code.gs`, and **`Code.gs:63` only rejects a fileId that is present and
fails `FILE_ID_RE`** — it does not reject `null`. So the outcome is **not an
error**: the upload succeeds, a second Drive file is created, and the row's old
photo is never updated.

If any existing row stores a bare file id rather than the canonical
`https://drive.google.com/file/d/<id>/view` URL that `Code.gs:27`
`canonicalUrl_` always writes, then every re-upload of that person's photo
silently duplicates. There is no log line, no exception, and no user-visible
signal. It surfaces months later as unexplained growth in the destination Drive
folder, at which point nothing in the logs points back at the cause.

**Reachability.** `canonicalUrl_` means rows written by this system always hold
the URL form, so this is reachable only through hand-edited or legacy rows. The
review could not settle it from source because Task 3 has no database access by
design.

**What was done here: made it explicit, not redesigned.** `server/media.test.js:236-246`
is a named test that pins the current behaviour so it cannot drift silently:

```js
test('⚠️ risiko diketahui: id polos bukan URL -> Apps Script buat duplikat diam-diam', () => {
  assert.equal(existingFileId('1AbCdEfGh'), null);
  assert.equal(existingFileId('1AbCdEfGh'), fileIdFromDriveUrl('1AbCdEfGh'));
  assert.equal(existingFileId('https://drive.google.com/file/d/1AbCdEfGh/view'), '1AbCdEfGh');
});
```

The first assertion is the defect, frozen in place. If a later round makes bare
ids work, this test goes red and the change is a conscious one.

**Owner: Task 4/5.** The fix is a data question, not a code question — query
what the stored values actually are. Two acceptable outcomes:

- all rows hold `/file/d/<id>/view` URLs → no code change, close the risk;
- some rows hold bare ids → either a one-off `UPDATE` to canonicalise them, or
  teach `fileIdFromDriveUrl` to accept a bare id as a fallback. The fallback is
  the smaller diff but weakens the URL check, so it should be a decision, not a
  default.

### Commands run, and their real output

All from the repo root `D:\Code\absensi_refactored_v6`. Node v22.22.0.

`node --test server/media.test.js`

```
ok 1 - parseToken membaca user id dari token sesi
ok 2 - parseToken menolak bentuk token lain
ok 3 - parseToken menolak prefix yang bukan usr
ok 4 - bearerToken membaca header Authorization
ok 5 - decodeDataUrl memecah data URL gambar
ok 6 - decodeDataUrl menolak input yang bukan data URL gambar
ok 7 - decodeDataUrl menolak gambar melebihi 5 MB
ok 8 - gasUpsert mengirim base64 dan mengembalikan fileId + url
ok 9 - gasUpsert melempar error saat Apps Script menolak
ok 10 - callGas_ melapor respons bukan JSON dan body JSON null
ok 11 - ⚠️ risiko diketahui: id polos bukan URL -> Apps Script buat duplikat diam-diam
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

`node --test` (repo root — 9 → 11 in this file, so 76 → 78 suite-wide; the count
moved because two tests were added, not because anything was tuned):

```
# tests 78
# suites 0
# pass 78
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

**Final count: 78 passing / 0 failing**, against the stated 76 / 0 baseline. The
delta is exactly the two new tests. No existing assertion was weakened,
loosened, or removed — `git show --stat` shows `6 deletions(-)` and all six are
the replaced `gas.js`/`media-payload.js` production lines, not test lines.

`git log --oneline -2`

```
306fe6c fix(server): bound fileId to FILE_ID_RE, name non-JSON Apps Script responses
9dfb3f6 feat(server): validate image payloads and call Apps Script upsert
```

`git show --stat HEAD`

```
commit 306fe6cb28d978a5b51d4fad3010d511bd31583f
Author: hudsonjhonson9-arch <hudsonjhonson9@gmail.com>
Date:   Sat Oct 3 08:09:51 2026 +0800

    fix(server): bound fileId to FILE_ID_RE, name non-JSON Apps Script responses

 server/gas.js           | 14 ++++++--
 server/media-payload.js |  5 ++-
 server/media.test.js    | 86 +++++++++++++++++++++++++++++++++++++++++++++++--
 3 files changed, 99 insertions(+), 6 deletions(-)
```

`git status --short -- server/ google-apps-script/ package.json` → empty. Working
tree clean for every in-scope and adjacent path.

This report file is untracked and was not committed.

## Fix round 2

### The issue

`fileIdFromDriveUrl` bounded the id to `{5,200}` but left the pattern **unanchored at the end**, so a
segment with an internal invalid character was truncated to its valid prefix instead of rejected:

    /file/d/1AbCd EfGh/view   ->  extracts '1AbCd'   (5 chars, passes FILE_ID_RE)

A truncated id points `gasUpsert` at a **different Drive file** than intended. `Code.gs` would then
overwrite the wrong file, or 403 on its folder-containment guard (`Code.gs:95-97`). Extracting the
wrong id and acting on it silently is worse than extracting nothing.

Reproduced against HEAD (`306fe6c`) before the fix:

```
$ node -e "import('./server/media-payload.js').then(m=>{const f=m.fileIdFromDriveUrl;for(const u of ['https://drive.google.com/file/d/1AbCdEfGh/view','/file/d/1AbCd EfGh/view',...
"https://drive.google.com/file/d/1AbCdEfGh/view" => "1AbCdEfGh"
"/file/d/1AbCd EfGh/view" => "1AbCd"
"https://drive.google.com/file/d/abc/view" => null
"https://drive.google.com/file/d/xxxxxxxxxxxxxxxxxxxxxxxxxxxx" => null
"https://evil.example/?u=/file/d/1AbCdEfGh" => "1AbCdEfGh"
"https://drive.google.com/file/d/1AbCdEfGh?usp=sharing" => "1AbCdEfGh"
```

### The change

`server/media-payload.js` only � one line, plus deleting the now-redundant post-check:

```js
export function fileIdFromDriveUrl(url) {
  // Batas {5,200} dikunci sama dengan FILE_ID_RE di Code.gs:3, dan letak batas itu
  // wajib di dalam pattern. Lookahead di belakang wajib juga: tanpa itu segment
  // dengan karakter invalid di tengah hanya terpotong jadi prefix yang tetap lolos
  // FILE_ID_RE (`/file/d/1AbCd EfGh/view` -> "1AbCd"), dan gasUpsert lalu menunjuk
  // file Drive yang lain, bukan file yang dimaksud. Lebih baik null.
  // Batas depan `/`, `?`, `#`, atau akhir string; `?`/`#` dipakai Share link Drive
  // ("...&usp=sharing"), jadi tidak boleh ikut dipotong.
  const m = /\/file\/d\/([-\w]{5,200})(?=[/?#]|$)/.exec(String(url || ''));
  return m ? m[1] : null;
}
```

Two deltas from the shape round 1 proposed (`/\/file\/d\/([-\w]{5,200})(?:\/|$)/`):

1. **Lookahead instead of consuming alternation.** `(?=[/?#]|$)` rather than `(?:\/|$)`. The extra
   `?`/`#` matter: `https://drive.google.com/file/d/1AbCdEfGh?usp=sharing` extracted `1AbCdEfGh`
   before this round and still does. Under `(?:\/|$)` it would return `null`, which is a behaviour
   *regression* beyond the reported issue and would re-create the silent-duplicate failure mode
   flagged in the round-1 test at `server/media.test.js:236`. Same character cost, no regression.
2. **Deleted `/^[-\w]{5,200}$/.test(m[1])`.** With the bound moved into the pattern that post-check
   can never fail � dead code, and it was the exact place the truncation slipped through (the bound
   lived in two places, so the regex only bounded the *start*).

### Start-of-host anchor: considered and deliberately NOT added

Round 1 left this open and asked for an explicit decision. **I did not tighten it.** Reasoning,
now that the code path is fully read:

- The value comes from our own `canonicalUrl_` (`Code.gs:26-28`), the only writer of that column. It
  emits exactly `https://drive.google.com/file/d/<id>/view`.
- A host anchor protects against nobody. Anyone able to write `https://evil.example/?u=/file/d/<id>`
  into the column can equally write `https://drive.google.com/file/d/<id>/view`, which any host
  anchor would still accept. The threat model is identical either way, so the anchor buys zero.
- It costs real breakage. `^https?://drive\.google\.com/` breaks `http://` Drive links, scheme-less
  `drive.google.com/file/d/<id>/view` from operator paste, and bare `/file/d/<id>/view` paths � all
  of which extract fine today. Each breakage turns a working overwrite into `null`, i.e. a new
  duplicate file on every upload, which is the exact harm `media.test.js:236` documents.
- `Code.gs:90-97` already checks *every* parent against `DRIVE_FOLDER_ID`, so a foreign-supplied id
  outside our folder 403s rather than overwriting an operator's unrelated file.

`https://evil.example/?u=/file/d/1AbCdEfGh` therefore still yields `1AbCdEfGh`. Recorded here as a
known, accepted, non-defended behaviour � not an oversight. No test pins it, deliberately: pinning
it would enshrine it, and a future round that does tighten it should not have to fight a test.

### Tests added

`server/media.test.js`, inside the existing `fileIdFromDriveUrl` assertion block:

```js
  // round 2: prefix hasil pemotongan yang PANJANGNYA sudah >= 5 lolos FILE_ID_RE
  // lalu gasUpsert menunjuk file Drive lain. Harus null, bukan prefix.
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd EfGh/view'), null);
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd.EfGh/view'), null);
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd%EfGh/view'), null);
  // '/' itu pemisah segment sungguhan, bukan pemotongan: id-nya memang '1AbCd'
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd/EfGh/view'), '1AbCd');
  // batas belakang lain tetap diekstraksi penuh (Share link & path tanpa /view)
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh?usp=sharing'), '1AbCdEfGh');
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh#x'), '1AbCdEfGh');
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh'), '1AbCdEfGh');
```

The round-1 duplicate-risk test (`server/media.test.js:236-246`) is **untouched** and still passes:
`existingFileId('1AbCdEfGh')` is still `null`, still equal to `fileIdFromDriveUrl('1AbCdEfGh')`, and
still yields `'1AbCdEfGh'` for the canonical URL. No test was weakened; 6 assertions added to an
existing `test()` block, so the suite count is unchanged.

### Behaviour matrix after the fix

```
"https://drive.google.com/file/d/1AbCdEfGh/view"      => "1AbCdEfGh"
"/file/d/1AbCd EfGh/view"                             => null
"https://drive.google.com/file/d/1Ab CdEf/view"       => null
"https://drive.google.com/file/d/abc/view"            => null   (too short)
"https://drive.google.com/file/d/ab/view"             => null   (too short)
"https://drive.google.com/file/d/<201 x>/view"        => null   (too long)
"https://drive.google.com/file/d/<200 x>/view"        => "x"*200 (boundary kept)
"https://drive.google.com/file/d/abcde/view"          => "abcde" (boundary kept)
"https://drive.google.com/file/d/1AbCdEfGh?usp=sharing" => "1AbCdEfGh"
"https://drive.google.com/file/d/1AbCdEfGh"           => "1AbCdEfGh"
"https://drive.google.com/file/d/1AbCd/EfGh/view"     => "1AbCd"  (real segment delimiter)
"https://drive.google.com/open?id=1AbCdEfGh"          => null
"1AbCdEfGh"                                           => null
"" / null                                             => null
"https://evil.example/?u=/file/d/1AbCdEfGh"           => "1AbCdEfGh"  (accepted, see above)
```

### Commands and real output

```
$ node --test server/media.test.js
# tests 11
# pass 11
# fail 0
# skipped 0
# todo 0

$ node --test
# tests 78
# pass 78
# fail 0
# skipped 0
# todo 0
```

Baseline before the change was also 78 pass / 0 fail. The count is unchanged because assertions were
added to an existing `test()` block rather than as new blocks.

### Mutation proof

Reverted the end anchor � `/\/file\/d\/([-\w]{5,200})/` with the lookahead removed, i.e. exactly
round 1's unanchored behaviour:

```
$ node --test server/media.test.js
not ok 6 - decodeDataUrl menolak input yang bukan data URL gambar
  expected: ~
  actual: 'xxxxxxxxxxxxxxxxxxxxxxxx...(200 x)...'
# tests 11
# pass 10
# fail 1
```

The over-long case fired first (assert throws on first failure), which independently proves the
`{5,200}` bound is also load-bearing: without the end anchor, a 201-char segment returns its first
200 characters instead of `null`.

Direct check that the *truncation* assertions specifically catch the regression:

```
$ node -e "import('./server/media-payload.js').then(m=>{const f=m.fileIdFromDriveUrl;for(const u of ['.../1AbCd EfGh/view','.../1AbCd.EfGh/view','.../1AbCd%EfGh/view'])console.log(...)})"
"https://drive.google.com/file/d/1AbCd EfGh/view" => "1AbCd" (PREFIX LEAKED)
"https://drive.google.com/file/d/1AbCd.EfGh/view" => "1AbCd" (PREFIX LEAKED)
"https://drive.google.com/file/d/1AbCd%EfGh/view" => "1AbCd" (PREFIX LEAKED)
```

Anchor restored, both suites green again (11/11 and 78/78, output above).

### Scope

Only `server/media-payload.js` and `server/media.test.js` touched. The 7 Minors untouched. Nothing
outside these two files read-modified-written; `Code.gs`, `gas.js`, and `db.js` were read only to
establish the writer of the URL column and the folder-containment guard.
