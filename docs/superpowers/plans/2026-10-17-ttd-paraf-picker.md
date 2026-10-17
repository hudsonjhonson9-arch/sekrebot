# Rencana: Pemilih Penandatangan + Paraf Pegawai (SPT & SPPD)

Spec: `docs/superpowers/specs/2026-10-17-ttd-paraf-picker-design.md`
Repo: `D:\Code\absensi_refactored_v6` · branch kerja: `master` (push: `git push origin master:main`)

## Tujuan

Semua slot tanda tangan bisa dipilih dari daftar pegawai (termasuk nama keras Kepala Bidang dan
label KTU di SPPD), dan paraf menjadi **pilihan pegawai** (3 baris, semuanya wajib), dicetak
`Nama` baris-1 + `Jabatan` baris-2. Berlaku untuk SPT **dan** SPPD.

## Bukan tujuan

- Paraf dinamis (boleh <3 / >3 baris) — user minta tetap 3, wajib.
- Memindahkan jabatan keras "KEPALA BIDANG PERENCANAAN, PENGENDALIAN DAN EVALUASI," di SPPD.
- Menyentuh `spt_template.docx` (tag paraf & ttd-nya sudah benar).

## Fakta terverifikasi (jangan diulang investigasinya)

- `sppd_template.docx` = 23 tag, **tanpa** tag paraf. Nama keras `BERLIAN MAGU WERU,S.Sos`
  (idx 113761) + `Nip. 19690619 200903 1 001` (idx 114443) ada di **satu sel** bersama teks
  jabatan `KEPALA BIDANG PERENCANAAN, PENGENDALIAN DAN EVALUASI,` (baris 4 tabel besar). Nama &
  NIP masing-masing utuh dalam satu `<w:t xml:space="preserve">`.
- Tabel KTU = tabel kecil **terpisah** (`<w:tbl style="Table3">`, 2 kolom 4676+1415 dxa, 1 baris):
  sel-1 teks `KTU Bapperida` (Arial sz24), sel-2 **kosong** → itulah slot nama KTU. Sel-2 isinya
  `<w:pPr><w:rPr><w:rFonts w:ascii="Arial" .../></w:rPr></w:pPr><w:r ...><w:rPr><w:rtl w:val="0"/></w:rPr></w:r>`.
- Tabel paraf SPT (idx 53622..61238, 7616 char, `<w:tblStyle w:val="TableGrid">`, grid
  586/3277/914, tcW 546/3277/914): header `NO | Paraf Hirarki` (baris 2, gridSpan), baris 5-7 =
  `1. | {Paraf1} |` dst. **Isinya hanya tag `{Paraf1}{Paraf2}{Paraf3}`** → aman disalin apa adanya,
  cukup ganti font `Bookman Old Style` → `Arial`.
- Badan dokumen berakhir `…</w:p>` lalu `<w:sectPr` → sisip blok paraf sebelum `<w:sectPr`.
- `bastRenderDocxBlob` (js/simapo-bast.js) memakai `docxtemplater` dengan `linebreaks: true` →
  `\n` jadi `<w:br/>` (2 baris dalam satu paragraf).
- `pizzip` + `docxtemplater` sudah dependensi node (dipakai `tests/spt-template-tags.test.mjs`).
- Template/js ada salinan wajib: template di `www/` **dan** `public/`; js di `www/js/`
  (dijaga tes byte-identity); html di `www/index.html`.
- Titik kode `js/tugas-spt.js` (437 baris): `DEFAULT_PERJADIN` 67-86 (paraf di :84), `merge` 87-94
  (`out.paraf` :91), `cariPejabat` 96, `defaultsDariMaster` 106, `FIELD_WAJIB` 116,
  `validasiPerjadin` 120, `bangunTagsSPT` 143 (Paraf :156-158), `bangunTagsSPPD` 162,
  `_masterCache` 194 / `masterIndex` 196-222, `generate` 236, `_siapMaster` 282,
  `setField` 294, `readForm` 299 (paraf :325-328), `fillForm` 333 (:347, :354-356),
  `bukaModal` 359 (`punya`/`_siapMaster` :376), `initPerjadinModal` 392.
- Markup modal: `index.html:3694-3735` (`#perjadinModal`; grid ttd/paraf di :3719-3729),
  `www/index.html` versi sama pada ~:3572. Field ttd sekarang: `kepalaNama`, `kepalaPangkat`,
  `kepalaNIP`, `sekretarisNama`, `sekretarisNIP`, `paraf1..3` (teks).

## Aturan global (berlaku di SETIAP task)

