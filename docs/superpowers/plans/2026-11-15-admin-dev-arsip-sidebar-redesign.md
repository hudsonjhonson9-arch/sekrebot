# Developer Diagnostics, Admin Grid, Arsip Agenda/SPPD & Desktop Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghadirkan fitur Developer Diagnostics & Activity Logger di Panel Admin, meredesain Panel Admin menjadi Menu Grid per Grup berbasis UI/UX Pro Max, memperbaiki tombol kembali di Arsip & menyelaraskan Agenda/SPPD seperti di `peta-ekonomi`, serta meredesain sidebar desktop menjadi lebih profesional dan terstruktur.

**Architecture:** Arsitektur modular memisahkan modul diagnostik developer (`js/dev-tools.js` + `server/core-admin.js`), router grid menu panel admin (`js/admin-grid.js`), penyempurnaan toolbar dan navigasi in-flow di modul Arsip, serta styling CSS modern berbasis token dan prinsip Anti-Slop `ui-ux-pro-max`.

**Tech Stack:** Vanilla JavaScript (ES6+), Express.js, PostgreSQL (`pg`), HTML5, CSS3 Custom Properties (Design Tokens), FontAwesome, Node Test Runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-11-15-admin-dev-arsip-sidebar-redesign.md`

## Global Constraints

- Semua tes unit & integrasi harus lulus tanpa regresi (752+ test).
- Perubahan pada `index.html`, `js/`, dan `css/` wajib disinkronkan ke mirror `www/` agar kompatibel dengan build Capacitor Android.
- Navigasi lama `switchAdminSection(sectionId)` dan panggilan global yang sudah ada (`loadKonfirmasiAdmin`, `loadAdminFaceReg`, `loadLokasiAdmin`, dll.) tidak boleh rusak (backward-compatible).
- Mengikuti 20 Aturan Anti-Slop UI/UX Pro Max: tidak ada badge pengisi acak, gunakan `tabular-nums` untuk angka/waktu, `R_inner = R_outer - padding`, kontras WCAG AA (4.5:1), dan font monospace hanya untuk data teknis/log.

## Review Focus

1. *Fallback ID section admin:* Jika admin menyimpan section basi di `localStorage`, router harus jatuh ke grid menu admin dengan anggun, bukan blank screen.
2. *Logger buffer overflow:* Log realtime harus dibatasi (max 200 entri) dengan pembersihan FIFO agar tidak menghabiskan kuota `localStorage`.
3. *Mobile/Desktop Responsive:* Menu grid admin harus 1 kolom pada mobile (`<768px`) dan 2–3 kolom pada tablet/desktop tanpa horizontal overflow.
4. *Tombol Kembali Arsip:* Saat berada di tampilan native (Dokumen, Agenda, SPPD, KK, BD), tombol kembali in-flow di header harus aktif; tombol melayang `.arsip-back` hanya aktif saat `body.arsip-fs` (iframe fullscreen).
5. *Sidebar Collapsed State:* Nav-item pada sidebar collapsed harus tetap menampilkan tooltip (`data-label`) dan tidak boleh merusak layout konten utama panel.

---

### Task 1: Backend Developer Health Endpoint & Diagnostics Core

**Files:**
- Modify: `server/core-admin.js`
- Modify: `server/index.js`
- Test: `server/core-admin.test.js`

**Steps:**
- [ ] Tulis unit test di `server/core-admin.test.js` untuk endpoint `/api/dev/health` (memastikan kembalian `{ ok: true, timestamp, uptime, db: { ok: true, latencyMs }, memory: { heapUsed, heapTotal } }`).
- [ ] Jalankan test untuk memastikan test gagal (`cd D:\Code\absensi; node --test server/core-admin.test.js`).
- [ ] Implementasikan handler `handleDevHealth(req, res)` di `server/core-admin.js` dengan ping query `SELECT 1` ke PostgreSQL pool.
- [ ] Daftarkan rute `GET /api/dev/health` di `server/index.js` (dilindungi auth admin / token).
- [ ] Jalankan kembali `node --test server/core-admin.test.js` dan pastikan lulus.

---

### Task 2: Frontend Developer Diagnostics & Activity Logger (`js/dev-tools.js`)

**Files:**
- Create: `js/dev-tools.js`
- Create: `tests/dev-tools.test.mjs`

**Steps:**
- [ ] Tulis test di `tests/dev-tools.test.mjs` yang memverifikasi:
  - `DEV_TRACKER.log(level, module, action, details)` mencatat dan menyimpan ke memori/storage.
  - `DEV_TRACKER.getLogs({ level, search })` memfilter berdasarkan level dan kata kunci.
  - `DEV_TRACKER.runDiagnostics()` mengembalikan skor kesehatan sistem dan status tiap subsistem.
  - `DEV_TRACKER.exportLogs()` menghasilkan format string JSON/TXT yang valid.
- [ ] Jalankan test untuk memastikan test gagal (`cd D:\Code\absensi; node --test tests/dev-tools.test.mjs`).
- [ ] Implementasikan `js/dev-tools.js`:
  - Objek global `window.DEV_TRACKER`.
  - Subsistem pengujian: Database, Backend API, Face Recognition (Human.js IndexedDB cache), Geolocation (GPS), Storage, Media, Telegram, n8n.
  - Auto-capture unhandled errors via `window.addEventListener('error')` dan `unhandledrejection`.
  - Render function untuk Health Matrix UI dan Log Table UI.
- [ ] Jalankan `node --test tests/dev-tools.test.mjs` dan pastikan lulus.

---

### Task 3: Redesain Panel Admin Menjadi Menu Grid per Grup (`ui-ux-pro-max`)

**Files:**
- Modify: `index.html`
- Modify: `js/ui.js`
- Modify: `css/styles.css`
- Test: `tests/admin-grid.test.mjs`

**Steps:**
- [ ] Buat unit test `tests/admin-grid.test.mjs` untuk memverifikasi landmark `#admin-grid-view`, tombol `[data-admin-card]`, tombol `← Kembali ke Menu Admin`, dan integrasi `switchAdminSection`.
- [ ] Jalankan test untuk memastikan test gagal (`cd D:\Code\absensi; node --test tests/admin-grid.test.mjs`).
- [ ] Desain dan terapkan markup Menu Grid per Grup di `#panel-admin` (`index.html`):
  - Grid View Container (`#admin-grid-view`) dengan 4 grup:
    1. Operasional & Kehadiran (Konfirmasi, Input Keterangan, Meja Absen)
    2. Manajemen Kepegawaian (Master Pegawai & Face AI, Kelola Admin)
    3. Konfigurasi Sistem (Lokasi, Jam Kerja, Libur, Seragam, Telegram, Instansi Superadmin)
    4. Developer Tools & Diagnostik (Health Matrix, Uji Fitur, Log Console)
  - Detail View Header Bar (`#admin-detail-head`) dengan tombol `← Kembali ke Menu Admin` dan judul modul aktif.
