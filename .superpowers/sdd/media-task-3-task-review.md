# Task 3 Gate Review — Payload validation and Apps Script client

Commit `9dfb3f6`, base `b689346`, branch `master`. Reviewed as the merged tree.

- **Spec compliance: PASS** (3 carried-over overrides honoured, all invariants asserted)
- **Code quality: 3 Important findings, 7 Minor.** No Critical. Nothing blocks Task 4.
- **Mutation testing: 25 mutations, 21 caught, 4 survived.** All 4 survivors are test
  gaps or disclosed non-defects, not wrong behaviour. Two of the four are load-bearing
  gaps (Important 1, Important 2).

---

## 1. Spec compliance

### Interfaces — all present, signatures correct

| Brief | Location | Status |
| --- | --- | --- |
| `decodeDataUrl(dataUrl)` → `{ buffer, mimeType }`, throws on invalid | `server/media-payload.js:7` | ✅ |
| `fileIdFromDriveUrl(url)` → string \| null | `server/media-payload.js:20` | ✅ |
| `gasHealth()` → Apps Script JSON | `server/gas.js:28` | ✅ |
| `gasUpsert({...})` → `{ fileId, url }` | `server/gas.js:32` | ✅ |
| `existingFileId(previousUrl)` → string \| null | `server/gas.js:47` | ✅ |

`MAX_IMAGE_BYTES` (`media-payload.js:3`) and `fileIdFromDriveUrl` are also exported;
both are required by the plan's step 3 and consumed by the tests.

### Override 1 — corrected test counts

Honoured. The implementer reported 9 / 76 / 0 and did **not** back-fit the plan's
stale 63/68 arithmetic. I counted `test(` in `server/media.test.js`: lines 5, 9, 15,
19, 49, 56, 78, 89, 126 → **9**. The 4 pre-existing tests are unmodified and in
original order (`git diff --stat` shows `140 insertions(+)`, zero deletions).
Suite-wide 76/0 was verified before this review and is not contradicted by anything here.

### Override 2 — SVG rejected server-side as well

Honoured. `server/media-payload.js:13`:

```js
if (/svg/.test(mimeType)) throw new Error('foto svg tidak boleh');
```

Tested at `server/media.test.js:63` (in the reject list) **and**
`server/media.test.js:71` (`assert.throws(..., /svg/)` — pins the reason, so the test
fails for the SVG rule rather than by accidental regex failure). `Code.gs:52` uses the
same `/svg/` test. The two layers agree. See Important 2 for the case-sensitivity
residual.

### Override 3 — the three carry-over findings

**(1) Bare `fileId`, not URL — HONOURED, and genuinely exercised.**
`server/media.test.js:97-113` runs the full path, not a shortcut:

```js
const previousUrl = 'https://drive.google.com/file/d/1AbCdEfGh/view';
const out = await gasUpsert({ ..., fileId: existingFileId(previousUrl) });
...
assert.equal(calls[0].body.fileId, '1AbCdEfGh');            // :113
assert.match(calls[0].body.fileId, /^[-\w]{5,200}$/);       // :114  <- Code.gs's own regex
```

The assertion reads `calls[0].body` — the actual serialized HTTP payload — so it pins
what crosses the wire. `existingFileId` is not stubbed; the extraction runs for real.
**Not a finding.** This is the requirement met properly.

**(2) No line breaks in the base64 — HONOURED in code, weakly pinned in the test.**
The comment naming the coupling is present and accurate at `server/gas.js:33-35`, and
the assertion exists at `server/media.test.js:116`. But the fixture is 8 characters
(`'AAA+/w=='`), so a 64-column re-wrap mutation is a **no-op on this input** and
survives. I confirmed an *unconditional* newline mutation IS caught. The coupling is
real and tight — see §2 — so the assertion deserves a payload long enough to fail.
Logged as Minor 2.

