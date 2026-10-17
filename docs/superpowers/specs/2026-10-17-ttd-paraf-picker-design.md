# Penandatangan & Paraf yang Dapat Dipilih (SPT + SPPD) - Desain

Tanggal: 2026-10-17
Status: disetujui untuk direncanakan
Menggantikan sebagian: `2026-10-16-spt-sppd-generator-design.md` §2 (non-goal "tidak mengurus paraf") dan §9–§10
(penandatangan hardcoded di template SPPD).

## 1. Latar & tujuan

Generator SPT/SPPD sudah jalan di produksi (satu `.zip` berisi 1 SPT + N SPPD, satu per pelaksana).
Dua kekurangan yang dilaporkan pengguna:

1. **Penandatangan tidak bisa dipilih untuk semua slot.** Yang bertag (`Kepala`, `Sekretaris`) hanya bisa
   diubah dengan mengetik; nama Kepala Bidang pada SPPD masih **tertulis keras** di template
   (`BERLIAN MAGU WERU,S.Sos` + NIP-nya) dan slot KTU hanya berupa label tanpa nama sama sekali.
2. **Paraf hanya ada di SPT dan hanya berupa teks jabatan bebas.** SPPD tidak punya blok paraf
   (halaman 2-nya kosong dari paraf). Pengguna ingin paraf **dipilih dari daftar pegawai**, 3 baris,
   **semuanya wajib terisi**, dan berlaku untuk **SPT dan SPPD**.

Tujuan: semua slot tanda tangan bisa dipilih dari daftar pegawai, dan paraf menjadi pilihan orang
(nama + jabatan tercetak) dengan minima 3 baris wajib — tanpa mengubah tata letak dokumen yang sudah
disetujui BAPPERIDA.

## 2. Bukan tujuan (non-goal)

- Tidak menyentuh tanda tangan basah, kolom "Berangkat/Tiba/Kembali" I–IV, bagian "Pengikut", atau
  bagian "Catatan Lain-lain".
- Tidak menambah baris paraf ke-4 (keputusan pengguna: tetap 3 baris). Template tetap pakai tiga tag
  `{Paraf1}`, `{Paraf2}`, `{Paraf3}`; menambah baris nanti = urusan form + data, bukan template.
- Tidak mengubah jabatan/judul yang tercetak di atas nama (`KEPALA BAPPERIDA`, `KEPALA BIDANG
  PERENCANAAN, PENGENDALIAN DAN EVALUASI,`, `KTU Bapperida`, `SEKRETARIS BAPPERIDA`). Slot itu
  memang jabatan tetap; yang dipilih adalah **siapa** yang menempatinya.
- Tidak membuat pencarian pegawai (typeahead/modal). Pakai `<select>` native.
- Tidak mengubah alur simpan (`simpanPerjadin`, endpoint, izin role).

## 3. Fakta yang mengikat desain

- **Tag template saat ini.** SPT (18 tag unik): `{Nomor} {Dasar} {#pelaksana}{No}{Nama}{PangkatGol}{NIP}{Jabatan}{/pelaksana} {Untuk} {DitetapkanDi} {TanggalSurat} {KepalaNama}{KepalaPangkat}{KepalaNIP} {Paraf1}{Paraf2}{Paraf3}`.
  SPPD (23 tag unik): `{NomorSPPD} {KpaNama} {Nama} {NIP} {PangkatGolongan} {JabatanInstansi} {TingkatBiaya} {Maksud} {AlatAngkut} {TempatBerangkat} {TempatTujuan} {LamaHari} {TanggalBerangkat} {TanggalKembali} {Instansi} {MataAnggaran} {DitetapkanDi} {TanggalPenetapan} {KepalaNama}{KepalaPangkat}{KepalaNIP} {SekretarisNama}{SekretarisNIP}` — **tanpa tag paraf**.
- **Titik bedah aman.** `BERLIAN MAGU WERU,S.Sos` utuh dalam satu `<w:t xml:space="preserve">`; label
  `KTU Bapperida` juga utuh; NIP keras berbentuk `Nip. 19690619 200903 1 001`. Badan dokumen berakhir
  `…</w:p><w:sectPr>` → titik sisip blok paraf = tepat sebelum `<w:sectPr`.
