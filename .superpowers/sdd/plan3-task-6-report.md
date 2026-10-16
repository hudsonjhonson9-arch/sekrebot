# Task 6 — Sambung ke kartu Monitoring Perjalanan Dinas (laporan)

**Commit:** `1e1dd7a2a697e46b171da7c5f4f6972ad8524fad` (branch `master`, parent `a0b3c95`)
**Pesan:** `feat(spt): tombol cetak SPT/SPPD di kartu monitoring perjalanan dinas`

## Files changed (7, tepat yang di-stage)

| File | Perubahan |
|---|---|
| `js/tugas_lembur.js` | `renderMonitoringTasks`: hitung `grupList` dari `window.TugasSPT.kelompokkan(_activeMonitoringTasks)`, tombol `.btn-cetak-spt[data-grup]` per kartu, listener klik → `window.TugasSPT.bukaModal(window.__tugasGrup[gi])` |
| `www/js/tugas_lembur.js` | salinan byte-identik |
| `tests/tugas-spt-wiring.test.mjs` | tes wiring baru (5 tes) |
| `package.json` | daftarkan `tests/tugas-spt-wiring.test.mjs` di `scripts.test` (daftar eksplisit) |
| `index.html` | cache-bust `js/tugas-spt.js` & `js/tugas_lembur.js` → `v=20261018` |
| `www/index.html` | sama byte-identik pada baris script |
| `docs/superpowers/plans/2026-10-16-spt-sppd-generator.md` | ikon plan `fa-file-word` → `fa-file-signature` (plan == code) |

Bahwa `index.html` sudah memuat `js/tugas-spt.js` **sebelum** `js/tugas_lembur.js` (Task 5), jadi Step 3 plan tidak butuh perubahan urutan — hanya cache-bust yang disentuh.

## Test counts

- Focused RED (sebelum implementasi): `node --test tests/tugas-spt-wiring.test.mjs` → **pass 2 / fail 3** (3 tes wiring gagal, 2 tes kontrak lolos).
- Focused GREEN (sesudah): **pass 5 / fail 0**.
- `node --test tests/tugas-spt.test.mjs` → **pass 11 / fail 0**.
- `node --test tests/deemoji.test.mjs` → **pass 4 / fail 0** (ikon `fa-file-signature` ada di `css/lib/runeicons.css`).
- Full `npm test` → **# tests 523, # pass 523, # fail 0, 0 cancelled/skipped**. Baseline 518 + 5 tes baru = 523, tanpa regresi.

## Mirror check

```
tugas-spt true
tugas_lembur true
config true
simapo-bast true
```

## Yang akan ditangkap tes wiring bila wiring dihapus

- `renderMonitoringTasks` tak lagi memanggil `TugasSPT.kelompokkan(_activeMonitoringTasks)` → tes 1 gagal.
- Tombol tanpa `class="btn-cetak-spt"` / tanpa `data-grup` / label bukan `SPT/SPPD` → tes 2 gagal.
- Listener `querySelectorAll('.btn-cetak-spt')` atau `dataset.grup` atau `TugasSPT.bukaModal(` dihapus → tes 3 gagal.
- `js/tugas-spt.js` dipindah setelah `tugas_lembur.js` di `index.html` **atau** `www/index.html` → tes 4 gagal (kedua file diperiksa).
- `kelompokkan` berhenti membawa `id` baris pada item grup → tes 5 gagal (kontrak `grupIndex.get(String(row.id))`).

Badan fungsi diambil dengan irisan `function renderMonitoringTasks(` s.d. `\n  window.` berikutnya, jadi wiring yang "nyangkut" di fungsi lain tidak bisa bikin tes lolos palsu.

## Deviation dari brief + alasan

1. **Tes = integrasi sumber, bukan DOM-behavioural.** `renderMonitoringTasks` **tidak diekspor** ke `window` (hanya `loadMonitoringTasks`), dan IIFE `tugas_lembur.js` menyentuh `document`/`$` saat load. Tes behavioural penuh butuh memuat IIFE 2650 baris dengan DOM palsu yang rapuh — di luar "harness yang mengizinkan" dan berisiko green-palsu. Sebagai gantinya tes tetap falsifiable lewat irisan badan fungsi + satu tes behavioural nyata (memuat `js/tugas-spt.js` asli dan memverifikasi kontrak `kelompokkan`→id). Tanpa dependency/framework baru.
2. **Ikon `fa-file-signature`**, bukan `fa-file-word` (brief/plan menyebut `fa-file-word` yang TIDAK ada di `runeicons.css`; deemoji akan gagal). Plan diperbarui dalam commit yang sama.
3. **Cache-bust `tugas_lembur.js` = `20261018`**, dan `tugas-spt.js` ikut di-bump ke `20261018` sesuai Step 6 plan (meski file `tugas-spt.js` sendiri tak berubah).
4. **Tombol dibungkus `<div flex column>`** agar dua tombol aksi (BUKTI + SPT/SPPD) tidak terpisah oleh `justify-content:space-between` pada baris kartu. Guard `btn.dataset.grup !== ''` ditambahkan karena `Number('') === 0` akan keliru memilih grup 0.
5. **Step 3 plan (pindahkan script lebih awal)** tidak diperlukan — sudah berurutan dari Task 5.

## Belum diverifikasi (sesuai instruksi)

- **Tanpa langkah browser/E2E manual, tanpa server.** Controller menjalankan verifikasi browser setelah task ini. Alur nyata yang belum diuji di runtime: klik tombol → dialog perjadin terbuka dengan pelaksana sekelompok, dan unduhan `.docx` SPT/SPPD.
