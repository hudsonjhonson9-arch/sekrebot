# Desain: Konsolidasi Fitur Aset ke Sidebar "Aset"

- Status: Selesai diimplementasikan (Task 1–5 selesai; hasil verifikasi di bagian "Hasil Verifikasi")
- Tanggal: 2026-10-01
- Milestone: 1 dari 2 (Milestone 2 = parity fitur + impor data penuh, terpisah)
- Sumber: `D:\Code\absensi_refactored_v6` (root; salinan `www/` diabaikan)

## Latar Belakang

Semua fitur inventaris dari aplikasi referensi `D:\Code\aset-bapperida` sudah ada sebagai
layar di aplikasi ini, tapi tersebar di dua tempat: sidebar **Aset** (3 layar user) dan
**Panel Admin → Inventaris** (13 tab admin). Dua router terpisah
(`switchSimapoSection` di `js/simapo.js:11` dan `window.switchSATab` di `js/simapo-ext.js:115`)
membuat(user harus tahu fitur berada di menu mana.

Audit paralel (dilakukan sebelum desain ini, hasilnya menjadi dasar milestone 2):
16 layar sudah ada di kode, tetapi UI Input Massal, UI Impor KIB, Ubah/Hapus Massal,
filter lanjutan, dan backup belum ada; data produksi hanya 19 dari 281 aset referensi.
Keduanya **tidak** dikerjakan di milestone 1.

## Tujuan

1. Semua fitur aset (16 layar) berada di satu tempat: sidebar **Aset**.
2. Navigasi berupa grid kartu; klik kartu → layar; tombol kembali → grid.
3. Semua layar di-load saat section Aset dibuka (eager load), fail-soft.
4. Kartu admin hanya tampil untuk admin/superadmin.
5. Emoji pada markup yang dipindah dan pada `js/simapo*.js` diganti ikon FontAwesome.

## Non-Tujuan (batas kerja milestone 1)

- Tidak ada perubahan database, endpoint n8n, atau kontrak API. Nol migrasi.
- Tidak menambah/menghapus fitur; tidak memperbaiki bug fungsional yang tidak terkait navigasi.
- Tidak menyentuh markup/JS di luar section Aset (emoji di area lain tetap).
- Milestone 2 (parity fitur + impor 281 aset ke `SIMAPO.unit_aset`, tanpa tabel baru)
  dan cleanup 8 tabel mati `SIMAPO` dikerjakan terpisah.

## Keputusan Desain

| # | Keputusan |
|---|---|
| D1 | Grid kartu di dalam sidebar Aset; total 16 kartu (3 user + 13 admin) |
| D2 | Konten admin **dipindahkan** ke section Aset (Pendekatan A: pindahkan markup, reuse router/handler) |
| D3 | `Panel Admin → Inventaris` dihapus dari nav admin |
| D4 | Grid langsung tampil, eager load di belakang layar, `Promise.allSettled`, gagal ≠ memblokir |
| D5 | Eager load hanya sekali per sesi masuk section (flag global `window._asetEagerDone`; kegagalan dikumpulkan di `window._asetFailed[key]`) |
| D6 | Kartu admin disembunyikan untuk non-admin memakai gate yang sudah ada |
| D7 | Emoji → ikon FontAwesome hanya di markup yang dipindah + `js/simapo*.js` |
| D8 | Satu sumber kebenaran: `window.ASET_SCREENS` |

## Arsitektur

### Sumber kebenaran tunggal

Data layar ada di `js/aset-screens.js` (`window.ASET_SCREENS`), dimuat paling awal dari trio
Aset. Seluruh logika navigasi ada di `js/aset-nav.js` (`window.ASET_NAV`). Grid, router, dan
eager-load semuanya membaca konstanta yang sama:

```js
// load: [namaFungsiGlobal, ...argumen] — argumen wajib untuk fungsi yang butuh flag
window.ASET_SCREENS = [
  { key: 'katalog',       label: 'Katalog Aset',        icon: 'fa-box-open',        role: 'user',  load: [['loadSimapoKatalog'], ['loadSimapoKategori', false]] },
  { key: 'pinjaman-saya', label: 'Pinjaman Saya',       icon: 'fa-exchange-alt',    role: 'user',  load: [['populateSimapoPinjamSelect'], ['loadSimapoRiwayatPinjam', false]] },
  { key: 'tiket-saya',    label: 'Tiket Kerusakan',     icon: 'fa-ticket-alt',      role: 'user',  load: [] }, // form-only: layar ini tidak punya daftar
  { key: 'master',        label: 'Aset',                icon: 'fa-cubes',           role: 'admin', load: [['loadAdminSimapoMaster', false]] },
  { key: 'kat',           label: 'Kategori',            icon: 'fa-tags',            role: 'admin', load: [['loadSimapoKategori', true, false]] },
  { key: 'mutasi',        label: 'Mutasi',              icon: 'fa-exchange-alt',    role: 'admin', load: [['loadMutasiRiwayat', false], ['populateMutasiBarangSelect']] },
  { key: 'opname',        label: 'Opname',              icon: 'fa-clipboard-check', role: 'admin', load: [['loadOpnameForm']] },
  { key: 'standar-harga', label: 'Standar Harga',       icon: 'fa-money-bill-wave', role: 'admin', load: [['loadStandarHarga', false]] },
  { key: 'bast',          label: 'Serah Terima (BAST)', icon: 'fa-file-signature',  role: 'admin', load: [['loadAdminBast', false], ['loadBastHistory', false]] },
  { key: 'pinjam',        label: 'Pinjaman',            icon: 'fa-clipboard-list',  role: 'admin', load: [['loadAdminSimapoPinjam', false]] },
  { key: 'tiket',         label: 'Tiket',               icon: 'fa-inbox',           role: 'admin', load: [['loadAdminSimapoTiket', false]] },
  { key: 'penerimaan',    label: 'Penerimaan',          icon: 'fa-truck',           role: 'admin', load: [['loadAdminPenerimaan', false], ['populateStandarHargaDatalist']] },
  { key: 'pemeliharaan',  label: 'Pemeliharaan',        icon: 'fa-tools',           role: 'admin', load: [['loadAdminPemeliharaan', false], ['populatePemeliharaanBarang']] },
  { key: 'bku',           label: 'Buku Kas Umum',       icon: 'fa-book',            role: 'admin', load: [['loadAdminBKU', false]] },
  { key: 'pks',           label: 'PKS',                 icon: 'fa-file-contract',   role: 'admin', load: [['loadAdminPKS', false]] },
  { key: 'pengaturan',    label: 'Pengaturan',          icon: 'fa-cog',             role: 'admin', load: [['loadSAPengaturan']] },
];
```

`load` berisi pasangan `[namaFungsiGlobal, ...argumen]`; pemanggil melakukan
`typeof window[name] === 'function' && window[name](...args)` sehingga fungsi yang belum
ada dilewati tanpa error (pola yang sama dipakai jalur lama). Argumen `false` adalah nilai
`force`; `loadSimapoKategori` menerima `(isAdmin, force)`. Ikon `fa-exclamation-triangle`
dan `fa-arrow-left` untuk penanda gagal + tombol kembali juga sudah diverifikasi ada.

Konvensi `force`: pada entri `load`, argumen **terakhir** adalah flag `force`
(mis. `['loadSimapoKategori', true, false]` → flag-nya `false`). `force` hanya mengubah
argumen terakhir menjadi `true`; entri tanpa argumen mendapat satu argumen `true`. Argumen
lain (mis. flag `isAdmin`) tidak pernah disentuh.

Semua ikon sudah diverifikasi ada di `css/lib/font-awesome.min.css` (bundle lokal, tanpa CDN).
`fa-ticket` **tidak** ada; yang dipakai `fa-ticket-alt`.

### Gate role

Tidak ada logika auth baru. Gate memakai sumber yang sudah dipakai app di `js/config.js:369`
(penyaringan `nip=`) dan `js/simapo.js:702-705` (indeks ROLE). Di `js/aset-nav.js` gate-nya
adalah `isAdmin()` internal dan diekspos sebagai `ASET_NAV.isAdmin`:

```js
function isAdmin() {
  if (window.IS_ADMIN) return true;
  if (typeof window._isSuperAdmin === 'function' && window._isSuperAdmin()) return true;
  const role = String(localStorage.getItem('MY_ROLE') || '').toLowerCase();
  if (role.includes('admin')) return true;
  return String((window.userProfile || {}).role || '').toLowerCase().includes('admin');
}
```

Catatan: `_isSuperAdmin` dicek lewat `window` dengan guard `typeof`, jadi aman kalau
`js/config.js` belum termuat.

`MY_ROLE` yang dipakai app adalah `'ADMIN GUDANG'` (dengan spasi) — sama persis dengan yang
dicek `js/ui.js`. Varian dengan underscore tidak ada di repo.

Grid dirender ulang saat gate berubah (dipanggil dari titik yang sama dengan saat
nav admin disembunyikan sekarang), agar perpindahan role tanpa reload tidak menampilkan
kartu yang salah. `open()` juga memeriksa gate, sehingga layar admin tetap tidak bisa dibuka
dengan `force: true` oleh non-admin.

### Routing

Satu fungsi di `window.ASET_NAV` menggantikan `switchSimapoSection` + `switchSATab`:

```js
ASET_NAV.open(key, force)   // buka layar: set judul + tombol kembali, panggil loader
ASET_NAV.showGrid()         // kembali ke grid: sembunyikan semua layar
ASET_NAV.renderGrid()       // cetak ulang kartu sesuai gate role
```

- Layar memakai satu namespace id: `aset-sect-<key>` (menggantikan `simapo-section-*` dan
  `sa-sect-*`), grid memakai `aset-grid`.
- `window.switchSimapoSection` dan `window.switchSATab` **tetap ada** sebagai pembungkus satu
  baris yang memanggil `ASET_NAV`, supaya tidak ada pemanggil yatim (tombol refresh,
  `onclick` di markup lama, fungsi lain).
- Group button `sa-group-*` (aset/transaksi/referensi) dihapus bersama tab strip `sa-tab-*`;
  pengelompokan tidak lagi dibutuhkan karena grid sudah flat. Urutan kartu mengikuti
  urutan admin dulu, lalu user.
- 16 id `aset-sect-*` berpasangan 1:1 dengan 16 key `ASET_SCREENS`.

### Eager load

Saat `switchSimapoSection('grid')`:

1. `showGrid()` menampilkan grid + `renderGrid()` mencetak kartu sesuai role (sinkron, tanpa
   jaringan).
2. Kalau `window._asetEagerDone` belum terpasang, jalankan semua loader yang boleh diakses
   role saat ini lewat `Promise.allSettled`; pasang flag setelah selesai, lalu cetak ulang
   grid.
3. Loader yang gagal → tercatat di `window._asetFailed[key]`, kartu diberi ikon
   `fa-exclamation-triangle` dengan `title` `"Gagal dimuat: <pesan>"` (properti DOM, bukan
   `innerHTML`, jadi tidak perlu escape dan tidak pernah jadi markup); klik kartu tetap
   membuka layar dan loader dicoba lagi dengan `force`. String kosong berarti sukses.
4. Loader yang melempar sinkron (bukan rejected Promise) dibungkus `safe()` supaya tidak
   lolos keluar dari `map()` dan menggagalkan eager load-nya sendiri.

Efek samping yang disengaja: 16 request paralel saat masuk section. Ini sudah jadi
permintaan saat ini (memilih tiap tab memicu request), hanya dikumpulkan di satu titik.

### Perubahan per file

| File | Perubahan |
|---|---|
| `index.html` | Grid + 16 markup kartu baru; 13 `.sa-sect` admin dipindah ke `#simapoInstansiSection` sebagai sibling `aset-sect-*` (bukan di dalam `<details>` modal, supaya bisa Target show/hide); 3 `.simapo-section` user jadi `aset-sect-*`; nav `#btn-nav-simapo-admin` + header "Panel Admin Inventaris" + `sa-group-*`/`sa-tab-*` dihapus; emoji di rentang yang dipindah diganti ikon; satu blok `<style>` baru untuk `.aset-grid`/`.aset-card` (CSS tidak perlu cache-bust karena inline; `css/styles.css` tidak disentuh) |
| `js/aset-screens.js` | **Baru.** `window.ASET_SCREENS` — 16 entri (label, ikon, role, daftar loader) |
| `js/aset-nav.js` | **Baru.** `window.ASET_NAV` — `isAdmin`, `visibleScreens`, `loaderCalls`, `eagerLoad`, `renderGrid`, `showGrid`, `open` |
| `js/simapo.js` | `switchSimapoSection` jadi pembungkus `ASET_NAV`; blok `ASET_SCREENS`/grid/router yang sempat ditarik ke sini dihapus (sumber kebenaran pindah ke `aset-screens.js`); emoji → ikon |
| `js/simapo-ext.js` | `window.switchSATab` jadi pembungkus `ASET_NAV.open`; hapus logika tab/group; emoji → ikon |
| `js/simapo-bast.js` | Emoji → ikon saja; logika BAST tidak diubah |
| `js/ui.js` | `switchAdminSection`: ADMIN GUDANG tidak lagi punya section admin → hapus `absen_last_admin_section` lalu `switchTab('simapo')`; nilai basi `'simapo-admin'` dan section yang hilang jatuh ke `'ops'` |
| n8n / SQL | Tidak disentuh |

`css/styles 1.css` adalah salinan duplikat dari `styles.css` yang tidak di-link — tidak disentuh.
`dist/index.html` dan `www/` adalah artefak/salinan yang tidak di-link — tidak disentuh.

### Emoji → ikon

Cakupan: markup yang dipindah (3 layar user + 13 layar admin, ikon teks, badge, placeholder,
label grup) dan seluruh string template di `js/simapo.js`, `js/simapo-ext.js`,
`js/simapo-bast.js`. Emoji di luar area itu (absen, profile, PDF, rekap, AI) **tetap**.
Untuk badge status (✅/❌/🔴/⚠️) di dalam list, gunakan kelas warna yang sudah ada
(`var(--success)`, `var(--danger)`, `var(--gold)`) + ikon, bukan ikon berwarna emoji.

## Verifikasi

Tidak ada framework test frontend di repo ini; standar yang dipakai:

1. `node --check` untuk setiap file JS yang disentuh, dan `node --test tests/*.test.mjs` untuk
   test baru (`node:test` bawaan Node 22 — tanpa dependensi baru). Glob `tests/*.test.mjs`
   dipakai karena `node --test tests/` tidak jalan di Node 22.22.0.
2. `npm run lint` **tidak** dipakai sebagai gate: baseline repo sudah gagal 16.107 error
   `no-undef` karena file classic-script tidak mendaftarkan global-nya.
3. Checklist manual via chrome-devtools — lihat "Hasil Verifikasi".
4. `node scripts/test-aset-data.mjs` sebagai penjaga endpoint (opsional — butuh
   `$env:N8N_TOKEN`). Tidak disentuh milestone ini; hanya memastikan tidak regresi.

### Hasil Verifikasi (2026-10-01)

Otomatis: **37 pass, 0 fail** (`node --test tests/*.test.mjs`) dari 5 file test —
`aset-screens` (5), `aset-nav` (9), `aset-router` (7), `aset-emoji` (3), `aset-markup` (10).
`node --check` hijau untuk `js/aset-screens.js`, `js/aset-nav.js`, `js/simapo.js`,
`js/simapo-ext.js`, `js/simapo-bast.js`.

Setiap test diuji balik dengan mutasi nyata (ubah satu hal di `index.html`/`js/ui.js`/
`js/simapo.js`, pastikan test gagal, lalu `git checkout --`): 5 dari 5 mutasi tertangkap —
ID screen di-rename, `aset-nav.js` tidak dimuat, ID section admin di-rename, loader tidak
terdefinisi, dan sidebar membuka Katalog alih-alih grid.

Browser (chrome-devtools, server statis `python -m http.server`, origin `127.0.0.1:5173`):

| Yang diperiksa | Hasil |
|---|---|
| Kartu per role | admin 16, user biasa 3 (Katalog Aset, Pinjaman Saya, Tiket Kerusakan), role kosong 3 — semua kartu punya `<i class="fas">` |
| Judul header tiap kartu | 16/16 cocok dengan label kartu, dan section yang tampil persis `aset-sect-<key>` |
| Tombol kembali | selalu kembali ke grid (`_asetCurrent` jadi `null`), grid tetap 16 kartu |
| Eager load ke backend nyata | 16/16 loader sukses dalam ~4 detik, `unhandledrejection` = 0 |
| Fail-soft | `renderGrid` tetap 16 kartu saat 7 loader gagal; ikon ⚠ + `title` "Gagal dimuat: …" muncul benar saat pesan terisi |
| Gate role | `open('master', {force:true})` oleh user biasa ditolak, `_asetCurrent` tetap `null`, grid 3 kartu |
| Key tak dikenal | `open('tidak-ada')` tidak menavigasi ke mana pun |
| ADMIN GUDANG | `switchAdminSection` → panel Aset aktif, grid tampil, `absen_last_admin_section` terhapus, nol nav admin terlihat |
| Responsif | 1440px = 4 kolom × 4 baris; 1000px = 3 kolom × 6 baris; ≤720px (diuji 500px, batas minimum window) = 2 kolom × 8 baris; tanpa scroll horizontal, tanpa label terpotong |
| Console | tanpa exception dari kode Aset; satu-satunya error adalah CORS ke webhook n8n dan `favicon.ico` 404 — keduanya artefak origin `127.0.0.1`, bukan regresi |
| Emoji | 0 emoji di markup Aset + `js/simapo*.js`; panah `→` (U+2192) dipertahankan karena itu bukan emoji |

Milestone 1 selesai.

## Risiko

| Risiko | Mitigasi |
|---|---|
| Sisa referensi ke `sa-sect-*`/`sa-tab-*` setelah rename | Grep seluruh repo untuk `sa-sect-\|sa-tab-\|sa-group-\|simapo-section-` dan perbarui semua pemanggil dalam commit yang sama |
| 16 request paralel membebani endpoint yang berat | Eager load memakai jalur klik tab yang sudah ada. Kalau ada endpoint yang terbukti berat, entry terkait dipindah dari eager load ke lazy load (hanya saat kartu diklik) — tanpa flag baru |
| Kartu admin sempat terlihat oleh non-admin | Grid dirender dari `ASET_SCREENS.filter(role)`, bukan CSS `display:none` pada markup yang sudah tercetak |
| Konten lama masih punya pemanggilan `switchSATab` dari luar | Kedua fungsi lama dipertahankan sebagai pembungkus (D-routing) |

## Catatan Milestone 2 (tidak dikerjakan di sini)

- Tutup gap parity: UI Input Massal, UI Impor KIB, Ubah/Hapus Massal, filter lanjutan
  (tanpa pemegang/tahun/rentang harga/jenis KIB/sumber data + chip filter aktif), backup DB,
  jumlah aset per kategori.
- Impor penuh: `aset.db` (281 aset, 47 pegawai, 7 arsip BAST, 14 ruang, 8 kategori) →
  `SIMAPO.unit_aset` dan tabel yang sudah ada. **Tanpa tabel baru.**
- Isi 7 key aset yang masih kosong di `public.pengaturan` dari default `aset-bapperida`.
- Kandidat cleanup (perlu persetujuan eksplisit, tidak sepele): `request_barang`,
  `detail_request`, `detail_distribusi_aset`, `detail_pemeliharaan`, `jadwal_maintenance`
  (0 baris, tidak dipakai fitur mana pun), `riwayat_pemeliharaan` (rujaman tipis),
  serta `program`/`kegiatan`/`subkegiatan` yang masih kosong.