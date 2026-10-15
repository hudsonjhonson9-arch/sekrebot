# Arsip Native 3 Domain — Desain

Tanggal: 2026-10-15
Modul: panel Arsip (`#panel-arsip`) di aplikasi absensi
Status: disetujui, menunggu rencana implementasi

## 1. Latar & tujuan

Panel Arsip di absensi punya dua jalur:

- **Jalur A (native)** — `js/arsip.js` + proxy `server/arsip.js` → `/api/docs` di peta-ekonomi.
- **Jalur B ("Aplikasi lengkap")** — iframe ke `arsipdigital.mindcloud.my.id` (`#arsipFrame`).

Jalur B sekarang praktis tidak terpakai dan bermasalah di WebApp Telegram (iframe, login, tab baru). Pekerjaan ini memperluas **Jalur A** supaya bisa menggantikan halaman utama arsipdigital secara **native penuh**, dan memperbaiki tiga keluhan konkret:

1. **Melihat dokumen tidak boleh pindah tab.** Sekarang baris dokumen adalah `<a href target="_blank">` (`js/arsip.js:125`, `:263`) → keluar dari WebApp ke tab baru.
2. **Menambah dokumen harus ada tombol `+`** yang jelas, bukan tombol tersembunyi di toolbar.
3. **Ada beranda grid tile dulu sebelum masuk daftar:** tile **Dokumen, Kertas Kerja, Bank Data, Aplikasi Lengkap** (bukan langsung daftar folder).

Tujuan: satu panel Arsip native dengan beranda tile, daftar dokumen bergaya arsipdigital, preview in-panel, serta modul **Kertas Kerja** dan **Bank Data** native penuh (baca + tulis/admin).

## 2. Bukan tujuan (non-goal)

- Tidak mengubah halaman/jalur di aplikasi peta-ekonomi (`arsipdigital`). Semua di sisi absensi.
- Tidak memindahkan/menduplikasi tabel DB peta. Semua data tetap di peta, diakses lewat HTTP.
- Tidak membuat jalur login kedua. SSO cookie + token yang sudah ada (`server/arsip-sso.js`) dipakai apa adanya.
- Tidak menyentuh Jalur B (iframe Aplikasi Lengkap) selain memindahkannya jadi salah satu tile.

## 3. Fakta yang mengikat desain

- **URL file = Google Drive.** Semua unggahan lewat Apps Script (`server/gas.js:47 gasUpsert`) dan mengembalikan `{ fileId, url }` dengan `url = https://drive.google.com/file/d/<fileId>/view`.
  - `/view` **tidak bisa** di-embed (X-Frame-Options).
  - Embed resmi Drive: `https://drive.google.com/file/d/<fileId>/preview` (boleh di-iframe).
  - Thumbnail gambar: `https://drive.google.com/thumbnail?id=<fileId>&sz=w<size>` → sudah ada util `js/helpers.js:390 driveImgUrl()`, dan pola fallback `images.weserv.nl` di `js/tugas_lembur.js:19-31`.
- **Endpoint peta yang relevan** (semua same-origin lewat proxy absensi):
  - Dokumen: `GET/POST /api/docs`, `GET/PUT/DELETE /api/docs/:id`, `GET /api/docs/:id/history`, `GET /api/docs/:id/versions`, `PATCH /api/docs/:id/status`, `PATCH /api/docs/:id/publik`, `POST /api/docs/bulk`, `GET|POST|DELETE /api/docs/:id/shares`, `POST /api/docs/upload-file` (khusus, Apps Script).
  - Kertas Kerja: `GET /api/pks/tahun`, `GET /api/pks/tree`, `GET /api/pks/ringkasan/:tahun`, `GET /api/pks/deadline-terdekat`, `GET|POST|PUT|DELETE /api/pks/:level(/:id)`, `GET/POST /api/kertas-kerja`, `POST /api/kertas-kerja/bulk`, `PUT|DELETE /api/kertas-kerja/:id`, `POST /api/kertas-kerja/:id/generate`, `POST /api/kertas-kerja/:id/sinkron-wajib`, `PATCH /api/kertas-kerja/periode/:id`, `POST /api/kertas-kerja/periode/:id/tautan`, `GET /api/kertas-kerja/periode/:id/kandidat`, `GET /api/kertas-kerja/jatim`.
  - Bank Data: `GET /api/bankdata` (satu request, tree penuh), `GET|POST /api/bankdata/tahun`, `DELETE /api/bankdata/tahun/:id`, CRUD `opd|iku|ikk|sektoral|indikator/:level|nilai/:level|triwulan/:level`.
