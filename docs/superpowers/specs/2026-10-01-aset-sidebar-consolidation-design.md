# Desain: Konsolidasi Fitur Aset ke Sidebar "Aset"

- Status: Disetujui (menunggu review dokumen ini sebelum masuk plan)
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
| D5 | Eager load hanya sekali per sesi masuk section (flag `window._asetLoaded[key]`) |
| D6 | Kartu admin disembunyikan untuk non-admin memakai gate yang sudah ada |
| D7 | Emoji → ikon FontAwesome hanya di markup yang dipindah + `js/simapo*.js` |
| D8 | Satu sumber kebenaran: `window.ASET_SCREENS` |

## Arsitektur

### Sumber kebenaran tunggal

Satu konstanta di `js/simapo.js` (dimuat paling awal dari trio Simapo) mendefinisikan
16 entri. Grid, router, dan eager-load semuanya membacanya:

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

Semua ikon sudah diverifikasi ada di `css/lib/font-awesome.min.css` (bundle lokal, tanpa CDN).
`fa-ticket` **tidak** ada; yang dipakai `fa-ticket-alt`.

### Gate role

Tidak ada logika auth baru. Gate memakai sumber yang sudah dipakai app di `js/config.js:369`
(penyaringan `nip=`) dan `js/simapo.js:702-705` (indeks ROLE):

```js
window.asetIsAdmin = function () {
  if (window.IS_ADMIN) return true;
  if (typeof _isSuperAdmin === 'function' && _isSuperAdmin()) return true; // SUPER
  const r = String(localStorage.getItem('MY_ROLE') || '').toLowerCase();
  if (r.includes('admin')) return true;
  return String((window.userProfile || {}).role || '').toLowerCase().includes('admin');
};
```

Catatan: `_isSuperAdmin()` adalah function global biasa di `js/config.js`, bukan properti
`window` — dipanggil langsung dengan guard `typeof`, sama seperti pemakaiannya di
`js/simapo.js:704`.

Grid dirender ulang saat gate berubah (dipanggil dari titik yang sama dengan saat
nav admin disembunyikan sekarang), agar perpindahan role tanpa reload tidak menampilkan
kartu yang salah.

### Routing

Satu fungsi menggantikan `switchSimapoSection` + `switchSATab`:

```js
window.openAsetScreen = function (key, force = false) {
  // tampilkan grid, sembunyikan layar lain, set judul + tombol kembali,
  // panggil loader sesuai ASET_SCREENS (skip yang sudah pernah eager-load)
};
```

- Layar memakai satu namespace id: `aset-sect-<key>` (menggantikan `simapo-section-*` dan
  `sa-sect-*`), grid memakai `aset-grid`.
- `window.switchSimapoSection` dan `window.switchSATab` **tetap ada** sebagai pembungkus satu
  baris yang memanggil `openAsetScreen`, supaya tidak ada pemanggil yatim (tombol refresh,
  `onclick` di markup lama, fungsi lain).
- Group button `sa-group-*` (aset/transaksi/referensi) dihapus bersama tab strip `sa-tab-*`;
  pengelompokan tidak lagi dibutuhkan karena grid sudah flat. Urutan kartu mengikuti
  urutan admin dulu, lalu user.

### Eager load

Saat `switchTab('simapo')`:

1. `renderAsetGrid()` tampilkan kartu sesuai role (sinkron, tanpa jaringan).
2. Kalau `window._asetEagerDone` belum terpasang, jalankan semua loader yang boleh diakses
   role saat ini lewat `Promise.allSettled`; pasang flag setelah selesai.
3. Loader yang gagal → kartu diberi tanda ⚠ (ikon `fa-exclamation-triangle`) +
   `aria-label` yang menyebut kegagalannya; klik kartu tetap membuka layar dan loader
   dicoba lagi.

Efek samping yang disengaja: 16 request paralel saat masuk section. Ini sudah jadi
permintaan saat ini (memilih tiap tab memicu request), hanya dikumpulkan di satu titik.

### Perubahan per file

| File | Perubahan |
|---|---|
| `index.html` | Grid + 16 markup kartu baru; 13 `.sa-sect` admin dipindah ke `#simapoInstansiSection` sebagai `aset-sect-*`; 3 `.simapo-section` user jadi `aset-sect-*`; nav `#btn-nav-simapo-admin` + header "Panel Admin Inventaris" + `sa-group-*`/`sa-tab-*` dihapus; emoji di rentang yang dipindah diganti ikon; satu blok `<style>` baru untuk `.aset-grid`/`.aset-card` (CSS tidak perlu cache-bust karena inline; `css/styles.css` tidak disentuh) |
| `js/simapo.js` | Tambah `ASET_SCREENS`, `renderAsetGrid`, `openAsetScreen`, `asetIsAdmin`, `eagerLoadAset`; `switchSimapoSection` jadi pembungkus |
| `js/simapo-ext.js` | `window.switchSATab` jadi pembungkus `openAsetScreen`; hapus logika tab/group; emoji → ikon |
| `js/simapo-bast.js` | Emoji → ikon saja; logika BAST tidak diubah |
| n8n / SQL | Tidak disentuh |

`css/styles 1.css` adalah salinan duplikat dari `styles.css` yang tidak di-link — tidak disentuh.

### Emoji → ikon

Cakupan: markup yang dipindah (3 layar user + 13 layar admin, ikon teks, badge, placeholder,
label grup) dan seluruh string template di `js/simapo.js`, `js/simapo-ext.js`,
`js/simapo-bast.js`. Emoji di luar area itu (absen, profile, PDF, rekap, AI) **tetap**.
Untuk badge status (✅/❌/🔴/⚠️) di dalam list, gunakan kelas warna yang sudah ada
(`var(--success)`, `var(--danger)`, `var(--gold)`) + ikon, bukan ikon berwarna emoji.

## Verifikasi

Tidak ada framework test frontend di repo ini; standar yang dipakai:

1. `node --check` untuk setiap file JS yang disentuh.
2. Checklist manual via chrome-devtools (localhost):
   - Admin: grid berisi **16** kartu; keenam belas layar terbuka tanpa error console.
   - Non-admin: grid berisi **3** kartu; kartu admin tidak ada di DOM.
   - Dari setiap layar, tombol kembali selalu kembali ke grid.
   - `Inventaris` tidak lagi ada di nav Panel Admin.
   - Grep emoji pada rentang markup yang dipindah + 3 file `simapo*.js` = 0.
   - Ukuran 375px: grid 2 kolom, tanpa overflow horizontal.
3. Smoke test backend n8n tetap hijau (`npm run test:aset`) — harusnya tidak tersentuh,
   dijalankan sebagai penjaga.

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