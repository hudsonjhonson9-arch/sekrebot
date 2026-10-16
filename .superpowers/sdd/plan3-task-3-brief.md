# Generator SPT & SPPD dari Penugasan Perjalanan Dinas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol "Cetak SPT/SPPD" pada kartu Monitoring Perjalanan Dinas yang menghasilkan `.docx` SPT (semua pelaksana) + SPPD (satu berkas per pelaksana) sesuai format BAPPERIDA, dengan detail perjadin yang bisa diisi di dialog dan tersimpan di baris `penugasan`.

**Architecture:** Client-side murni, meniru pola BAST: template `.docx` dijahit sekali oleh script build (placeholder `{Tag}` disulam pada run yang sama, layout asli dipertahankan), lalu di runtime dirender `docxtemplater` di browser dan diunduh sebagai blob. Detail perjadin disimpan ke kolom `penugasan.perjadin JSONB` lewat route server baru. Pengelompokan pelaksana dilakukan otomatis dari kunci `tanggal|keterangan|created_by_nip` — **tanpa kolom pengelompokan baru**.

**Tech Stack:** Node 18+, Express (`server/overtime.js`), `pizzip` + `docxtemplater` (sudah ada di `devDependencies` dan dimuat di `index.html:40-41` sebagai `window.PizZip`/`window.docxtemplater`), `node:test` untuk tes, Capacitor (`www/` dibangun ulang oleh `scripts/setup-capacitor.js`).

## Global Constraints

- Bahasa UI & komentar: Indonesia. Gaya commit: `feat(spt): …` / `fix(spt): …` / `test(spt): …` / `docs(spt): …`.
- **Tidak menambah dependency baru.** Pakai `pizzip` + `docxtemplater` yang sudah ada.
- **Template sumber tidak di-commit** (pola `aset-bapperida`): `Salinan Surat Tugas.docx` dan `8656838432_2026-07-02_2026-07-02_TUGAS.docx` ada di root dan sudah ter-untrack; biarkan. Yang di-commit adalah hasil jahitan `public/spt_template.docx`, `public/sppd_template.docx` (+ salinan root).
- **`www/` = salinan ter-commit untuk APK.** Setiap file `js/` baru dan setiap template baru WAJIB disalin ke `www/` dan didaftarkan (script tag di `www/index.html`, baris copy di `scripts/setup-capacitor.js`). Kalau tidak, fitur mati di APK.
- **`js/**` ada di `globalIgnores` eslint** → `npx eslint js/tugas-spt.js` membalas "File ignored" (warning, bukan error). Lint tidak akan memvalidasi file JS baru; andalkan `npm test`.
- **Tes didaftarkan manual**: `package.json` → `scripts.test` menyebut tiap file tes satu per satu. File tes baru harus ditambahkan ke daftar itu atau tidak akan pernah jalan.
- **`npm test` baseline = 503/503 lulus.** Jangan biarkan turun.
- Server Postgres MCP bersifat **read-only** — semua DDL kolom `penugasan` harus lewat `server/overtime.js` (pola `ALTER TABLE … IF NOT EXISTS` di dalam handler, meniru `CREATE TABLE IF NOT EXISTS rekap_lembur` di `server/overtime.js:11`), bukan lewat SQL langsung.
- Runtime lib guard: `if (!window.PizZip || !window.docxtemplater)` → toast error, jangan lempar.
- **Jangan** menyentuh `aset.db`, `tmp_*`, `n8n/export/`, `n8n/backup/`.
- Tag docxtemplater memakai delimiter `{` / `}` dengan `paragraphLoop: true, linebreaks: true` (persis panggilan BAST).

---


---

### Task 3: Logika murni generator + tes

**Files:**
- Create: `js/tugas-spt.js` (bagian murni saja — tanpa DOM di top level)
- Create: `tests/tugas-spt.test.mjs`
- Modify: `package.json` (`scripts.test` — tambahkan `tests/tugas-spt.test.mjs`)
- Modify: `index.html` (script tag), `www/js/tugas-spt.js`, `www/index.html`

