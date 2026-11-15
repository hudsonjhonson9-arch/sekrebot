# Role Management Absensi & Rename SIMAPO ke Aset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement isolated Role Management for `absensi` without colliding with `peta-ekonomi` on the shared PostgreSQL instance, and rename all user-facing SIMAPO labels to "Aset".

**Architecture:** 
- Dedicated PostgreSQL table `absen_roles` with `id`, `nama`, `deskripsi`, `is_system`, `permissions JSONB`, `created_at`.
- Dedicated endpoints under `/api/admin/roles` and `/api/absen-roles` to completely isolate from `peta-ekonomi`'s `/api/roles` and `sd_roles`.
- Dynamic permission checking in `server/auth.js` integrating with `user_list.role` and `user_list.app_permissions`.
- Clean UI under Admin Panel Grup 2 (Kepegawaian) conforming to `ui-ux-pro-max` 20 Anti-Slop Golden Rules.
- Rename user-facing labels "SIMAPO" to "Aset" while preserving backend database tables for zero disruption.

**Tech Stack:** Node.js, Express, PostgreSQL, Vanilla JS, CSS (RuneIcons).

## Global Constraints
- **Strict Database Non-Collision:** NEVER modify `sd_roles` or `user_credentials.role` in the shared PostgreSQL database.
- **Strict API Non-Collision:** NEVER register `/api/roles` root route (used by `peta-ekonomi`); use `/api/admin/roles` or `/api/absen-roles`.
- **Anti-Slop UI Rules:** No raw emojis in markup or code, no decorative filler badges, use `tabular-nums` on numbers, WCAG AA contrast.
- **Dual Directory Mirroring:** Every frontend update in `index.html` and `js/` must be synchronized to `www/index.html` and `www/js/`.
- **Test Integrity:** All existing tests (788 tests) must continue to pass 100%.

---

### Task 1: Rename User-Facing "SIMAPO" to "Aset"
**Files:**
- Modify: `index.html`
- Modify: `www/index.html`
- Modify: `js/simapo-ui.js` / `www/js/simapo-ui.js`
- Test: `tests/aset-screens.test.mjs`, `tests/aset-nav.test.mjs`

**Steps:**
- [x] Rename header titles, modal titles, and navigation labels from "SIMAPO" / "SIMAPO Aset" to "Aset" in `index.html`.
- [x] Sync identical changes to `www/index.html`.
- [x] Update labels in `js/simapo-ui.js` and `www/js/simapo-ui.js` (e.g. notification toasts, card headers).
- [x] Run existing aset tests: `node --test tests/aset-nav.test.mjs tests/aset-screens.test.mjs`.

---

### Task 2: Database Schema & Migration (`absen_roles`)
**Files:**
- Create: `server/migrations/006_absen_roles.sql`
- Create: `server/absen-roles-db.js`
- Test: `server/absen-roles-db.test.js`

**Steps:**
- [ ] Create `server/migrations/006_absen_roles.sql` defining `absen_roles` table with default system roles:
  - `SUPERADMIN`: full access across all modules and agencies.
  - `ADMIN`: operational admin within agency.
  - `KEPALA`: approval for izin/keterangan, lembur, SPPD, laporan aset.
  - `SEKRETARIS`: verifikasi dan approval administrasi.
  - `KABID`: verifikasi lembur dan SPPD bidang.
  - `BENDAHARA_BARANG`: kelola penuh modul Aset (pencatatan, mutasi, peminjaman, kartu pemeliharaan, laporan).
  - `USER`: presensi standar, pengajuan izin, pengajuan lembur.
- [ ] Implement `server/absen-roles-db.js` providing `initAbsenRolesTable(pool)`, `getRoles(pool)`, `getRoleById(pool, id)`, `createRole(pool, role)`, `updateRole(pool, id, role)`, `deleteRole(pool, id)`.
- [ ] Ensure `deleteRole` forbids deleting `is_system = true` roles.
- [ ] Write unit tests `server/absen-roles-db.test.js` verifying isolation from `sd_roles` and correct CRUD behavior.

---

### Task 3: Backend REST API & Auth Integration
**Files:**
- Create: `server/absen-roles.js`
- Modify: `server/auth.js`
- Modify: `server/index.js`
- Test: `server/absen-roles.test.js`

**Steps:**
- [ ] Implement `server/absen-roles.js` with Express router:
  - `GET /api/admin/roles`: List all roles, permissions, and member count from `user_list`.
  - `GET /api/admin/roles/:id`: Detail of a specific role.
  - `POST /api/admin/roles`: Create custom role with permissions array.
  - `PUT /api/admin/roles/:id`: Update custom role (for system roles, permissions can be tweaked or locked).
  - `DELETE /api/admin/roles/:id`: Delete custom role (returns 400 for system role).
  - `POST /api/admin/roles/assign`: Assign role to user in `user_list`.
  - `GET /api/admin/roles/permissions-list`: List available system modules and capabilities.
- [ ] Mount router in `server/index.js` at `/api/admin/roles`.
- [ ] Enhance `server/auth.js` to support checking permissions from `absen_roles` dynamically.
- [ ] Write test `server/absen-roles.test.js` covering all endpoints, RBAC enforcement, and system role safeguards.

---

### Task 4: Frontend UI Role Management in Admin Panel
**Files:**
- Modify: `index.html`
- Modify: `www/index.html`
- Create: `js/admin-roles.js`
- Create: `www/js/admin-roles.js`
- Modify: `js/ui.js` / `www/js/ui.js`
- Test: `tests/admin-roles-ui.test.mjs`

**Steps:**
- [x] Add menu card "Kelola Role & Hak Akses" in Admin Panel Grup 2 (Manajemen Kepegawaian) with `data-admin-card="roles"`.
- [x] Add full card container `#adminRolesCard` with:
  - Table of roles: Nama Role, Deskripsi, Hak Akses (badge ringkas), Jumlah Pegawai, Aksi (Edit / Hapus).
  - "Tambah Role Baru" button.
  - Modal/Drawer edit permissions with checkboxes categorized by module: Presensi, Keterangan, Lembur, SPPD/Perjadin, Aset, Arsip, Admin.
  - Modal assignment: assign user ke role.
- [x] Implement `js/admin-roles.js` handling fetch, save, delete, and user assignment.
- [x] Follow all 20 Anti-Slop Golden UI/UX Rules (clean typography, no filler badges, `tabular-nums`, high contrast).
- [x] Mirror changes to `www/index.html` and `www/js/admin-roles.js`.
- [x] Write `tests/admin-roles-ui.test.mjs` verifying UI element IDs, structure, and synchronization.

---

### Task 5: End-to-End Verification, Test Suite & Deployment
**Files:**
- Run: `npm test`
- Run: `git status`, `git commit`, `git push`

**Steps:**
- [ ] Run full test suite (`npm test`) and ensure 100% pass across all tests.
- [ ] Verify no collateral changes or stray files.
- [ ] Commit and push to `origin/main`.
