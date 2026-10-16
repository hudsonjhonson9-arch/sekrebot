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