**(3) `MAX_IMAGE_BYTES` ↔ `Code.gs` `MAX_BYTES` lockstep — HONOURED, doubly pinned.**
`server/media-payload.js:1-2` carries the lockstep comment; `server/media.test.js:82`
pins the value at runtime; and `tests/gas-media.test.js:65` pins
`Code.gs`'s `MAX_BYTES = 5 * 1024 * 1024` statically. Drift in either direction fails
a test. This is the strongest-specified item in the task and it is properly covered.

### Remaining brief invariants

| Invariant | Pinned at | Status |
| --- | --- | --- |
| rejects empty / Drive URL / `text/plain` / no `;base64,` / `null` / `undefined` / non-image / svg / >5 MB | `media.test.js:57-71` | ✅ |
| over-size message mentions `5 MB` | `media.test.js:80` | ✅ |
| `action: 'mediaUpsert'`, `dataBase64` verbatim | `media.test.js:107,110` | ✅ |
| non-OK response → throws Apps Script `message` | `media.test.js:133-136` | ✅ |
| throws when `fileId` or `url` missing | `media.test.js:138-148` (each field absent in turn) | ✅ |
| `gasHealth()` → `/?action=health` | `media.test.js:118-120` | ✅ |
| `GAS_WEBAPP_URL` unset → clear throw | `media.test.js:150-160` (env deleted, restored in `finally`) | ✅ |
| 45 s `AbortController`, cleared in `finally` | `media.test.js:111` (`init.signal instanceof AbortSignal`) | ✅ signal; ⚠️ `clearTimeout` unasserted — Minor 3 |
| never writes PostgreSQL, never logs base64 | no `pg`/import of `db.js`, no `console.*` in either module | ✅ verified by inspection |

### TDD red phase — reproduced

I re-created both red phases on temp copies outside the repo:

```
phase1 (no media-payload.js): ERR_MODULE_NOT_FOUND | tests=1 pass=0 fail=1
phase2 (no gas.js)          : ERR_MODULE_NOT_FOUND | tests=1 pass=0 fail=1
phase3 (complete, no env)   : tests=9 pass=9 fail=0
```

`ERR_MODULE_NOT_FOUND`, not a syntax error, and not an unrelated throw — exactly as the
brief required and as the report quoted. The red phase was genuine.

---

## 2. Layer-contract agreement with `Code.gs`

