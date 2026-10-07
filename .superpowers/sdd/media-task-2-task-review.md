# Task 2 gate review — Google Apps Script media uploader

- **Repo:** `D:\Code\absensi_refactored_v6` (branch `master`)
- **Base:** `d47976c` · **Commit under review:** `a793cce`
- **Diff:** 3 new files, 139 insertions — `google-apps-script/Code.gs` (94), `google-apps-script/appsscript.json` (6), `tests/gas-media.test.js` (39)
- **Method:** source read + **mutation testing** of the assertion suite (each mutation applied to a temp copy of `Code.gs` in an OS temp dir, suite re-run there; working tree never modified, temp dirs removed).

---

## 1. Verdicts

| Gate | Verdict |
|---|---|
| **Spec compliance** | ✅ — all prescribed values implemented verbatim; one disclosed extra (2 comment lines) |
| **Code quality** | ❌ — 1 Critical (security), 1 Critical (test integrity), 5 Important, 3 Minor |

---

## 2. Spec compliance detail

Every exact value the brief is authoritative for is present and correct:

| Brief requirement | Code.gs | Status |
|---|---|---|
| `GET ?action=health` → `{ ok: true, folderId }` | `Code.gs:36-46` | ✅ |
| `POST { action:'mediaUpsert', filename, mimeType, dataBase64, fileId? }` → `{ ok: true, fileId, url, name }` | `Code.gs:48-94` | ✅ |
| `MAX_BYTES = 5 * 1024 * 1024` | `Code.gs:3` | ✅ |
| MIME prefix `image/` | `Code.gs:4, 56` | ✅ |
| Canonical URL `https://drive.google.com/file/d/<ID>/view` | `Code.gs:32-34` | ✅ |
| `DriveApp.Access.ANYONE_WITH_LINK` + `DriveApp.Permission.VIEW` | `Code.gs:82` | ✅ |
| Folder from `PropertiesService` / `DRIVE_FOLDER_ID` | `Code.gs:21-25, 83` | ✅ |
| `appsscript.json` (V8 / Asia/Jakarta / STACKDRIVER / drive scope) | byte-for-byte match to brief §Step 3 | ✅ |
| Never writes PostgreSQL | no DB code anywhere | ✅ |
| Never logs/echoes raw base64 | no `console.log`/`Logger.log`; no message interpolates `p.dataBase64` | ✅ |
| create-vs-update distinction | ternary `Code.gs:75-77` + `setContent` `Code.gs:80` | ✅ correct |

**Extra (not in the brief, disclosed in the report):** `Code.gs:1-2` — two comment lines echoing regex literals. Harmless to runtime, but they exist only to satisfy a broken assertion (see C2).

**Removed (were in the brief, silently dropped):** the two inline explanatory comments in the brief's `Code.gs` (first-upload vs re-upload rationale) and the 3-line comment in the brief's test 2 (why banning `createFile` would be wrong). Net effect: real documentation removed, decorative documentation added.

### Is the 6th test scope creep? — **No.**

The brief's Step-1 code block contains **six** `test()` calls (brief lines 33, 38, 48, 53, 58, 63). The implementer delivered exactly those six, with **every assertion preserved verbatim** and none weakened. The `63 vs 64` total is the brief's arithmetic being off by one: Step 5b predicts `63 = 57 + 6`, but the real baseline at `d47976c` is **58** (64 − 6), so the correct total is 64. The brief is internally inconsistent — Step 5 says "Expected: 6 passing" (right) while Step 5b mis-states the baseline. **Adjudication: not scope creep; the brief's prediction was wrong, the implementer's output is right.**

---

## 3. Mutation test results — which assertions actually guard anything

Baseline `Code.gs` → 6/6 pass. Each mutation below was applied to a temp copy; every mutation is verified to have actually changed the source before the result is trusted (`X` = test fails = mutation caught):

