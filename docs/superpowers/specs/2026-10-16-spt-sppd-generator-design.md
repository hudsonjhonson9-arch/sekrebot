# Generator Surat Tugas (SPT) & SPPD dari Penugasan Perjalanan Dinas — Desain

Tanggal: 2026-10-16
Modul: menu **Perjalanan Dinas / Tugas** (`js/tugas_lembur.js`, data `penugasan`)
Status: disetujui, menunggu rencana implementasi

## 1. Latar & tujuan

Menu Perjalanan Dinas sekarang hanya mencatat **penugasan** (admin menugaskan pegawai ke
suatu lokasi + radius, pegawai menyelesaikan dengan bukti foto/koordinat). Surat resminya
— **Surat Perintah Tugas (SPT)** dan **Surat Perjalanan Dinas (SPPD)** — dibuat manual di
luar aplikasi.

Tujuan: dari satu perjalanan dinas (satu **grup** penugasan), admin bisa mengisi detail
perjadin sekali lalu mengunduh **SPT** (memuat semua pelaksana) dan **SPPD** (satu per
pegawai) sebagai `.docx` yang formatnya persis dokumen BAPPERIDA (kop, ttd, tabel paraf
utuh).

Template asli yang jadi acuan:

- SPT: `Salinan Surat Tugas.docx` (SURAT PERINTAH TUGAS, nomor `BP4D.011.7/.../ST/...`).
- SPPD: `8656838432_2026-07-02_2026-07-02_TUGAS.docx` (SURAT PERJALANAN DINAS / SPD,
  termasuk kolom Berangkat–Tiba I–IV).

## 2. Bukan tujuan (non-goal)

- Tidak membuat halaman admin baru. Fitur menempel di menu Tugas/Perjalanan Dinas yang ada.
- Tidak menambah route server untuk generate dokumen. Generate 100% di browser (pola BAST).
- Tidak mengurus tanda tangan basah/paraf: kolom paraf, "Berangkat/Tiba" I–IV, dan ruang
  ttd dibiarkan kosong di dokumen.
- Tidak menyimpan dokumen hasil ke panel Arsip (bisa jadi iterasi lanjut).
- Tidak mengubah alur geolokasi/bukti penugasan yang sudah jalan.

## 3. Fakta yang mengikat desain

- **Pola generate docx sudah ada (BAST)** — pakai apa adanya, jangan bikin mekanisme baru:
  - Library vendored dimuat di `index.html:40-41`: `js/lib/pizzip.min.js`,
    `js/lib/docxtemplater.min.js` → global `window.PizZip`, `window.docxtemplater`.
  - `scripts/build-bast-template.js`: membaca docx asli, **menyulam** `{Tag}` pada run yang
    sama (fungsi `rewriteWhole`/`applyOne`/`patchParagraph`), validasi tiap tag ada
    (`PLACEHOLDERS`), tulis ke `public/` **dan** root.
  - `js/simapo-bast.js:322-337`: `fetch('bast_template.docx')` → `new PizZip(buf)` →
    `new Docxtemplater(zip)` → `doc.render(tags)` → `Blob` → `a.download`.
  - Template BAST ada di root (`bast_template.docx`) + `public/bast_template.docx`.
- **`www/` adalah salinan ter-commit**, dibangun ulang oleh `scripts/setup-capacitor.js`
  (`rm -rf www` lalu salin `index.html`, `css/`, `js/`, `icons/`, dan `bast_template.docx`
  di baris 47). Jadi tiap dokumen template baru **wajib ditambah** ke baris itu, dan tiap
  file `js/` baru harus ada di `www/js/` juga (untuk APK).
