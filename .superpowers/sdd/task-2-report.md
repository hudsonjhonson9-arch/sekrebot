# Task 2 Report — Frontend: `P.webLogin` + `setNativeToken` (config.js)

**Status:** DONE
**Commit:** `ff59ff6` — `feat: P.webLogin + setNativeToken untuk sesi web` (branch `main`)

## What changed

1. **`js/config.js`** (2 edits, transcribed verbatim dari brief):
   - Step 1: `webLogin: '/api/auth/login',` ditambahkan di `P` map tepat setelah `sessionLogin` (kini baris 254).
   - Step 2: fungsi `setNativeToken(token)` ditambahkan setelah `clearSession()` dan sebelum `_getSessionRole()` (kini baris 234–239):
     ```js
     // Sesi web/NIP: token 192 hex dari /api/auth/login disimpan sebagai _native_token
     // supaya nativeFetch memakainya, dan di localStorage supaya bertahan reload.
     function setNativeToken(token) {
       _nativeToken = token;
       try { localStorage.setItem('_native_token', token); } catch { /* mode privat */ }
     }
     ```
   - Menulis ke `_nativeToken` (module-level, dipakai `nativeFetch`/`ensureNativeSession`) DAN `localStorage._native_token`. Tidak ada wiring lain — Task 3 yang memanggil.
2. **`www/js/config.js`** — disinkronkan via `Copy-Item js\config.js www\js\config.js -Force`.
3. **Cache-buster** (resolusi controller): `js/config.js?v=20260720b` → `?v=20261008a` di `index.html:3072` dan `www/index.html:3072`.

Tidak ada file lain disentuh. File `.superpowers/sdd/*` yang dirty di working tree adalah milik controller — tidak ikut di-commit.

## Verification

| Command | Output |
|---|---|
| `node --check js/config.js; node --check www/js/config.js` | no output (OK, exit 0) |
| `(Get-FileHash js\config.js).Hash -eq (Get-FileHash www\js\config.js).Hash` | `HASH MATCH: 228360A1BE0A60A282216F4E79EC884D0AEDC17E956869CDFBDBF9D0435FDDB7` |
| `git diff --stat -- js/config.js www/js/config.js` | both files: `8 ++++++++` (identical 8-line addition) |
| `npm test` | **322 tests, 322 pass, 0 fail** (jalur global-constraints; tidak ada test frontend baru — sesuai brief) |

Diff review: `git diff` sebelum commit hanya memuat 2 edit config.js (persis kode brief) + 1 baris cache-buster di masing-masing index.html.

## Self-review

- [x] Kode transkrip **verbatim** dari brief (tidak ada perubahan wording/komentar/format).
- [x] `setNativeToken` di posisi benar: setelah `clearSession()`, sebelum `_getSessionRole()`.
- [x] `webLogin` di posisi benar: setelah `sessionLogin`.
- [x] `www/js/config.js` byte-identik dengan `js/config.js` (hash match).
- [x] Cache-buster di-bump di **kedua** `index.html` (dev + production) → `?v=20261008a`.
- [x] `node --check` bersih untuk kedua config.js.
- [x] Commit hanya berisi 4 file yang diminta; tidak menyentuh endpoint Telegram `/api/auth/session` atau device token `dv_`.
- [x] Test suite tetap hijau (322/322).

## Concerns

- **LF/CRLF warning** dari git saat staging (`LF will be replaced by CRLF`) — artefak `core.autocrlf` di Windows, konsisten dengan repo sebelumnya, bukan perubahan konten. Kedua config.js tetap identik satu sama lain.
- Tidak ada concern lain. Task 3 dapat langsung memanggil `setNativeToken(...)` dan `P.webLogin`.
