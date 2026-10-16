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

### Task 1: Helper patch docx bersama + template SPT

**Files:**
- Create: `scripts/docx-patch.js`
- Create: `scripts/build-spt-template.js`
- Create: `public/spt_template.docx` (hasil build) + root `spt_template.docx`
- Modify: `scripts/setup-capacitor.js:47`

**Interfaces:**
- Consumes: `pizzip` (require), sumber `Salinan Surat Tugas.docx` di root repo.
- Produces: `scripts/docx-patch.js` mengekspor `loadParagraphs(docXml)`, `rewriteWhole(par, tag)`, `patchParagraph(par, patches)`, `applyByIndex(paras, wholeMap, patchesMap, blankList)`, `assertPlaceholders(xml, list)`. Task 2 memakai modul yang sama. Menghasilkan `public/spt_template.docx` berisi tag: `{Nomor} {Dasar} {#pelaksana} {No} {Nama} {PangkatGol} {NIP} {Jabatan} {/pelaksana} {Untuk} {DitetapkanDi} {TanggalSurat} {KepalaNama} {KepalaPangkat} {KepalaNIP} {Paraf1} {Paraf2} {Paraf3}`.

- [ ] **Step 1: Tulis `scripts/docx-patch.js`**

Helper diambil apa adanya dari pola `scripts/build-bast-template.js:68-183` (sudah teruji di produksi), dibungkus jadi modul.

```js
// scripts/docx-patch.js — utilitas sulam tag docxtemplater ke docx asli.
// Dipakai scripts/build-spt-template.js & scripts/build-sppd-template.js.
// Logika inti disalin dari scripts/build-bast-template.js (sudah dipakai produksi).

const tOf = run => {
  const m = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
  if (!m) return null;
  return { open: m[0].slice(0, m[0].indexOf('>') + 1), text: m[1] };
};

function spliceRun(par, rawRun, newT) {
  const i = par.indexOf(rawRun);
  const t = tOf(rawRun);
  const inner = t.open + t.text + '</w:t>';
  const replaced = rawRun.slice(0, rawRun.indexOf(inner)) + newT + rawRun.slice(rawRun.indexOf(inner) + inner.length);
  return par.slice(0, i) + replaced + par.slice(i + rawRun.length);
}

export function rewriteWhole(par, tag) {
  // ganti seluruh teks paragraf: run pertama berisi teks -> tag, sisanya dikosongkan
  const runs = Array.from(par.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => m[0]);
  let done = false;
  let out = par;
  for (const r of runs) {
    const t = tOf(r);
    if (!t) continue;
    if (!done && t.text.trim() !== '') {
      out = spliceRun(out, r, t.open + tag + '</w:t>');
      done = true;
    } else if (t.text.length) {
      out = spliceRun(out, r, t.open + '</w:t>');
    }
  }
  return out;
}

function applyOne(para, target, repl) {
  const runs = Array.from(para.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => ({ raw: m[0], start: m.index }));
  let full = '';
  const segs = [];
  runs.forEach((r, i) => {
    const t = tOf(r.raw);
    segs.push({ i, off: full.length, len: t ? t.text.length : 0 });
    full += t ? t.text : '';
  });
  const idx = full.indexOf(target);
  if (idx < 0) throw new Error('Target tidak ditemukan dalam paragraf: ' + JSON.stringify(target).slice(0, 60));
  const end = idx + target.length;
  const aff = segs.filter(s => s.off < end && s.off + s.len > idx && s.len > 0);
  const first = aff[0];
  const last = aff[aff.length - 1];
  const edits = {};
  for (const s of aff) {
    const cutA = Math.max(0, idx - s.off);
    const cutB = Math.max(0, Math.min(end, s.off + s.len) - s.off);
    const txt = tOf(runs[s.i].raw).text;
    let nt;
    if (s === first) nt = txt.slice(0, cutA) + repl + (s === last ? txt.slice(cutB) : '');
    else nt = s === last ? txt.slice(cutB) : '';
    edits[s.i] = nt;
  }
  let outPara = para;
  const keys = Object.keys(edits).map(Number).sort((a, b) => b - a);
  for (const key of keys) {
    const { raw } = runs[key];
    const t = tOf(raw);
    const inner = t.open + t.text + '</w:t>';
    const at = outPara.indexOf(raw);
    if (at < 0) throw new Error('Run tidak ditemukan saat patch');
    const replaced = raw.slice(0, raw.indexOf(inner)) + t.open + edits[key] + '</w:t>' + raw.slice(raw.indexOf(inner) + inner.length);
    outPara = outPara.slice(0, at) + replaced + outPara.slice(at + raw.length);
  }
  return outPara;
}

export function patchParagraph(para, patches) {
  let out = para;
  for (const [target, repl] of patches) out = applyOne(out, target, repl);
  return out;
}

export function loadParagraphs(docXml) {
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const out = [];
  let m;
  while ((m = re.exec(docXml))) {
    const raw = m[0];
    const text = Array.from(raw.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), x => x[1]).join('');
    out.push({ raw, start: m.index, text });
  }
  return out;
}

// wholeMap: { index: '{Tag}' }, patchesMap: { index: [[target, repl], …] }, blankList: [index, …]
export function applyByIndex(paras, wholeMap = {}, patchesMap = {}, blankList = []) {
  const blanks = new Set(blankList);
  const newParas = paras.map(({ raw, text }, i) => {
    if (blanks.has(i)) return rewriteWhole(raw, '');
    if (wholeMap[i] !== undefined) return rewriteWhole(raw, wholeMap[i]);
    if (patchesMap[i] !== undefined) return patchParagraph(raw, patchesMap[i]);
    return raw;
  });
  return newParas;
}

export function spliceInto(docXml, paras, newParas) {
  let out = docXml;
  for (let i = paras.length - 1; i >= 0; i--) {
    out = out.slice(0, paras[i].start) + newParas[i] + out.slice(paras[i].start + paras[i].raw.length);
  }
  return out;
}

export function assertPlaceholders(xml, list) {
  for (const p of list) {
    if (!xml.includes(p)) {
      console.error('[FAIL] Placeholder TIDAK ditemukan di hasil:', p);
      process.exit(1);
    }
  }
}
```