- **Data penugasan** (`server/overtime.js`):
  - `GET /penugasan` (baris 8) mengembalikan `SELECT * FROM penugasan`.
  - `POST /penugasan` (baris 9): kalau `id` → `UPDATE penugasan SET status, bukti,
    lat_pengerjaan, lon_pengerjaan, instansi_id`; kalau tidak → `INSERT` dengan kolom
    `user_id, nama, nip, tanggal, lat, lon, keterangan, created_by, created_by_nip, radius,
    instansi_id` — **`nomor_surat` tidak ada di daftar kolom**.
  - Role admin untuk tulis: `ADMIN/SUPERADMIN/KEPALA/SEKRETARIS/KABID/IRBAN`.
  - Pola migrasi inline sudah dipakai di file ini (`CREATE TABLE IF NOT EXISTS rekap_lembur`
    di baris 11-12) → untuk kolom baru pakai `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **Form Penugasan** (`js/tugas_lembur.js:765-830`) sudah mengumpulkan: pegawai (multi),
  `tanggal`, `keterangan` (= maksud), `lat`/`lon` (lokasi), `radius`, `tugasPemberi`, dan
  `tugasNomorSurat` (baris 797) — yang terakhir tadi **dibuang** server (lihat di atas).
- **Master pegawai punya `pangkat` dan `jabatan`** (`js/tugas_lembur.js:913-914`,
  `js/simapo-bast.js:139`); ada util skor hierarki `getJabatanScore` (`js/helpers.js:262`)
  dan `getPangkatScore` (`js/helpers.js:292`). Kepala Badan dideteksi dengan
  `/^Kepala Badan/i` (`js/simapo-bast.js:453`).
- **Daftar penugasan milik admin** dirender di `renderMonitoringTasks`
  (`js/tugas_lembur.js:2014`, kartu dibangun di `:2035-2081`) — ini tempat tombolnya.
- **`npm test` menyebut file tes satu per satu** (`package.json` → `scripts.test`) → tes
  baru harus ditambahkan ke daftar itu, tidak otomatis ke-glob.

## 4. Keputusan desain (hasil brainstorming)

1. **Tempat**: di menu Tugas/Perjalanan Dinas (kartu Monitoring Perjalanan Dinas).
2. **Detail perjadin**: diisi lewat **dialog isian** saat klik "Buat SPT + SPPD", lalu
   **disimpan ke baris penugasan** (satu kolom `perjadin JSONB`) supaya bisa generate ulang
   tanpa isi lagi.
3. **Pengelompokan**: **otomatis, tanpa kolom pengelompokan baru**. Baris dengan `tanggal` +
   `keterangan` + `created_by_nip` sama = satu perjalanan dinas. (Kolom `perjadin` di poin 2
   tetap ditambah — itu untuk menyimpan detail, bukan untuk mengelompokkan.)
4. **Cakupan v1**: **SPT + SPPD sekaligus** dalam satu aksi.
5. **Mekanisme**: client-side, meniru BAST (pendekatan A). Tanpa dependency dan route baru.

## 5. Arsitektur & file

| File | Jenis | Isi |
|---|---|---|
| `scripts/build-spt-template.js` | baru | Sulam `{Tag}` ke `Salinan Surat Tugas.docx` → `public/spt_template.docx` + root |
| `scripts/build-sppd-template.js` | baru | Sulam `{Tag}` ke `8656838432_..._TUGAS.docx` → `public/sppd_template.docx` + root |
| `js/tugas-spt.js` | baru | `window.TugasSPT = { grup(list), bukaModal(grup), generate(grup, perjadin) }`, tag builder + render docx |
| `js/tugas_lembur.js` | ubah | `renderMonitoringTasks` dikelompokkan + tombol per grup; panggil `TugasSPT` |
| `index.html` | ubah | modal `#perjadinModal`; `<script src="js/tugas-spt.js?v=...">` |
| `www/index.html`, `www/js/tugas-spt.js`, `www/*_template.docx` | ubah | salinan untuk APK |
| `server/overtime.js` | ubah | `ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS perjadin JSONB`; `POST` terima `perjadin`; simpan `nomor_surat` |
| `scripts/setup-capacitor.js` | ubah | baris 47: ikut salin `spt_template.docx` & `sppd_template.docx` |
| `css/styles.css` | ubah | gaya modal isian perjadin + kartu grup |
| `tests/tugas-spt.test.mjs` | baru | tes logika murni + cek placeholder template |
| `package.json` | ubah | tambah `tests/tugas-spt.test.mjs` ke `scripts.test` |

Tidak ada dependency baru (`pizzip`, `docxtemplater` sudah ada di `devDependencies`).

## 6. Skema data & API

Kolom baru (dijalankan inline di route, idempoten):

```sql
ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS perjadin JSONB;
```

`POST /penugasan` (saat `id` ada) diperluas menjadi:

```sql
UPDATE penugasan
   SET status=$1, bukti=$2, lat_pengerjaan=$3, lon_pengerjaan=$4,
       instansi_id=$5, perjadin=$6, nomor_surat=$7
 WHERE id=$8 RETURNING *
```

`ALTER TABLE ... ADD COLUMN IF NOT EXISTS nomor_surat TEXT` ditambahkan sekalian (perbaikan
bug: field di form tidak pernah tersimpan). INSERT baru juga menyertakan `nomor_surat`, diisi
dari field form `tugasNomorSurat` (`js/tugas_lembur.js:797`).

Bentuk `perjadin` (JSONB):

