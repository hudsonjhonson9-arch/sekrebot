# Task 4: app.js — remove safety guard

**Context:** The localStorage safety guard in `initApp()` was added when face toggle was global. Now face toggle is per-instansi (checked in auth.js at login), so the parse-time pre-check is no longer needed. Remove the guard, keep the `loadFaceToggle()` call.

## Step

**File:** `js/app.js:1-11`

Current:
```javascript
    async function initApp() {
      try {
        fetchInstansiList(); // Pre-load instansi for registration
        // Safety pre-check: restore face toggle from localStorage before identity check
        // (in case admin-face.js didn't load — syntax error, SW cache, etc.)
        try {
          const ft = localStorage.getItem('face_recognition_bapperida');
          if (ft !== null) FACE_RECOGNITION_ENABLED = ft !== '0';
          else FACE_RECOGNITION_ENABLED = false;
        } catch (_) {}
        console.log('[Init] Checking identity...');
```

Replace with:
```javascript
    async function initApp() {
      try {
        fetchInstansiList(); // Pre-load instansi for registration
        console.log('[Init] Checking identity...');
```

Delete lines 5-11 (the safety guard with localStorage). Keep everything else unchanged.

## Verify

Run: `node -c "js/app.js"` — expected: no errors

## Commit

```
git add js/app.js
git commit -m "cleanup: remove localStorage face toggle safety guard from initApp"
```