- [ ] **Step 2: Tulis `scripts/build-spt-template.js`**

```js
// ═══════════════════════════════════════════════════════════════
// Bangun spt_template.docx dari "Salinan Surat Tugas.docx".
//   TEMPLATE_SRC=... node scripts/build-spt-template.js
// Keluaran: public/spt_template.docx + ./spt_template.docx
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadParagraphs, applyByIndex, spliceInto, assertPlaceholders } from './docx-patch.js';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../Salinan Surat Tugas.docx');
const OUTS = [path.join(__dirname, '../public/spt_template.docx'), path.join(__dirname, '../spt_template.docx')];

// indeks paragraf deterministik (template ini file tetap yang di-commit).
// Lihat docs/superpowers/specs/2026-10-16-spt-sppd-generator-design.md §9.
const WHOLE = {
  9: 'Nomor : {Nomor}',
  14: '{Dasar}',
  20: '{#pelaksana}{No}.',
  29: '{Nama}',
  30: '{PangkatGol}',
  31: '{NIP}',
  32: '{Jabatan}{/pelaksana}',
  37: '{Untuk}',
  41: '{DitetapkanDi}',
  44: '{TanggalSurat}',
  55: '{KepalaNama}',
  56: '{KepalaPangkat}',
  57: 'NIP. {KepalaNIP}',
  62: '{Paraf1}',
  65: '{Paraf2}',
  68: '{Paraf3}'
};
const PATCHES = {};
const BLANK = [];

const PLACEHOLDERS = [
  '{Nomor}', '{Dasar}', '{#pelaksana}', '{No}', '{Nama}', '{PangkatGol}', '{NIP}',
  '{Jabatan}', '{/pelaksana}', '{Untuk}', '{DitetapkanDi}', '{TanggalSurat}',
  '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}', '{Paraf1}', '{Paraf2}', '{Paraf3}'
];

const zip = new PizZip(fs.readFileSync(SRC));
const docXml = zip.file('word/document.xml').asText();
const paras = loadParagraphs(docXml);
const newXml = spliceInto(docXml, paras, applyByIndex(paras, WHOLE, PATCHES, BLANK));

assertPlaceholders(newXml, PLACEHOLDERS);
zip.file('word/document.xml', newXml);
for (const out of OUTS) {
  fs.writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('[OK]', out, fs.statSync(out).size, 'bytes');
}
console.log('Tag SPT aktif:', PLACEHOLDERS.filter(p => !/^\{[/#]/.test(p)).length);
```

