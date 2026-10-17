# Task 2 — Bedah `sppd_template.docx` (tag ttd + blok paraf) — LAPORAN

## Ringkasan
`sppd_template.docx` (dan 2 salinannya) kini memuat 7 tag baru yang sudah dipancarkan
`js/tugas-spt.js` sejak Task 1: `{BidangNama}`, `{BidangNIP}`, `{KtuNama}`, `{KtuNIP}`,
`{Paraf1}`, `{Paraf2}`, `{Paraf3}`. Nama Kepala Bidang yang tadinya keras (`BERLIAN MAGU WERU,S.Sos`
+ `Nip. 19690619 200903 1 001`) diganti tag; sel KTU yang kosong diisi; tabel paraf dari
`spt_template.docx` disalin (font diubah ke Arial) tepat sebelum `<w:sectPr`.

Skrip jejak: `scripts/patch-sppd-template.mjs` (sekali-jalan, idempoten).

## TDD (RED → GREEN)
Tes ditambahkan di `tests/spt-template-tags.test.mjs`:
- `sppd_template: tag ttd/paraf baru ada, nama keras hilang, 3 salinan identik` (dari brief 2a).
- `SPPD: render mengisi slot bidang/KTU/paraf yang baru` (bukti slot benar-benar terisi saat render).

RED (sebelum patch, `node --test tests/spt-template-tags.test.mjs`):
```
not ok 5 - sppd_template: tag ttd/paraf baru ada, nama keras hilang, 3 salinan identik
  error: 'tag hilang: {BidangNama}'
not ok 6 - SPPD: render mengisi slot bidang/KTU/paraf yang baru
  error: 'SPPD slot baru kosong: KTU UJI'
# tests 6 / # pass 4 / # fail 2
```

GREEN (setelah patch):
```
ok 5 - sppd_template: tag ttd/paraf baru ada, nama keras hilang, 3 salinan identik
ok 6 - SPPD: render mengisi slot bidang/KTU/paraf yang baru
# tests 6 / # pass 6 / # fail 0
```

Full suite: `npm test` → **# tests 544 / # pass 544 / # fail 0** (542 lama + 2 tes baru).

## Verifikasi biner terpatch
- Ukuran: sebelum **67412 B** → sesudah **68007 B**.
- SHA256 sebelum `5216261ff38d96d7b6ee6d20261b070abf9f5fdf6c6c824c13546096a0eaf7a0`
  → sesudah `81077c3396c05bb4b3fdb1ce33eb20d2edcd554aed4da3304c42d3eb9648b0a8`.
- `git hash-object` ketiga salinan identik: `b7c53d5b815ce007f70fb0baca489cce4a0e3800`.
- Tag di docx terpatch — **30** (23 lama + 7 baru):
  ```
  {NomorSPPD} {KpaNama} {Nama} {NIP} {PangkatGolongan} {JabatanInstansi} {TingkatBiaya} {Maksud}
  {AlatAngkut} {TempatBerangkat} {TempatTujuan} {LamaHari} {TanggalBerangkat} {TanggalKembali}
  {Instansi} {MataAnggaran} {DitetapkanDi} {TanggalPenetapan} {KepalaNama} {KepalaPangkat}
  {KepalaNIP} {KtuNama} {KtuNIP} {BidangNama} {BidangNIP} {SekretarisNama} {SekretarisNIP}
  {Paraf1} {Paraf2} {Paraf3}
  ```
- `Bookman Old Style` di seluruh document.xml terpatch: **0**.
- Render docxtemplater (tag builder + `KtuNama`/`KtuNIP` contoh), `nullGetter` mencatat tag
  tak dikenal/kosong → **`[]`** (tidak ada), tidak ada `{..}` tersisa, dan teks hasil render memuat
  `BERLIAN MAGU WERU,S.Sos`, `19690619 200903 1 001`, `MARIA KTU, S.Sos`, `19700101 200003 2 002`,
  `Sekretaris BAPPERIDA`, `Kepala Bidang Ekonomi`, `KTU BAPPERIDA`, `Paraf:` — semua `true`.
- Idempoten: menjalankan skrip kedua kali → `sudah dipatch, tidak ada yang dikerjakan` (keluar
  tanpa menulis ulang; tidak menggandakan tag KTU / tabel paraf).

## Berkas diubah
| Berkas | Keterangan |
|---|---|
| `sppd_template.docx` | terpatch, SHA256 `81077c33…` |
| `www/sppd_template.docx` | byte-identik |
| `public/sppd_template.docx` | byte-identik |
| `tests/spt-template-tags.test.mjs` | +2 tes |
| `scripts/patch-sppd-template.mjs` | skrip bedah (baru) |
| `.superpowers/sdd/progress.md` | entri ledger Task 2 |

## Deviasi dari brief (dicatat)
Pola penggantian font di brief (§2b) memakai `<w:ascii="Bookman Old Style"` dsb., padahal di XML
nyata atribut `rFonts` selalu **berspasi-depan** (` w:ascii="Bookman Old Style"`), sehingga keempat
`.replace()` di brief adalah **no-op senyap** (dibuktikan: 48/24 kemunculan Bookman tetap utuh, tes
gagal `'font tabel paraf harus Arial'`). Struktur/sisip lain di brief cocok 100% (tabel paraf
TableGrid grid 586/3277/914, sel KTU run kosong `<w:rPr><w:rtl w:val="0"/></w:rPr>`, sisip sebelum
`<w:sectPr`). Perbaikan minimal: ganti nilai font — `replace(/"Bookman Old Style"/g, '"Arial"')` —
yang menutup ascii/hAnsi/cs/eastAsia sekaligus.

## Self-review
- Tidak menyentuh `js/tugas-spt.js`, `index.html`, `www/index.html`, `css/` (milik Task 3). OK.
- Blok paraf tanpa page-break, tepat sebelum `<w:sectPr` → mengalir ke halaman berikut (sesuai brief).
- Nama keras hilang dari XML (`BERLIAN MAGU WERU`, `Nip. 19690619` → 0 kemunculan).
- Komit hanya berkas Task 2; build artefak terlarang (`Salinan Surat Tugas.docx`,
  `8656838432_*.docx`, `aset.db`) tidak ikut.

## Concerns
- `{KtuNama}/{KtuNIP}` untuk data `bapperida` sintetis dirender kosong (Task 1 memang belum
  mempopulasi KTU dari sumber data) — template-nya benar; pengisian nilai ada di Task 3/4.
- Tabel paraf masih memakai teks `NO | Paraf Hirarki` persis seperti SPT (sesuai brief: "copy").
  Bila SPPD ingin judul lain, sesuaikan di task lanjutan.
