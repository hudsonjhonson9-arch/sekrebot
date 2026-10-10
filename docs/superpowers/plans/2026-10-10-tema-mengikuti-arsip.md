# Plan: Tema absensi mengikuti tema arsip (WS3)

> Spec: `docs/superpowers/specs/2026-10-10-import-aset-arsip-menu-tema-design.md` — section **WS3 — Tema absensi mengikuti tema arsip**.
> Sumber acuan warna/font: `D:\Code\peta-ekonomi\src\theme.js` (DARK/LIGHT).
> Target: `css/styles.css` + salinan `www/` & `android/` + `index.html` + `manifest.json`. **Layout tidak diubah.**

## Mengapa

Absensi kini memakai palet emas/navy ("warm eye-comfort") yang tidak seirama dengan arsip
(blue/slate). User minta **palet + font ikut arsip** (dikonfirmasi lewat pilihan). Perubahan harus
mencakup kedua mode: dark base (`:root`) dan `html.light-theme` (blok besar ~baris 6156–6868 yang
punya literalnya sendiri, mis. `#8a6914`, `#4a4035`, `#fffdf9`, dan TIDAK meng-override `--gold`).

## Bagaimana

1. Ubah blok **variabel** di `:root` dan `html.light-theme` (menangani semua `var(--x)`).
2. Ungkap literal hardcoded yang tersisa dengan **sweep programatik** (`scripts/retheme.mjs`,
   sekali jalan, bukan edit manual) — termasuk literal di `index.html`/`manifest.json`.
3. Ganti font: link Google Fonts + `font-family` di CSS.

## Prasyarat

- Salinan yang WAJIB sinkron: `css/styles.css`, `www/css/styles.css`,
  `android/app/src/main/assets/public/css/styles.css`. Juga `index.html`, `www/index.html`,
  `android/app/src/main/assets/public/index.html`, dan `manifest.json`.
- JANGAN sentuh `css/styles 1.css` (file sisa). `css/lib/runeicons.css` + `icons/*` TIDAK berubah
  (pakai `currentColor`).

---

## Fase 1 — Variabel (dark + light)

### Task 1.1 — `:root` (css/styles.css baris 2–17)
Ganti nilai variabel ke DARK arsip (spec):

| var | nilai baru |
|---|---|
| `--navy` | `#0F172A` |
| `--on-gold` | `#F1F5F9` |
| `--gold` | `#3B82F6` |
| `--gold-dim` | `rgba(59,130,246,.15)` |
| `--white` | `#F1F5F9` |
| `--muted` | `#94A3B8` |
| `--success` | `#34D399` |
| `--danger` | `#F87171` |
| `--warning` | `#FBBF24` |
| `--info` | `#60A5FA` (biarkan; tidak di arsip) |
| `--card-bg` | `rgba(30,41,59,.85)` |
| `--border` | `#334155` |
| `--admin` | `#A78BFA` (biarkan) |
| `--admin-dim` | `rgba(167,139,250,.15)` (biarkan) |

### Task 1.2 — `html.light-theme` (baris 6156–6171)
Ganti nilai di blok itu ke LIGHT arsip, DAN **tambahkan** override `--gold` (sebelumnya tidak ada):

| var | nilai baru |
|---|---|
| `--navy` | `#F8FAFC` |
| `--white` | `#0F172A` |
| `--muted` | `#64748B` |
| `--card-bg` | `#FFFFFF` |
| `--border` | `#E2E8F0` |
| `--gold-dim` | `rgba(37,99,235,.15)` |
| `--gold-darker` | `#1D4ED8` (nilai lama `#8a6914` diganti) |
| `--success` | `#059669` |
| `--warning` | `#D97706` |
| `--info` | `#1D4ED8` (nilai lama `#1b5fc4` → biru arsip) |
| `--danger` | `#DC2626` |
| **BARU** `--gold` | `#2563EB` |
| **BARU** `--on-gold` | `#FFFFFF` |

Biarkan komentar "warm" lama? Tidak — hapus/ganti karena sudah tidak relevan (atau cukup biarkan
satu baris `/* palette: arsip */` di kepala blok).

**Keluar:** `node --check` tak relevan; siap sweep.

---

## Fase 2 — Sweep literal programatik

### Task 2.1 — Tulis `scripts/retheme.mjs`
Script Node yang (a) membaca daftar file, (b) mengganti literal old→new, (c) melaporkan hitungan
per file, (d) `--dry` untuk lihat saja. Peta literal:

**Dark / umum:**
| lama | baru |
|---|---|
| `#c9a84c` | `#3B82F6` |
| `#d4af37` | `#3B82F6` |
| `#0a1628` | `#0F172A` |
| `#f0f4ff` | `#F1F5F9` |
| `#7a90b8` | `#94A3B8` |
| `rgba(201,168,76,A)` | `rgba(59,130,246,A)` |
| `rgba(201, 168, 76, A)` | `rgba(59, 130, 246, A)` |
| `rgba(10,22,40,A)` | `rgba(15,23,42,A)` |
| `rgba(10, 22, 40, A)` | `rgba(15, 23, 42, A)` |