```json
{
  "nomorSPT": "BP4D.011.7/69/53.12/ST/01/2026",
  "nomorSPPD": "42 /SPPD/202566 / SPPD / 2024",
  "dasar": ["DPA Bapperida Kabupaten Sumba Barat TA 2026"],
  "alatAngkut": "Pesawat",
  "tempatBerangkat": "Waikabubak",
  "tempatTujuan": "Kupang",
  "lamaHari": 4,
  "tanggalBerangkat": "2026-06-29",
  "tanggalKembali": "2026-07-02",
  "tingkatBiaya": "C",
  "pengikut": [{ "nama": "", "tanggalLahir": "", "keterangan": "" }],
  "instansi": "Bapperida Kabupaten Sumba Barat",
  "mataAnggaran": "DPA Bapperida Kabupaten Sumba Barat TA 2026",
  "ditetapkanDi": "Waikabubak",
  "tanggalPenetapan": "2026-06-25",
  "kepala": { "nama": "Charles Hermana Weru,S.Sos", "pangkat": "Pembina Utama Muda – IV/c", "nip": "19721102 200112 1 001" },
  "sekretaris": { "nama": "Imanuel Moses Kalegotana, ST.,M.Si", "nip": "19800315 200501 1 011" },
  "ktu": { "nama": "", "jabatan": "KTU Bapperida" },
  "paraf": [{ "jabatan": "Sekretaris BAPPERIDA" }, { "jabatan": "Kepala Bidang Ekonomi" }, { "jabatan": "KTU Bapperida" }]
}
```

Nilai default diisi saat dialog dibuka pertama kali: `dasar`/`mataAnggaran` =
`DPA Bapperida Kabupaten Sumba Barat TA <tahun(tanggal)>`, `tempatBerangkat` &
`ditetapkanDi` = `Waikabubak`, `tingkatBiaya` = `C`, `instansi` = `Bapperida Kabupaten Sumba
Barat`, `kepala` = pegawai berjabatan `/^Kepala Badan/i` (nama/pangkat/nip dari master).

## 7. Pengelompokan (otomatis)

```
kunciGrup(p) = `${p.tanggal}|${p.keterangan}|${p.created_by_nip}`   // string apa adanya
```

Baris sekunci = satu perjalanan dinas. `perjadin` disimpan ke **semua baris** sekunci
(satu nilai yang sama) sehingga urutan generate apa pun hasilnya konsisten. Grup di-render
satu kartu header (maksud + tanggal + pemberi + jumlah pelaksana) dengan tombol tunggal.

## 8. Alur (data flow)

1. `renderMonitoringTasks` mengelompokkan baris → render kartu grup + tombol
   **"Buat SPT + SPPD"**.
2. Klik tombol → `TugasSPT.bukaModal(grup)`:
   - Ambil detail pegawai per `nip` dari master (`pangkat`, `jabatan`).
   - Prefill dari `perjadin` baris pertama grup; kalau kosong pakai default (§6).
3. Admin mengisi/menyunting → **Simpan & Unduh**.
4. Simpan: `POST /penugasan` untuk setiap baris grup dengan `perjadin` yang sama (admin only).
5. Generate:
   - `bangunTagsSPT(grup, perjadin, pegawai)` → render `spt_template.docx` → unduh
     `<NomorSPT>.docx`.
   - Untuk tiap pelaksana: `bangunTagsSPPD(peg, grup, perjadin)` → render
     `sppd_template.docx` → unduh `<Nama>-SPPD.docx`.
6. Toast hasil (pola `showToast`).

## 9. Template & pemetaan tag

Tag SPT (`spt_template.docx`):

| Tag | Sumber |
|---|---|
| `{Nomor}` | `perjadin.nomorSPT` |
| `{#dasar}{.}{/dasar}` | `perjadin.dasar[]` |
| `{#pelaksana}{No}{Nama}{PangkatGol}{NIP}{Jabatan}{/pelaksana}` | master pegawai per baris grup |
| `{Untuk}` | disusun: `"<keterangan> di <tempatTujuan>"`, lalu baris ke-2 `"<tanggalBerangkat> s.d. <tanggalKembali>"` (kalau ada) |
| `{DitetapkanDi}`, `{TanggalSurat}` | `perjadin.ditetapkanDi`, `perjadin.tanggalPenetapan` |
| `{KepalaNama}`, `{KepalaPangkat}`, `{KepalaNIP}` | `perjadin.kepala` |
| `{#paraf}{No}{Jabatan}{/paraf}` | `perjadin.paraf[]` (default §6: Sekretaris, Kabid Ekonomi, KTU) |

Tag SPPD (`sppd_template.docx`):