- [ ] **Step 3: Jalankan build, verifikasi tag tertanam**

Run:
```
node scripts/build-spt-template.js
node -e "const z=require('pizzip'),fs=require('fs');const x=z(fs.readFileSync('public/spt_template.docx')).file('word/document.xml').asText();['{Nomor}','{#pelaksana}{No}.','{Jabatan}{/pelaksana}','{Paraf3}'].forEach(t=>console.log(x.includes(t)?'OK '+t:'FAIL '+t))"
```
Expected: `[OK] … spt_template.docx … bytes` dua kali, lalu empat baris `OK …`.

- [ ] **Step 4: Daftarkan template di Capacitor + salin ke www**

Modify `scripts/setup-capacitor.js:47` — tambahkan `spt_template.docx` ke daftar salin, tepat setelah `bast_template.docx`.
Lalu salin salinan APK: `Copy-Item public/spt_template.docx www/spt_template.docx -Force` (tanpa ini fitur mati di APK — sama seperti `www/bast_template.docx`).

- [ ] **Step 5: Commit**

```bash
git add scripts/docx-patch.js scripts/build-spt-template.js scripts/setup-capacitor.js public/spt_template.docx spt_template.docx www/spt_template.docx
git commit -m "feat(spt): build template SPT dari dokumen asli + helper patch docx"
```

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

### Task 4: Server — simpan detail perjadin + perbaiki nomor_surat

**Files:**
- Modify: `server/overtime.js` (tambah route `POST /penugasan/perjadin`; tambah kolom `nomor_surat` ke INSERT)
- Create: `tests/penugasan-perjadin.test.mjs`
- Modify: `package.json` (`scripts.test`)

**Interfaces:**
- Consumes: `query` (sudah ada di `createOvertimeRouter`), helper `admin`, `scope`, `ok`, `fail`.
- Produces: route `POST /api/penugasan/perjadin` menerima `{ ids:[string], perjadin:object, nomor_surat:string, instansi_id? }` → `{ ok:true, updated:<n> }`. Kolom `penugasan.perjadin JSONB` & `penugasan.nomor_surat TEXT` dibuat bila belum ada. Task 5 memanggil route ini via `P.penugasanPerjadin`.

- [ ] **Step 1: Tulis tes GAGAL — `tests/penugasan-perjadin.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server', 'overtime.js'), 'utf8');

test('server: ada route POST /penugasan/perjadin yang menyimpan perjadin JSONB', () => {
  assert.match(src, /r\.post\('\/penugasan\/perjadin'/, 'route belum ada');
  assert.match(src, /ADD COLUMN IF NOT EXISTS perjadin JSONB/, 'migrasi kolom perjadin belum ada');
  assert.match(src, /UPDATE penugasan SET perjadin=\$1,nomor_surat=\$2/, 'UPDATE perjadin belum ada');
});

test('server: nomor_surat ikut tersimpan saat buat penugasan (bug lama)', () => {
  assert.match(src, /INSERT INTO penugasan \([^)]*nomor_surat[^)]*\)/, 'INSERT belum menerima nomor_surat');
});
```

- [ ] **Step 2: Daftarkan tes di `package.json`** (`scripts.test`) lalu jalankan → GAGAL

Run: `node --test tests/penugasan-perjadin.test.mjs`
Expected: FAIL (kedua tes).

- [ ] **Step 3: Tambah route di `server/overtime.js`**

Sisipkan tepat setelah baris `r.post('/penugasan', …)` (baris 9):