- **Bentuk data Bank Data** (`peta-ekonomi/server/index.js:2890`): tree `bidang[] → opds[] → { ikus[] (tiap iku punya ikks[]), sektorals[] (tiap sektoral punya indikator[]) }`; tiap node punya `nilai[]` = `{ id, tahun, target?, capaian?, data?, tw? }` dengan `tw1..tw4 = { a, b? }`.
- **Role ditegakkan di peta** (`peta-ekonomi/server/kebijakan.js`): tulis Bank Data butuh `ADMIN`, tulis Kertas Kerja butuh `ADMIN`/`LOGIN` sesuai aturan. Proxy absensi hanya meneruskan; percobaan tulis oleh non-admin akan ditolak peta (403) — perilaku yang benar, jangan ditelan.
- **Nama & format SSO tidak berubah** (`server/arsip-sso.js`): cookie `arsip_session`, `PANJANG_MINIMUM=16`, `DOMAIN='.mindcloud.my.id'`, token `b64url(JSON{sub,exp}).hmac-sha256-base64url`. `ARSIP_SESSION_SECRET` absensi wajib sama dengan `SESSION_SECRET` peta.
- **Panel full-bleed & dual tema sudah ada**; jangan regresikan (`body.desktop-mode .panel:not(#panel-arsip)`, `html.light-theme`).

## 4. Arsitektur & file

Frontend:

| File | Isi |
|---|---|
| `js/arsip.js` (ubah) | shell panel: state view, beranda tile, grid folder, list dokumen, preview overlay, FAB upload. Menjadi entry `window.ARSIP`. |
| `js/arsip-ui.js` (baru) | helper tampilan bersama: `arsipBadge(status)`, `arsipDocRow(d)`, `arsipSkeleton(n)`, `arsipEmpty(text)`, `driveEmbedUrl(url)`, `driveThumbUrl(url,size)`, abstraksi modal (`arsipModal(title, body, onOk)`). |
| `js/arsip-kk.js` (baru) | modul Kertas Kerja: `window.ArsipKK = { mount(el), unmount() }`. |
| `js/arsip-bd.js` (baru) | modul Bank Data: `window.ArsipBD = { mount(el), unmount() }`. |
| `index.html` (ubah) | tambah `#arsipHome` (grid tile) & `#arsipPreview` (overlay) di dalam `#panel-arsip`; tambah `<script>` baru. |
| `css/styles.css` (ubah) | gaya tile beranda, baris dokumen, overlay preview, FAB. |

Backend (`server/arsip.js` diubah, tidak ada file server baru):

- `forward(req,res,target)` tetap.
- Ada **tabel whitelist** `IZIN` (lihat §6) + rute generik `/p/*`.
- Handler khusus tetap: `/docs/upload-file` (pakai `gasUpsert`), dan rute `/docs/*` eksplisit yang sudah ada boleh tetap ada (tidak diganggu) — whitelist hanya untuk domain baru.

Kontrak modul frontend (biar `js/arsip.js` tetap kurus):

```js
// window.ArsipKK / window.ArsipBD
{ mount(containerEl), unmount(), setTahun?(y) }
```