- **Tabel paraf SPT** (untuk disalin): 3 kolom (`546 | 3277 | 914` dxa), baris header `NO | Paraf Hirarki`,
  3 baris bernomor, font `Bookman Old Style` sz 24.
- **Renderer**: `bastRenderDocxBlob` memakai `docxtemplater` dengan `{ start:'{', end:'}' }`,
  `paragraphLoop: true`, **`linebreaks: true`** → nilai bertanda `\n` menjadi `<w:br/>`. Jadi satu tag
  bisa mencetak dua baris (nama di atas, jabatan di bawah).
- **`pizzip` + `docxtemplater` adalah dependensi node** (dipakai `tests/spt-template-tags.test.mjs`),
  jadi bedah template dilakukan di node dengan PizZip — bukan `Compress-Archive`/zip buatan sendiri.
- **Tes penjaga tag**: `tests/spt-template-tags.test.mjs` memakai `nullGetter` untuk mengumpulkan tag
  template tanpa nilai → begitu tag baru masuk template, tes SPPD GAGAL sampai builder memasoknya.
- **Template ada 3 salinan** yang harus identik: `sppd_template.docx`, `www/sppd_template.docx`,
  `public/sppd_template.docx` (vite menyajikan `public/`, nginx menyajikan salinan di image).
- **Dialog tampil sebelum master selesai.** `bukaModal` memanggil `fillForm(p)` lalu
  `modal.style.display='flex'`, sementara `masterIndex()` (dari `/api/user-list` + `MASTER_PEGAWAI`)
  menyusul lewat `_siapMaster`; submit menunggu lewat `tungguMaster(1500)`. Opsi `<select>` harus
  diisi pada tahap master, bukan saat `fillForm`.
- **Tes wiring modal** mengiris `index.html` dari `id="perjadinModal"` sampai `</form>` pertama dan
  menuntut ≥20 `name="…"`; tombol submit harus tetap berada di dalam `<form>`.
- **Nilai tersimpan yang sudah ada** (`perjadin` di DB) berbentuk `kepala{nama,pangkat,nip}`,
  `sekretaris{nama,nip}`, `paraf[{jabatan}]` — tanpa `bidang`, `ktu`, tanpa `nip` di paraf.

## 4. Keputusan desain (hasil brainstorming)

1. Blok paraf berlaku untuk **SPT dan SPPD**; SPPD mendapat blok paraf baru di template.
2. Penandatangan yang dapat dipilih: **semua slot**, termasuk nama keras Kepala Bidang dan slot KTU.
3. Paraf: **tetap 3 baris, ketiganya wajib terisi** (bukan daftar dinamis).
4. Paraf adalah **orang** (dipilih dari master pegawai), dicetak sebagai `Nama` baris-1 + `Jabatan` baris-2.
5. Pemilih memakai `<select>` native, `value` = NIP, teks opsi = `Nama — Jabatan`.
6. Blok paraf SPPD diletakkan di **akhir dokumen** (halaman 2), meniru letak di SPT.

## 5. Skema data & pemetaan tag

`perjadin` (objek yang sudah disimpan lewat `simpanPerjadin`):

| field | bentuk | keterangan |
|---|---|---|
| `kepala` | `{nama, pangkat, nip}` | ada (SPT + SPPD) |
| `sekretaris` | `{nama, nip}` | ada (SPPD) |
| `bidang` | `{nama, nip}` | **baru** — Kepala Bidang (SPPD halaman 2) |
| `ktu` | `{nama, nip}` | **baru** — KTU Bapperida (SPPD halaman 1) |
| `paraf` | `[{nip, nama, jabatan} × 3]` | diperluas dari `{jabatan}` |

Nilai yang dicetak untuk paraf: `[nama, jabatan].filter(Boolean).join('\n')` (jabatan saja bila nama
belum ada — menjaga data lama tetap tercetak).

Pemetaan tag:

