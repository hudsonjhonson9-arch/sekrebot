# Task 3 Report — Logika murni generator SPT/SPPD + tes

**Status:** DONE_WITH_CONCERNS
**Commit:** `b0cf742` — `feat(spt): logika murni generator SPT/SPPD + tes`

## What I implemented

- `js/tugas-spt.js` — modul logika murni (IIFE) yang hanya meng-assign `window.TugasSPT`;
  tidak menyentuh `document`/`window` selain assignment terakhir, jadi bisa dimuat di
  `window` palsu (`new Function('window', src)(win)`).
  Ekspor: `terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan, personTag,
  bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge`.
- `tests/tugas-spt.test.mjs` — 7 tes yang memuat **sumber sebenarnya** (bukan salinan),
  lalu menguji terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan, bangunTagsSPT,
  bangunTagsSPPD.
- `package.json` — `tests/tugas-spt.test.mjs` di-append ke akhir `scripts.test`
  (satu perintah `node --test <daftar>`; tidak dirombak).
- `index.html` (baris 3342) & `www/index.html` (baris 3220) — `<script src="js/tugas-spt.js?v=1"></script>`
  setelah `js/simapo-bast.js` (dan setelah `js/helpers.js`).
- `www/js/tugas-spt.js` — salinan identik dari `js/tugas-spt.js` (hash sama).

## TDD Evidence

### RED (Step 3) — sebelum implementasi

Command: `node --test tests/tugas-spt.test.mjs`

```
# Error: ENOENT: no such file or directory, open 'D:\\Code\\absensi_refactored_v6\\js\\tugas-spt.js'
#     at Object.readFileSync (node:fs:440:20)
#     at file:///D:/Code/absensi_refactored_v6/tests/tugas-spt.test.mjs:9:16
not ok 1 - tests\tugas-spt.test.mjs
EXIT=-1
```

Expected: tes membaca `js/tugas-spt.js` di top-level modul; file belum ada → ENOENT.
Ini kegagalan yang diharapkan (bukan kegagalan assertion palsu) — tes benar-benar
menargetkan sumber nyata.

### GREEN attempt pertama — 1 gagal (temuan)

Setelah menulis `js/tugas-spt.js` verbatim dari brief, `node --test` memberi:

```
not ok 1 - terbilang: satuan, belasan, puluhan
#   Expected values to be strictly equal:
#   + actual - expected
#   + 'Tiga Puluh '
#   - 'Tiga Puluh'
# pass 6
# fail 1
```

**Penyebab:** snippet produksi di brief tidak konsisten dengan tes-nya sendiri —
`terbilang(30)` = `terbilang(3) + ' Puluh ' + terbilang(0)` = `'Tiga Puluh '` (spasi
ekor) karena `SATUAN[0] = ''`. Ini bug nyata (akan mencetak spasi ekor di dokumen).
Selaras TDD, **tes adalah kontrak** → perbaikan minimal pada produksi.

### GREEN final (Step 5)

Perbaikan minimal di `terbilang`: helper `sisa(r)` menyambung ekor hanya bila ada.

```js
if (n < 100) return terbilang(Math.floor(n / 10)) + ' Puluh' + sisa(n % 10);
if (n < 200) return 'Seratus' + sisa(n - 100);
if (n < 1000) return terbilang(Math.floor(n / 100)) + ' Ratus' + sisa(n % 100);
// ponytail: sambung ekor hanya bila ada, supaya "Tiga Puluh" tak berjejak spasi.
function sisa(r) { return r ? ' ' + terbilang(r) : ''; }
```

Command: `node --test tests/tugas-spt.test.mjs`

```
# tests 7
# pass 7
# fail 0
EXIT=0
```

Output diperiksa: tidak ada warning/deprecated/unhandled/experimental (pristine).

## Full-suite result

Command: `npm test`

```
# tests 510
# pass 510
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Baseline 503 → 510 (503 + 7 tes baru). Tidak ada regresi.

## Files changed (commit b0cf742)

| File | Perubahan |
|------|-----------|
| `js/tugas-spt.js` | baru (+163) |
| `tests/tugas-spt.test.mjs` | baru (+90) |
| `package.json` | `scripts.test` +1 entri |
| `index.html` | +1 script tag |
| `www/index.html` | +1 script tag |
| `www/js/tugas-spt.js` | baru (+163, salinan identik) |

Tidak ada `.docx`, `aset.db`, atau `.superpowers/` yang ter-stage.

## Self-review findings

- ✅ RED benar-benar teramati (ENOENT) sebelum implementasi.
- ✅ `js/tugas-spt.js` hanya meng-assign `window.TugasSPT`; tidak menyentuh `document`/`window`
  lain di top level (dikonfirmasi tes memuatnya di `{}` palsu).
- ✅ 7 tes lulus, output pristine; full-suite 510/0.
- ✅ Script tag ada di `index.html` **dan** `www/index.html`; `www/js/tugas-spt.js` identik
  (hash sama) dengan `js/tugas-spt.js`.

## Concerns / deviations

1. **Path salinan `www/` dikoreksi: `www/js/tugas-spt.js`, bukan `www/tugas-spt.js`.**
   Brief & instruksi menyebut `www/tugas-spt.js`, tetapi semua JS di `www/` berada di
   `www/js/` (`scripts/setup-capacitor.js:43` → `copyDirSync('js', 'www/js')`), dan
   `www/index.html` memuat `src="js/tugas-spt.js"`. Menaruhnya di root `www/` akan 404 →
   fitur mati di APK (persis yang diperingatkan Global Constraint #16). Karena itu file
   disalin ke `www/js/tugas-spt.js` dan path itu yang di-commit.
2. **`terbilang` diperbaiki dari brief.** Brief meminta "pakai verbatim", tetapi snippet
   produksinya gagal terhadap tesnya sendiri (spasi ekor pada kelipatan puluhan/ratusan
   dan pada 100). Tes dianggap kontrak → perbaikan minimal 1 helper + 3 baris. Perilaku
   lain (satuan, belasan, 21, 11, 4) tidak berubah.