`js/arsip.js` memanggil `mount(el)` saat tile dipilih dan `unmount()` saat pindah tile. Modul mengurus fetch, loading, dan render-nya sendiri.

## 5. Perilaku UI

### 5.1 State & navigasi

```
arsipView: 'home' | 'dokumen' | 'kk' | 'bd' | 'app'
openFolder: string | null     (khusus dokumen)
openDetailId: string | null   (khusus dokumen)
```

- Home → Dokumen: masuk ke grid folder bidang (perilaku sekarang, `js/arsip.js:283`).
- Grid folder → list dokumen (klik folder, `openFolder`).
- List → detail dokumen: **tetap in-panel** (`openDetail`, `js/arsip.js:107`).
- Detail → tombol "Lihat dokumen" → **overlay preview** (§5.3), bukan tab baru.
- Tombol kembali per tingkat: detail → list → folder → home. Tombol kembali browser/WebApp (`Telegram.BackButton` jika ada) memetakan ke tingkat yang sama.
- Ganti tile → `unmount()` modul sebelumnya.

### 5.2 Beranda grid tile

Grid 2 kolom (mobile) / 4 kolom (desktop width panel):

| Tile | Aksi |
|---|---|
| **Dokumen** | `arsipView='dokumen'` → grid folder bidang |
| **Kertas Kerja** | `mount(window.ArsipKK)` |
| **Bank Data** | `mount(window.ArsipBD)` |
| **Aplikasi Lengkap** | tampilkan `#arsipFrame` (iframe arsipdigital) di dalam panel |

- Tile Dokumen menampilkan jumlah dokumen (`#arsipCount` yang sudah ada) sebagai sub-label.
- Tile hanya ikon + label + sub-label; tidak ada state baru yang perlu di-fetch selain jumlah dokumen.

### 5.3 Preview in-panel (keluhan #1)

Overlay `#arsipPreview` **di dalam** `#panel-arsip` (bukan `window.open`, bukan tab baru).

Aturan jenis berkas, diturunkan dari `url` + `type` dokumen:

1. **Gambar** (`.jpg/.jpeg/.png/.webp/.gif`, atau mime `image/*`): `<img src="driveThumbUrl(url,1000)">`; bila `img.onerror` → coba `https://images.weserv.nl/?url=<thumbnail url>`; bila masih gagal → tampilkan pesan + tombol Buka.
2. **PDF** (`.pdf` atau mime `application/pdf`): `<iframe src="driveEmbedUrl(url)">` = `https://drive.google.com/file/d/<fileId>/preview`. Bila `fileId` tidak terdeteksi → langsung tampilkan fallback pesan + tombol.
3. **Jenis lain**: kartu info (ikon per tipe, nama, ukuran bila ada) + tombol **Unduh** dan **Buka di tab baru** (sekunder, `target="_blank"` — satu-satunya tempat yang boleh keluar tab).

Overlay punya: judul = `d.title`, tombol tutup, tombol **Unduh** (link Drive `url`), tombol **Buka** (sekunder). Tutup juga lewat `Esc` dan klik latar.

`driveEmbedUrl`/`driveThumbUrl` di `js/arsip-ui.js`, memakai ulang regex `fileIdFromDriveUrl` pola yang sudah ada di `js/helpers.js:390` (jangan menyalin regex baru bila bisa impor ulang; bila util-nya tidak diekspor, tambahkan export kecil).

### 5.4 List dokumen bergaya arsipdigital

Acuan: `peta-ekonomi/src/components/DocPages.jsx` (`FILE_TYPE_COLORS` :62, `BIDANG_COLORS` :74, `EXT_MAP` :85, `TYPE_COLORS` :101, `DocList` :238).

Baris dokumen (list mode):

- kotak ikon 36–40px berwarna per tipe (`EXT_MAP` → warna `TYPE_COLORS`/`FILE_TYPE_COLORS`),
- baris 1: `title` (ellipsis 1 baris),
- baris 2: `type · year · uploader`,
- kanan: badge `status` (warna dari peta status) dan chip `bidang` (warna dari `BIDANG_COLORS`),
- aksi: tombol **Lihat** (→ overlay preview) menggantikan tautan keluar.