**Interfaces:**
- Consumes: —
- Produces: `window.TugasSPT` dengan `terbilang(n) -> string`, `tanggalID(v) -> string`, `lamaHari(a,b) -> string`, `kunciGrup(row) -> string`, `kelompokkan(rows) -> [{kunci, items, perjadin}]`, `personTag(row, masterIndex) -> {Nama,PangkatGol,NIP,Jabatan}`, `bangunTagsSPT(grup, perjadin, masterIndex) -> object`, `bangunTagsSPPD(row, grup, perjadin, masterIndex) -> object`, `DEFAULT_PERJADIN -> object`. Task 5 memakai semua nama ini persis.

- [ ] **Step 1: Tulis tes yang GAGAL dulu — `tests/tugas-spt.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Uji SUMBER SEBENARNYA: jalankan js/tugas-spt.js sebagai script klasik di window palsu,
// supaya salinan di tes tidak bisa "lolos" padahal implementasinya beda.
const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win); // top-level tidak boleh menyentuh document
  assert.ok(win.TugasSPT, 'window.TugasSPT harus terdefinisi');
  return win.TugasSPT;
}
const T = load();

test('terbilang: satuan, belasan, puluhan', () => {
  assert.equal(T.terbilang(4), 'Empat');
  assert.equal(T.terbilang(11), 'Sebelas');
  assert.equal(T.terbilang(21), 'Dua Puluh Satu');
  assert.equal(T.terbilang(30), 'Tiga Puluh');
});

test('tanggalID: format Indonesia, aman timezone', () => {
  assert.equal(T.tanggalID('2026-06-29'), '29 Juni 2026');
  assert.equal(T.tanggalID('2026-01-01T00:00:00.000Z'), '1 Januari 2026');
  assert.equal(T.tanggalID(''), '');
});

test('lamaHari: inklusif dari tanggal berangkat s.d. kembali', () => {
  assert.equal(T.lamaHari('2026-06-29', '2026-07-02'), '4 (Empat) Hari');
  assert.equal(T.lamaHari('2026-06-29', '2026-06-29'), '1 (Satu) Hari');
  assert.equal(T.lamaHari('', '2026-07-02'), '');
});

test('kunciGrup: tanggal|keterangan|pemberi', () => {
  assert.equal(
    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123' }),
    '2026-06-29|Rakor|123'
  );
  assert.notEqual(
    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123' }),
    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '999' })
  );
});

test('kelompokkan: baris seperjalanan jadi satu grup + bawa perjadin', () => {
  const rows = [
    { id: '1', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123', nip: '111', perjadin: { nomor: 'X' } },
    { id: '2', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123', nip: '222' },
    { id: '3', tanggal: '2026-07-02', keterangan: 'Fasilitasi', created_by_nip: '123', nip: '333' }
  ];
  const g = T.kelompokkan(rows);
  assert.equal(g.length, 2);
  assert.equal(g[0].items.length, 2);
  assert.equal(g[0].perjadin.nomor, 'X');
  assert.equal(g[1].items.length, 1);
  assert.equal(g[1].perjadin, null);
});

test('bangunTagsSPT: nomor urut pelaksana, 3 slot paraf, Untuk dari keterangan', () => {
  const grup = { items: [
    { tanggal: '2026-06-29', keterangan: 'Rapat Koordinasi', nip: '111', nama: 'A' },
    { tanggal: '2026-06-29', keterangan: 'Rapat Koordinasi', nip: '222', nama: 'B' }
  ] };
  const master = { 111: { nama: 'Acmad', pangkat: 'Penata Muda – III/a', jabatan: 'Pranata Komputer', nip: '111' } };
  const t = T.bangunTagsSPT(grup, { tempatTujuan: 'Waingapu' }, master);
  assert.equal(t.pelaksana.length, 2);
  assert.deepEqual(t.pelaksana.map(x => x.No), [1, 2]);
  assert.equal(t.pelaksana[0].Nama, 'Acmad');
  assert.equal(t.pelaksana[0].PangkatGol, 'Penata Muda – III/a');
  assert.ok(t.Untuk.includes('Waingapu'));
  assert.equal(t.Paraf1, 'Sekretaris BAPPERIDA');
  assert.equal(t.Paraf3, 'KTU BAPPERIDA');
});

test('bangunTagsSPPD: lama hari + nama pegawai dari baris', () => {
  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Fasilitasi RKPD', nip: '111', nama: 'Alvian' }] };
  const t = T.bangunTagsSPPD(
    { nip: '111', nama: 'Alvian' }, grup,
    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-07-02', tempatTujuan: 'Kupang' },
    { 111: { nama: 'Alvian Zadrakh', pangkat: 'Pembina-IV/a', jabatan: 'Kepala Bidang' } }
  );
  assert.equal(t.Nama, 'Alvian Zadrakh');
  assert.equal(t.LamaHari, '4 (Empat) Hari');
  assert.equal(t.TempatTujuan, 'Kupang');
  assert.equal(t.Nama === t.KpaNama, false);
});
```