| Contract | `Code.gs` | `server/` | Agree? |
| --- | --- | --- | --- |
| size limit | `MAX_BYTES = 5*1024*1024` (`:1`), pre-decode `> MAX*4/3+4` (`:59`), post-decode `> MAX_BYTES` (`:73`) | `MAX_IMAGE_BYTES = 5*1024*1024` (`media-payload.js:3`), `buffer.length > MAX_IMAGE_BYTES` (`:16`) | ✅ **exact**, and pinned from both sides (`tests/gas-media.test.js:65` + `media.test.js:82`). Same comparison direction (`>`), so neither layer is more permissive at the boundary. |
| pre-decode base64 length | rejects if `dataBase64.length > 6 990 510.67` (`:59`) | worst case it can send is `buffer.toString('base64')` of 5 MB = **6 990 508 chars** | ✅ **margin 2.67 chars.** Measured. Wrapped-at-64 columns would be 7 099 734 → false 413. `gasUpsert` cannot produce that today because `decodeDataUrl` returns a `Buffer`, never the raw string, so any Task 4 caller is forced through `Buffer#toString('base64')`. The comment at `gas.js:33-35` is accurate and load-bearing. |
| MIME acceptance | `MIME_PREFIX.indexOf(p.mimeType) !== 0 \|\| /svg/.test(p.mimeType)` → 400 (`:52`) | `^data:(image\/[a-z0-9.+-]+);base64,` + `/svg/` on the lowercased mime (`media-payload.js:5,10,13`) | ✅ **no type one accepts and the other rejects.** The server is strictly *narrower* on charset (rejects a subtype containing a second `/`, e.g. `image/a/b`) — narrower is safe. Case is normalised before it leaves the server, so `Code.gs`'s case-sensitive `indexOf`/`/svg/` both work. Verified: `image/PNG`, `DATA:IMAGE/PNG;BASE64`, `image/x-icon` all accepted and normalised; `image/svg`, `image/Svg+xml`, `image/SVG+XML` all rejected. |
| SVG | `/svg/` on whatever arrives (`:52`) | `/svg/` on the lowercased mime (`:13`) | ✅ agree — **but only because of `.toLowerCase()`**. `Code.gs`'s test is case-sensitive too, so an uppercase `image/SVG+XML` would pass *both* layers. The current code is correct; nothing protects it. → **Important 2** |
| `FILE_ID_RE` | `/^[-\w]{5,200}$/`, 400 on any URL (`:3,63`) | emits `([-\w]+)` — **unbounded length, unanchored** (`media-payload.js:21`) | ❌ **DRIFT** → **Important 1** |
| error propagation / leakage | all messages domain-only Indonesian; the 500 is genericised to `'gagal menyimpan file'` with detail only in `console.error` (`:113-115`) | `callGas_` rethrows `json.message` verbatim (`gas.js:20`) | ✅ **no leak.** Verified end-to-end: `413 ukuran file melebihi 5 MB` and `403 fileId bukan milik folder tujuan` propagate verbatim; nothing internal (no stack, no file path, no `folderId`) can reach an end user. `Code.gs:34` is the only place a `folderId` is returned, via `gasHealth`, which is a diagnostic path and not user-facing. |

### `fileIdFromDriveUrl` vs `FILE_ID_RE` — the drift, measured

`server/media-payload.js:21` is `/\/file\/d\/([-\w]+)/`. It uses the same *character
class* as `FILE_ID_RE` but drops the *quantifier*. Measured against the real contract:

```
https://drive.google.com/file/d/1AbCdEfGh/view   -> "1AbCdEfGh"  len=9    FILE_ID_RE=true
https://drive.google.com/file/d/abc/view          -> "abc"        len=3    FILE_ID_RE=FALSE  -> Apps Script 400
https://drive.google.com/file/d/ab/view           -> "ab"         len=2    FILE_ID_RE=FALSE  -> Apps Script 400
https://drive.google.com/file/d/xxx...(300)       -> 300 chars             FILE_ID_RE=FALSE  -> Apps Script 400
https://drive.google.com/open?id=1AbCdEfGh        -> null                  (correct — not a /file/d/ URL)
1AbCdEfGh   (bare id)                            -> null                  (silent duplicate-create, see ⚠️ below)
https://evil.example/?u=/file/d/1AbCdEfGh         -> "1AbCdEfGh"           (foreign host accepted)
```

The three cases the review brief asked me to consider, answered: **a short id fails**,
**an over-long id fails**, and **a non-Drive URL is usually rejected** — but only
incidentally, because the regex requires the literal `/file/d/` segment; it is
unanchored, so any host carrying that path substring is accepted.

Note that `server/media.test.js:59` already uses
`'https://drive.google.com/file/d/abc/view'` as a `decodeDataUrl` fixture — the exact
string that exposes this hole — but never asserts `fileIdFromDriveUrl` on it.

---

## 3. Mutation testing

Independent sweep on temp copies outside the repo (`os.tmpdir()`), never the working
tree. Baseline confirmed green first (`# pass 9 / # fail 0`) so no mutation could be
credited to a pre-existing red.

**25 mutations — 21 caught, 4 survived.**