```js
 r.post('/penugasan/perjadin',async(req,res)=>{try{if(!admin(req))return fail(res,403,'Forbidden');const b=req.body||{};const {inst,allowed}=scope(req,b.instansi_id);if(!allowed)return fail(res,403,'Forbidden');const ids=(Array.isArray(b.ids)?b.ids:(b.id?[b.id]:[])).map(String).filter(Boolean);if(!ids.length)return fail(res,400,'ids kosong');await query('ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS perjadin JSONB');await query('ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS nomor_surat TEXT');const rows=(await query('UPDATE penugasan SET perjadin=$1,nomor_surat=$2 WHERE id::text=ANY($3::text[]) AND instansi_id=$4 RETURNING id',[JSON.stringify(b.perjadin||{}),String(b.nomor_surat||''),ids,inst])).rows;return ok(res,{updated:rows.length,message:'Detail perjalanan dinas disimpan.'});}catch(e){console.error('[penugasan/perjadin]',e);return fail(res,500,'Gagal menyimpan detail perjalanan dinas.');}});
```

- [ ] **Step 4: Perbaiki INSERT agar `nomor_surat` tersimpan**

Di baris 9, ubah daftar kolom INSERT `(user_id,nama,nip,tanggal,lat,lon,keterangan,created_by,created_by_nip,radius,instansi_id)` menjadi `(user_id,nama,nip,tanggal,lat,lon,keterangan,created_by,created_by_nip,radius,instansi_id,nomor_surat)`, tambah `$12` di `VALUES`, dan tambah `String(b.nomor_surat||'')` sebagai argumen terakhir array parameter.

- [ ] **Step 5: Jalankan tes → LULUS**

Run: `node --test tests/penugasan-perjadin.test.mjs`
Expected: `# pass 2`.

- [ ] **Step 6: Commit**

```bash
git add server/overtime.js tests/penugasan-perjadin.test.mjs package.json
git commit -m "feat(spt): endpoint simpan detail perjadin + fix nomor_surat penugasan"
```

---

### Task 5: Dialog isian + orkestrasi generate/unduh

**Files:**
- Modify: `js/simapo-bast.js:316` (`bastRenderDocx` terima parameter template opsional)
- Modify: `js/tugas-spt.js` (tambah `bukaModal`, `generate`, `simpanPerjadin`, `initPerjadinModal`)
- Modify: `js/config.js:326` (tambah `penugasanPerjadin: '/api/penugasan/perjadin',` setelah `penugasanList`)
- Modify: `index.html` (modal `#perjadinModal` + script tag tetap dari Task 3)
- Modify: `css/styles.css` (kelas `.perjadin-*`)
- Modify: `www/js/tugas-spt.js`, `www/index.html`, `www/css/styles.css`, `www/js/simapo-bast.js`, `www/js/config.js`
- Modify: `docs/superpowers/specs/2026-10-16-spt-sppd-generator-design.md` (catat reuse `bastRenderDocx`)

**Interfaces:**
- Consumes: `window.TugasSPT.*` (Task 3), `window.bastRenderDocx(tags, filename, templateUrl)` (dimodifikasi di sini), route `POST /api/penugasan/perjadin` (Task 4) via `P.penugasanPerjadin`, globals `showToast`, `escapeHtml`, `localStorage.MY_NIP`.
- Produces: `window.TugasSPT.bukaModal(rows)` — membuka dialog untuk **satu grup** (dipanggil Task 6 dari kartu). `window.TugasSPT.generate(grup, perjadin, masterIndex)` mengunduh 1 SPT + N SPPD lalu menyimpan perjadin.

- [ ] **Step 1: Buat `bastRenderDocx` menerima template**

Modify `js/simapo-bast.js:316` — ubah tanda tangan dan baris fetch:

```js
window.bastRenderDocx = async function(tags, filename, templateUrl) {
```
dan baris 322:
```js
    const tp = await fetch(templateUrl || 'bast_template.docx');
```

- [ ] **Step 2: Tambah modal di `index.html`**

Tambahkan sebelum `</body>` (setelah modal-modal eksisting):