Mode grid: kartu dengan ikon besar + judul + meta. Toggle grid/list disimpan di `localStorage` (`arsip:mode`).

State tambahan yang wajib ada: **skeleton** saat memuat, **empty state** ("Belum ada dokumen di bidang ini"), **error state** dengan tombol Coba lagi (menampilkan pesan server apa adanya, mis. 503 `Proxy arsip belum dikonfigurasi…`).

### 5.5 Tombol + upload (keluhan #2)

- FAB `+` fixed di dalam area `#panel-arsip`, sudut kanan bawah, di atas bottom navbar (offset aman `env(safe-area-inset-bottom)`).
- Muncul hanya bila `IS_ADMIN` (pola `js/ui.js:144`) — non-admin tidak melihatnya.
- Klik → buka `#arsipUploadModal` yang sudah ada (tidak ada modal baru).

## 6. Backend: whitelist proxy

`server/arsip.js` — tambah tabel izin dan rute generik:

Dua gerbang tulis berlaku berurutan:

1. **Absensi** — `forward()` sudah menolak semua non-GET untuk role di luar `MEDIA_ROLES` (`server/arsip.js:19,28-31`, `403 Tidak berwenang.`). Tidak diubah.
2. **Peta** — `peta-ekonomi/server/kebijakan.js` menolak lagi sesuai role di DB peta. Pesannya diteruskan apa adanya.

Catatan implementasi: `forward()` **tidak** meneruskan query string (hanya `baseUrl + target`), jadi rute `/p/*` harus menyusun `target` termasuk query bila ada. `forward()` juga selalu mengirim `content-type: application/json` dan body `JSON.stringify(req.body ?? {})` — cukup untuk semua endpoint di daftar.

```js
// ponytail: whitelist, bukan handler per endpoint. Guard tulis sudah ada di
// server/arsip.js (MEDIA_ROLES) + peta (kebijakan.js), jadi di sini cuma
// memastikan path & method yang boleh lewat.
const IZIN = {
  GET:    [/^\/api\/docs$/, /^\/api\/docs\/[^/]+$/, /^\/api\/docs\/[^/]+\/(history|versions|index-status|shares)$/,
           /^\/api\/pks\/[a-z]+$/, /^\/api\/pks\/ringkasan\/\d+$/, /^\/api\/pks\/deadline-terdekat$/,
           /^\/api\/kertas-kerja$/, /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/kertas-kerja\/periode\/[^/]+\/(kandidat)$/,
           /^\/api\/bankdata$/, /^\/api\/bankdata\/tahun$/],
  POST:   [/^\/api\/docs$/, /^\/api\/docs\/bulk$/, /^\/api\/docs\/[^/]+\/(status|publik|shares|versions)$/,
           /^\/api\/kertas-kerja$/, /^\/api\/kertas-kerja\/bulk$/, /^\/api\/kertas-kerja\/[^/]+\/(generate|sinkron-wajib|pengingat)$/,
           /^\/api\/kertas-kerja\/periode\/[^/]+\/tautan$/, /^\/api\/pks\/[a-z]+$/,
           /^\/api\/bankdata\/[a-z]+$/],
  PUT:    [/^\/api\/docs\/[^/]+$/, /^\/api\/pks\/[a-z]+\/[^/]+$/, /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/],
  PATCH:  [/^\/api\/docs\/[^/]+\/(status|publik)$/, /^\/api\/kertas-kerja\/periode\/[^/]+$/, /^\/api\/bankdata\/[a-z]+(\/[^/]+)*$/],
  DELETE: [/^\/api\/docs\/[^/]+$/, /^\/api\/docs\/[^/]+\/shares\/[^/]+$/, /^\/api\/pks\/[a-z]+\/[^/]+$/,
           /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata(\/[a-z]+\/[^/]+|\/tahun\/[^/]+)$/],
};

router.all(/^\/p\/(.*)$/, (req, res) => {
  const target = '/' + req.params[0] + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  const pola = IZIN[req.method] || [];
  const path = '/' + req.params[0];
  if (!pola.some(re => re.test(path))) return res.status(403).json({ ok: false, message: 'Path arsip tidak diizinkan.' });
  return forward(req, res, target);
});
```