| # | Mutation | File | Result |
| --- | --- | --- | --- |
| 1 | 5 MB limit guard removed | `media-payload.js:16` | CAUGHT |
| 2 | 5 MB guard off-by-one `>` → `>=` | `media-payload.js:16` | CAUGHT (via the byte-exact 5 MB fixture at `media.test.js:83`) |
| 3 | `MAX_IMAGE_BYTES` → 1 MB | `media-payload.js:3` | CAUGHT |
| 4 | SVG rejection removed | `media-payload.js:13` | CAUGHT |
| 5 | **`mimeType` not lowercased** | `media-payload.js:10` | **SURVIVED** → Important 2 |
| 6 | empty-buffer guard removed | `media-payload.js:15` | CAUGHT |
| 7 | `DATA_URL` regex drops `image/` | `media-payload.js:5` | CAUGHT |
| 8 | `DATA_URL` regex drops `;base64,` | `media-payload.js:5` | CAUGHT |
| 9 | `fileIdFromDriveUrl` returns the whole URL | `media-payload.js:22` | CAUGHT |
| 10 | `fileIdFromDriveUrl` returns `null` always | `media-payload.js:22` | CAUGHT |
| 11 | `dataBase64` mutated (`+ 'x'`) | `gas.js:39` | CAUGHT |
| 12 | **`dataBase64` re-wrapped at 64 cols** | `gas.js:39` | **SURVIVED** — no-op on the 8-char fixture. Same mutation with an *unconditional* newline: CAUGHT. → Minor 2 |
| 13 | `dataBase64` omitted from body | `gas.js:39` | CAUGHT |
| 14 | `action` renamed | `gas.js:39` | CAUGHT |
| 15 | `mimeType` not forwarded | `gas.js:39` | CAUGHT |
| 16 | `filename` not forwarded | `gas.js:39` | CAUGHT |
| 17 | **URL sent as `fileId`** | `gas.js:48` | CAUGHT — carry-over #1 is genuinely pinned |
| 18 | `fileId` omitted from body | `gas.js:39` | CAUGHT |
| 19 | `AbortController` signal removed | `gas.js:16` | CAUGHT |
| 20 | `GAS_WEBAPP_URL` guard removed | `gas.js:8` | CAUGHT |
| 21 | **`clearTimeout` removed (timer leak)** | `gas.js:24` | **SURVIVED** (tests still 9 pass) → Minor 3 |
| 22 | `!out.fileId \|\| !out.url` guard removed | `gas.js:41` | CAUGHT |
| 23 | **`gasUpsert` returns raw Apps Script JSON** | `gas.js:42` | **SURVIVED** — the implementer's disclosed miss. Their reasoning is correct: the extra `name` field (`Code.gs:111`) is not observable through the specified `{ fileId, url }` interface, so it is an equivalent-behaviour mutation. The implementation is right; the test just does not pin it. |
| 24 | `gasHealth` hits the wrong action | `gas.js:29` | CAUGHT |
| 25 | Apps Script `message` swallowed | `gas.js:20` | CAUGHT |

**Against the specific list requested:** 5 MB limit ✅ caught · SVG rejection ✅ caught ·
wrong MIME from no-lowercasing ❌ **survived** · `fileIdFromDriveUrl` returning the URL
✅ caught · `dataBase64` mutated ✅ caught · re-wrapped ⚠️ survived at 64 cols on this
fixture, caught unconditionally · `dataBase64` omitted ✅ caught · URL sent as `fileId`
✅ caught · timeout/`AbortController` ✅ caught · `GAS_WEBAPP_URL` guard ✅ caught ·
`clearTimeout` ❌ **survived** · `!out.fileId || !out.url` guard ✅ caught.

Every one of the brief's carry-over requirements is mutation-covered. The implementer's
report claimed 17 mutations / 16 caught / 1 missed; my independent sweep is larger and
finds **4** survivors, so the reported mutation coverage was **optimistic**. Two of the
four are real gaps (Important 1 is the untested `fileId` length; Important 2 is the
untested lowercasing), one is a weak fixture (Minor 2), one is disclosed.

---

## 4. Findings

### Critical — none