```html
  <div id="perjadinModal" class="modal-overlay" style="display:none">
    <div class="modal-content" style="max-width:520px; max-height:90vh; overflow-y:auto">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
        <div style="font-weight:800; font-size:13px; color:var(--gold)"><i class="fas fa-file-signature"></i> Detail Perjalanan Dinas</div>
        <button type="button" id="perjadinClose" class="btn-icon" aria-label="Tutup">&times;</button>
      </div>
      <div id="perjadinInfo" style="font-size:10px; color:var(--muted); margin-bottom:12px"></div>
      <form id="perjadinForm">
        <div class="form-group"><label class="form-label">Nomor SPT</label><input class="form-input" name="nomor"></div>
        <div class="form-group"><label class="form-label">Nomor SPPD</label><input class="form-input" name="nomorSPPD"></div>
        <div class="form-group"><label class="form-label">Dasar</label><input class="form-input" name="dasar"></div>
        <div class="form-group"><label class="form-label">Maksud Perjalanan</label><input class="form-input" name="maksud"></div>
        <div class="form-group"><label class="form-label">Tempat Berangkat</label><input class="form-input" name="tempatBerangkat"></div>
        <div class="form-group"><label class="form-label">Tempat Tujuan</label><input class="form-input" name="tempatTujuan"></div>
        <div class="form-group"><label class="form-label">Alat Angkut</label><input class="form-input" name="alatAngkut"></div>
        <div class="form-group"><label class="form-label">Tanggal Berangkat</label><input type="date" class="form-input" name="tanggalBerangkat"></div>
        <div class="form-group"><label class="form-label">Tanggal Kembali</label><input type="date" class="form-input" name="tanggalKembali"></div>
        <div class="form-group"><label class="form-label">Tingkat Biaya</label><input class="form-input" name="tingkatBiaya"></div>
        <div class="form-group"><label class="form-label">Tanggal Penetapan</label><input type="date" class="form-input" name="tanggalPenetapan"></div>
        <div class="form-group"><label class="form-label">Mata Anggaran</label><input class="form-input" name="mataAnggaran"></div>
        <div style="display:flex; gap:8px; margin-top:14px">
          <button type="button" id="perjadinCancel" class="btn-secondary" style="flex:1">Batal</button>
          <button type="submit" class="btn-primary" style="flex:2"><i class="fas fa-file-word"></i> Cetak SPT &amp; SPPD</button>
        </div>
      </form>
    </div>
  </div>
```

- [ ] **Step 3: Tambah CSS di `css/styles.css`**

Tambahkan di akhir file (pakai variabel tema eksisting):

```css
/* perjadin modal */
#perjadinModal .modal-content{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:16px}
#perjadinModal .btn-icon{background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer}
#perjadinModal .form-group{margin-bottom:8px}
```

- [ ] **Step 4: Tambah UI + orkestrasi di `js/tugas-spt.js`**

Tambahkan di dalam IIFE, **sebelum** baris `window.TugasSPT = {…}`:

```js
  function $(id) { return document.getElementById(id); }

  let _grupAktif = null;

  function masterIndex() {
    const out = {};
    const list = (window.MASTER_PEGAWAI || window._masterPegawai || []);
    for (const m of list) { if (m && m.nip) out[String(m.nip)] = m; }
    return out;
  }

  async function simpanPerjadin(ids, perjadin) {
    try {
      const r = await apiPost(P.penugasanPerjadin, {
        ids, perjadin, nomor_surat: perjadin.nomor
      });
      return !!(r && r.ok && r.data && r.data.ok !== false);
    } catch (e) {
      console.error('[SPT] simpan perjadin gagal:', e);
      return false;
    }
  }

  async function generate(grup, perjadin) {
    if (!window.bastRenderDocx) { showToast('Fungsi render dokumen belum siap.', 'error'); return false; }
    const idx = masterIndex();
    const tglKunci = (grup.items[0] && grup.items[0].tanggal) || '';
    const tagsSPT = bangunTagsSPT(grup, perjadin, idx);
    const okSPT = await window.bastRenderDocx(tagsSPT, 'SPT_' + tglKunci + '.docx', 'spt_template.docx');
    if (!okSPT) return false;
    for (const row of grup.items) {
      const tags = bangunTagsSPPD(row, grup, perjadin, idx);
      const nip = String(row.nip || '').replace(/\s+/g, '');
      await window.bastRenderDocx(tags, 'SPPD_' + nip + '_' + tglKunci + '.docx', 'sppd_template.docx');
    }
    const ids = grup.items.map(r => r.id).filter(Boolean);
    if (ids.length) {
      const ok = await simpanPerjadin(ids, perjadin);
      showToast(ok ? 'SPT & SPPD dibuat, detail tersimpan.' : 'Dokumen dibuat, tapi detail gagal disimpan.', ok ? 'success' : 'error');
    }
    return true;
  }

  function readForm() {
    const f = $('perjadinForm');
    const g = n => { const el = f.elements[n]; return el ? el.value : ''; };
    const p = merge(_grupAktif.perjadin);
    p.nomor = g('nomor') || p.nomor;
    p.nomorSPPD = g('nomorSPPD') || p.nomorSPPD;
    p.dasar = g('dasar') || p.dasar;
    p.maksud = g('maksud');
    p.tempatBerangkat = g('tempatBerangkat') || p.tempatBerangkat;
    p.tempatTujuan = g('tempatTujuan');
    p.alatAngkut = g('alatAngkut') || p.alatAngkut;
    p.tanggalBerangkat = g('tanggalBerangkat');
    p.tanggalKembali = g('tanggalKembali');
    p.tingkatBiaya = g('tingkatBiaya') || p.tingkatBiaya;
    p.tanggalPenetapan = g('tanggalPenetapan');
    p.mataAnggaran = g('mataAnggaran') || p.mataAnggaran;
    return p;
  }

  function fillForm(perjadin) {
    const f = $('perjadinForm');
    const set = (n, v) => { const el = f.elements[n]; if (el) el.value = v || ''; };
    set('nomor', perjadin.nomor);
    set('nomorSPPD', perjadin.nomorSPPD);
    set('dasar', perjadin.dasar);
    set('maksud', perjadin.maksud);
    set('tempatBerangkat', perjadin.tempatBerangkat);
    set('tempatTujuan', perjadin.tempatTujuan);
    set('alatAngkut', perjadin.alatAngkut);
    set('tanggalBerangkat', perjadin.tanggalBerangkat);
    set('tanggalKembali', perjadin.tanggalKembali);
    set('tingkatBiaya', perjadin.tingkatBiaya);
    set('tanggalPenetapan', perjadin.tanggalPenetapan);
    set('mataAnggaran', perjadin.mataAnggaran);
  }

  function bukaModal(grup) {
    _grupAktif = grup;
    const modal = $('perjadinModal');
    if (!modal) return;
    const info = $('perjadinInfo');
    if (info) {
      const nama = grup.items.map(r => r.nama || r.nip).join(', ');
      info.textContent = grup.items.length + ' pelaksana: ' + nama + ' — ' + ((grup.items[0] || {}).keterangan || '');
    }
    fillForm(merge(grup.perjadin));
    modal.style.display = 'flex';
  }

  function tutupModal() { const m = $('perjadinModal'); if (m) m.style.display = 'none'; }

  function initPerjadinModal() {
    const modal = $('perjadinModal');
    if (!modal || modal.dataset.ready) return;
    modal.dataset.ready = '1';
    const close = $('perjadinClose'), cancel = $('perjadinCancel'), form = $('perjadinForm');
    if (close) close.addEventListener('click', tutupModal);
    if (cancel) cancel.addEventListener('click', tutupModal);
    modal.addEventListener('click', e => { if (e.target === modal) tutupModal(); });
    if (form) form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!_grupAktif) return;
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        if (await generate(_grupAktif, readForm())) tutupModal();
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPerjadinModal);
    else initPerjadinModal();
  }
```

Lalu ubah ekspor menjadi:

```js
  window.TugasSPT = {
    terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
    personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge,
    bukaModal, generate, simpanPerjadin
  };
```

> Catatan: `apiPost(endpoint, body)` sudah ada (`js/api.js:15`) dan menerima path dari objek `P.*`. Konfigurasi wajib ditambah dulu — Modify `js/config.js:326` tepat setelah `penugasanList: '/api/penugasan',`:
>
> ```js
>   penugasanPerjadin: '/api/penugasan/perjadin',
> ```
>
> Bentuk balikan `apiPost` = `{ ok, data, status }` (bukan body mentah) — makanya `simpanPerjadin` memeriksa `r.data.ok !== false`.

- [ ] **Step 5: Salin ke www + update spec**

