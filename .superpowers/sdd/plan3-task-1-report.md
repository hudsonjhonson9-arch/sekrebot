# Task 1 Report — Helper patch docx bersama + template SPT

**Status:** DONE
**Commit:** `fc39260` — `feat(spt): build template SPT dari dokumen asli + helper patch docx`

## What I implemented

1. `scripts/docx-patch.js` — modul shared berisi primitif sulam docxtemplater,
   diekstrak dari `scripts/build-bast-template.js` (teruji produksi). Ekspor:
   `loadParagraphs`, `rewriteWhole`, `patchParagraph`, `applyByIndex`,
   `spliceInto`, `assertPlaceholders`.
2. `scripts/build-spt-template.js` — build script yang membaca
   `Salinan Surat Tugas.docx` (root, untracked) dan menulis
   `public/spt_template.docx` + `spt_template.docx` dengan 18 placeholder.
   Memakai peta indeks paragraf `WHOLE` persis dari brief (tidak diubah).
3. `scripts/setup-capacitor.js:47` — ditambah satu baris salin
   `spt_template.docx` → `www/` tepat setelah `bast_template.docx` (baris bast
   tidak disentuh).

Tidak ada dependency baru. Tidak menyentuh `build-bast-template.js`,
`aset.db`, atau file source docx.

## What I tested and results

**Build:**
```
[OK] D:\Code\absensi_refactored_v6\public\spt_template.docx 75643 bytes
[OK] D:\Code\absensi_refactored_v6\spt_template.docx 75643 bytes
Tag SPT aktif: 16
```

**Verifikasi 4 tag (perintah brief, dijalankan inline — tidak ada temp file):**
```
OK {Nomor}
OK {#pelaksana}{No}.
OK {Jabatan}{/pelaksana}
OK {Paraf3}
```

**Verifikasi seluruh 18 placeholder (tambahan, untuk self-review):**
```
ALL 18 PLACEHOLDERS PRESENT
```

Build script juga memanggil `assertPlaceholders` atas seluruh 18 tag sebelum
menulis zip — build akan `[FAIL]` + exit 1 kalau ada yang hilang, jadi
keberadaan tag terverifikasi, bukan diasumsikan.

## Files changed

- `scripts/docx-patch.js` (baru)
- `scripts/build-spt-template.js` (baru)
- `public/spt_template.docx` (baru, hasil build, 75643 bytes)
- `spt_template.docx` (baru, hasil build, 75643 bytes)
- `scripts/setup-capacitor.js` (modifikasi, +2 baris di ~baris 47)

## Self-review findings

- Generated `public/spt_template.docx` memuat seluruh 18 placeholder —
  diverifikasi lewat pemeriksaan `includes` terpisah (semua ada).
- Dua baris `[OK] … bytes` ada, byte count 75643 (non-zero).
- `scripts/setup-capacitor.js`: `spt_template.docx` ditambahkan, baris
  `bast_template.docx` tetap utuh.
- Tidak ada temp file tertinggal (perintah `node -e` inline berhasil, tidak
  perlu file `.mjs` sementara).
- Commit hanya 5 file sesuai brief; `Salinan Surat Tugas.docx`, `aset.db`, dan
  brief task 2–6 tetap untracked (tidak di-commit).

## Issues / concerns

Tidak ada. Catatan kecil: Git memberi warning LF→CRLF saat men-stage dua file
JS baru — kosmetik, bukan error.

## Fix round 1

**Finding:** `www/spt_template.docx` tidak pernah dibuat/di-commit, padahal
constraint global mewajibkan setiap template baru disalin ke `www/` (preseden
`www/bast_template.docx`).

**Fix:**
1. `Copy-Item public/spt_template.docx www/spt_template.docx -Force`
2. Verifikasi salinan byte-identik + tag masih ada (lihat perintah & output).
3. Plan diperbarui agar celah tidak terulang:
   - Task 1 Step 4: ditambah instruksi salin `public/spt_template.docx` →
     `www/spt_template.docx`; Step 5 `git add` + `www/spt_template.docx`.
   - Task 2 Step 3: ditambah instruksi salin `public/sppd_template.docx` →
     `www/sppd_template.docx`; Step 4 `git add` + `www/sppd_template.docx`.

**Perintah (PowerShell mangle satu-liner → dipakai file `.cjs` sementara, lalu dihapus):**
```
Copy-Item public/spt_template.docx www/spt_template.docx -Force
node .tmp-spt-check.cjs
Remove-Item .tmp-spt-check.cjs -Force
```
isi `.tmp-spt-check.cjs`:
```js
const z = require('pizzip'), fs = require('fs');
const a = fs.readFileSync('www/spt_template.docx'), b = fs.readFileSync('public/spt_template.docx');
console.log('identical:', a.equals(b));
const x = z(a).file('word/document.xml').asText();
['{Nomor}', '{#pelaksana}', '{Jabatan}{/pelaksana}', '{Paraf3}', '{/pelaksana}'].forEach(t => console.log((x.includes(t) ? 'OK ' : 'FAIL ') + t));
```

**Output:**
```
identical: true
OK {Nomor}
OK {#pelaksana}
OK {Jabatan}{/pelaksana}
OK {Paraf3}
OK {/pelaksana}
```

**Commit:** `fix(spt): salin spt_template.docx ke www + rencana tambah salinan www`
(2 file: `www/spt_template.docx`, `docs/superpowers/plans/2026-10-16-spt-sppd-generator.md`).
Tidak meng-commit `Salinan Surat Tugas.docx`, `8656838432_…_TUGAS.docx`, `aset.db`,
atau file scratch `.superpowers/`.
