# Plan3 Task 5 — Report

**Commit:** `a0b3c95bd6fd25fe5012129d26b7cffe19e2f021`
**Message:** `feat(spt): dialog detail perjadin + generate SPT/SPPD`
**Baseline:** `3e8a7be` — npm test 514 pass / 0 fail.

## Files changed (12, all staged & committed)

| File | Change |
|---|---|
| `js/tugas-spt.js` | `masterIndex` (async+cache, seam `window.apiGet`), `simpanPerjadin`, `generate`, DOM glue (`bukaModal`, `readForm`, `fillForm`, `tutupModal`, `initPerjadinModal`), exports `masterIndex` |
| `js/simapo-bast.js` | `bastRenderDocx(tags, filename, templateUrl)`; `fetch(templateUrl || 'bast_template.docx')` |
| `js/config.js` | `penugasanPerjadin: '/api/penugasan/perjadin'` setelah `penugasanList` |
| `index.html` | `#perjadinModal` markup + cache-bust `config.js`/`simapo-bast.js`/`tugas-spt.js` → `?v=20261016a` |
| `css/styles.css` | 3 rule `#perjadinModal ...` |
| `www/index.html` | mirror modal + cache-bust (sama) |
| `www/css/styles.css` | mirror CSS |
| `www/js/tugas-spt.js`, `www/js/config.js`, `www/js/simapo-bast.js` | mirror byte-identik |
| `tests/tugas-spt.test.mjs` | +4 tes (7 lama tak berubah) |
| `docs/superpowers/plans/2026-10-16-spt-sppd-generator.md` | Step 4 code block disamakan dgn implementasi (plan == code) + catatan amandemen |

## Test counts

- **RED** (sebelum implementasi) — `node --test tests/tugas-spt.test.mjs`: `# tests 11 / pass 9 / fail 2` (`win.TugasSPT.masterIndex is not a function`).
- **GREEN** (focused) — `node --test tests/tugas-spt.test.mjs`: `# tests 11 / pass 11 / fail 0`.
- **FULL** — `npm test`: `# tests 518 / pass 518 / fail 0 / cancelled 0`.
  - 514 baseline + 4 tes baru = 518. **Tidak ada regresi.**

## sha1 mirror check

```
node -e "...sha1 compare..."
tugas-spt true
config true
simapo-bast true
```

Semua `true` — mirror `www/js/*` identik dgn `js/*`.

## Deviations from the brief (and why)

1. **`masterIndex` endpoint guard.** Ditulis
   `const endpoint = (typeof P !== 'undefined' && P && P.userList) || '/api/user-list';`
   Alasan: `P` adalah `const` top-level di `config.js` (bukan properti `window`, dan tidak
   dimuat oleh harness `new Function('window', src)`), sementara `new Function` me-resolve
   identifier bebas ke `globalThis` → `P.userList` akan `ReferenceError` di tes murni. Guard
   ini menjaga perilaku browser identik (`P.userList` = `'/api/user-list'`) dan tetap bisa diuji.
   Sisanya persis kode amandemen controller.
2. **`personTag` TIDAK diubah.** Brief Step 3 tes #2 berbunyi "prefers the row's own
   `nama`", tetapi ini **kontradiksi** dengan tes eksisting #6/#7
   (`bangunTagsSPT` → `Nama === 'Acmad'` master, sedangkan baris `'A'`; `bangunTagsSPPD` →
   `'Alvian Zadrakh'` master, sedangkan baris `'Alvian'`). Aturan Step 3 eksplisit:
   **tes eksisting menang**. Implementasi tetap `m.nama || row.nama`. Tes baru #2 karena itu
   meng-assert presedensi eksisting (master menang saat punya nama) + fallback ke nama baris
   saat master tanpa nama. Tidak ada assertion lama yang dilemahkan.
3. **`simpanPerjadin`** mengirim `nomor_surat` **hanya bila** `perjadin.nomor` non-kosong
   (sesuai brief; berbeda dari plan asli yang selalu mengirim).
4. **Ikon tombol cetak `fa-print`** (plan menulis `fa-file-word`). Wajib: `tests/deemoji.test.mjs:28`
   ("setiap ikon fas yang dipakai js/ dan index.html ada di runeicons.css") gagal saat
   markup memakai `fa-file-word` — subset `css/lib/runeicons.css` tidak memuatnya (hanya
   `fa-print`, `fa-file-signature`, `fa-file-pdf`, `fa-file-excel`, `fa-file-invoice`,
   `fa-file-alt`, `fa-file-contract`, `fa-download`). Diterapkan di `index.html` +
   `www/index.html`; Step 2 plan ikut diperbarui.
   ⚠️ **Catatan untuk Task 6:** plan Task 6 memakai `fa-file-word` pada tombol kartu
   (`js/tugas_lembur.js`) — akan gagal tes deemoji yang sama; ganti ke `fa-print`.
5. **CSS**: memakai snippet plan `#perjadinModal .modal-content/.btn-icon/.form-group`
   (brief menyingkat "`.perjadin-*`"; berkas Step 3 plan yang otoritatif).
6. **Spec tidak disentuh.** Plan Step 5 menyebut modify
   `docs/superpowers/specs/2026-10-16-spt-sppd-generator-design.md`; brief (Step 4 & Step 6,
   binding) tidak mencantumkannya di daftar berkas. Diikuti brief.

## Not verified

- **Langkah uji browser/end-to-end (plan Step 6) sengaja TIDAK dijalankan** dan server TIDAK
  dinyalakan — controller yang melakukan verifikasi tsb. Yang terverifikasi: unit test
  (`node:test`), kompatibilitas `bastRenderDocx` 2-arg (caller `simapo-bast.js:353` & `:650`
  tetap 2 arg → `templateUrl` fallback), dan mirror sha1.
- `www/css/styles.css` **sudah** berbeda dari `css/styles.css` sebelum task ini (warisan,
  bukan akibat perubahan ini); check mirror brief hanya mencakup berkas `js/`. Blok CSS
  perjadin ditambahkan identik ke keduanya.