No security hole, no data-loss path, no scope violation. `decodeDataUrl` and
`callGas_` are correct as written; the findings below are either untested-but-correct
behaviour or diagnostics quality.

### Important

**Important 1 — `server/media-payload.js:21` — `fileIdFromDriveUrl` can emit ids that
`Code.gs` rejects.**

`/\/file\/d\/([-\w]+)/` shares `FILE_ID_RE`'s character class but not its quantifier, and
is not anchored. Measured: `/file/d/abc/view` → `'abc'` (3 chars) and a 300-char segment
both fail `/^[-\w]{5,200}$/` in `Code.gs:3` and come back as
**400 `fileId harus id file Drive, bukan URL`** — a message that names the wrong cause
(the server sent a bare id, not a URL), so an operator will debug the wrong thing. The
unanchored form additionally accepts `https://any.host/file/d/<id>`, and
`/file/d/1Ab CdEf/view` silently truncates to the valid-looking `1AbCdEf`.

Fix — one line, and it makes the contract self-enforcing rather than duplicated:

```js
const m = /\/file\/d\/([-\w]+)/.exec(String(url || ''));
return m && /^[-\w]{5,200}$/.test(m[1]) ? m[1] : null;
```

Add to the existing reject block at `server/media.test.js:57-71`:

```js
assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/abc/view'), null);
assert.equal(fileIdFromDriveUrl(`https://drive.google.com/file/d/${'x'.repeat(201)}/view`), null);
```

(`server/media.test.js:59` already carries the `abc` fixture — one assertion away.)

**Important 2 — `server/media-payload.js:10` — `.toLowerCase()` is load-bearing for the
SVG defence and nothing tests it.**

Removing `.toLowerCase()` leaves the suite fully green (mutation #5). But
`Code.gs:52`'s `/svg/.test(p.mimeType)` is *also* case-sensitive, so an uppercase
`data:image/SVG+XML;base64,...` would clear **both** layers and land an SVG — which can
carry `<script>` — in Drive. The brief's override exists precisely to close this, and
the closing mechanism is unprotected. This is the highest-value missing assertion in the
task.

Fix — add to the reject list at `server/media.test.js:57-71`:

```js
'data:image/SVG+XML;base64,PHN2Zz48L3N2Zz4=',
'data:image/Svg+xml;base64,PHN2Zz48L3N2Zz4=',
```

**Important 3 — `server/gas.js:17-20` — a non-JSON Apps Script response reports a
misleading status.**

`await res.json().catch(() => ({}))` collapses "the deployment returned an HTML page"
into the same message as "the endpoint returned 500". Measured:

```
HTML login page, HTTP 200 (deployment not set to "Anyone") -> Error: Apps Script HTTP 200
body is JSON null, HTTP 200                                -> TypeError: Cannot read properties of null (reading 'ok')
```

The first is the single most common Apps Script misconfiguration — the web app is not
deployed for "Anyone" — and the operator is told `HTTP 200`. The second leaks a raw
`TypeError` out of a client module. One fix covers both:

```js
const json = (await res.json().catch(() => ({}))) || {};
if (!res.ok || !json.ok) {
  throw new Error(
    json.message || `Apps Script HTTP ${res.status}` +
      (res.ok ? ' (respons bukan JSON — cek izin deploy "Anyone" dan URL /exec)' : ''),
  );
}
```

(The `|| {}` also handles the JSON-`null` body, which `.catch()` cannot.)

### Minor

**Minor 1 — `server/media-payload.js:8` — `String(dataUrl || '')` coerces non-strings.**
Verified: `12345`, `{}`, `true` and a `Buffer` are all correctly rejected (they fail the
regex), but a **single-element array is accepted** — `String(['data:image/png;base64,…'])`
is the string itself. If Task 4 passes `req.body.foto` straight through, a client can
send `foto: ["data:…"]` instead of a string. Benign today (the same bytes are accepted
either way), but this is a trust boundary and it reads stricter than it is. Fix, one line
above line 8:

```js
if (typeof dataUrl !== 'string') throw new Error('foto harus berupa data URL image/*;base64');
```

**Minor 2 — `server/media.test.js:116` — the no-line-break assertion cannot fail on its
own fixture.** `'AAA+/w=='` is 8 characters; a 64-column wrap is a no-op on it
(mutation #12 survived for this reason). The coupling is real and tight — 5 MB base64 is
6 990 508 chars against `Code.gs`'s 6 990 510.67 limit, a **2.67-character margin** — so
the assertion deserves a payload long enough to actually wrap. Fix: raise the fixture to
more than 64 characters, e.g. `dataBase64: 'A'.repeat(80) + '+/w=='`. (Keep the current
value in the `assert.equal` on line 110, or update both together.)

**Minor 3 — `server/gas.js:24` — `clearTimeout` removal is invisible to the suite.**
Mutation #21 still reports 9 pass. It is observable only as wall clock: with
`clearTimeout` removed the run took **25.1 s** (45 s uncapped — my harness cut it at
`--test-timeout=25000`) versus **0.17 s** with it. The report's claim that this is
"proven indirectly by the suite not hanging" is correct in principle but unasserted, so
a regression would land as a mysteriously slow CI job rather than a red test. Fix (if
you want it): assert `duration_ms` at the file level, or accept the leak with a
`// ponytail: unasserted; removal shows up as a 45 s suite, not a failure` comment.