1. **Backup dulu** sebelum memutasi apa pun:
   `Copy-Item` berkas target ke `C:\Users\Agil\AppData\Local\Temp\opencode\bak-ttd-paraf\`.
   Jangan pernah `git checkout -- <file>`.
2. **Encoding**: JANGAN `Set-Content` untuk `.html/.js/.css` (PS 5.1 menambah BOM + merusak
   karakter `–`/`…`). Untuk edit kecil pakai tool `edit`; untuk tulis penuh pakai tool `write`.
3. **Mirror wajib dalam commit yang sama**:
   - `js/tugas-spt.js` → `Copy-Item` ke `www/js/tugas-spt.js` (tes byte-identity gagal bila lupa).
   - `index.html` → terapkan perubahan identik ke `www/index.html`.
   - `sppd_template.docx` → salin ke `www/` **dan** `public/`.
4. **Commit per task**, prefix: `feat(spt):` / `test(spt):` / `docs(spt):`.
   Jangan commit: `Salinan Surat Tugas.docx`, `8656838432_*.docx`, `aset.db`, `tmp_*`.
5. Sebelum tiap commit: `npm test` hijau + catat baris ledger di `.superpowers/sdd/progress.md`.
6. Bila `npm test` memunculkan `[SPT] simpan perjadin gagal: ReferenceError: apiPost is not defined`
   di konsol → itu efek try/catch yang disengaja, bukan kegagalan.

## Definisi selesai

`npm test` hijau; SPT & SPPD hasil render tidak menyisakan satu pun `{tag}`; SPPD memuat nama
Kepala Bidang, NIP-nya, nama+NIP KTU, dan tabel paraf 3 baris; 3 salinan template identik;
mirror js/html identik; cache-buster naik; ledger diperbarui; push ke `main` + user diminta
Redeploy Coolify.

---

## Task 1 — Model data & tag: paraf jadi orang, bidang+ktu baru

**Files**: `js/tugas-spt.js`, `www/js/tugas-spt.js` (mirror), `tests/tugas-spt.test.mjs`.

### 1a. Tes dulu (harus GAGAL sebelum 1b)

Tambahkan/ubah di `tests/tugas-spt.test.mjs`:

```js
test('defaultsDariMaster: Kepala Bidang & KTU ikut dideteksi', () => {
  const idx = {
    '111': { nip: '111', nama: 'Kepala', pangkat: 'IV/c', jabatan: 'Kepala Badan' },
    '112': { nip: '112', nama: 'Sek', jabatan: 'Sekretaris' },
    '113': { nip: '113', nama: 'Kabid', jabatan: 'Kepala Bidang Ekonomi' },
    '114': { nip: '114', nama: 'Ktu', jabatan: 'KTU Bapperida' }
  };
  const d = T.defaultsDariMaster(idx);
  assert.deepEqual(d.bidang, { nama: 'Kabid', nip: '113' });
  assert.deepEqual(d.ktu, { nama: 'Ktu', nip: '114' });
  assert.deepEqual(T.defaultsDariMaster({ '111': { jabatan: 'Staf' } }),
    { kepala: null, sekretaris: null, bidang: null, ktu: null });
  assert.deepEqual(T.defaultsDariMaster(null),
    { kepala: null, sekretaris: null, bidang: null, ktu: null });
});

test('validasiPerjadin: paraf kosong ditolak satu per satu', () => {
  const dasar = { maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' };
  // default paraf terisi jabatan -> tetap lolos (perilaku lama tidak berubah)
  assert.deepEqual(T.validasiPerjadin(dasar), []);
  assert.deepEqual(
    T.validasiPerjadin(Object.assign({}, dasar, {
      paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: '' }, { jabatan: 'KTU BAPPERIDA' }]
    })),
    ['Paraf 2']
  );
  assert.deepEqual(
    T.validasiPerjadin(Object.assign({}, dasar, { paraf: [{ nip: '1', nama: 'A', jabatan: 'X' }, {}, {}] })),
    ['Paraf 2', 'Paraf 3']
  );
});

test('bangunTagsSPT: paraf cetak nama + jabatan dua baris', () => {
  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Rakor', nip: '111', nama: 'A' }] };
  const t = T.bangunTagsSPT(grup, {
    tempatTujuan: 'Waingapu',
    paraf: [
      { nip: '901', nama: 'Sek Uji', jabatan: 'Sekretaris' },
      { nip: '', nama: '', jabatan: 'Kepala Bidang Ekonomi' },   // legacy: jabatan saja
      { nip: '903', nama: 'Ktu Uji', jabatan: 'KTU' }
    ]
  }, {});
  assert.equal(t.Paraf1, 'Sek Uji\nSekretaris');
  assert.equal(t.Paraf2, 'Kepala Bidang Ekonomi');
  assert.equal(t.Paraf3, 'Ktu Uji\nKTU');
});

test('bangunTagsSPPD: Bidang & KTU masuk tag, paraf ikut', () => {
  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Fasilitasi', nip: '111', nama: 'A' }] };
  const t = T.bangunTagsSPPD({ nip: '111', nama: 'A' }, grup,
    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-07-02', tempatTujuan: 'Kupang',
      bidang: { nama: 'Kabid Uji', nip: '902' }, ktu: { nama: 'Ktu Uji', nip: '903' },
      paraf: [{ nip: '901', nama: 'Sek Uji', jabatan: 'Sekretaris' }] }, {});
  assert.equal(t.BidangNama, 'Kabid Uji');
  assert.equal(t.BidangNIP, '902');
  assert.equal(t.KtuNama, 'Ktu Uji');
  assert.equal(t.KtuNIP, '903');
  assert.equal(t.Paraf1, 'Sek Uji\nSekretaris');
});