| tag | SPT | SPPD | sumber |
|---|---|---|---|
| `{Paraf1}{Paraf2}{Paraf3}` | ya (sudah ada) | **baru** | `paraf[0..2]` (nama + jabatan) |
| `{BidangNama}` `{BidangNIP}` | – | **baru** | `perjadin.bidang` |
| `{KtuNama}` `{KtuNIP}` | – | **baru** | `perjadin.ktu` |

`personTag` tidak berubah. `merge()` menormalkan ketiga entitas baru dengan pola yang sama
seperti `kepala`/`sekretaris` (sehingga `perjadin` lama tetap sah).

## 6. Bedah template `sppd_template.docx`

Dilakukan oleh skrip sekali-pakai (node + PizZip, ditulis di folder sementara repo lalu dihapus;
tidak wajib menjadi berkas permanen), dengan langkah:

1. Baca `word/document.xml`.
2. Assert setiap needle ditemukan **tepat satu kali** (gagal → batalkan, jangan tulis apa pun):
   `BERLIAN MAGU WERU,S.Sos` → `{BidangNama}`; `Nip. 19690619 200903 1 001` → `NIP. {BidangNIP}`.
3. Sisipkan `{KtuNama}` + `NIP. {KtuNIP}` (font Arial, mengikuti sel sekitarnya) pada bagian bertanda
   `KTU Bapperida`. **Letaknya (paragraf di dalam sel yang sama, atau sel kosong di sebelah label)
   ditentukan saat implementasi**: template memuat `<w:p>` kosong di sel setelah label, sedangkan
   kemungkinan lain adalah menambah paragraf di dalam sel label itu sendiri. Yang mengikat hanya
   hasil akhir: tepat satu tempat, di bawah/di samping label `KTU Bapperida`, dengan nama + NIP.
4. Sisipkan tabel paraf 3 baris (disalin dari tabel SPT, rFonts diganti Arial) tepat sebelum `<w:sectPr>`.
5. Tulis ulang hanya entri `word/document.xml` lewat PizZip; simpan; salin byte-identik ke `www/` dan `public/`.
6. Verifikasi: `tests/spt-template-tags.test.mjs` (tag tanpa nilai + sisa `{Tag}`) dan pemeriksaan
   manual bahwa `<w:sectPr>` tetap elemen terakhir badan dokumen.

## 7. UI & alur

**Nama field (mengikat — dipakai `readForm`/`fillForm` dan tes).** Yang berubah, dengan `value` = NIP:

| field | bentuk | menggantikan |
|---|---|---|
| `kepalaNip` | `<select>` | `kepalaNama` + `kepalaNIP` (teks) |
| `kepalaPangkat` | teks (tetap) | – (master bisa kosong, pangkat perlu bisa disunting) |
| `sekretarisNip` | `<select>` | `sekretarisNama` + `sekretarisNIP` (teks) |
| `bidangNip` | `<select>` | baru |
| `ktuNip` | `<select>` | baru |
| `paraf1`, `paraf2`, `paraf3` | `<select>` | input teks jabatan |

Jumlah `name="…"` di dalam `#perjadinModal` tetap 21 (≥20 yang dituntut tes wiring). Nama lain
(`nomor`, `maksud`, `tanggalBerangkat`, …) tidak berubah.

- Opsi diisi dari `masterIndex()` saat `_siapMaster` selesai (`isiOpsiPegawai(idx)`), teks
  `Nama — Jabatan`, `<option value="">— pilih —</option>` di urutan pertama. Bila master gagal dimuat,
  hanya opsi "— pilih —" yang ada dan nilai tersimpan/default tetap terpakai saat mencetak.
- `fillForm(p)` memilih NIP tersimpan pada select; untuk data lama yang hanya punya nama/jabatan
  (`bidang`/`ktu`/`paraf` tanpa nip) NIP dicari dulu di master: cocok `nip` → cocok `nama` (normalisasi
  huruf besar/spasi) → cocok `jabatan` persis → jika tak ada, select dibiarkan kosong.