- [ ] Perbarui `js/ui.js` (`switchAdminSection`) untuk mendukung pembukaan kartu spesifik (drill-down) dan tombol kembali ke grid.
- [ ] Tambahkan styling CSS modern di `css/styles.css` sesuai panduan UI/UX Pro Max (grid responsive, card hover 150ms, border-radius matematis, badge status bersih).
- [ ] Jalankan `node --test tests/admin-grid.test.mjs` dan pastikan lulus.

---

### Task 4: Perbaikan Tombol Kembali di Arsip & Modul Agenda/SPPD

**Files:**
- Modify: `index.html`
- Modify: `js/arsip.js`
- Modify: `js/arsip-agenda.js`
- Modify: `js/arsip-sppd.js`
- Modify: `css/styles.css`
- Test: `tests/arsip-nav-header.test.mjs`

**Steps:**
- [ ] Buat test `tests/arsip-nav-header.test.mjs` untuk memverifikasi:
  - Header in-flow tombol `← Kembali` ada pada sub-layar native arsip (Dokumen, Agenda, SPPD, KK, BD).
  - Tombol `.arsip-back` mengambang hanya aktif saat `body.arsip-fs` (mode fullscreen iframe).
  - Modul Agenda memiliki KPI cards, tab Surat Masuk/Keluar, dan search bar.
  - Modul SPPD memiliki KPI cards dan tab Dalam/Luar Daerah.
- [ ] Jalankan test untuk memastikan test gagal (`cd D:\Code\absensi; node --test tests/arsip-nav-header.test.mjs`).
- [ ] Perbarui `js/arsip.js` untuk menyembunyikan floating `.arsip-back` pada view native dan mengontrol tombol kembali header in-flow.
- [ ] Perbarui `js/arsip-agenda.js` dan `js/arsip-sppd.js` agar memiliki header `← Kembali ke Menu Arsip`, KPI metric cards, tabs, dan layout terstruktur seperti di `peta-ekonomi`.
- [ ] Sesuaikan styling di `css/styles.css` untuk header in-flow arsip dan KPI cards.
- [ ] Jalankan `node --test tests/arsip-nav-header.test.mjs` dan pastikan lulus.

---

### Task 5: Redesain Desktop Sidebar (`ui-ux-pro-max`)

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/desktop.js`
- Test: `tests/sidebar-desktop.test.mjs`

**Steps:**
- [ ] Periksa dan sesuaikan test `tests/sidebar-desktop.test.mjs` agar memvalidasi struktur grouping baru (Utama, Layanan, Administrasi) tanpa melanggar kontrak data-label/title yang sudah ada.
- [ ] Perbarui markup `#tabsBar` di `index.html` dengan pembagian grup visual (kategori header halus) dan perbaikan tombol toggle collapse.
- [ ] Perbarui styling di `css/styles.css`:
  - Active accent bar (3px rounded pill di sisi kiri nav item).
  - Background hover & active bernuansa lembut (`rgba(59, 130, 246, 0.12)`).
  - Optical alignment antara icon dan teks label.
  - Dukungan smooth transition saat sidebar collapse / expand.
- [ ] Jalankan `node --test tests/sidebar-desktop.test.mjs` dan pastikan lulus.

---

### Task 6: Sinkronisasi Web Root (`www/`) & Verifikasi Suite Penuh

**Files:**
- Mirror: `www/index.html`
- Mirror: `www/css/styles.css`
- Mirror: `www/js/*`
- Test: Full test suite (`npm test`)

**Steps:**
- [ ] Salin file yang dimodifikasi (`index.html`, `css/styles.css`, `js/dev-tools.js`, `js/ui.js`, `js/arsip*.js`, `js/desktop.js`) ke direktori `www/`.
- [ ] Jalankan seluruh test suite `npm test` di `D:\Code\absensi`.
- [ ] Pastikan seluruh 752+ test (termasuk test baru) berstatus PASS 100% tanpa ada kegagalan regresi.
- [ ] Lakukan verifikasi runtime end-to-end (diagnostik sistem dan navigasi grid).
