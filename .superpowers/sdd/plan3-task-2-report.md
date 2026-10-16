# Task 2 Report — Template SPPD

## What I implemented
Created `scripts/build-sppd-template.js` verbatim from the brief (Step 1). It reads the untracked
source `8656838432_2026-07-02_2026-07-02_TUGAS.docx`, sews `{Tag}` docxtemplater placeholders into
`word/document.xml` via `scripts/docx-patch.js` (`loadParagraphs`/`applyByIndex`/`spliceInto`/`assertPlaceholders`),
and writes both `public/sppd_template.docx` and root `sppd_template.docx`.

- `WHOLE` map (paras 8..228) used as-is from the brief.
- `PATCHES` para 105 (KepalaNama / KepalaPangkat) used as-is.
- `BLANK` = [128,131,133,149,150,155,156,215,216] used as-is.
- Guard rejects stale example dates (15/18 Juli 2025).
- No new dependency; `pizzip` reused via `createRequire`.

Then copied the artifact to `www/sppd_template.docx` and registered the copy in
`scripts/setup-capacitor.js` (new line right after the existing `spt_template.docx` line; the
`bast_template.docx` + `spt_template.docx` lines are untouched).

## Testing / results
Build run:
```
$ node scripts/build-sppd-template.js
[OK] D:\Code\absensi_refactored_v6\public\sppd_template.docx 67422 bytes
[OK] D:\Code\absensi_refactored_v6\sppd_template.docx 67422 bytes
```
No `[FAIL]`. Byte count 67422 (>0).

Binary verification of the produced `public/sppd_template.docx` (temp `.mjs`, deleted after):
```
total tags: 23 missing: 0 (none)
stale dates present: false
```

## Files changed
- `scripts/build-sppd-template.js` (new)
- `public/sppd_template.docx` (new)
- `sppd_template.docx` (new, root copy)
- `www/sppd_template.docx` (new, Capacitor copy)
- `scripts/setup-capacitor.js` (modified, +1 copy line)

## Self-review findings
- All 23 required tags present in the compiled binary (checked against the actual file, not assumed).
- Byte counts non-zero; both expected `[OK]` lines present, no `[FAIL]`.
- `www/sppd_template.docx` copied; `setup-capacitor.js` registration added, bast + spt lines intact.
- No temp files left (verify `.mjs` deleted from temp dir). Source `.docx` NOT staged; `aset.db` and
  `.superpowers/` scratch left untracked.

## Issues / concerns
None. Commit contains exactly the 5 intended files (source docx excluded).

## Commit
`8d53fb7 feat(spt): build template SPPD dari dokumen asli`

---

# Fix round 1 — `rewriteWhole` abaikan `<w:t>` kedua dalam satu run

## Root cause (verified against the binary)
Paragraph 8's first `<w:r>` contains **two** `<w:t>`:
```xml
<w:r ...><w:prPr>…</w:prPr><w:tab/><w:t xml:space="preserve">Nomor: {NomorSPPD}</w:t><w:tab/><w:t xml:space="preserve">:  42 /SPPD/2025</w:t></w:r>
```
The old `rewriteWhole` iterated **runs** and used `tOf(run)` = only the **first** `<w:t>` of a run, so the second `<w:t>` (`:  42 /SPPD/2025`) was never emptied and shipped into the template. Confirmed with the leftover recon script `tmp_multiWt.mjs`:
```
=== SPT ===  paragraf dgn run ber-<w:t> ganda: 0
=== SPPD === paragraf dgn run ber-<w:t> ganda: 3
  para 8: runs=3 multiWt=1 :: Nomor: {NomorSPPD}:  42 /SPPD/2025
```

## Edits (`scripts/docx-patch.js` — one place, callers untouched)
1. **`rewriteWhole(par, tag)`** rewritten at the **`<w:t>` level** (regex over all `<w:t>` in the paragraph): first non-blank `<w:t>` → `tag`, every other non-empty `<w:t>` → emptied. Signature and externally-observable behavior for single-`<w:t>`-per-run paragraphs unchanged.
2. **`parText(par)` exported** (joins all `<w:t>`, collapses whitespace, trims) and **`applyByIndex` now asserts** the rewritten paragraph text equals the intended value — and that each `blankList` paragraph is exactly `''`. Same class of bug can no longer ship silently.
3. Also removed `spliceRun` (now dead code — only the old `rewriteWhole` used it).

## Commands run + actual output
```
$ node scripts/build-spt-template.js
[OK] D:\Code\absensi_refactored_v6\public\spt_template.docx 75643 bytes
[OK] D:\Code\absensi_refactored_v6\spt_template.docx 75643 bytes
Tag SPT aktif: 16

$ node scripts/build-sppd-template.js
[OK] D:\Code\absensi_refactored_v6\public\sppd_template.docx 67412 bytes
[OK] D:\Code\absensi_refactored_v6\sppd_template.docx 67412 bytes
```
No `[FAIL]`, no thrown assertion (67422 → 67412 bytes: the 16-char `:  42 /SPPD/2025` is gone).

```
$ Copy-Item public/spt_template.docx  www/spt_template.docx  -Force
$ Copy-Item public/sppd_template.docx www/sppd_template.docx -Force
```

Focused verification (temp `tmp_verify_fix.mjs`, deleted after):
```
SPPD para 8 text      : "Nomor: {NomorSPPD}"
SPPD para 8 == tag    : true
contains "42 /SPPD/2025": false
contains "2025"       : false
SPPD tags present     : 23 / 23 missing: []
SPT  tags present     : 18 / 18 missing: []
www/spt_template.docx byte-identical: true true
www/sppd_template.docx byte-identical: true true
SPT old==new bytes    : false
SPT entries differing : (none -> only zip metadata/timestamps differ)
SPT document.xml identical: true
```

## SPT byte-identity to previous committed version
**Not** byte-identical (`false`): old blob `6a58704e…` vs new `9166a693…`, **same size 75643 bytes**.
Reason: **only ZIP entry timestamps differ** — every zip entry's text content (including
`word/document.xml`) is identical between old and new. Document XML is unchanged, so the SPT
artifact is content-identical to its previous committed version; the byte change is
`pizzip`'s per-entry DOS timestamp, not a content change.

## Files staged in this commit
`scripts/docx-patch.js`, `public/spt_template.docx`, `spt_template.docx`, `www/spt_template.docx`,
`public/sppd_template.docx`, `sppd_template.docx`, `www/sppd_template.docx`.
Source `.docx`, `aset.db`, `.superpowers/` not staged. `tmp_multiWt.mjs` deleted from repo root.
