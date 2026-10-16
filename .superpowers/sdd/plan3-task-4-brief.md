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