| # | Mutation | Result | Reading |
|---|---|---|---|
| M0 | delete the 2 planted comment lines only | `X.....` | **the comment is the sole satisfier of that regex** |
| M1 | delete the whole `fileIdFromUrl()` function | `X.....` | signature assertion is load-bearing |
| M2 | gut `fileIdFromUrl` body → `return null;` | `......` | **test 1 never checks the function works** |
| M3 | delete `if(p.fileId){setName;setContent}` | `.X....` | load-bearing |
| M4 | always `createFile` (duplicate on re-upload) | `.X....` | **load-bearing — the core invariant is genuinely protected** |
| M5 | delete `setSharing()` | `..X...` | load-bearing |
| M6 | delete `setResponseCode()` | `...X..` | presence only (see M12) |
| M7 | delete the 5 MB size guard entirely | `......` | **size limit is untested** |
| M8 | `jsonOut` always returns 200 | `......` | **no HTTP status is tested** |
| M9 | delete MIME `image/` validation entirely | `......` | **MIME validation is untested** |
| M10 | change canonical URL to `/uc?id=` form | `......` | **canonical URL is untested** |
| M11 | `throw` out of `doPost` instead of JSON | `......` | **"all failures return JSON" is untested** |
| M12 | echo `p.dataBase64` into an error message | `......` | **"never echo base64" is untested** |
| M13 | hardcode the folder id | `....X.` | load-bearing |

### Load-bearing vs decorative, assertion by assertion

