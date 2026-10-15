# Arsip — Perbaikan Panel Native (UI)

## Status
- Selesai & terverifikasi di browser (Vite :5173, backend :8081).
- Tanpa perubahan API/skema; hanya `js/**`, `css/styles.css`, `index.html`, `tests/**`.

## Perubahan

### 1. Fix mojibake `index.html`
Commit `edf9ad4` menggandakan encoding non-ASCII (UTF-8→cp1252→UTF-8). 197 run dikembalikan
(`═`, `—`, `…`, `…` dsb). Sisa 1 em dash sah dibiarkan. Verifikasi: `â€`/`â•`/`â†`/U+FFFD = 0.

### 2. Tombol "Kembali" per menu
- `js/arsip.js` `syncChrome()`: `arsip-back` tampil di semua view selain beranda, FAB upload hanya di view Dokumen.
- `css/styles.css`: `.arsip-back` + `@media (min-width:768px){ .arsip-back{ left: calc(260px + 16px) } }` (hindari nav 260px).

### 3. Custom dropdown tahun (KK & BD)
Select tahun native diganti dropdown search (`makeSearchDd`) agar seragam dengan dropdown kategori/sektor.
- `js/helpers.js`: `_ddPick` dispatch `new Event('change', { bubbles: true })` supaya listener delegasi di container ikut kena; `makeSearchDd` dukung `opts.noIcon` (tanpa ikon `fa-search`).
- `js/arsip-kk.js`: select `id="kkTahunSel"` + `pasangTahunDd()` (dipanggil di `tulis()` & akhir `render()`).
- `js/arsip-bd.js`: select `id="bdTahunSel"` + `pasangTahunDd()` (dipanggil di `tulis()`).
- Select asli tetap jadi value source (`display:none`), pick men-dispatch `change` ke `onChange()` lama.
- `css/styles.css`: `.kk-head .custom-search-dropdown{ width:110px; flex:0 0 auto }` + trigger 38px + list-wrap.

### 4. Cache-bust `index.html`
`styles.css?v=40`, `arsip.js?v=22`, `arsip-kk.js?v=2`, `arsip-bd.js?v=2`, `helpers.js?v=20261016a`.

## Verifikasi
- KK: opts `2027/2026/2025`, wrap 110px, trigger 38px, tanpa ikon search; pick 2025 → value=2025, input sinkron, `change` terpicu 1×, list tertutup.
- BD: opts `2024..2030`; pick 2024 → value=2024, `change` terpicu 1×, input sinkron.
- Tombol Kembali: home=`none`; dokumen=`flex`+FAB; kk/bd=`flex`, FAB=`none`; klik → beranda.
- Tes: `search-dd` 8/8, `arsip-markup` 16/16, `arsip-ui` 9/9, `server/arsip.test.js` 14/14, `npm test` 503/503.
