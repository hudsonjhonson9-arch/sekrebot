# Task 3: simpanFaceToggle() — superadmin only, no localStorage

**Context:** Task 1 already removed localStorage from `loadFaceToggle()`. Now remove localStorage from `simpanFaceToggle()` and add superadmin-only visibility.

## Steps

### Step 1: Remove localStorage from `simpanFaceToggle()`

**File:** `js/admin-face.js:259-286`

Current code:
```javascript
    async function simpanFaceToggle() {
      const enabled = _faceTogglePending ?? FACE_RECOGNITION_ENABLED;
      const btn = $('btnSimpanFaceToggle');
      if (btn) { btn.disabled = true; dom.setText('btnFaceToggleText', '💾 Menyimpan...'); }
      const rc = $('faceToggleResult');
      if (rc) rc.style.display = 'flex';
      try {
        const instId = getScopedInstansiId();
        await apiPost(P.faceToggle, { enabled, instansi_id: instId, admin_id: MY_ID, admin_nips: ADMIN_NIPS });
        FACE_RECOGNITION_ENABLED = enabled;
        try { localStorage.setItem('face_recognition_bapperida', enabled ? '1' : '0'); } catch (_) { }
        _applyFaceToggleUI(enabled);
        showResult('faceToggleResult', 'faceToggleRIcon', 'faceToggleRTitle', 'faceToggleRMsg', 'success', '✅',
          enabled ? 'Face Recognition Diaktifkan' : 'Face Recognition Dinonaktifkan',
          enabled
            ? 'Semua pegawai wajib verifikasi wajah saat absen.'
            : 'HADIR hanya menggunakan GPS, tanpa kamera.'
        );
      } catch {
        // Simpan lokal saja
        FACE_RECOGNITION_ENABLED = enabled;
        try { localStorage.setItem('face_recognition_bapperida', enabled ? '1' : '0'); } catch (_) { }
        showResult('faceToggleResult', 'faceToggleRIcon', 'faceToggleRTitle', 'faceToggleRMsg', 'warning', '⚠️', 'Tersimpan Lokal',
          'Berhasil disimpan di perangkat ini, tapi gagal ke server. Pastikan webhook face-toggle aktif di n8n.');
      } finally {
        if (btn) { setTimeout(() => { btn.disabled = false; dom.setText('btnFaceToggleText', 'Simpan Pengaturan Face Recognition'); }, 2500); }
      }
    }
```

Delete these two lines (line 269 and 280 — the `localStorage.setItem` calls):
```javascript
        try { localStorage.setItem('face_recognition_bapperida', enabled ? '1' : '0'); } catch (_) { }
```

### Step 2: Add `id="faceToggleCard"` to index.html

**File:** `index.html` line 2381

Find:
```html
        <div class="card" style="margin-top:12px">
```
(Inside the `<!-- 📸 FACE RECOGNITION ══ -->` section)

Replace with:
```html
        <div id="faceToggleCard" class="card" style="margin-top:12px">
```

### Step 3: Show toggle only for superadmin in `_applyFaceToggleUI()`

**File:** `js/admin-face.js:204-224`

Current `_applyFaceToggleUI`:
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
      // Sinkronisasi UI profil dengan status toggle
      if (typeof updateProfilFaceUI === 'function') updateProfilFaceUI();
    }
```

Add AFTER the `if/else` block (before the updateProfilFaceUI line):
```javascript
      // Show toggle card only for superadmin
      const card = $('faceToggleCard');
      if (card) card.style.display = _isSuperAdmin() ? 'block' : 'none';
```

So the full function becomes:
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

## Verify

Run: `node -c "js/admin-face.js"` — expected: no errors

## Commit

```
git add js/admin-face.js index.html
git commit -m "fix: face toggle only for superadmin, no localStorage fallback in simpanFaceToggle"
```
