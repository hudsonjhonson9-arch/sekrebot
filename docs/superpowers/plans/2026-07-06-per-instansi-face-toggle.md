# Per-Instansi Face Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace global `FACE_RECOGNITION_ENABLED` with per-instansi setting from `pengaturan` table.

**Architecture:** `pengaturan` table stores `face_recognition_enabled` per `instansi_id`. Login checks after user fetch. `loadFaceToggle()` passes `instansi_id`. Non-superadmin can't see the toggle.

**Tech Stack:** Vanilla JS, n8n, PostgreSQL (MCP-postgres)

## Global Constraints

- `pengaturan` key = `face_recognition_enabled`, value = `"1"` / `"0"`
- Default for instansi without entry = `"0"` (OFF)
- API error/timeout → OFF (safe, don't block login)
- Only superadmin sees the toggle in admin panel
- `FACE_RECOGNITION_ENABLED` global var still exists for absen flow, but set per-instansi

---
### Task 1: `loadFaceToggle()` — accept instansi_id

**Files:**
- Modify: `js/admin-face.js:230-249`
- Modify: `js/face.js:42` (remove default, set to null)

**Interfaces:**
- Produces: `loadFaceToggle(instansi_id?)` — optional param, falls back to `getScopedInstansiId()`

- [ ] **Remove global default** in `js/face.js:42`

  Replace `let FACE_RECOGNITION_ENABLED = true;` with `let FACE_RECOGNITION_ENABLED = null;`

- [ ] **Update `loadFaceToggle()` in admin-face.js**

  Current (lines 230-249):
  ```javascript
  async function loadFaceToggle() {
    try {
      const res = await apiGet(P.faceToggle);
      if (!res.ok) throw 0;
      const rawFT = res.rows.length ? res.rows[0] : (res?.data ?? {});
      const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
      FACE_RECOGNITION_ENABLED = d?.enabled !== false;
    } catch {
      try {
        const v = localStorage.getItem('face_recognition_bapperida');
        if (v !== null) FACE_RECOGNITION_ENABLED = v !== '0';
        else FACE_RECOGNITION_ENABLED = false;
      } catch (_) {
        FACE_RECOGNITION_ENABLED = false;
      }
    }
    _faceTogglePending = FACE_RECOGNITION_ENABLED;
    _applyFaceToggleUI(FACE_RECOGNITION_ENABLED);
  }
  ```

  Replace with (add instansi_id param, no localStorage fallback):
  ```javascript
  async function loadFaceToggle(instansi_id) {
    const inst = instansi_id || getScopedInstansiId();
    if (!inst) { FACE_RECOGNITION_ENABLED = false; return; }
    try {
      const res = await apiGet(P.faceToggle + '&instansi_id=' + inst);
      if (!res.ok) throw 0;
      const rawFT = res.rows?.length ? res.rows[0] : (res?.data ?? {});
      const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
      FACE_RECOGNITION_ENABLED = d?.enabled !== false;
    } catch {
      // API down → safe default: no face required
      FACE_RECOGNITION_ENABLED = false;
    }
    _faceTogglePending = FACE_RECOGNITION_ENABLED;
    _applyFaceToggleUI(FACE_RECOGNITION_ENABLED);
  }
  ```

- [ ] **Remove the parse-time localStorage pre-check** that was added in admin-face.js (the IIFE `_restoreFaceToggleSync`). No longer needed since login will check per-instansi after user fetch.

  Delete these lines from admin-face.js:
  ```javascript
  (function _restoreFaceToggleSync() {
    try {
      const ft = localStorage.getItem('face_recognition_bapperida');
      if (ft !== null) FACE_RECOGNITION_ENABLED = ft !== '0';
      else FACE_RECOGNITION_ENABLED = false;
    } catch (_) {}
  })();
  ```

- [ ] **Remove `loadFaceToggle();` parse-time call** from admin-face.js (the one we added). Keep the async call at `initApp()` time only.

- [ ] **Commit**
  ```
  git add js/admin-face.js js/face.js
  git commit -m "refactor: loadFaceToggle accepts instansi_id, no localStorage fallback"
  ```

---

### Task 2: `auth.js` — check per-instansi face toggle AFTER user fetch

**Files:**
- Modify: `js/auth.js:73-98`

**Interfaces:**
- Consumes: `P.faceToggle`, `apiGet`, user object with `instansi_id`
- Produces: Per-instansi face check during login

- [ ] **Update the face check in `handleAuthAction('login')`**

  Current (lines 73-98):
  ```javascript
  // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
  const isFaceEnabled = typeof FACE_RECOGNITION_ENABLED !== 'undefined' ? FACE_RECOGNITION_ENABLED : true;
  const hasFace = ...
  const userNip = ...
  const targetId = ...

  const finalizeLogin = async () => {
    ...
    location.reload();
  };

  if (isFaceEnabled && typeof openCamOverlay === 'function') {
    // face verification flow
  }
  // No face: direct login
  finalizeLogin();
  ```

  Replace with:
  ```javascript
  // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
  const userInstansi = (user.instansi_id || user.Instansi_Id || '').trim();
  // Check per-instansi face toggle
  let isFaceEnabled = false;
  try {
    const faceRes = await apiGet(P.faceToggle + '&instansi_id=' + userInstansi);
    if (faceRes.ok) {
      const rawFT = faceRes.rows?.length ? faceRes.rows[0] : (faceRes?.data ?? {});
      const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
      isFaceEnabled = d?.enabled === true || d?.enabled === '1' || d?.enabled === 1;
    }
  } catch (_) {}
  // Ponytail: if toggle fetch fails → safe default = OFF, no face required

  const hasFace = !!(user.face_histogram && user.face_histogram !== '[]' && user.face_histogram !== '[]' && user.face_histogram !== '')
    || !!(user.face_photo && user.face_photo !== '' && user.face_photo !== 'null')
    || !!(user.foto_base64 && user.foto_base64 !== '')
    || !!(user.descriptor && user.descriptor !== '[]');
  const userNip = String(user.nip || '').trim();
  const targetId = String(user.telegram_id || user.id);

  const finalizeLogin = async () => {
    ...
    location.reload();
  };

  if (isFaceEnabled && typeof openCamOverlay === 'function') {
    // face verification flow
  }
  // No face: direct login
  finalizeLogin();
  ```

  Key changes:
  - Removed global `FACE_RECOGNITION_ENABLED` reference
  - Added async API call to `P.faceToggle` with `userInstansi`
  - `isFaceEnabled` defaults to `false` on error
  - `isFaceEnabled` is `true` only when API returns `enabled: true`

- [ ] **Commit**
  ```
  git add js/auth.js
  git commit -m "fix: login checks face toggle per-instansi after user fetch"
  ```

---

### Task 3: `simpanFaceToggle()` — only for superadmin, remove localStorage

**Files:**
- Modify: `js/admin-face.js:265-292` (simpanFaceToggle)
- Modify: `js/admin-face.js` (toggle visibility)

- [ ] **Update `simpanFaceToggle()` — remove localStorage fallback**

  Current: writes to localStorage even when API fails. Remove the localStorage lines:
  ```javascript
  // Delete these lines:
  try { localStorage.setItem('face_recognition_bapperida', enabled ? '1' : '0'); } catch (_) { }
  ```

  The function already sends `instansi_id` in the payload (line 272-273) — that stays.

- [ ] **Admin visibility: hide toggle for non-superadmin**

  The face toggle card is in `index.html:2381` (no `id` on the card div). Add `id="faceToggleCard"` to the card:

  ```diff
  - <div class="card" style="margin-top:12px">
  + <div id="faceToggleCard" class="card" style="margin-top:12px">
  ```

  Add visibility check at the end of `_applyFaceToggleUI()` (admin-face.js:204-224):
  ```javascript
  function _applyFaceToggleUI(enabled) {
    const sw = $('faceToggleSwitch');
    const knob = $('faceToggleKnob');
    const label = $('faceToggleLabel');
    const desc = $('faceToggleDesc');
    if (!sw || !knob) return;

    if (enabled) {
      if (sw) sw.style.background = '#22c55e';
      if (knob) knob.style.left = '27px';
      if (label) label.textContent = '🟢 Face Recognition Aktif';
      if (desc) desc.textContent = 'Pegawai wajib verifikasi wajah saat absen';
    } else {
      if (sw) sw.style.background = '#6b7280';
      if (knob) knob.style.left = '3px';
      if (label) label.textContent = '⚪ Face Recognition Nonaktif';
      if (desc) desc.textContent = 'Absen tanpa verifikasi wajah (hanya GPS)';
    }
    // Show toggle card only for superadmin
    const card = $('faceToggleCard');
    if (card) card.style.display = _isSuperAdmin() ? 'block' : 'none';
    if (typeof updateProfilFaceUI === 'function') updateProfilFaceUI();
  }
  ```

- [ ] **Commit**
  ```
  git add js/admin-face.js
  git commit -m "fix: face toggle only for superadmin, no localStorage fallback"
  ```

---

### Task 4: `app.js` — remove safety guard

**Files:**
- Modify: `js/app.js:7-12`

- [ ] **Remove the safety guard block** added earlier:

  Delete from `initApp()`:
  ```javascript
  // Safety pre-check: restore face toggle from localStorage before identity check
  // (in case admin-face.js didn't load — syntax error, SW cache, etc.)
  try {
    const ft = localStorage.getItem('face_recognition_bapperida');
    if (ft !== null) FACE_RECOGNITION_ENABLED = ft !== '0';
    else FACE_RECOGNITION_ENABLED = false;
  } catch (_) {}
  ```

  No longer needed since login checks per-instansi after user fetch, and the global variable defaults to `null`.

- [ ] **Commit**
  ```
  git add js/app.js
  git commit -m "cleanup: remove localStorage face toggle guard from initApp"
  ```

---

### Task 5: n8n face-toggle workflow — handle instansi_id

**Files:**
- Create: `scripts/migration_006_face_toggle_per_instansi.sql`
- Modify: `n8n/face-toggle-wf.json` (or recreate)

- [ ] **Create migration SQL**

  `scripts/migration_006_face_toggle_per_instansi.sql`:
  ```sql
  -- Migration: Per-instansi face toggle entries in pengaturan
  -- Default: OFF for all existing instansi
  INSERT INTO pengaturan (key, value, instansi_id)
  SELECT 'face_recognition_enabled', '0', DISTINCT instansi_id FROM pengaturan
  WHERE instansi_id IS NOT NULL AND instansi_id != ''
  ON CONFLICT (key, instansi_id) DO NOTHING;
  ```

- [ ] **Update n8n face-toggle workflow**

  The n8n face-toggle workflow needs two changes:

  **GET** `/webhook/face-toggle`:
  - Read `instansi_id` from query params
  - Query: `SELECT value FROM pengaturan WHERE key='face_recognition_enabled' AND instansi_id='{{query.instansi_id}}'`
  - Return `{ enabled: true/false }` based on value
  - If no row found → return `{ enabled: false }`

  **POST** `/webhook/face-toggle`:
  - Body already contains: `{ enabled, instansi_id, admin_id, admin_nips }`
  - Verify superadmin via `admin_nips` or role check
  - If `enabled === true`: `INSERT INTO pengaturan (key, value, instansi_id) VALUES ('face_recognition_enabled', '1', '{{body.instansi_id}}') ON CONFLICT (key, instansi_id) DO UPDATE SET value='1'`
  - If `enabled === false`: `INSERT INTO pengaturan (key, value, instansi_id) VALUES ('face_recognition_enabled', '0', '{{body.instansi_id}}') ON CONFLICT (key, instansi_id) DO UPDATE SET value='0'`

- [ ] **Commit**
  ```
  git add scripts/migration_006_face_toggle_per_instansi.sql n8n/face-toggle-wf.json
  git commit -m "feat: per-instansi face toggle n8n workflow + migration"
  ```

---

### Task 6: Sync `admin.js` (duplicate)

**Files:**
- Modify: `js/admin.js` (if loaded — check index.html script tags)

- [ ] **Check if admin.js is loaded** — earlier grep showed no `<script src="js/admin.js">` in index.html. If not loaded, skip. If loaded, apply same changes as admin-face.js.

- [ ] **Commit (if needed)**
  ```
  git add js/admin.js
  git commit -m "fix: sync admin.js with per-instansi face toggle"
  ```

---

### Task 7: Cleanup & verify

- [ ] **Verify `FACE_RECOGNITION_ENABLED` usage**

  Check all references to ensure they still work:
  - `absen.js:76` — `const useFace = (FACE_RECOGNITION_ENABLED || isMandatory) && navigator.onLine;`
    - After login reload, `loadFaceToggle()` in `initApp()` sets this from the correct instansi
    - After login without reload (first login), `isFaceEnabled` in auth.js handles it directly
    - `FACE_RECOGNITION_ENABLED` might still be `null` on first login → null is falsy → `useFace = false || isMandatory` → depends on `isMandatory`. This is correct behavior: if the global hasn't been set yet, face is only required if NIP is in `mandatory_nips`.

- [ ] **Final commit**
  ```
  git add -A
  git commit -m "feat: per-instansi face toggle — login checks + superadmin-only toggle"
  git push origin main
  ```
