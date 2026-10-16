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