`Copy-Item js/tugas-spt.js www/js/tugas-spt.js -Force`; salin juga `css/styles.css` → `www/css/styles.css`, `js/simapo-bast.js` → `www/js/simapo-bast.js`, `js/config.js` → `www/js/config.js`; samakan script tag di `www/index.html`.
Modify spec §5/§9: catat bahwa generate memakai kembali `window.bastRenderDocx(tags, filename, templateUrl)` (diberi parameter template) alih-alih fungsi render baru.

- [ ] **Step 6: Uji manual (vite hidup di :5173)**

Buka Monitoring → pilih kartu → buka dialog → isi → Cetak. Expected: 2+ berkas terunduh (`SPT_<tanggal>.docx`, `SPPD_<nip>_<tanggal>.docx`), isi sesuai format, dan tidak ada error console. Cek baris `penugasan` di DB punya `perjadin` terisi.

- [ ] **Step 7: Commit**

```bash
git add js/simapo-bast.js js/tugas-spt.js js/config.js index.html css/styles.css www/js/tugas-spt.js www/index.html www/css/styles.css www/js/simapo-bast.js www/js/config.js docs/superpowers/specs/2026-10-16-spt-sppd-generator-design.md
git commit -m "feat(spt): dialog detail perjadin + generate SPT/SPPD"
```

---

### Task 6: Sambung ke kartu Monitoring Perjalanan Dinas

**Files:**
- Modify: `js/tugas_lembur.js` (`renderMonitoringTasks` — tombol Cetak per kartu)
- Create: `tests/tugas-spt-wiring.test.mjs`
- Modify: `package.json` (`scripts.test`)
- Modify: `www/js/tugas_lembur.js`, `www/index.html` (cache-bust)

**Interfaces:**
- Consumes: `window.TugasSPT.bukaModal(grup)` (Task 5), `window.TugasSPT.kelompokkan(rows)` (Task 3), array `_activeMonitoringTasks` (modul scope `js/tugas_lembur.js:2006`).
- Produces: tombol per kartu yang membuka dialog grup berisi pelaksana seperjalanan.

- [ ] **Step 1: Tulis tes wiring GAGAL — `tests/tugas-spt-wiring.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'tugas_lembur.js'), 'utf8');

test('renderMonitoringTasks: kartu punya tombol cetak SPT/SPPD', () => {
  assert.match(src, /window\.TugasSPT\.kelompokkan\(_activeMonitoringTasks\)/,
    'kartu harus mengelompokkan _activeMonitoringTasks via TugasSPT.kelompokkan');
  assert.match(src, /window\.TugasSPT\.bukaModal\(/,
    'tombol harus memanggil window.TugasSPT.bukaModal');
});

test('index.html: tugas-spt.js dimuat sebelum tugas_lembur.js', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iSpt = html.indexOf('js/tugas-spt.js');
  const iLembur = html.indexOf('js/tugas_lembur.js');
  assert.ok(iSpt >= 0, 'script js/tugas-spt.js belum ada di index.html');
  assert.ok(iLembur >= 0, 'script js/tugas_lembur.js tidak ditemukan');
  assert.ok(iSpt < iLembur, 'tugas-spt.js harus dimuat sebelum tugas_lembur.js');
});
```

- [ ] **Step 2: Daftarkan tes di `package.json`, jalankan → GAGAL**

Run: `node --test tests/tugas-spt-wiring.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Pindahkan `tugas-spt.js` lebih awal di `index.html`**

Pastikan `<script src="js/tugas-spt.js?v=1"></script>` berada **sebelum** `<script src="js/tugas_lembur.js…">` (tugas_lembur memanggil `window.TugasSPT` saat render). Samakan di `www/index.html`.

- [ ] **Step 4: Ubah `renderMonitoringTasks` agar tiap kartu punya indeks grup + tombol**

Modify `js/tugas_lembur.js:2035` — sebelum `data.map`, hitung grup:

```js
    const grupList = (window.TugasSPT && window.TugasSPT.kelompokkan)
      ? window.TugasSPT.kelompokkan(_activeMonitoringTasks)
      : [];
    const grupIndex = new Map();
    grupList.forEach((g, gi) => g.items.forEach(it => grupIndex.set(String(it.id), gi)));