**Decorative — satisfied only by the planted comment:**
- `assert.match(src, /\/file\/d\/([-\w]+)/)` (`tests/gas-media.test.js:11`). Direct probe: the *unescaped* literal `/file/d/([-\w]+)` occurs **exactly once** in `Code.gs`, on **line 2**. The real regex on `Code.gs:28` is backslash-escaped (`/\/file\/d\/([-\w]+)/`), so the test's unescaped pattern cannot match it, and `Code.gs:33` (`/file/d/' + fileId + '/view'`) is not followed by `([-\w]+)`. M0 confirms: remove lines 1-2 and this assertion dies. **The test would pass with the implementation deleted** (M2: gut the body → 6/6 green).

**Load-bearing (would fail if the behaviour regressed):**
- `function\s+fileIdFromUrl\s*\(` — M1
- `DriveApp\.getFileById`, `\.setContent\(`, `if\s*\(\s*p\.fileId\s*\)` — M3
- `const file = p.fileId ? DriveApp.getFileById(p.fileId)` — **M4. This is the best assertion in the file: it is the only thing standing between the codebase and silent duplicate creation on every re-upload.** It is genuinely pinned.
- `ANYONE_WITH_LINK`, `Permission.VIEW` — M5
- `function jsonOut(`, `setResponseCode(` — M6 (presence)
- `PropertiesService`, `DRIVE_FOLDER_ID` — M13

**Non-load-bearing — satisfied by a *declaration*, not by a *use* (same defect class as the planted comment, just less blatant):**
- `5 * 1024 * 1024` — matched by the constant declaration alone; the guard that uses it can be deleted (M7).
- `image/` — matched by `MIME_PREFIX = 'image/'` alone; the validation can be deleted (M9).
- `setResponseCode(` — matched whether or not `code` is forwarded (M8).

Net: **4 of the 7 stated core invariants have zero test coverage** (size cap, MIME validation, canonical URL, JSON-on-all-errors), and the "never echo base64" invariant would not be caught if violated (M12).

---

## 4. Findings

### CRITICAL-1 — `p.fileId` is untrusted: arbitrary Drive file overwrite + forced public sharing
`google-apps-script/Code.gs:75-83`

The brief's Step 6 deploys the web app with access **Anyone**. `p.fileId` goes straight into `DriveApp.getFileById()` with no check that the file belongs to this app's folder, then its content is overwritten (`setContent`) and its sharing is switched to public. Anyone who obtains the `/exec` URL (it will live in an `.env` in this repo) can overwrite **any file in the operator's entire Drive** — not just files created by this app — and force it world-readable. `getFileById` on a nonexistent ID throws → 500, which is also a file-ID existence oracle.

Fix (one guard, see also IMPORTANT-1/2 — they fold into the same rewrite):

```javascript
    const folder = DriveApp.getFolderById(folderId_());
    const existingId = p.fileId ? fileIdFromUrl(p.fileId) || p.fileId : null;
    let file;
    if (existingId) {
      file = DriveApp.getFileById(existingId);
      const parents = file.getParents();
      if (!parents.hasNext() || parents.next().getId() !== folder.getId()) {
        return jsonOut(403, { ok: false, message: 'fileId bukan milik folder tujuan' });
      }
      file.setName(p.filename);
      file.setContent(blob);
    } else {
      file = folder.createFile(blob);
    }
```

### CRITICAL-2 — assertion satisfied only by a comment; the implementation is untested
`google-apps-script/Code.gs:1-2` + `tests/gas-media.test.js:11`

Lines 1-2 are comment-only text whose sole purpose is to make `/\/file\/d\/([-\w]+)/` match. Proof in §3: M0 (delete comments) → test 1 fails; M2 (body → `return null`) → all 6 pass. The brief itself is self-contradictory — its prescribed `Code.gs` cannot satisfy its own assertion, because the only real occurrence is escaped. The implementer patched the *source* to satisfy a broken *test*; the test should have been fixed.

`fileIdFromUrl` also has **0 callers** (1 occurrence in the file = the definition). So test 1 is testing dead code, and test 1's second assertion is testing a comment.

Fix — delete lines 1-2, and make the assertion match real code (`.gs` regex literals are backslash-escaped, so flatten before matching):

```javascript
const flat = src.replace(/\\/g, '');   // .gs regex literals are backslash-escaped
...
  assert.match(src, /function\s+fileIdFromUrl\s*\(/);
  assert.match(flat, /\/file\/d\/([-\w]+)/);
  assert.match(src, /drive\.google\.com\/file\/d\/'\s*\+\s*fileId\s*\+\s*'\/view/);
```

The third line pins the canonical-URL invariant against `Code.gs:33`, which is currently untested (M10). Then either wire `fileIdFromUrl` in (see IMPORTANT-3) or delete it and its test — but not leave it dead.

### IMPORTANT-1 — create path leaves an orphan in My Drive root (multi-parent file)
`google-apps-script/Code.gs:77` + `:83`

`DriveApp.createFile(blob)` creates the file in the account root, then `DriveApp.getFolderById(...).addFile(file)` **adds** a second parent — Drive's `addFile` does not remove the previous parent. Every first upload therefore ends up in **both** root and the target folder, so deleting the folder later leaves orphans. Fix: `folder.createFile(blob)` creates directly in the folder with exactly one parent, and the `addFile` call can then be deleted from the create path entirely.

### IMPORTANT-2 — config validated *after* the file is mutated
`google-apps-script/Code.gs:80-83`

`folderId_()` is called on line 83, **after** `setContent` (80) and `setSharing` (82). If `DRIVE_FOLDER_ID` is unset, the throw lands in the `catch` → 500, but the content is already overwritten and the file already made public. The backend sees a failure, may retry, and the file is left half-mutated. Fix: resolve `folder` as the **first** statement in the `try` (as in CRITICAL-1).

### IMPORTANT-3 — `fileIdFromUrl` is dead code
`google-apps-script/Code.gs:27-30`

Zero callers. The plan stores canonical URLs in Postgres (Task 1), so a caller sending the URL it stored back — the obvious thing — hits `getFileById('<a url>')` → throw → 500. Fix: one line, `const existingId = p.fileId ? fileIdFromUrl(p.fileId) || p.fileId : null;` (bare id → helper returns `null` → falls through to the id; URL → helper extracts the id). Lazy alternative: delete the function and test 1 — but then the stored URL cannot round-trip, which CRITICAL-1's fix does not otherwise solve.

### IMPORTANT-4 — 5 MB cap is enforced only *after* full decode
`google-apps-script/Code.gs:65-71`

A 200 MB body is fully materialised into `bytes` before the cap rejects it; Apps Script then dies on memory/time quota with an opaque error instead of a clean 413. Add an early guard on the encoded length (base64 is ~4/3 of the decoded size), keeping the decoded check as the authority:

```javascript
  // ponytail: cheap pre-decode guard; 4/3 + 4 slack. Remove if the backend
  // already caps its body size.
  if (p.dataBase64.length > MAX_BYTES * 4 / 3 + 4) {
    return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
  }
```

### IMPORTANT-5 — 4 of 7 core invariants have no test coverage
`tests/gas-media.test.js:31-34` and `:26-29`

Per §3, M7/M8/M9/M10/M11/M12 all pass with 6/6 green. Assert on the **guard**, not the declaration:

```javascript
  assert.match(src, /bytes\.length > MAX_BYTES/);            // size cap is used
  assert.match(src, /MIME_PREFIX\.indexOf\(p\.mimeType\)/);  // mime is checked
  assert.match(src, /\.setResponseCode\(code\)/);            // code is forwarded
```

### MINOR-1 — `image/svg+xml` is accepted
`google-apps-script/Code.gs:56`

`MIME_PREFIX.indexOf('image/evil') === 0`, so anything with the `image/` prefix passes, including `image/svg+xml` — script-capable content that is never a legitimate face photo or signature. Empty mime is correctly rejected by `!p.mimeType` (line 53), and case sensitivity (`IMAGE/PNG` → rejected) is the safe direction, so neither matters. Fix: `if (MIME_PREFIX.indexOf(p.mimeType) !== 0 || /svg/.test(p.mimeType))`, or allowlist `png|jpe?g|webp`.

### MINOR-2 — raw internal exception text returned to the caller
`google-apps-script/Code.gs:44, 92`

`String(err && err.message || err)` returns Drive/Apps Script error text verbatim, which can include resource IDs and existence information ("File not found: …"). It does **not** contain the base64 payload. Prescribed by the brief, so not a spec violation. Fix: return a generic message and `console.error` the detail server-side — Apps Script's Stackdriver logging (already enabled in `appsscript.json`) makes this free.

### MINOR-3 — brief's explanatory comments dropped
`google-apps-script/Code.gs:74-81`, `tests/gas-media.test.js:14-19`

The brief's two inline comments (create-vs-update rationale) and the test-2 comment (why banning `createFile` would be wrong) are gone. Restore them once CRITICAL-2 is fixed.

---

## 5. Apps Script correctness audit — clean

- No Node-only APIs (`require`, `fs`, `Buffer`, `fetch`, `process`, `__dirname`) anywhere in `Code.gs`.
- All globals are valid Apps Script services: `ContentService`, `Utilities`, `PropertiesService`, `DriveApp`.
- `ContentService.createTextOutput(...).setMimeType(ContentService.MimeType.JSON).setResponseCode(code)` — correct chain, returns `TextOutput`, which is what `doGet`/`doPost` must return.
- `Utilities.base64Decode(str)` → `byte[]`; `.length` is the byte count, so the 5 MB comparison is in the right unit. Non-base64 input throws → caught → 400. Empty string pre-rejected at line 59.
- `Utilities.newBlob(bytes, mimeType, name)` — correct arg order.
- `DriveApp.createFile`, `getFileById`, `getFolderById`, `File.setName`, `File.setContent`, `File.setSharing`, `Folder.addFile` — all valid.
- No path throws out of `doPost`: `readParams_` swallows JSON-parse errors (returns `{}` → 400), and every fallible call sits inside a `try`. The only code outside a `try` is pure validation. Error shape is consistently `{ ok: false, message }`.

---

## 6. ⚠️ Not verifiable from source alone

1. **Whether the brief's Step 6 (manual deploy) was performed** — the report covers only Steps 2 and 5. No record of the deployment, the `/exec` URL, or `DRIVE_FOLDER_ID` being set exists in the repo. Cannot be automated; needs a human confirmation before Task 3 depends on it.
2. **Whether the deployed web app really is access=Anyone.** CRITICAL-1's severity depends entirely on this. If it were restricted to the Google account, the finding drops to Important.
3. **Drive multi-parent behaviour** (`addFile` not moving the file) is from the Drive API contract, not from executing this script — the mutation suite cannot exercise it.
4. **Whether `file.getParents()` yields exactly one parent** for files created outside this app but added to the folder. The CRITICAL-1 guard checks only the first parent; if a file has several, order is not guaranteed. Flagged rather than over-engineered — with `folder.createFile` on the create path, our own files always have exactly one parent.
5. **Concurrency**: no `LockService`, so two simultaneous re-uploads to the same `fileId` can interleave `setName`/`setContent` (last write wins). Not exercised by the static suite; only relevant if the backend fans out writes for one employee.
6. **Real runtime behaviour of `setResponseCode` in a deployed `/exec`** — asserted by source reading only.

---

## 7. Recommended patch, in order

1. CRITICAL-1 + IMPORTANT-1 + IMPORTANT-2 + IMPORTANT-3 together — one rewrite of the mutation block in `doPost` (resolve folder first → parent check → `folder.createFile` → `fileIdFromUrl` accept-both). Four findings, one edit.
2. CRITICAL-2 — delete `Code.gs:1-2`; fix the assertion to match escaped source via `flat`; add the canonical-URL assertion.
3. IMPORTANT-5 — three guard-level assertions.
4. IMPORTANT-4, MINOR-1, MINOR-2, MINOR-3 — as written above.

Blocking for merge: **CRITICAL-1** (security) and **CRITICAL-2** (the assertion that lets the implementation vanish unnoticed). IMPORTANT-1/2 are three lines and remove the root-folder orphan and the partial-mutation window, so fold them into the same commit.

---

# Fix round 1 re-review

- **Commit:** `c38a90f` (parent `a793cce`) · **Files:** `google-apps-script/Code.gs` (110 lines), `tests/gas-media.test.js` (100 lines), `appsscript.json` unchanged
- **Method:** independent re-mutation. Working tree never modified (`git status --porcelain` on the in-scope paths: clean). Every mutation applied to a temp copy of `Code.gs` in an OS temp dir with the real `tests/gas-media.test.js` copied alongside; each result verified to have actually changed the source; temp dirs removed.

## Verdict: **NOT APPROVED**

The security fix is real and correct. The test-integrity fix is not — the original CRITICAL-2 proof reproduces, one character to the right.

## 1. Per-finding adjudication

| Finding | Verdict | Evidence |
|---|---|---|
| **CRITICAL-1** untrusted `p.fileId` → arbitrary Drive overwrite + forced public | **FIXED** | `Code.gs:81` folder resolved first; `:63` `FILE_ID_RE` shape check; `:84-90` parent check → 403 at `:89`; first mutation is `:91`. Repro: M1 (delete guard), M17 (`/^.*$/`), reversing the folder-before-`setContent` order, and neutering the `FILE_ID_RE` guard — all 4 caught. `addFile` path gone, so no cross-folder write remains. |
| **CRITICAL-2** assertion satisfied only by a comment; impl untested | **PARTIAL** | Planted comments deleted (diff `:20-21`); 12 tests instead of 6; 6 sampled implementer mutations + M18 all caught. **But** the stripper at `tests/gas-media.test.js:13` (`src.replace(/^\s*\/\/.*$/gm,'')`) only removes comments that *begin a line*. See §2 — deleting the whole mutation block still gives 12/12. |
| **IMPORTANT-1** create path leaves an orphan in My Drive root | **FIXED** | `Code.gs:96` `folder.createFile(blob)`; no `DriveApp.createFile`, no `addFile`. Pinned by `tests:82-83`; M10 caught. |
| **IMPORTANT-2** config validated *after* the file is mutated | **FIXED** (folder case) | `Code.gs:81` is the first statement of the `try`; `tests:61-67` pins the order by `indexOf`; moving `getFolderById` after `setContent` is caught (verified). New partial window on the *sharing* step → MINOR-C below. |
| **IMPORTANT-3** `fileIdFromUrl` dead code | **RESOLVED by deletion** — with a cross-task caveat | Function removed; `tests:20` now asserts its absence. Report justifies it: the plan extracts the id server-side (`fileIdFromDriveUrl`, plan:506/620/1017). See ⚠️-3 — that contract is now unenforced and `FILE_ID_RE` hard-rejects URLs with a 400. |
| **IMPORTANT-4** 5 MB enforced only *after* full decode | **FIXED** | `Code.gs:59` pre-decode guard, `:73` post-decode authority. Both asserted (`tests:42-43`) plus an order check vs `base64Decode` (`tests:46`). M3/M4-equivalents caught. Arithmetic verified correct — see §3. |
| **IMPORTANT-5** 4 of 7 core invariants untested | **PARTIAL (6 of 7)** | size cap, MIME guard, canonical URL, `setResponseCode(code)`, JSON-on-all-errors all now caught. **"Never echo base64" is still uncovered** — verified: `return jsonOut(400, { message: 'bad payload: ' + p.dataBase64 })` → 12/12 SURVIVED. `tests:99` only bans the specific `String(err && err.message)` form. |
| **MINOR-1** `image/svg+xml` accepted | **FIXED** | `Code.gs:52`; pinned `tests:53`. Dropping only the `/svg/` clause is caught. No over-match: no legitimate `image/*` type contains "svg". |
| **MINOR-2** raw internal exception text returned | **FIXED** | `Code.gs:38` / `:107` `console.error(...)` → Stackdriver; responses are generic (`:39` "health check gagal", `:108` "gagal menyimpan file"). Pinned by `tests:99`. No payload or resource ID reaches the caller, so the file-existence oracle is gone. |
| **MINOR-3** brief's explanatory comments dropped | **FIXED** | `Code.gs:51`, `:58`, `:62`, `:78-80`, `:85`, `:94-95`. |

## 2. The anti-gaming fix does **not** hold

`tests/gas-media.test.js:13` strips only lines whose first non-space token is `//`. Everything else survives into `code`/`flat`.

**REPRO (the decisive one).** Delete `Code.gs:78-105` — the entire mutation block: `getFolderById`, `newBlob`, `getFileById`, the 403 parent guard, `setName`, `setContent`, `folder.createFile`, `setSharing` — and replace with a single block comment holding that text in the order the assertions demand:

```javascript
  /* DriveApp.getFolderById(folderId_()) const parents = file.getParents()
     if (!parents.hasNext() || parents.next().getId() !== folder.getId()) return jsonOut(403, {ok:false})
     if (p.fileId) file = DriveApp.getFileById(p.fileId) file.setName(p.filename) file.setContent(blob)
     file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW) file = folder.createFile(blob) */
```

**Result: `# pass 12  # fail 0`, and `node --check` still reports the file parses.** That is the CRITICAL-2 cheat — CRITICAL-1's whole security fix, IMPORTANT-1 and IMPORTANT-2 deleted — shipped green.

Three further vectors, each 12/12:

| Vector | Result |
|---|---|
| Marker as a **trailing** `//` comment after code on the same line (`tests:13` anchors `^\s*//`, so this is not stripped) | 12/12 SURVIVED |
| Marker inside a **`/* … */`** block comment | 12/12 SURVIVED |
| Marker inside a **template literal** (`` const M = `…` ``) | 12/12 SURVIVED |
| Marker as a **full-line** `//` comment (the honest cheat) | CAUGHT — the stripper's only working case |

To be fair to the implementer: the new **ordering** assertions (`tests:46`, `:62-66`, `:75-77`) are genuinely load-bearing. Two of my first full-gut attempts were caught purely by ordering violations — putting the 403 text after `setContent`, or shifting `file.setSharing(` off the marker line. That is a real improvement over round 0.

**Fix.** Strip all comments, not just full-line ones, and assert against the comment-free text. One line does it:

```javascript
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
```

`^\s*` must go — it is the only reason trailing comments survive. Accept that trailing-comment stripping can eat a `//` inside a string literal (this file has no URL strings containing `//`, so it is free today). Re-run M18 plus the three vectors above; all four must go to 11/12.

## 3. Fresh-defect audit (new code)

- **`parents.next()` after `hasNext()` — safe, but first-parent-only.** `hasNext()` is called first, so no `next()` on an exhausted iterator; short-circuit `||` means no `next()` at all when the iterator is empty. But `:88` compares **only the first parent**. See IMPORTANT-B.
- **Pre-decode size arithmetic — correct.** `limit = 6990510.67`; longest legitimate encoding of 5 242 880 bytes is `4·ceil(MAX/3) = 6 990 508`; headroom 2.67 chars; legitimate max-size uploads pass. No bypass direction exists: a *shorter* string can only decode to *fewer* bytes, so whitespace and padding cannot smuggle an oversized payload past a length check. ⚠️-1 for wrapped base64.
- **`FILE_ID_RE = /^[-\w]{5,200}$/` — correct, no false rejects, nothing dangerous accepted.** Real Drive IDs are `[A-Za-z0-9_-]{28,44}`, comfortably inside. `/`, `.`, `:` and `?` are excluded, so URLs and path fragments are rejected at `:64`. Junk that passes (e.g. `_______`) reaches `getFileById`, throws, and is now swallowed into a generic 500 with no ID echo — so it is no longer an oracle. MINOR-D: `.test()` coerces, so a numeric `p.fileId` passes the shape check.
- **SVG rejection — no over-match.** No legitimate `image/*` type contains the substring "svg"; `image/svg+xml`, `image/svg`, `image/x-svg` are all caught. Under-match is by design (the guard reads the *declared* type only) → ⚠️-4.
- **Error messages — clean.** No response body interpolates `p.dataBase64`, `p.filename`, `p.fileId`, or exception text. Both catches log server-side via `console.error`, which is valid in the V8 runtime and routed by `exceptionLogging: STACKDRIVER` (`appsscript.json:4`). Nothing sensitive leaks.
- **`folder.createFile` + `setSharing` on the create path — correct.** `folder.createFile(blob)` returns the new `File` with exactly one parent; `setSharing(ANYONE_WITH_LINK, VIEW)` at `:98` runs once, after either branch, so the sharing guarantee holds on both paths. Residual: if `setSharing` throws (domain policy forbidding public links), the file already exists but the caller gets a 500 with no `fileId` → MINOR-C.

## 4. NEW findings this round

### NEW-IMPORTANT-A — the comment stripper only covers full-line `//`, so the implementation can be deleted wholesale
`tests/gas-media.test.js:13`
REPRO-B above: 12/12 with `Code.gs:78-105` removed. This is CRITICAL-2 not closing, and it is the same class of defect the round was supposed to eliminate. Fix is one line (§2). Until then the suite proves nothing about the security fix it appears to cover.

### NEW-IMPORTANT-B — the 403 guard reads only the *first* parent; a multi-parent file gets a false 403
`Code.gs:87-90`
`parents.next()` reads one element of a `FileIterator` and discards the rest. Drive does not document parent ordering. Concretely: every file created by the **previous** version of this very script has two parents — `DriveApp.createFile` put it in My Drive root and `addFile` added the target folder without removing the root. If root comes first, re-uploading such a file after this fix returns `403 fileId bukan milik folder tujuan` permanently, and there is no way to recover it through the endpoint. On a fresh deploy nothing regresses; on an upgrade of an already-deployed script it can brick re-uploads for existing employees.

```javascript
      const parents = file.getParents();
      let mine = false;
      while (parents.hasNext()) { if (parents.next().getId() === folder.getId()) { mine = true; } }
      if (!mine) {
        return jsonOut(403, { ok: false, message: 'fileId bukan milik folder tujuan' });
      }
```

`tests:73` must be updated to match. (For files this version creates, exactly one parent is guaranteed, so the loop is a no-op — this only widens correctness.)

### NEW-MINOR-C — partial mutation if `setSharing` throws
`Code.gs:98`
Content is already overwritten (`:91-92`) or the file already created (`:96`) before sharing is attempted. A throw yields 500 with the file mutated-but-unshared, and on the create path an orphan the caller has no `fileId` for — a retry duplicates it. Same class as IMPORTANT-2, one step further down. Acceptable for now; worth a line in the `ponytail:` comment if drive-sharing policy ever bites.

### NEW-MINOR-D — `FILE_ID_RE` accepts non-string `p.fileId`
`Code.gs:63`
`RegExp.prototype.test` coerces, so `p.fileId = 12345` passes the shape check and reaches `getFileById(12345)` → throw → generic 500. No security impact; `typeof p.fileId !== 'string'` would close it.

## 5. Spec compliance — no regression

| Requirement | Status |
|---|---|
| `GET ?action=health` → `{ ok: true, folderId }` | ✅ `Code.gs:33-34` |
| `POST` → `{ ok: true, fileId, url, name }` | ✅ `Code.gs:100-105` |
| create-vs-update distinction | ✅ `if (p.fileId)` `:84` → `getFileById`+`setContent`; `else` `:93-97` → `folder.createFile`; no duplicate path |
| `MAX_BYTES = 5 * 1024 * 1024` | ✅ `:1`, enforced `:59` and `:73` |
| `image/*` | ✅ `:52` |
| canonical URL `https://drive.google.com/file/d/<ID>/view` | ✅ `:26-28`, pinned `tests:88-89` |
| `ANYONE_WITH_LINK` + `Permission.VIEW` | ✅ `:98`, single call covering both paths |
| `DRIVE_FOLDER_ID` via `PropertiesService` | ✅ `:21`, `tests:58` |
| no PostgreSQL write | ✅ no DB code; `appsscript.json` unchanged |
| no base64 echo | ⚠️ true in the shipped code, but **not asserted** — see IMPORTANT-5 |
| `appsscript.json` V8 / Asia/Jakarta / STACKDRIVER / drive scope | ✅ byte-identical to the brief |

## 6. ⚠️ Residual

1. **Wrapped base64 false-413.** A legitimate 5 MB payload encoded with 76-column line breaks is 7 082 489 chars > the 6 990 510 guard and would be rejected before decode. Node's `Buffer.toString('base64')` does not wrap, so this is unlikely from the planned backend — but confirm no encoder or proxy inserts line breaks, and no `data:image/png;base64,` prefix is ever prepended.
2. **`setResponseCode` in a live `/exec`** — asserted by source reading only; not executed.
3. **Task 3 contract, now unenforced.** `FILE_ID_RE` (`Code.gs:63`) hard-rejects a canonical URL with 400. The plan converts URLs to ids server-side (`fileIdFromDriveUrl`), but nothing in *this* task pins that, and no test would catch a Task 3 route passing `previousUrl` verbatim. Add an assertion when Task 3 lands.
4. **SVG-by-mislabelling.** `Code.gs:52` inspects the caller-declared `p.mimeType` only. SVG bytes declared as `image/png`, with `p.filename = 'x.svg'`, are accepted. Mitigated by Drive's `/file/d/<ID>/view` sandboxing and the fact that the link is never embedded; an allowlist (`png|jpe?g|webp`) would close it if it matters.
5. **Deployment still unrecorded** — carried over from round 0 §6.1: no evidence of brief Step 6, no `/exec` URL, no confirmation that `DRIVE_FOLDER_ID` is set. Task 3 depends on it; needs a human.
6. **Access level still unconfirmed** — now informational only: the fix holds regardless of who can reach the endpoint.
7. **Concurrency** — still no `LockService`; two simultaneous re-uploads to one `fileId` interleave `setName`/`setContent`, last write wins. Add a document lock only if the backend ever fans out writes for one employee.
8. **Suite is source-text only** — Apps Script cannot run under `node --test`. The mutations prove the assertions track the source text; they say nothing about Drive runtime behaviour.

## 7. To approve

1. **NEW-IMPORTANT-A** — one-line stripper fix in `tests/gas-media.test.js:13`, then re-run M18 plus the trailing-comment / block-comment / template-literal vectors. All must fail.
2. **NEW-IMPORTANT-B** — loop over all parents at `Code.gs:87-90`; update `tests:73`.
3. Assert that `p.dataBase64` never appears in a response message — closes the last hole in IMPORTANT-5.
4. MINOR-C / MINOR-D: take them or leave them with a `ponytail:` note; neither blocks.

Items 1 and 2 are small and both are correctness. Items 3 is three lines.