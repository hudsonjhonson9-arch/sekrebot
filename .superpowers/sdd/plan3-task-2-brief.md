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

### Task 2: Template SPPD

**Files:**
- Create: `scripts/build-sppd-template.js`
- Create: `public/sppd_template.docx` (hasil build) + root `sppd_template.docx`
- Modify: `scripts/setup-capacitor.js:47`

**Interfaces:**
- Consumes: `scripts/docx-patch.js` (Task 1), sumber `8656838432_2026-07-02_2026-07-02_TUGAS.docx` di root.
- Produces: `public/sppd_template.docx` berisi tag: `{NomorSPPD} {KpaNama} {Nama} {NIP} {PangkatGolongan} {JabatanInstansi} {TingkatBiaya} {Maksud} {AlatAngkut} {TempatBerangkat} {TempatTujuan} {LamaHari} {TanggalBerangkat} {TanggalKembali} {Instansi} {MataAnggaran} {DitetapkanDi} {TanggalPenetapan} {KepalaNama} {KepalaPangkat} {KepalaNIP} {SekretarisNama} {SekretarisNIP}`.

- [ ] **Step 1: Tulis `scripts/build-sppd-template.js`**

```js
// ═══════════════════════════════════════════════════════════════
// Bangun sppd_template.docx dari "8656838432_…_TUGAS.docx" (SPPD asli).
//   TEMPLATE_SRC=... node scripts/build-sppd-template.js
// Keluaran: public/sppd_template.docx + ./sppd_template.docx
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadParagraphs, applyByIndex, spliceInto, assertPlaceholders } from './docx-patch.js';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../8656838432_2026-07-02_2026-07-02_TUGAS.docx');
const OUTS = [path.join(__dirname, '../public/sppd_template.docx'), path.join(__dirname, '../sppd_template.docx')];

// indeks paragraf deterministik (lihat spec §9). Nyaris semua nilai multi-run →
// ganti seluruh paragraf; hanya pangkat Kepala yang dibiarkan di baris terpisah.
const WHOLE = {
  8: 'Nomor: {NomorSPPD}',
  14: '{KpaNama}',
  18: '{Nama}',
  19: 'NIP.{NIP}',
  23: '{PangkatGolongan}',
  27: '{JabatanInstansi}',
  31: '{TingkatBiaya}',
  35: '{Maksud}',
  39: '{AlatAngkut}',
  43: '{TempatBerangkat}',
  47: '{TempatTujuan}',
  51: '{LamaHari}',
  55: '{TanggalBerangkat}',
  59: '{TanggalKembali}',
  80: '{Instansi}',
  84: '{MataAnggaran}',
  93: '{DitetapkanDi}',
  96: '{TanggalPenetapan}',
  106: 'NIP: {KepalaNIP}',
  227: '{SekretarisNama}',
  228: 'NIP. {SekretarisNIP}'
};
const PATCHES = {
  105: [['CHARLES HERMANA WERU,S.Sos', '{KepalaNama}'], ['Pembina Utama Muda – IV/c', '{KepalaPangkat}']]
};
// isi contoh log Berangkat/Tiba I–IV + ruang tanggal tangan → dikosongkan
const BLANK = [128, 131, 133, 149, 150, 155, 156, 215, 216];

const PLACEHOLDERS = [
  '{NomorSPPD}', '{KpaNama}', '{Nama}', '{NIP}', '{PangkatGolongan}', '{JabatanInstansi}',
  '{TingkatBiaya}', '{Maksud}', '{AlatAngkut}', '{TempatBerangkat}', '{TempatTujuan}',
  '{LamaHari}', '{TanggalBerangkat}', '{TanggalKembali}', '{Instansi}', '{MataAnggaran}',
  '{DitetapkanDi}', '{TanggalPenetapan}', '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}',
  '{SekretarisNama}', '{SekretarisNIP}'
];

const zip = new PizZip(fs.readFileSync(SRC));
const docXml = zip.file('word/document.xml').asText();
const paras = loadParagraphs(docXml);
const newXml = spliceInto(docXml, paras, applyByIndex(paras, WHOLE, PATCHES, BLANK));

assertPlaceholders(newXml, PLACEHOLDERS);
// pastikan data contoh trip lama sudah hilang
if (newXml.includes('15 Juli 2025') || newXml.includes('18 Juli 2025')) {
  console.error('[FAIL] masih ada tanggal contoh (15/18 Juli 2025) di hasil');
  process.exit(1);
}
zip.file('word/document.xml', newXml);
for (const out of OUTS) {
  fs.writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('[OK]', out, fs.statSync(out).size, 'bytes');
}
```

- [ ] **Step 2: Jalankan build, verifikasi**

Run:
```
node scripts/build-sppd-template.js
```
Expected: dua baris `[OK] … sppd_template.docx … bytes`, tanpa `[FAIL]`.

- [ ] **Step 3: Daftarkan template di Capacitor + salin ke www**

Modify `scripts/setup-capacitor.js:47` — tambahkan `sppd_template.docx` setelah `spt_template.docx` (Task 1).
Lalu salin: `Copy-Item public/sppd_template.docx www/sppd_template.docx -Force`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-sppd-template.js scripts/setup-capacitor.js public/sppd_template.docx sppd_template.docx www/sppd_template.docx
git commit -m "feat(spt): build template SPPD dari dokumen asli"
```

---