```

Lalu di dalam `data.map(t => { … })`, tambahkan tombol di baris aksi — tepat setelah blok `${t.bukti ? … : ''}`. Pakai `data-grup` (jangan menyisipkan ekspresi JS ke string HTML):

```js
            <button class="btn-cetak-spt" data-grup="${grupIndex.has(String(t.id)) ? grupIndex.get(String(t.id)) : ''}" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--white); padding:6px 12px; border-radius:10px; font-size:10px; font-weight:700; cursor:pointer">
              <i class="fas fa-file-word"></i> SPT/SPPD
            </button>
```

Setelah `el.innerHTML = header + cards;` (baris 2083), simpan grup & pasang listener:

```js
    window.__tugasGrup = grupList;
    el.querySelectorAll('.btn-cetak-spt').forEach(btn => {
      btn.addEventListener('click', () => {
        const gi = Number(btn.dataset.grup);
        if (Number.isInteger(gi) && window.__tugasGrup[gi]) window.TugasSPT.bukaModal(window.__tugasGrup[gi]);
      });
    });
```

- [ ] **Step 5: Jalankan tes wiring → LULUS**

Run: `node --test tests/tugas-spt-wiring.test.mjs`
Expected: `# pass 2`.

- [ ] **Step 6: Cache-bust + salin ke www**

Modify `index.html` & `www/index.html`: naikkan `js/tugas_lembur.js?v=<naik>` dan `js/tugas-spt.js?v=<naik>`. Salin `js/tugas_lembur.js` → `www/js/tugas_lembur.js`, `index.html` → `www/index.html`.

- [ ] **Step 7: Jalankan seluruh tes (regresi)**

Run: `npm test`
Expected: `# pass 512` atau lebih (baseline 503 + 9 tes baru), 0 fail.

- [ ] **Step 8: Commit**

```bash
git add js/tugas_lembur.js tests/tugas-spt-wiring.test.mjs package.json index.html www/index.html www/js/tugas_lembur.js
git commit -m "feat(spt): tombol cetak SPT/SPPD di kartu monitoring perjalanan dinas"
```

---

## Catatan penyederhanaan (sengaja, bukan lupa)

- **Pengikut (SPPD)**: baris pengikut di template kosong dan diisi tangan → tidak diberi tag. Tambah loop `{#pengikut}` bila nanti perlu.
- **Baris "Untuk"**: satu baris (`<maksud> di <tempatTujuan>.`), bukan dua baris dengan tanggal. Tambah baris kedua bila pola docx-nya sudah pasti berfungsi.
- **Kepala/Sekretaris/Paraf**: nilai default di-hardcode di `DEFAULT_PERJADIN` (bukan lookup master) supaya tidak perlu resolusi pejabat; bisa diedit di dialog.
- **Tidak menyentuh `scripts/build-bast-template.js`**: helper dibagi lewat `scripts/docx-patch.js` untuk dua script baru saja — jangan refactor yang sudah jalan.

## Self-review

- **Cakupan spec**: §4.1/§4.2 (dialog + simpan JSONB) → Task 4 & 5; §4.3 (grup otomatis tanpa kolom) → Task 3 `kunciGrup`/`kelompokkan` + Task 6; §4.4 (SPT+SPPD) → Task 5 `generate`; §4.5 (client-side pola BAST) → Task 5 reuse `bastRenderDocx`; §6 skema `perjadin` → Task 3 `DEFAULT_PERJADIN` + Task 4 kolom; §9 tabel tag → Task 1 & 2 RULES; §11 error handling → toast + guard lib; §12 tes → 4 file tes baru.
- **Placeholder**: tidak ada "TBD"/"implement later". Satu titik yang menuntut verifikasi nama helper (`apiPost`) sudah diberi instruksi cek `js/api.js` — langkah konkret, bukan placeholder.
- **Konsistensi tipe**: `bangunTagsSPT`/`bangunTagsSPPD`/`bukaModal`/`kelompokkan` dipakai dengan nama & bentuk yang sama di Task 3, 5, 6. Tag di RULES Task 1/2 sama persis dengan key objek yang dibangun Task 3.