test('DEFAULT_PERJADIN: bidang = nama keras template lama (anti-regresi SPPD)', () => {
  const t = T.bangunTagsSPPD({ nip: '111', nama: 'A' }, { items: [{ nip: '111', nama: 'A', tanggal: '2026-06-29' }] },
    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-06-29' }, {});
  assert.equal(t.BidangNama, 'BERLIAN MAGU WERU,S.Sos', 'default harus mengisi nama lama');
  assert.equal(t.BidangNIP, '19690619 200903 1 001');
});
```

Ubah 2 assertion lama di `test('defaultsDariMaster: Kepala Badan & Sekretaris…')` supaya memakai
`bidang`/`ktu` di hasil `deepEqual` (baris 246-247).

Verifikasi GAGAL: `npm test` → tes baru merah (bidang/ktu belum ada).

### 1b. Implementasi `js/tugas-spt.js`

1. `DEFAULT_PERJADIN` (:67-86): setelah baris `sekretaris: {...}` sisipkan

```js
    // ponytail: nama keras template SPPD dipakai sebagai default -> SPPD tetap terisi walau master kosong.
    bidang: { nama: 'BERLIAN MAGU WERU,S.Sos', nip: '19690619 200903 1 001' },
    ktu: { nama: '', nip: '' },
```

dan ganti baris :84 jadi

```js
    paraf: [
      { nip: '', nama: '', jabatan: 'Sekretaris BAPPERIDA' },
      { nip: '', nama: '', jabatan: 'Kepala Bidang Ekonomi' },
      { nip: '', nama: '', jabatan: 'KTU BAPPERIDA' }
    ]
```

2. `merge` (:87-94): tambah `bidang`/`ktu` + normalisasi paraf (dukung bentuk lama `{jabatan}`):

```js
    out.bidang = Object.assign({}, DEFAULT_PERJADIN.bidang, (p && p.bidang) || {});
    out.ktu = Object.assign({}, DEFAULT_PERJADIN.ktu, (p && p.ktu) || {});
    const pf = (p && Array.isArray(p.paraf) && p.paraf.length) ? p.paraf : DEFAULT_PERJADIN.paraf;
    out.paraf = pf.map(e => { const x = e || {}; return { nip: x.nip || '', nama: x.nama || '', jabatan: x.jabatan || '' }; });
```
(ganti baris :91 yang lama).

3. Helper baru tepat sebelum `personTag` (:125):

```js
  // Satu baris bila cuma jabatan (perilaku lama), dua baris bila ada nama.
  function parafTeks(e) { const x = e || {}; return [x.nama, x.jabatan].filter(Boolean).join('\n'); }
```

4. `defaultsDariMaster` (:106-114): tambah deteksi bidang & KTU dan kembalikan 4 kunci
   (selalu keempat kunci, `null` bila tak ketemu):

```js
    const b = cariPejabat(masterIndex, /^Kepala Bidang/i);
    const t = cariPejabat(masterIndex, /^(KTU|Kepala Tata Usaha|Kasubbag Tata Usaha)/i);
    return {
      kepala: k ? { nama: k.nama || '', pangkat: k.pangkat || '', nip: k.nip || '' } : null,
      sekretaris: s ? { nama: s.nama || '', nip: s.nip || '' } : null,
      bidang: b ? { nama: b.nama || '', nip: b.nip || '' } : null,
      ktu: t ? { nama: t.nama || '', nip: t.nip || '' } : null
    };
```
(pertahankan bentuk pembuatan `kepala`/`sekretaris` yang sudah ada; `masterIndex` null → keempat `null`).

5. `validasiPerjadin` (:116-123):

```js
  // Paraf berbentuk array -> diperiksa terpisah; ketiganya wajib (permintaan user minimal 3).
  function parafKurang(p) {
    const kurang = [];
    for (let i = 0; i < 3; i++) {
      const e = (p.paraf || [])[i] || {};
      if (!String(e.nip || '').trim() && !String(e.jabatan || '').trim() && !String(e.nama || '').trim()) kurang.push('Paraf ' + (i + 1));
    }
    return kurang;
  }

  function validasiPerjadin(p) {
    const q = merge(p);
    return FIELD_WAJIB.filter(f => !String(q[f[0]] || '').trim()).map(f => f[1]).concat(parafKurang(q));
  }
```
(`FIELD_WAJIB` tidak berubah.)

6. `bangunTagsSPT` :156-158 →

```js
      Paraf1: parafTeks(p.paraf[0]),
      Paraf2: parafTeks(p.paraf[1]),
      Paraf3: parafTeks(p.paraf[2])
```

7. `bangunTagsSPPD` (:162-192): tambah di objek tag (di samping `SekretarisNama/NIP`):

```js
      BidangNama: (p.bidang || {}).nama || '',
      BidangNIP: (p.bidang || {}).nip || '',
      KtuNama: (p.ktu || {}).nama || '',
      KtuNIP: (p.ktu || {}).nip || '',
      Paraf1: parafTeks(p.paraf[0]),
      Paraf2: parafTeks(p.paraf[1]),
      Paraf3: parafTeks(p.paraf[2])
```

### 1c. Mirror + verifikasi

```
Copy-Item js\tugas-spt.js www\js\tugas-spt.js -Force
npm test
```
Hijau. (Template SPPD belum punya tag baru — `bangunTagsSPPD` boleh mengirim tag ekstra; tes
template hanya menuntut arah sebaliknya.)

### 1d. Commit
`feat(spt): paraf jadi pilihan pegawai (nama+jabatan), tambah data bidang & KTU` + ledger.

---

## Task 2 — Bedah `sppd_template.docx` (tag baru + blok paraf)

**Files**: `scripts/patch-sppd-template.mjs` (baru, disimpan sebagai jejak bedah),
`sppd_template.docx` + `www/` + `public/` (biner), `tests/spt-template-tags.test.mjs`.

### 2a. Tes dulu

Tambah di `tests/spt-template-tags.test.mjs`:

```js
test('sppd_template: tag ttd/paraf baru ada, nama keras hilang, 3 salinan identik', () => {
  const ROOT = path.resolve(import.meta.dirname, '..');
  const berkas = ['sppd_template.docx', 'www/sppd_template.docx', 'public/sppd_template.docx'];
  const isi = berkas.map(b => fs.readFileSync(path.join(ROOT, b)));
  assert.ok(isi[0].equals(isi[1]) && isi[0].equals(isi[2]), 'tiga salinan sppd_template.docx harus identik');
  const xml = new PizZip(isi[0]).file('word/document.xml').asText();
  for (const tag of ['{BidangNama}', '{BidangNIP}', '{KtuNama}', '{KtuNIP}', '{Paraf1}', '{Paraf2}', '{Paraf3}'])
    assert.ok(xml.includes(tag), 'tag hilang: ' + tag);
  assert.ok(!xml.includes('BERLIAN MAGU WERU'), 'nama keras masih ada');
  assert.ok(!xml.includes('Nip. 19690619'), 'NIP keras masih ada');
  const paraf = xml.slice(xml.lastIndexOf('<w:tbl>', xml.indexOf('{Paraf1}')), xml.indexOf('</w:tbl>', xml.indexOf('{Paraf1}')) + 8);
  assert.ok(paraf.includes('<w:tblStyle w:val="TableGrid"'), 'tabel paraf (TableGrid) tidak tersalin');
  assert.ok(!/Bookman Old Style/.test(paraf), 'font tabel paraf harus Arial');
  assert.ok(xml.indexOf('{Paraf1}') < xml.lastIndexOf('<w:sectPr'), 'blok paraf harus sebelum <w:sectPr>');
});
```

### 2b. Skrip bedah `scripts/patch-sppd-template.mjs`

```js
// Bedah sekali-jalan sppd_template.docx: tag nama keras -> tag, sel KTU kosong -> {KtuNama}/{KtuNIP},
// tabel paraf SPT disalin (font Arial) sebelum <w:sectPr>. Idempoten: lari kedua kali keluar 0.
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';

const ROOT = path.resolve(import.meta.dirname, '..');
const SALINAN = ['sppd_template.docx', 'www/sppd_template.docx', 'public/sppd_template.docx'];

const baca = f => new PizZip(fs.readFileSync(path.join(ROOT, f)));

function tabelParafSPT(xmlSPT) {
  const i = xmlSPT.indexOf('{Paraf1}');
  if (i < 0) throw new Error('{Paraf1} tidak ada di spt_template.docx');
  const mulai = xmlSPT.lastIndexOf('<w:tbl>', i);
  let depth = 0, j = mulai;
  while (j < xmlSPT.length) {
    const buka = xmlSPT.indexOf('<w:tbl>', j), tutup = xmlSPT.indexOf('</w:tbl>', j);
    if (tutup < 0) throw new Error('</w:tbl> tidak seimbang');
    if (buka >= 0 && buka < tutup) { depth++; j = buka + 7; }
    else { depth--; j = tutup + 8; if (!depth) return xmlSPT.slice(mulai, j); }
  }
  throw new Error('tabel paraf tidak tertutup');
}

function bedah() {
  const spt = baca('spt_template.docx').file('word/document.xml').asText();
  const parafTbl = tabelParafSPT(spt).replace(/<w:ascii="Bookman Old Style"/g, '<w:ascii="Arial"')
    .replace(/<w:hAnsi="Bookman Old Style"/g, '<w:hAnsi="Arial"').replace(/<w:cs="Bookman Old Style"/g, '<w:cs="Arial"')
    .replace(/<w:eastAsia="Bookman Old Style"/g, '<w:eastAsia="Arial"');

  const zip = baca('sppd_template.docx');
  let xml = zip.file('word/document.xml').asText();

  const sudah = xml.includes('{BidangNama}') && xml.includes('{KtuNama}') && xml.includes('{Paraf1}');
  if (sudah) { console.log('sudah dipatch, tidak ada yang dikerjakan'); return null; }

  const ganti = (dari, ke) => {
    const n = xml.split(dari).length - 1;
    if (n !== 1) throw new Error(`needle ${JSON.stringify(dari)} muncul ${n}× (harus 1)`);
    xml = xml.replace(dari, ke);
  };
  ganti('BERLIAN MAGU WERU,S.Sos', '{BidangNama}');
  ganti('Nip. 19690619 200903 1 001', 'NIP. {BidangNIP}');

  // Sel KTU (tabel Table3, 2 kolom): sel-2 kosong -> {KtuNama} + paragraf NIP. {KtuNIP}
  const ktu = xml.indexOf('KTU Bapperida');
  if (ktu < 0) throw new Error('label KTU Bapperida tidak ditemukan');
  const tbl = xml.slice(xml.lastIndexOf('<w:tbl>', ktu), xml.indexOf('</w:tbl>', ktu) + 8);
  const tc2 = tbl.split('<w:tc>')[2];
  if (!tc2) throw new Error('sel nama KTU tidak ditemukan');
  const kosong = /<w:r [^>]*><w:rPr><w:rtl w:val="0"\/><\/w:rPr><\/w:r>/;
  if ((tc2.match(kosong) || []).length !== 1) throw new Error('run kosong sel KTU tidak unik');
  const rPr = '<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  const isi = `<w:r>${rPr}<w:t xml:space="preserve">{KtuNama}</w:t></w:r>`
    + `<w:p><w:pPr>${rPr}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">NIP. {KtuNIP}</w:t></w:r></w:p>`;
  const tcBaru = tc2.replace(kosong, isi);
  xml = xml.replace(tc2, tcBaru);   // tc2 unik (berisi id paragraf 00000080)

  // Blok paraf di akhir dokumen (tanpa page-break; Word mengalirkan sendiri)
  const sect = xml.lastIndexOf('<w:sectPr');
  if (sect < 0) throw new Error('<w:sectPr> tidak ditemukan');
  const judul = '<w:p><w:pPr><w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>'
    + '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/></w:rPr>'
    + '<w:t xml:space="preserve">Paraf:</w:t></w:r></w:p>';
  xml = xml.slice(0, sect) + judul + parafTbl + xml.slice(sect);

  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const hasil = bedah();
if (hasil) for (const f of SALINAN) { fs.writeFileSync(path.join(ROOT, f), hasil); console.log('ditulis:', f); }
```

### 2c. Jalankan + verifikasi

```
New-Item -ItemType Directory -Force -Path "$env:TEMP\opencode\bak-ttd-paraf" | Out-Null
Copy-Item sppd_template.docx,www\sppd_template.docx,public\sppd_template.docx "$env:TEMP\opencode\bak-ttd-paraf\"
node scripts\patch-sppd-template.mjs
npm test
```

Pemeriksaan manual: render 1 SPPD dari modal (atau `node` dengan tag contoh) → buka `.docx` di
Word: blok `Paraf:` berisi 3 baris nama+jabatan, nama Kepala Bidang + NIP, nama + NIP KTU di baris
"KTU Bapperida". Tidak ada `{...}` tersisa.

### 2d. Commit
`feat(spt): sppd_template memuat tag bidang/KTU + tabel paraf (3 salinan)` + ledger.

---

## Task 3 — Form: pilih pegawai (js + markup + tes)

**Files**: `js/tugas-spt.js`, `www/js/tugas-spt.js`, `index.html`, `www/index.html`,
`tests/tugas-spt.test.mjs`.

### 3a. Tes dulu

1. Ganti seluruh isi `test('readForm/fillForm: dua arah lewat DOM tiruan…')` (:325-358) jadi versi
   select (dua arah: NIP → {nama,jabatan} dari master, dan legacy jabatan → NIP):

```js
test('readForm/fillForm: select pegawai dua arah (NIP <-> nama/jabatan), legacy tetap jalan', async () => {
  const win = fresh();
  win.apiGet = async () => ({ rows: [
    { nip: '900', nama: 'Kepala Uji', pangkat: 'IV/c', jabatan: 'Kepala Badan' },
    { nip: '901', nama: 'Sek Uji', jabatan: 'Sekretaris' },
    { nip: '902', nama: 'Kabid Uji', jabatan: 'Kepala Bidang Ekonomi' },
    { nip: '903', nama: 'Ktu Uji', jabatan: 'KTU Bapperida' }
  ] });
  await win.TugasSPT.masterIndex('INS');
  const Mod = win.TugasSPT;

  const isi = {
    nomor: '005/SPT', ditetapkanDi: 'Kupang', kepalaPangkat: 'IV/c',
    kepalaNip: '900', sekretarisNip: '901', bidangNip: '902', ktuNip: '903',
    paraf1: '901', paraf2: '902', paraf3: '903'
  };
  const elements = {};
  for (const n of Object.keys(isi)) elements[n] = { value: isi[n], style: {} };
  const lama = globalThis.document;
  globalThis.document = { getElementById: id => (id === 'perjadinForm' ? { elements } : null) };
  try {
    const p = Mod.readForm({});
    assert.equal(p.kepala.nama, 'Kepala Uji', 'nama kepala dari master lewat NIP');
    assert.equal(p.kepala.nip, '900');
    assert.equal(p.kepala.pangkat, 'IV/c');
    assert.equal(p.sekretaris.nama, 'Sek Uji');
    assert.equal(p.bidang.nama, 'Kabid Uji');
    assert.equal(p.bidang.nip, '902');
    assert.equal(p.ktu.nama, 'Ktu Uji');
    assert.deepEqual(p.paraf[0], { nip: '901', nama: 'Sek Uji', jabatan: 'Sekretaris' });
    assert.equal(p.paraf[2].nama, 'Ktu Uji');

    // legacy: perjadin lama (jabatan saja, tanpa nip) -> select terisi lewat jabatan master
    Mod.fillForm({ kepala: { nama: 'Kepala Uji', nip: '900' }, sekretaris: { nama: 'Sek Uji', nip: '901' },
      paraf: [{ jabatan: 'Sekretaris' }, { jabatan: 'Kepala Bidang Ekonomi' }, { jabatan: 'KTU Bapperida' }] });
    assert.equal(elements['paraf1'].value, '901', 'jabatan lama dipetakan ke NIP master');
    assert.equal(elements['paraf2'].value, '902');
    assert.equal(elements['paraf3'].value, '903');
    assert.equal(elements['kepalaNip'].value, '900');
    // jabatan tak dikenal -> kosong (tidak crash)
    Mod.fillForm({ paraf: [{ jabatan: 'Jabatan Aneh' }] });
    assert.equal(elements['paraf1'].value, '');
    assert.equal(elements['paraf2'].value, '');
  } finally {
    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
  }
});

test('readForm: tanpa master, nilai tersimpan tidak tertimpa kosong', () => {
  const Mod = fresh().TugasSPT;
  const elements = { kepalaNip: { value: '', style: {} }, kepalaPangkat: { value: '', style: {} },
    sekretarisNip: { value: '', style: {} }, bidangNip: { value: '', style: {} }, ktuNip: { value: '', style: {} },
    paraf1: { value: '', style: {} }, paraf2: { value: '', style: {} }, paraf3: { value: '', style: {} } };
  const lama = globalThis.document;
  globalThis.document = { getElementById: id => (id === 'perjadinForm' ? { elements } : null) };
  try {
    const p = Mod.readForm({ kepala: { nama: 'Kepala Lama', pangkat: 'IV', nip: '777' },
      paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kepala Bidang Ekonomi' }, { jabatan: 'KTU BAPPERIDA' }] });
    assert.equal(p.kepala.nama, 'Kepala Lama');
    assert.equal(p.kepala.nip, '777');
    assert.equal(p.paraf[0].jabatan, 'Sekretaris BAPPERIDA', 'paraf default dipertahankan');
    assert.equal(p.bidang.nama, 'BERLIAN MAGU WERU,S.Sos', 'default bidang dipertahankan');
  } finally {
    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
  }
});
```

2. Uji `isiOpsiPegawai` (opsi terisi + pilihan terjaga) dengan elemen tiruan ber-`tagName: 'SELECT'`:

```js
test('isiOpsiPegawai: opsi dari master, pilihan lama dipertahankan', () => {
  const Mod = fresh().TugasSPT;
  const dibuat = [];
  class OptionTiruan { constructor(t, v) { this.text = t; this.value = v; } }
  const lamaOption = globalThis.Option, lamaDoc = globalThis.document;
  globalThis.Option = OptionTiruan;
  const sel = { tagName: 'SELECT', value: '902', children: [], appendChild(c) { this.children.push(c); }, set innerHTML(_) { this.children = []; }, get innerHTML() { return ''; } };
  globalThis.document = { getElementById: id => (id === 'perjadinForm' ? { elements: { kepalaNip: sel } } : null) };
  try {
    Mod.isiOpsiPegawai({ '901': { nip: '901', nama: 'Budi', jabatan: 'Staf' }, '902': { nip: '902', nama: 'Ayu', jabatan: 'Kabid' } });
    assert.deepEqual(sel.children.map(o => o.value), ['', '902', '901'], 'opsi terurut nama + opsi kosong di depan');
    assert.equal(sel.children[1].text, 'Ayu — Kabid');
    assert.equal(sel.value, '902', 'pilihan lama tidak hilang setelah opsi dimuat ulang');
  } finally {
    if (lamaOption === undefined) delete globalThis.Option; else globalThis.Option = lamaOption;
    if (lamaDoc === undefined) delete globalThis.document; else globalThis.document = lamaDoc;
  }
});
```

3. Tes wiring `#perjadinModal` (:360-385) **tidak perlu diubah** — ia menyimpulkan nama field dari
   HTML × `readForm` × `fillForm`. Syarat yang harus dipenuhi implementasi: `readForm` memakai
   literal `g('paraf1')`, `g('paraf2')`, `g('paraf3')` (jangan dirangkai/loop), dan `fillForm`
   memakai `set('paraf1')`, dst — jumlah nama 21 di ketiga sisi.

### 3b. Implementasi `js/tugas-spt.js`

1. Helper baru setelah `masterIndex` (:222):

```js
  const SLOT_PEGAWAI = ['kepalaNip', 'sekretarisNip', 'bidangNip', 'ktuNip', 'paraf1', 'paraf2', 'paraf3'];

  function pegawaiByNip(nip) {
    const n = String(nip || '').trim();
    return n && _masterCache ? (_masterCache[n] || null) : null;
  }

  // Cari NIP dari nama/jabatan (dipakai untuk data lama yang belum menyimpan NIP).
  function nipCocok(field, nilai) {
    const t = String(nilai || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!t || !_masterCache) return '';
    for (const nip of Object.keys(_masterCache)) {
      const v = ((_masterCache[nip] || {})[field] || '').trim().toUpperCase().replace(/\s+/g, ' ');
      if (v === t) return nip;
    }
    return '';
  }

  // ponytail: <select> native; opsi pertama '— pilih —' (nilai kosong).
  function isiOpsiPegawai(idx) {
    const f = $('perjadinForm');
    if (!f || !f.elements) return;
    const daftar = Object.keys(idx || {}).map(nip => idx[nip]).filter(m => m && m.nama)
      .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
    for (const n of SLOT_PEGAWAI) {
      const el = f.elements[n];
      if (!el || el.tagName !== 'SELECT') continue;
      const simpan = el.value;
      el.innerHTML = '';
      el.appendChild(new Option('— pilih —', ''));
      for (const m of daftar) el.appendChild(new Option(m.nama + ' — ' + (m.jabatan || 'tanpa jabatan'), String(m.nip)));
      el.value = simpan;
    }
  }

  // NIP terpilih -> dari master; tak ada pilihan -> pakai nilai tersimpan (data lama tetap jalan).
  function parafDariForm(nip, lama) {
    const l = lama || {}, e = pegawaiByNip(nip);
    if (!e) return { nip: l.nip || '', nama: l.nama || '', jabatan: l.jabatan || '' };
    return { nip: e.nip || String(nip), nama: e.nama || l.nama || '', jabatan: e.jabatan || l.jabatan || '' };
  }
```

2. `readForm` (:299-331): bagian pejabat → nama dari NIP, pangkat tetap dari input:

```js
    const k = pegawaiByNip(g('kepalaNip')), s = pegawaiByNip(g('sekretarisNip'));
    const b = pegawaiByNip(g('bidangNip')), t = pegawaiByNip(g('ktuNip'));
    p.kepala = { nama: (k && k.nama) || p.kepala.nama, pangkat: g('kepalaPangkat') || p.kepala.pangkat, nip: (k && k.nip) || p.kepala.nip };
    p.sekretaris = { nama: (s && s.nama) || p.sekretaris.nama, nip: (s && s.nip) || p.sekretaris.nip };
    p.bidang = { nama: (b && b.nama) || p.bidang.nama, nip: (b && b.nip) || p.bidang.nip };
    p.ktu = { nama: (t && t.nama) || p.ktu.nama, nip: (t && t.nip) || p.ktu.nip };
```

dan paraf (:325-328):

```js
    p.paraf = [
      parafDariForm(g('paraf1'), p.paraf[0]),
      parafDariForm(g('paraf2'), p.paraf[1]),
      parafDariForm(g('paraf3'), p.paraf[2])
    ];
```

3. `fillForm` (:333-357): ganti `set('kepalaNama'…)`, `set('kepalaNIP'…)`, `set('sekretarisNama'…)`,
   `set('sekretarisNIP'…)` dengan select (NIP), tambah bidang/ktu:

```js
    set('kepalaNip', k.nip || nipCocok('nama', k.nama));
    set('kepalaPangkat', k.pangkat);
    set('sekretarisNip', s.nip || nipCocok('nama', s.nama));
    const bd = perjadin.bidang || {}, kt = perjadin.ktu || {};
    set('bidangNip', bd.nip || nipCocok('nama', bd.nama));
    set('ktuNip', kt.nip || nipCocok('nama', kt.nama));
```
dan paraf (:354-356):

```js
    set('paraf1', (pf[0] || {}).nip || nipCocok('jabatan', (pf[0] || {}).jabatan));
    set('paraf2', (pf[1] || {}).nip || nipCocok('jabatan', (pf[1] || {}).jabatan));
    set('paraf3', (pf[2] || {}).nip || nipCocok('jabatan', (pf[2] || {}).jabatan));
```

4. `bukaModal` (:359-388): opsi **selalu** dimuat (bukan hanya saat perjadin kosong), lalu default:

```js
    const simpan = grup.perjadin || {};
    const punya = {
      kepala: !!(simpan.kepala && simpan.kepala.nama), sekretaris: !!(simpan.sekretaris && simpan.sekretaris.nama),
      bidang: !!(simpan.bidang && simpan.bidang.nama), ktu: !!(simpan.ktu && simpan.ktu.nama),
      paraf: !!(simpan.paraf && simpan.paraf.length)
    };
    // ... (setField berkas lain tidak berubah)
    _siapMaster = (async () => {
      const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
      isiOpsiPegawai(idx);                       // opsi dipasang setelah master siap
      const d = defaultsDariMaster(idx);
      if (d.kepala && !punya.kepala) { setField('kepalaNip', d.kepala.nip); setField('kepalaPangkat', d.kepala.pangkat); }
      if (d.sekretaris && !punya.sekretaris) setField('sekretarisNip', d.sekretaris.nip);
      if (d.bidang && !punya.bidang) setField('bidangNip', d.bidang.nip);
      if (d.ktu && !punya.ktu) setField('ktuNip', d.ktu.nip);
      if (!punya.paraf) {                        // tebak dari jabatan (persis default lama)
        setField('paraf1', (d.sekretaris || {}).nip || '');
        setField('paraf2', (d.bidang || {}).nip || '');
        setField('paraf3', (d.ktu || {}).nip || '');
      }
    })().catch(() => {});
```

`_siapMaster` **selalu** diisi (hapus syarat `(!punya.kepala || !punya.sekretaris)`), supaya select
tetap terisi walau perjadin sudah lengkap.

### 3c. Markup `index.html` (:3719-3729) dan `www/index.html`

Ganti 9 baris field penandatangan jadi 8 baris berikut (pakai kelas `.form-input` yang sudah ada —
tanpa CSS baru):

```html
              <div class="form-group"><label class="form-label">Ditetapkan Di</label><input class="form-input" name="ditetapkanDi"></div>
              <div class="form-group"><label class="form-label">Kepala - Nama</label><select class="form-input" name="kepalaNip"></select></div>
              <div class="form-group"><label class="form-label">Kepala - Pangkat/Gol</label><input class="form-input" name="kepalaPangkat"></div>
              <div class="form-group"><label class="form-label">Sekretaris</label><select class="form-input" name="sekretarisNip"></select></div>
              <div class="form-group"><label class="form-label">Kepala Bidang</label><select class="form-input" name="bidangNip"></select></div>
              <div class="form-group"><label class="form-label">KTU</label><select class="form-input" name="ktuNip"></select></div>
              <div class="form-group"><label class="form-label">Paraf 1</label><select class="form-input" name="paraf1"></select></div>
              <div class="form-group"><label class="form-label">Paraf 2</label><select class="form-input" name="paraf2"></select></div>
              <div class="form-group"><label class="form-label">Paraf 3</label><select class="form-input" name="paraf3"></select></div>
```
(9 baris hasil: `ditetapkanDi` + 8 field = tetap 21 `name=` di modal.)

### 3d. Cache-bust + mirror + verifikasi

- `index.html` (:63, :3341-3342) dan `www/index.html` (:63, :3219-3220): naikkan `?v=js/tugas-spt.js`
  ke `?v=20261023` (css tidak berubah).
- `Copy-Item js\tugas-spt.js www\js\tugas-spt.js -Force`
- `npm test` → hijau, termasuk tes wiring (21 nama, ketiga sisi cocok) dan byte-identity www/js.
- Asap di browser (vite `http://localhost:5174`): buka modal satu grup → 7 select terisi nama
  pegawai; pilih 3 paraf; tekan Cetak → muncul toast wajib-isi bila ada yang kosong.

### 3e. Commit
`feat(spt): form pakai select pegawai untuk ttd & paraf (index + www + mirror js)` + ledger.

---

## Task 4 — Verifikasi end-to-end + tutup

1. `npm test` penuh — catat jumlah tes (sebelumnya 537; bertambah karena tes baru).
2. Render nyata: dari browser tekan Cetak pada grup uji → unduhan `SPT-SPPD_<tgl>.zip`; ekstrak,
   cek `SPPD_<nip>_<tgl>.docx`:
   - tidak ada teks `{`/`}` tersisa,
   - nama Kepala Bidang + `NIP. …` terisi; baris "KTU Bapperida" memuat nama + NIP KTU,
   - blok `Paraf:` 3 baris, tiap baris `Nama` lalu `Jabatan`,
   - SPT: `Paraf1..3` kini nama+jabatan (dua baris).
3. Periksa 3 salinan template identik + `www/js/tugas-spt.js` identik:
   `Get-FileHash sppd_template.docx,www\sppd_template.docx,public\sppd_template.docx,js\tugas-spt.js,www\js\tugas-spt.js`
4. `.superpowers/sdd/progress.md`: tulis entri (Task 1-4, temuan bedah template, jebakan
   `Expand-Archive` menolak `.docx` → pakai PizZip, dan catatan `readForm` wajib literal `g('parafN')`).
5. Commit akhir `docs(spt): catat fitur pemilih ttd & paraf di progress.md`, lalu
   `git push origin master:main`.
6. Beri tahu user: **Redeploy Coolify + hard refresh** (production build Docker, bukan dev server).

## Risiko & penanganan

- **Nama keras hilang tanpa pengganti**: ditutup `DEFAULT_PERJADIN.bidang` (Task 1) + tes anti-regresi.
- **Sel KTU disisipi di tempat salah**: needle dibatasi di dalam sel-2 tabel KTU + assert unik
  (`paraId 00000080`); sesudah patch tervalidasi tes tag + pemeriksaan manual Word.
- **Blok paraf meluber ke halaman 3**: tidak dipasang page-break (dipilih sesuai spec). Bila user
  minta pas di halaman 2 → tambahkan `<w:br w:type="page"/>` pada paragraf judul (1 baris).
- **Master gagal dimuat**: select tetap kosong → validasi menahan cetak (paraf wajib), perilaku
  lama untuk kepala/sekretaris tetap (nilai tersimpan tidak tertimpa kosong — tes 3a.2).
- **UA lama tanpa `new Option`**: sintaks `new Option` didukung semua browser target; tidak ada
  fallback (YAGNI).