**Minor 4 — `server/media-payload.js:14` — lenient `Buffer.from(…, 'base64')`.**
Measured: `data:image/png;base64,AAA$%^&*` is **accepted** and yields 2 bytes of `0x00`,
so a malformed body becomes a 2-byte garbage file in Drive. Untested. Separately verified
benign: a client sending CRLF-wrapped base64 decodes correctly, so there is no
server-side false-413 path. Recommendation: **leave the behaviour**, add
`// ponytail: Buffer.from base64 lenient — garbage payload becomes a small junk file in Drive, not a security issue; tighten only if junk uploads show up in practice.`

**Minor 5 — `server/gas.js:29` — `gasHealth()`'s URL is correct but the assertion is
tautological.** `gasUrl_() + '/?action=health'` against a `…/exec` base yields
`…/exec/?action=health`, which Apps Script handles (`Code.gs:30` reads `e.parameter`).
The test asserts `${GAS_URL}/?action=health`, i.e. the same concatenation the
implementation performs — it cannot catch a shared misunderstanding of Apps Script's URL
shape. Low impact: the value is right, and it is guarded by the static
`tests/gas-media.test.js` assertions from Task 2. No fix needed unless you want the
literal `'https://script.google.com/macros/s/…/exec/?action=health'` spelled out.

**Minor 6 — `server/media.test.js:29-30` — the deviation from the plan's step 7 is sound,
not a hidden pass.** Judgement, as requested. The plan would have required
`GAS_WEBAPP_URL=… node --test`, which makes plain `npm test` red for anyone without the
variable — a worse default. The replacement is honest because the assertions compare
against the *resolved* `GAS_URL` (`media.test.js:106,120`), not against
`process.env.GAS_WEBAPP_URL`, so a shell-supplied value still wins and a wrong one still
fails the URL assertion. The module-scope `process.env` write cannot leak: `node --test`
runs each file in its own process. **No test performs real network I/O** — the only
`fetch` call site is `callGas_` (`gas.js:16`) and both tests replace `globalThis.fetch`
before any call and restore it in `finally`; my sandbox baseline completed in 0.17 s,
which a real DNS attempt to `example.invalid` could not. **Approved.**

**Minor 7 — `server/media.test.js:164` — no trailing newline** (the diff ends with
`\ No newline at end of file`). Cosmetic; POSIX-text-hygiene only.

### Report accuracy

