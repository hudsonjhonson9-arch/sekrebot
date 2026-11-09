# Panel Manajemen Wewenang SSO Terpusat di Absensi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun antarmuka manajemen wewenang SSO terpusat berbasis NIP dan endpoint pendukungnya pada aplikasi Absensi (`absensi_refactored_v6`), memungkinkan Super Admin mengaktifkan/menonaktifkan akses dan role per aplikasi (Absensi, SIMAPO, Satu Data, Perencanaan, Web Portal) serta melakukan reset password pegawai secara instan.

**Architecture:** Frontend menggunakan komponen modal berbasis Vanilla JS / SweetAlert2 di `js/admin-pegawai.js` terintegrasi dengan tabel manajemen pegawai eksisting. Backend memperluas Express router di `server/core-admin.js` dan `server/auth-session.js` untuk membaca/memperbarui kolom `app_permissions` JSONB, status aktif, dan opsi toggle `require_password` di PostgreSQL `n8n_storage`.

**Tech Stack:** Express.js, PostgreSQL (`pg`), Node.js native test runner (`node:test`), Vanilla JS, CSS Variables, SweetAlert2.

**Spec:** `C:\Users\Agil\.gemini\antigravity\brain\47ab249b-8774-471f-a7e7-61029c5e543f\rencana_sso_terpusat_berbasis_nip.md`

## Global Constraints
- **Preserve Existing Behavior:** Pegawai tanpa password tetap dapat absen selama `require_password = '0'`.
- **Zero AI Slop:** Desain antarmuka modal bersih, kontras tinggi, menggunakan CSS tokens proyek (`--gold`, `--border`, `--bg-card`, dll.), toggle switch rapi, tanpa ornamen berlebihan.
- **Fail-Closed Security:** Hanya peran `ADMIN` / `SUPERADMIN` yang dapat mengubah wewenang pegawai (`requireMedia` check). Perubahan wewenang langsung tersimpan ke `user_list.app_permissions` JSONB.
- **Default Password:** Password reset default adalah `BapperidaSB2026`.

## Review Focus
1. Input ID pegawai tidak valid atau lintas-instansi ditolak dengan status 400 / 403.
2. Akun dengan `status_aktif = false` ditolak saat login (`/api/auth/login`) dengan status 403.
3. Payload `app_permissions` yang parsial atau tidak lengkap di-merge secara aman tanpa menghilangkan izin aplikasi lain.
4. Nilai `require_password = '0'` di `public.pengaturan` tetap membolehkan login absensi NIP-only (backward compatible).
5. Tampilan modal responsive di layar desktop maupun mobile browser.

---

### Task 1: Backend Endpoints untuk Kelola Wewenang & Reset Password

**Files:**
- Modify: `D:\Code\absensi_refactored_v6\server\core-admin.js`
- Test: `D:\Code\absensi_refactored_v6\server\core-admin.test.js`

**Interfaces:**
- Consumes: `public.user_list (id, "NIP", app_permissions, status_aktif, password_hash)`
- Produces:
  - `POST /api/user-permissions`: `{ id: string, app_permissions: object, status_aktif?: boolean }` $\rightarrow$ `{ ok: true, data: object }`
  - `POST /api/user-reset-password`: `{ id: string, password?: string }` $\rightarrow$ `{ ok: true, message: string }`

- [ ] **Step 1: Write failing tests in `server/core-admin.test.js`**
  - Uji `GET /api/user-list` mengembalikan `app_permissions` dan `status_aktif`.
  - Uji `POST /api/user-permissions` berhasil memperbarui JSONB wewenang.
  - Uji `POST /api/user-permissions` menolak caller non-admin (403).
  - Uji `POST /api/user-reset-password` menyetel ulang `password_hash` ke default `BapperidaSB2026`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test server/core-admin.test.js`
  Expected: FAIL on new test assertions (endpoints not implemented).

- [ ] **Step 3: Implement endpoints in `server/core-admin.js`**
  - Perbarui `USER_SELECT` agar menyertakan kolom `COALESCE(status_aktif, true) AS status_aktif` dan `app_permissions`.
  - Tambahkan handler `POST /user-permissions`: validasi `requireMedia(req, res)`, periksa `sameInstansi`, jalankan `UPDATE user_list SET app_permissions = $1, status_aktif = COALESCE($2, status_aktif) WHERE id = $3 RETURNING ...`.
  - Tambahkan handler `POST /user-reset-password`: validasi `requireMedia(req, res)`, hash password baru atau gunakan default `$2a$10$qyVxAODHUx6WLLF0Tm/I7u/T1b.m0hZW2FD2ivm/6U7K.SRiIgjwq` (`BapperidaSB2026`), jalankan `UPDATE user_list SET password_hash = $1 WHERE id = $2`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test server/core-admin.test.js`
  Expected: PASS

---

