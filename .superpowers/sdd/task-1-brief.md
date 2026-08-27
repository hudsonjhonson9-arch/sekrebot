# Task 1: loadFaceToggle() — accept instansi_id, remove localStorage fallback

**Files:**
- Modify: `js/face.js:42`
- Modify: `js/admin-face.js:230-249`
- Modify: `js/admin-face.js` (remove parse-time pre-check)

**Context:** This is the first task in converting face toggle from global to per-instansi. The global variable `FACE_RECOGNITION_ENABLED` still exists for the absen flow, but will be set per-instansi via `loadFaceToggle(instansi_id)`.

## Steps

### Step 1: Change default in face.js

**File:** `js/face.js` line 42

Replace:
```javascript
let FACE_RECOGNITION_ENABLED = true;
```
With:
```javascript
let FACE_RECOGNITION_ENABLED = null;
```

### Step 2: Update `loadFaceToggle()` in admin-face.js

**File:** `js/admin-face.js` lines 230-249

Current code:
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

Replace with (accept optional instansi_id param, no localStorage fallback):
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
    FACE_RECOGNITION_ENABLED = false;
  }
  _faceTogglePending = FACE_RECOGNITION_ENABLED;
  _applyFaceToggleUI(FACE_RECOGNITION_ENABLED);
}
```

### Step 3: Remove parse-time pre-check in admin-face.js

Find and delete this block from `js/admin-face.js`:
```javascript
(function _restoreFaceToggleSync() {
  try {
    const ft = localStorage.getItem('face_recognition_bapperida');
    if (ft !== null) FACE_RECOGNITION_ENABLED = ft !== '0';
    else FACE_RECOGNITION_ENABLED = false;
  } catch (_) {}
})();
```

Also remove this line:
```javascript
loadFaceToggle();
```

(These were added in a previous commit. The comment below them says "ponytail: do NOT call loadFaceSettings() at parse time — moved to initApp()" which should stay.)

### Step 4: Verify syntax

Run: `node -c "js/admin-face.js"` and `node -c "js/face.js"`
Expected: no output (no errors)

### Step 5: Commit

```
git add js/admin-face.js js/face.js
git commit -m "refactor: loadFaceToggle accepts instansi_id, no localStorage fallback"
```