The report is honest and, on the things it chose to disclose, precise — the raw-JSON
miss was volunteered rather than buried, and the invariants table maps 1:1 onto real
assertions. Two claims are weaker than stated:

- "17-mutation sweep: 16 caught, 1 missed" — my independent sweep of 25 finds **4**
  survivors. The *conclusion* (assertions are load-bearing) holds; the *coverage
  number* is optimistic, and it is optimistic in a direction that hides an
  Important-severity gap (Important 2).
- "re-wrap base64 with `\n` → caught" is true only for an unconditional newline; the
  natural 64-column mutation is a no-op on the 8-char fixture and survives.

---

## 5. Scope discipline

`git show --stat HEAD`:

```
 server/gas.js           |  49 +++++++++++++++++
 server/media-payload.js |  23 ++++++++
 server/media.test.js    | 140 ++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 212 insertions(+)
```

Exactly the three files the brief named. **Confirmed absent:** no route file, no config
file, no `.env`, no `package.json` change, no `google-apps-script/` change, no frontend
(`www/`) change, no migration. Zero deletions, so the 4 pre-existing tests in
`media.test.js` are untouched rather than rewritten. `git status` shows no modified
tracked files — only pre-existing untracked artefacts.

Verbatim adherence to the plan's step-3 and step-6 code: confirmed by diffing against
`docs/superpowers/plans/2026-10-02-media-drive.md:491-509` and `:579-621`. The only
differences are the brief's SVG override, three added comments, and the
`gasUrl_()` call-site comment. No scope creep.

---

## 6. ⚠️ Not verifiable from source alone

1. **Whether the database currently stores bare ids rather than `/file/d/<id>/view`
   URLs.** `existingFileId('1AbCdEfGh')` returns `null`, which makes `gasUpsert` send
   `fileId: null` and `Code.gs` **creates a duplicate file** instead of updating —
   silent, no error. `Code.gs:27` `canonicalUrl_` always writes the `/file/d/<id>/view`
   form, so this is reachable only via hand-edited or legacy rows. Task 3 has no
   database access by design, so this cannot be settled here. **Task 4/5 should query
   the stored values**, or accept the duplicate-create risk explicitly.
2. **Whether `GAS_WEBAPP_URL` in the real deployment ends at `/exec`.** The health-URL
   concatenation is correct for `/exec` and would be wrong for a `/dev` URL. Nothing in
   the repo pins the production value (there is no `.env`, by design at this stage).
3. **Whether Apps Script's `/exec` actually tolerates the trailing-slash form
   `…/exec/?action=health`.** It does in general, but this cannot be exercised from
   `node --test`; it needs one manual call against the real deployment.
4. **The 2.67-character base64 margin** is arithmetic I verified locally against Node's
   encoder. `Utilities.base64Decode` in Apps Script is a different implementation; the
   margin is large enough that this is not a practical risk, but it is not *proven*
   against Apps Script's own encoder.

---

## 7. Verdict

- **Spec compliance: PASS.** All five interfaces correct. All three deliberate overrides
  honoured — corrected counts, server-side SVG rejection, and all three carry-over
  constraints, with carry-over #1 (bare `fileId`) genuinely exercised end-to-end rather
  than trivially. Every listed invariant has a real assertion. Red phase reproduced.
  Scope is exactly three files.
- **Code quality: approved with findings.** 3 Important, 7 Minor, 0 Critical. The
  Important findings are one-line fixes in two files and none of them block Task 4 —
  but Important 1 and Important 2 should land before any route starts calling these
  functions with attacker-influenced or legacy-stored input.
- **Mutation results: 4 survivors** — `mimeType` not lowercased (Important 2), `dataBase64`
  re-wrapped at 64 columns (Minor 2), `clearTimeout` removed (Minor 3), and `gasUpsert`
  returning raw JSON (the implementer's own disclosed miss, equivalent behaviour).