- Query string diteruskan apa adanya (dibutuhkan `?tahun=`) — **dikutip manual** karena `forward()` tidak menyertakannya.
- `/p/*` tidak bertabrakan dengan `/docs/:id` yang sudah ada (prefix berbeda). Urutan `/docs/upload-file` → `/docs/bulk` → `/docs/:id/*` tidak diubah.
- `siap()` guard tetap dipakai → pesan 503 tetap muncul bila env belum diisi.

## 7. Kertas Kerja native (`js/arsip-kk.js`)

Baca:

- Pilih tahun (default tahun berjalan; opsi dari `GET /api/pks/tahun` digabung tahun berjalan — pola `Dashboard.jsx InfoKertasKerja`).
- Ringkasan: `GET /api/pks/ringkasan/:tahun` → progress wajib/terisi; `GET /api/pks/deadline-terdekat?tahun=` → daftar deadline.
- Daftar: `GET /api/kertas-kerja?tahun=` → baris sub kegiatan: nama, PIC, jumlah periode, status turunan, target/indikator. Kolom status mengikuti pola "status diturunkan saat query" (jangan menyimpan status sendiri di klien).
- Detail sub kegiatan: periode (tahun/periode), tautan dokumen (kalau `doc_id` ada → tombol Lihat → overlay preview dokumen yang sama §5.3), deadline, PIC.

Tulis (hanya untuk `IS_ADMIN`):

- Generate periodes: `POST /api/kertas-kerja/:id/generate`.
- Sinkron wajib: `POST /api/kertas-kerja/:id/sinkron-wajib`.
- Ubah/hapus: `PUT|DELETE /api/kertas-kerja/:id`.
- Tambah massal: `POST /api/kertas-kerja/bulk`.
- Tautkan/lepas dokumen: `POST /api/kertas-kerja/periode/:id/tautan`, kandidat dari `GET /api/kertas-kerja/periode/:id/kandidat`.
- Pohon PKS (kalau diperlukan untuk konteks): `GET /api/pks/tree`, `POST /api/pks/:level`, `PUT|DELETE /api/pks/:level/:id`.

Aturan: tiap aksi tulis menampilkan hasil apa adanya dari peta; 403 peta ditampilkan sebagai "Tidak punya hak (ditolak server arsip)", bukan pesan sukses palsu. Setelah sukses → refresh data terkait, bukan optimistik buta.

## 8. Bank Data native (`js/arsip-bd.js`)

Baca:

- Tahun: `GET /api/bankdata/tahun`; default `bank_data_tahun` terbaru.
- Data: `GET /api/bankdata` sekali, cache di memori modul. Render akordeon:

```
Bidang → OPD → (IKU → IKK) dan Sektoral → Indikator
Indikator → tabel per tahun: [tahun, target, capaian, data, tw1..tw4]
```

- Baris nilai menampilkan sel kosong rapi bila `target`/`capaian` tidak ada (jangan render `undefined`).
- Tampilkan hanya tahun terpilih di tabel utama; tahun lain lewat pemilih.

Tulis (hanya `IS_ADMIN`): CRUD `opd`, `iku`, `ikk`, `sektoral`, `indikator/:level`, `nilai/:level`, `triwulan/:level`, serta tahun (`POST /api/bankdata/tahun`, `DELETE /api/bankdata/tahun/:id`) dan `POST /api/bankdata/sektoral/ensure`.

