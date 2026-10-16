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