### Task 2: Backend Penegakan Status Aktif & Toggle Password di Login

**Files:**
- Modify: `D:\Code\absensi_refactored_v6\server\auth-session.js`
- Test: `D:\Code\absensi_refactored_v6\server\auth-session.test.js`

**Interfaces:**
- Consumes: `public.pengaturan (key='require_password')`, `public.user_list (status_aktif, password_hash, app_permissions)`
- Produces: Respon `/api/auth/login` menyertakan `app_permissions`, menolak user nonaktif (403), dan memeriksa password jika toggle `require_password = '1'`.

- [ ] **Step 1: Write failing tests in `server/auth-session.test.js`**
  - Uji login ditolak dengan 403 jika `status_aktif === false`.
  - Uji respon sukses login menyertakan field `app_permissions` dan `status_aktif`.
  - Uji toggle `require_password = '0'` membolehkan login hanya dengan NIP (tanpa password).

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test server/auth-session.test.js`
  Expected: FAIL on new assertions.

- [ ] **Step 3: Implement validation in `server/auth-session.js`**
  - Di `POST /api/auth/login`, tambahkan pemeriksaan:
    ```javascript
    if (user.status_aktif === false) {
      return res.status(403).json({ ok: false, message: 'Akun Anda dinonaktifkan. Hubungi administrator.' });
    }
    ```
  - Sertakan `app_permissions: user.app_permissions` di objek user yang dikembalikan ke client.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test server/auth-session.test.js`
  Expected: PASS

---

### Task 3: Antarmuka UI Modal "Hak Akses SSO" di Panel Admin Pegawai

**Files:**
- Modify: `D:\Code\absensi_refactored_v6\js\admin-pegawai.js`
- Modify: `D:\Code\absensi_refactored_v6\www\js\admin-pegawai.js`
- Test: `D:\Code\absensi_refactored_v6\tests\admin-sso-ui.test.mjs`

**Interfaces:**
- Consumes: `_pegawaiCache`, `POST /api/user-permissions`, `POST /api/user-reset-password`
- Produces: Modal popup interaktif "Kelola Hak Akses SSO" dengan switch toggle per aplikasi dan tombol reset password.

- [ ] **Step 1: Write failing UI test in `tests/admin-sso-ui.test.mjs`**
  - Uji keberadaan fungsi `bukaModalSSO` dan struktur HTML modal yang dihasilkan.
  - Uji serialisasi form wewenang: toggle Absensi, SIMAPO, Satu Data, Perencanaan, dan Web Portal.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/admin-sso-ui.test.mjs`
  Expected: FAIL (`bukaModalSSO is not defined`).

- [ ] **Step 3: Implement UI in `js/admin-pegawai.js` (dan salinannya di `www/js/admin-pegawai.js`)**
  - Tambahkan tombol aksi `<button class="btn btn-sm btn-outline-warning" title="Hak Akses SSO" onclick="bukaModalSSO('${uid}')"><i class="fas fa-shield-alt"></i></button>` di setiap baris tabel pegawai.
  - Buat fungsi `bukaModalSSO(userId)` yang mengambil data user dari `_pegawaiCache` dan menampilkan modal SweetAlert2 / custom modal:
    - Informasi Pegawai (Nama, NIP, Jabatan).
    - Saklar Status Akun: Aktif / Nonaktif.
    - Card wewenang per modul dengan checkbox ON/OFF dan dropdown Role:
      1. Absensi Digital (`PEGAWAI`, `ADMIN_ABSEN`)
      2. SIMAPO Aset (`PEGAWAI`, `BENDAHARA_BARANG`, `ADMIN_ASET`)
      3. Satu Data Daerah (`KONTRIBUTOR`, `WALIDATA_ADMIN`)
      4. Perencanaan & PKS (`STAF`, `REVIEWER_KABID`, `ADMIN_PERENCANAAN`)
      5. Web Portal (`EDITOR_BERITA`, `SUPERADMIN_PORTAL`)
    - Tombol "Reset Password ke BapperidaSB2026".
  - Buat fungsi `simpanWewenangSSO(userId)` yang mengirim payload ke `POST /api/user-permissions`.
  - Buat fungsi `resetPasswordPegawai(userId, nip)` yang memanggil `POST /api/user-reset-password`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/admin-sso-ui.test.mjs`
  Expected: PASS

---

### Task 4: Verifikasi Menyeluruh & Build Verification

**Files:**
- Entire repository `D:\Code\absensi_refactored_v6`

- [ ] **Step 1: Run full test suite in `absensi_refactored_v6`**
  Run: `npm test`
  Expected: All 673+ tests pass with 0 failures.

- [ ] **Step 2: Run live integration tests**
  Run: `npm run test:live`
  Expected: 13/13 tests pass.

- [ ] **Step 3: Run production build**
  Run: `npm run build`
  Expected: Build succeeds with 0 errors.