Aturan: setelah tulis sukses → fetch ulang `GET /api/bankdata` (satu request, tree kecil) lalu render; tidak menyimpan state turunan yang bisa basi.

## 9. Error, loading, kosong

- Loading: skeleton (list/grid/tabel), bukan spinner layar penuh.
- Kosong: pesan spesifik per konteks.
- Error: pesan server apa adanya + tombol **Coba lagi**. Khusus 503 proxy belum siap → tampilkan instruksi singkat (env `PETA_API_URL`/`ARSIP_SESSION_SECRET` belum diisi di server) supaya tidak menyesatkan.
- Tidak ada `alert()` baru; pakai pola notifikasi yang sudah dipakai panel.

## 10. Kompatibilitas tema & WebApp

- Semua warna lewat CSS variable tema (`html.light-theme` / gelap) — tidak ada warna keras baru.
- Full-bleed & lebar panel tidak diubah.
- Tidak ada `window.open` kecuali tombol "Buka" sekunder di jenis berkas yang tidak bisa di-preview.
- Tidak ada dependensi baru; ikon memakai set ikon yang sudah dipakai.

## 11. Pengujian

- `server/arsip.test.js`:
  - whitelist: `GET /api/arsip/p/api/bankdata` → diteruskan; path di luar daftar (mis. `/api/arsip/p/api/users`) → 403; `POST /api/arsip/p/api/bankdata/opd` oleh role non-`MEDIA_ROLES` → 403 (gate absensi); oleh role MEDIA_ROLES → diteruskan.
  - query string: `GET /api/arsip/p/api/kertas-kerja?tahun=2026` → URL tujuan peta memuat `?tahun=2026` (assert pada `fetchImpl` palsu).
  - `/docs/upload-file` tetap handler khusus, dan `GET /api/arsip/p/api/docs` tidak menabrak `/docs/:id`.
- Satu cek kecil untuk builder URL preview (assert murni, tanpa framework): `driveEmbedUrl('https://drive.google.com/file/d/1AbCd/view')` → `https://drive.google.com/file/d/1AbCd/preview`; URL non-Drive → `null`.
- `npx eslint --no-ignore js/arsip.js js/arsip-ui.js js/arsip-kk.js js/arsip-bd.js`.
- Verifikasi manual di browser: beranda tile → Dokumen → folder → list → preview (tanpa pindah tab) → FAB `+` membuka modal unggah; Kertas Kerja & Bank Data memuat data dan tabel nilai.

## 12. Tahapan

1. **Dokumen + beranda + preview + FAB** — `js/arsip-ui.js`, ubah `js/arsip.js`, `index.html`, `css/styles.css`; `server/arsip.js` whitelist; test.
2. **Kertas Kerja** — `js/arsip-kk.js` (baca dulu, lalu tulis).
3. **Bank Data** — `js/arsip-bd.js` (baca dulu, lalu tulis).

Tahap 1 harus jalan penuh (termasuk perbaikan preview & tombol `+`) sebelum tahap 2 dimulai.

## 13. Cache-bust

Naikkan versi aset setelah perubahan: `css/styles.css`, `js/arsip.js` (→ v12), dan tambahkan `js/arsip-ui.js?v=1`, `js/arsip-kk.js?v=1`, `js/arsip-bd.js?v=1`.

## 14. Butuh keputusan saat implementasi

- Path whitelist final harus dicek terhadap `peta-ekonomi/server/index.js` (daftar di §6 adalah draft; verifikasi tiap regex cocok dengan path nyata, khusus `/api/pks/:level` yang level-nya dinamis).
- Apakah `POST /api/docs` (pembuatan dokumen) diperlukan di native, atau cukup `POST /api/docs/upload-file` + endpoint upload yang sudah ada. Dicek di tahap 1.
- Ukuran `sz=` thumbnail Drive untuk daftar (draft: 400 untuk baris, 1000 untuk preview).
