# Task 3 Brief — Payload validation and Apps Script client

Source of truth: `docs/superpowers/plans/2026-10-02-media-drive.md`, Task 3, lines 441–648.
This brief overrides the plan where they conflict. Where they agree, follow the plan verbatim.

Repo: `D:\Code\absensi_refactored_v6` (exact spelling `refactored`). Branch `master`, HEAD `b689346`.

## Files

- Create `server/media-payload.js`
- Create `server/gas.js`
- Modify `server/media.test.js` (append only — do not reorder or rewrite existing tests)

No routes yet. Pure functions, fully unit-testable. No database access.

## Interfaces

- `decodeDataUrl(dataUrl)` → `{ buffer, mimeType }`, throws `Error` on invalid input
- `fileIdFromDriveUrl(url)` → string | null
- `gasHealth()` → the Apps Script JSON response
- `gasUpsert({ filename, mimeType, dataBase64, fileId })` → `{ fileId, url }`
- `existingFileId(previousUrl)` → string | null

Follow the plan's implementation code for steps 3 and 6 exactly, except where this brief overrides it.

## Overrides to the plan

### Test counts are stale — the plan's arithmetic is wrong

The plan says `server/media.test.js` should end at 9 passing and the suite at 68. Both are wrong now.

- `server/media.test.js` currently has 4 tests. Adding the plan's 5 gives **9 in that file**.
- The full suite baseline is **71**, not 63. The plan's "68 passing (63 + 5)" assumed a 63 baseline that never existed.
- Correct target: **9 in `media.test.js`, 76 for the full suite, 0 failing.**

State the real numbers in your report. Do not "correct" a test count to match the plan.

### The `node --test` cwd trap

Run `node --test` **from the repo root only**. From any other directory it silently collects unrelated test files and reports bogus failures. This has already wasted a cycle in this session. Target single files with `node --test server/media.test.js` from the root.

Shell is Windows PowerShell 5.1: no `&&`, no heredocs, no `grep`/`head`/`tail`/`wc`.

### Reject SVG server-side too (new)

The Apps Script rejects `image/svg+xml` — SVG can carry `<script>` and is never a legitimate face photo or signature. The plan's `DATA_URL` regex accepts it, so an SVG would pass server validation and then fail at the Apps Script with a confusing 400.

Add the same rejection in `decodeDataUrl` so the two layers agree. Test it.

```js
const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;
// reject if /svg/ matches the mime type, same rule as Code.gs
```

## Carry-over findings from the Task 2 review — these constrain Task 3

1. **The Apps Script accepts a bare Drive `fileId` only, never a URL.** `Code.gs` validates the incoming `fileId` against `/^[-\w]{5,200}$/` and returns 400 for anything containing a URL. So `gasUpsert` must receive an already-extracted id. `existingFileId(previousUrl)` exists precisely to do that extraction server-side. Add a test that pins this: given a stored URL, the id sent to Apps Script is the bare id segment, not the URL.

2. **The base64 the server sends must not contain line breaks.** `Code.gs` rejects with 413 before decoding if `dataBase64.length > MAX_BYTES * 4/3 + 4`. A wrapped base64 body would false-413. `Buffer.from(...).toString('base64')` emits no newlines, so the server path is safe — but do not introduce any re-wrapping, and add a comment noting this coupling exists.

3. **Layer contract to pin:** `decodeDataUrl` enforces `MAX_IMAGE_BYTES = 5 * 1024 * 1024` post-decode; the Apps Script enforces the same limit pre- and post-decode. They must not drift.

## Invariants

- `decodeDataUrl` rejects: empty input, a Drive URL, `data:text/plain;base64,...`, a data URL without `;base64,`, `null`, `undefined`, non-image MIME, SVG, and anything over 5 MB.
- Over-size rejection must mention `5 MB` in the message; the plan's test asserts `/5 MB/`.
- `gasUpsert` sends `action: 'mediaUpsert'` and the caller's `dataBase64` verbatim.
- On a non-OK Apps Script response, `gasUpsert` throws with the Apps Script `message` when present — the plan's test asserts `/5 MB/` propagates.
- `gasUpsert` throws if the response lacks `fileId` or `url`.
- `gasHealth()` calls `/?action=health`.
- `GAS_WEBAPP_URL` unset must throw a clear error — fail fast, same as `server/db.js` does for its own config. Reuse that pattern.
- A 45 s `AbortController` timeout, cleared in `finally`.
- This module must never write to PostgreSQL and must never log the base64.

## TDD sequence

Follow the plan's steps: append tests → run and confirm they fail for the right reason → implement → run and confirm they pass → full suite → commit.

Note the plan's step 2 expects `ERR_MODULE_NOT_FOUND` for `./media-payload.js` and step 5 for `./gas.js`. Confirm the failure is that module-not-found, not a syntax error or an unrelated throw.

## Commit

```
git add server/media-payload.js server/gas.js server/media.test.js
git commit -m "feat(server): validate image payloads and call Apps Script upsert"
```

## Report

Write `D:\Code\absensi_refactored_v6\.superpowers\sdd\media-task-3-report.md`: what you built, the exact test commands with real output, and any deviation from this brief with its reason.

## MANDATORY evidence in your reply

A previous subagent in this session fabricated a completion report. Verify before claiming DONE.

1. `git log --oneline -2`
2. `git show --stat HEAD`
3. `# tests` / `# pass` / `# fail` from BOTH `node --test server/media.test.js` and the full root `node --test`
4. Full source of `server/media-payload.js` and `server/gas.js`
5. Confirmation you ran from the repo root

Status: DONE / DONE_WITH_CONCERNS / BLOCKED.