- [ ] **Step 2: Daftarkan tes di `package.json`**

Modify `package.json` → `scripts.test`: sisipkan `node --test tests/tugas-spt.test.mjs` di antara entri tes lainnya (ikuti format eksisting daftar ini).

- [ ] **Step 3: Jalankan tes, pastikan GAGAL**

Run: `node --test tests/tugas-spt.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory … js\tugas-spt.js`.

- [ ] **Step 4: Tulis `js/tugas-spt.js` (bagian murni)**

```js
// js/tugas-spt.js — generator Surat Perintah Tugas (SPT) & SPPD dari penugasan.
// Client-side, meniru pola BAST. Top level TIDAK menyentuh DOM supaya bisa diuji.
(function () {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh',
    'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function terbilang(n) {
    n = Math.abs(Math.round(Number(n) || 0));
    if (n < 12) return SATUAN[n];
    if (n < 20) return terbilang(n - 10) + ' Belas';
    if (n < 100) return terbilang(Math.floor(n / 10)) + ' Puluh' + sisa(n % 10);
    if (n < 200) return 'Seratus' + sisa(n - 100);
    if (n < 1000) return terbilang(Math.floor(n / 100)) + ' Ratus' + sisa(n % 100);
    return String(n);
  }

  // ponytail: sambung ekor hanya bila ada, supaya "Tiga Puluh" tak berjejak spasi.
  function sisa(r) { return r ? ' ' + terbilang(r) : ''; }

  // ponytail: parse tanggal-only sendiri (bukan new Date(str)) supaya tidak geser hari
  // akibat timezone. Upgrade path: pakai Temporal bila sudah tersedia di target.
  function toDate(v) {
    if (!v) return null;
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function tanggalID(v) {
    const d = toDate(v);
    if (!d) return v ? String(v) : '';
    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function lamaHari(a, b) {
    const d1 = toDate(a), d2 = toDate(b);
    if (!d1 || !d2) return '';
    const n = Math.round((d2 - d1) / 86400000) + 1;
    if (n <= 0) return '';
    return n + ' (' + terbilang(n) + ') Hari';
  }

  function kunciGrup(r) {
    return [r.tanggal || '', r.keterangan || '', r.created_by_nip || ''].join('|');
  }

  function kelompokkan(rows) {
    const map = new Map();
    for (const r of rows || []) {
      const k = kunciGrup(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return Array.from(map.entries()).map(([kunci, items]) => ({
      kunci, items, perjadin: items[0].perjadin || null
    }));
  }

  const DEFAULT_PERJADIN = {
    nomor: 'BP4D.011.7/69/53.12/ST/01/2026',
    nomorSPPD: '001/SPPD/2026',
    dasar: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
    maksud: '',
    tempatBerangkat: 'Waikabubak',
    tempatTujuan: '',
    alatAngkut: 'Pesawat',
    tanggalBerangkat: '',
    tanggalKembali: '',
    tingkatBiaya: 'C',
    instansi: 'Bapperida Kabupaten Sumba Barat',
    mataAnggaran: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
    ditetapkanDi: 'Waikabubak',
    tanggalPenetapan: '',
    kepala: { nama: 'CHARLES HERMANA WERU,S.Sos', pangkat: 'Pembina Utama Muda – IV/c', nip: '19721102 200112 1 001' },
    sekretaris: { nama: 'IMANUEL MOSES KALEGOTAN, ST.,M.Si', nip: '19800315 200501 1 011' },
    paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kepala Bidang Ekonomi' }, { jabatan: 'KTU BAPPERIDA' }]
  };

  function merge(p) {
    const out = Object.assign({}, DEFAULT_PERJADIN, p || {});
    out.kepala = Object.assign({}, DEFAULT_PERJADIN.kepala, (p && p.kepala) || {});
    out.sekretaris = Object.assign({}, DEFAULT_PERJADIN.sekretaris, (p && p.sekretaris) || {});
    out.paraf = (p && Array.isArray(p.paraf) && p.paraf.length) ? p.paraf : DEFAULT_PERJADIN.paraf;
    return out;
  }

  function personTag(row, masterIndex) {
    const m = (masterIndex && masterIndex[String(row.nip)]) || {};
    return {
      Nama: m.nama || row.nama || '',
      PangkatGol: m.pangkat || row.pangkat || '',
      NIP: m.nip || row.nip || '',
      Jabatan: m.jabatan || row.jabatan || ''
    };
  }

  function susunUntuk(p, grup) {
    let u = p.maksud || (grup.items[0] && grup.items[0].keterangan) || '';
    if (p.tempatTujuan) u += ' di ' + p.tempatTujuan;
    u = u.trim();
    if (u && !/[.!]$/.test(u)) u += '.';
    return u;
  }

  function bangunTagsSPT(grup, perjadin, masterIndex) {
    const p = merge(perjadin);
    const items = grup.items.map((r, i) => Object.assign({ No: i + 1 }, personTag(r, masterIndex)));
    return {
      Nomor: p.nomor,
      Dasar: p.dasar,
      pelaksana: items,
      Untuk: susunUntuk(p, grup),
      DitetapkanDi: p.ditetapkanDi,
      TanggalSurat: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
      KepalaNama: p.kepala.nama,
      KepalaPangkat: p.kepala.pangkat,
      KepalaNIP: p.kepala.nip,
      Paraf1: (p.paraf[0] || {}).jabatan || '',
      Paraf2: (p.paraf[1] || {}).jabatan || '',
      Paraf3: (p.paraf[2] || {}).jabatan || ''
    };
  }

  function bangunTagsSPPD(row, grup, perjadin, masterIndex) {
    const p = merge(perjadin);
    const t = personTag(row, masterIndex);
    return {
      NomorSPPD: p.nomorSPPD,
      KpaNama: p.kepala.nama,
      Nama: t.Nama,
      NIP: t.NIP,
      PangkatGolongan: p.pangkatGolongan || t.PangkatGol,
      JabatanInstansi: t.Jabatan,
      TingkatBiaya: p.tingkatBiaya,
      Maksud: p.maksud || susunUntuk(p, grup),
      AlatAngkut: p.alatAngkut,
      TempatBerangkat: p.tempatBerangkat,
      TempatTujuan: p.tempatTujuan,
      LamaHari: lamaHari(p.tanggalBerangkat, p.tanggalKembali),
      TanggalBerangkat: tanggalID(p.tanggalBerangkat),
      TanggalKembali: tanggalID(p.tanggalKembali),
      Instansi: p.instansi,
      MataAnggaran: p.mataAnggaran,
      DitetapkanDi: p.ditetapkanDi,
      TanggalPenetapan: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
      KepalaNama: p.kepala.nama,
      KepalaPangkat: p.kepala.pangkat,
      KepalaNIP: p.kepala.nip,
      SekretarisNama: p.sekretaris.nama,
      SekretarisNIP: p.sekretaris.nip
    };
  }

  window.TugasSPT = {
    terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
    personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge
  };
})();
```

- [ ] **Step 5: Jalankan tes, pastikan LULUS**

Run: `node --test tests/tugas-spt.test.mjs`
Expected: `# pass 7` (0 fail).

- [ ] **Step 6: Muat di index.html + salin ke www**

Modify `index.html`: tambahkan `<script src="js/tugas-spt.js?v=1"></script>` di dekat blok script `js/arsip-*` (sekitar baris 3309) — **setelah** `js/simapo-bast.js` dan `js/helpers.js` (butuh `window.bastRenderDocx` dan `apiGet` saat runtime, bukan saat load).
Lalu salin: `Copy-Item js/tugas-spt.js www/js/tugas-spt.js -Force` dan tambahkan script tag yang sama ke `www/index.html`.

- [ ] **Step 7: Commit**

```bash
git add js/tugas-spt.js tests/tugas-spt.test.mjs package.json index.html www/js/tugas-spt.js www/index.html
git commit -m "feat(spt): logika murni generator SPT/SPPD + tes"
```

---