| Tag | Sumber |
|---|---|
| `{NomorSPPD}` | `perjadin.nomorSPPD` |
| `{KpaNama}` | `perjadin.kepala.nama` |
| `{Nama}`, `{NIP}` | master pegawai (pelaksana) |
| `{PangkatGolongan}`, `{JabatanInstansi}`, `{TingkatBiaya}` | master pegawai + `perjadin.tingkatBiaya` |
| `{Maksud}` | `penugasan.keterangan` |
| `{AlatAngkut}` | `perjadin.alatAngkut` |
| `{TempatBerangkat}`, `{TempatTujuan}` | `perjadin.*` |
| `{LamaHari}`, `{TanggalBerangkat}`, `{TanggalKembali}` | `perjadin.*` (`LamaHari` → "4 (Empat) Hari") |
| `{#pengikut}{No}{Nama}{TanggalLahir}{Keterangan}{/pengikut}` | `perjadin.pengikut[]` |
| `{Instansi}`, `{MataAnggaran}` | `perjadin.*` |
| `{DitetapkanDi}`, `{TanggalPenetapan}` | `perjadin.*` |
| `{KepalaNama}`, `{KepalaPangkat}`, `{KepalaNIP}` | `perjadin.kepala` |
| `{SekretarisNama}`, `{SekretarisNIP}`, `{KtuNama}` | `perjadin.sekretaris`, `perjadin.ktu` |

Kolom **Berangkat/Tiba I–IV**, ruang ttd basah, dan tanggal jabatan tangan **tidak** diisi.
Struktur run persis (apakah "Kepada" berupa tabel baris-per-pelaksana atau list bernomor)
dipastikan saat menulis build script — script mencetak teks tiap paragraf dulu (sama seperti
`build-bast-template.js`), lalu menyulam tag pada run yang tepat.

## 10. UI

- Kartu grup (header): maksud (`keterangan`), tanggal, pemberi, daftar nama pelaksana
  (ringkas), status agregat, tombol **"Buat SPT + SPPD"**.
- Modal `#perjadinModal`: field teks/tanggal/angka + tabel pengikut (tambah/hapus baris) +
  blok penandatangan (Kepala/Sekretaris/KTU) yang bisa diedit. Pakai kelas form yang sudah
  ada (`form-group`, `form-label`, `form-input`) supaya konsisten tema.
- Tombol hanya tampil untuk role admin (pakai `checkTugasLemburAccess`/`admin` yang sudah
  ada di menu ini).

## 11. Error handling

- `window.PizZip`/`window.docxtemplater` tidak ada → `showToast('Library docxtemplater belum
  dimuat. Muat ulang aplikasi.', 'error')` (pola `js/simapo-bast.js:317-319`).
- Template gagal di-`fetch` (404/blob) → toast error, jangan unduh file kosong.
- Validasi sebelum generate: maksud, tempat tujuan, tanggal berangkat/kembali wajib; kalau
  kosong → tandai field + batalkan.
- `doc.render` melempar (tag tidak cocok) → `try/catch` → toast + `console.error`, tanpa
  menutup modal.
- Gagal simpan `perjadin` ke server → tetap boleh unduh, tapi beri peringatan "detail tidak
  tersimpan".

## 12. Tes

`tests/tugas-spt.test.mjs` (node `--test`, tanpa framework):

1. `kunciGrup()` — baris dengan tanggal/keterangan/pemberi sama → grup sama; beda → beda.
2. `bangunTagsSPT()` / `bangunTagsSPPD()` — pasangan penugasan + perjadin → tag sesuai
   (termasuk `LamaHari` terbilang, dan daftar pelaksana untuk SPT).
3. `kelompokkan()` — urutan & jumlah anggota grup benar.
4. **Cek template**: buka `public/spt_template.docx` & `public/sppd_template.docx` via
   `pizzip`, baca `word/document.xml`, pastikan **setiap** tag yang dipakai builder benar-
   benar ada (gagal kalau build script melewatkan satu tag).
5. Tambahkan file ini ke `scripts.test` di `package.json`.

## 13. Risiko & catatan implementasi

- **`www/` gampang terlupa**: tanpa menyalin `js/tugas-spt.js` + `*_template.docx` + tag
  `<script>` di `www/index.html`, fitur mati di APK. Masuk checklist.
- **Docxtemplater & tag terbelah run**: tag harus utuh dalam satu run; itu sebabnya memakai
  `rewriteWhole` (ganti seluruh isi paragraf) seperti BAST, bukan menyisipkan di tengah.
- **Tanggal Indonesia**: format "29 Juni 2026" dan terbilang hari dibutuhkan builder; util
  serupa sudah ada di `js/simapo-bast.js` (`bastHariTanggal`, `bastTerbilang`) — boleh
  disalin/diadaptasi ke `js/tugas-spt.js` (file terpisah, tidak mengimpor BAST).
- **Nomor surat**: diisi manual di dialog (tidak ada generator nomor). Format contoh
  disediakan sebagai placeholder/prefill dari template.