- `readForm()` mengubah NIP terpilih menjadi objek lengkap dari `_masterCache` (helper `pegawaiByNip`).
  Field yang tak ketemu di cache **mempertahankan nilai lama** (`|| p.kepala.nama`), bukan menimpanya
  dengan kosong — jadi default `DEFAULT_PERJADIN` tetap berlaku bila master mati.
- `bangunTagsSPT`/`bangunTagsSPPD` mencetak paraf sebagai `paraf[i].nama` + `'\n'` + `paraf[i].jabatan`
  (jabatan saja bila nama kosong).
- `defaultsDariMaster` diperluas: `/^Kepala Bidang/i` → `bidang`, `/^(KTU|Kepala Tata Usaha|Kasubbag)/i` → `ktu`
  (regex kepala/sekretaris yang sudah ada tidak berubah).

## 8. Error handling & anti-regresi

- `FIELD_WAJIB` bertambah tiga entri (`Paraf 1..3`); mekanisme toast + border merah yang sudah ada
  langsung memakainya. Label wajib yang kurang disebut namanya di toast.
- **Anti-regresi nama keras**: `DEFAULT_PERJADIN.bidang` diisi nilai lama
  (`BERLIAN MAGU WERU,S.Sos` / `19690619 200903 1 001`) supaya bila master tidak memuat Kepala Bidang,
  SPPD tetap tercetak seperti hari ini, bukan kosong. `DEFAULT_PERJADIN.ktu` default kosong.
- Tag baru yang tidak dipasok akan **tertangkap tes** SPPD (`nullGetter`), bukan diam-diam kosong.
- Cache-buster `?v=` untuk aset js/css yang berubah dinaikkan di `index.html` dan `www/index.html`.

## 9. Tes

Perluasan `tests/spt-template-tags.test.mjs` + `tests/tugas-spt.test.mjs`:

1. SPPD: tag baru terpasang (sudah otomatis lewat `nullGetter`) dan `{Paraf1}` mencetak nama + jabatan
   dalam dua baris (`<w:br/>`), bukan hanya jabatan.
2. SPT: `{Paraf1}` kini memuat nama pegawai terpilih (assert nilai, bukan sekadar tag terpasang).
3. `defaultsDariMaster`: menemukan `bidang` dari `/^Kepala Bidang/i` dan `ktu` dari `/^KTU/i`; tidak
   menemukan → `null` (lalu default lama dipakai).
4. `validasiPerjadin`: paraf kosong menambah "Paraf 1..3" ke daftar kurang.
5. `readForm`: NIP terpilih menjadi `{nip, nama, jabatan}`; entri paraf lama (`{jabatan}` saja) tetap
   terbaca dan tercetak.
6. Wiring: kedua `index.html` memuat select baru (`kepalaNip`, `sekretarisNip`, `bidangNip`, `ktuNip`,
   `paraf1..3`) dan jumlah `name="…"` di dalam `#perjadinModal` tetap ≥20; `www/` byte-identik untuk
   setiap js/css yang berubah.

## 10. Risiko & catatan

- **Mengubah .docx biner** adalah risiko terbesar. Mitigasi: patch hanya `word/document.xml` lewat
  PizZip (entri lain utuh), assert needle sebelum menulis, dan tiga salinan disalin byte-identik dari
  hasil yang sama.
- `masterIndex()` bisa tidak memuat pejabat yang tepat (nama ganda, jabatan tak seragam) → pengguna
  tetap bisa memilih orang lain dari daftar; teks opsi menampilkan jabatan agar mudah dibedakan.
- Data `perjadin` lama tanpa `bidang`/`ktu` tetap sah: `merge()` menormalkan, dan nilai keras lama
  menjadi default.

## 11. Selesai bila

- SPT dan SPPD mencetak 3 baris paraf berisi nama + jabatan pegawai yang dipilih, dan menolak cetak
  bila salah satu paraf kosong.
- SPPD mencetak nama Kepala Bidang dan KTU sesuai pilihan (bukan `BERLIAN MAGU WERU` yang keras).
- Suite tes hijau, `www/` dan `public/` tersinkron, dan pengguna bisa memilih ketujuh slot dari daftar
  pegawai di dialog perjadin.