**Light (warm tones di blok `html.light-theme`, juga bisa muncul di inline HTML):**
| lama | baru |
|---|---|
| `#8a6914` | `#1D4ED8` |
| `#4a4035` | `#1E293B` |
| `#6b5e4e` | `#64748B` |
| `#2c2417` | `#0F172A` |
| `#f8f6f1` | `#F8FAFC` |
| `#fffdf9` | `#FFFFFF` |
| `#f0ede5` | `#EEF2F7` |
| `#a3620a` | `#1D4ED8` |
| `#0d1b2a` | `#0F172A` (manifest theme-color + meta) |
| `rgba(138,105,20,A)` | `rgba(37,99,235,A)` |
| `rgba(138, 105, 20, A)` | `rgba(37, 99, 235, A)` |

Catat: `#0a1628` dan `#f0f4ff` juga muncul sebagai nilai variabel (sudah diubah di Fase 1) — sweep
memproses literal yang tersisa di tempat lain. `#c9a84c` di blok light akan jadi `#3B82F6` (biru
dark) alih-alih `#2563EB` — nuansa kecil, diterima (keluarga biru sama); verifikasi visual.

File yang diproses (argumen script, default):
`css/styles.css`, `www/css/styles.css`, `android/app/src/main/assets/public/css/styles.css`,
`index.html`, `www/index.html`, `android/app/src/main/assets/public/index.html`, `manifest.json`.

**Keluar:** `node scripts/retheme.mjs --dry` mencetak hitungan; 0 error.

### Task 2.2 — Jalankan sweep
`node scripts/retheme.mjs` (tanpa `--dry`).

**Keluar:** hitungan per file dicetak; tidak ada file gagal tulis.

### Task 2.3 — Verifikasi tak ada sisa emas/warm
Grep pada file target, harus 0:
```
rg -i "c9a84c|d4af37|8a6914|a3620a|f8f6f1|fffdf9|f0ede5|4a4035|6b5e4e|2c2417|0a1628|f0f4ff|7a90b8|201, ?168, ?76|138, ?105, ?20|10, ?22, ?40" css/styles.css www/css/styles.css android/app/src/main/assets/public/css/styles.css index.html www/index.html android/app/src/main/assets/public/index.html manifest.json
```
Kecuali: kemunculan di `css/styles 1.css` / `www/css/styles 1.css` (diabaikan).
Verifikasi juga `--navy: #0F172A` dan `--gold: #3B82F6` ada di `:root`.

**Keluar:** grep 0 (selain file yang diabaikan).

---

## Fase 3 — Font + versi

### Task 3.1 — Link Google Fonts
Di `index.html` (dan ketiga salinan) baris ~55, ganti Plus Jakarta Sans →
`family=Lexend:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;600`.

**Keluar:** link memuat Lexend + Source Sans 3 + JetBrains Mono.

### Task 3.2 — `font-family` di CSS
Grep `Plus Jakarta Sans` di `css/styles.css`: ganti ke `'Lexend', 'Source Sans 3'` (pertahankan
`system-ui, sans-serif` setelahnya). Mono tetap `'JetBrains Mono'`. Cek juga deklarasi
`--font`/`font-family` global (body/`:root`) — sinkronkan.

**Keluar:** grep `Plus Jakarta Sans` = 0 di file target.

### Task 3.3 — Bump cache
`index.html` (+ salinan): `css/styles.css?v=9` → `?v=10`. (`runeicons.css?v=4` tetap.)

**Keluar:** grep `styles.css?v=10`.

---

## Fase 4 — Verifikasi & deploy

### Task 4.1 — Sinkronisasi 3 salinan
Konfirmasi ketiga `styles.css` menerima perubahan yang sama (script sweep memproses ketiganya
independen). Bandingkan blok variabel + hitungan grep identik.

**Keluar:** ketiga salinan konsisten.

### Task 4.2 — QA visual (dark + light, desktop + mobile)
Buka app lokal: cek bottom-nav/sidebar, kartu absen, modal, chip filter, tombol utama
(sekarang biru), status success/danger/warning, dan font (Lexend). Cek dua mode via toggle tema.

**Keluar:** tidak ada teks tak terbaca / elemen "menyilaukan"; tandai bila ada (task perbaikan kecil).

### Task 4.3 — Commit & deploy
Commit (`style(theme): palet + font mengikuti arsip`, tanpa `>`/`"`), push `git push origin master:main`,
redeploy Coolify. Smoke prod: hard-refresh (cache-bust `?v=10`), cek warna biru/slate + font.

**Keluar:** prod menampilkan tema baru. Rollback = revert commit + redeploy.

---

## Checkpoint

- **C1 (akhir Fase 1):** variabel berubah, struktur utuh.
- **C2 (akhir Fase 2):** 0 literal emas/warm tersisa di file target.
- **C3 (akhir Fase 3):** font beralih, `?v=10`.
- **C4 (sebelum 4.3):** QA visual lolos di 4 kombinasi (2 mode × 2 lebar).

## Catatan risiko

- `--white` dipakai bergantian sebagai latar terang ATAU teks, tergantung konteks; jangan asal
  ganti. Sweep literal `#f0f4ff`→`#F1F5F9` aman karena `#f0f4ff` hanya muncul sebagai nilai teks
  di dark. Untuk latar kartu, sudah ditangani `--card-bg`.
- Sebagian literal mungkin muncul di `index.html` sebagai atribut `style` inline (mis.
  `rgba(201,168,76,.35)` di baris ~423) — ikut tersapu karena index.html masuk daftar file.
- Font Lexend punya kerning sedikit berbeda; bisa membuat teks terasa lebih lebar. Itu
  diperbolehkan (spec: verifikasi visual, tanpa ubah layout/radius).