# Task 2: auth.js — per-instansi face toggle after user fetch

**Files:**
- Modify: `js/auth.js:73-98`

**Context:** This is the second task. Task 1 already updated `loadFaceToggle()` to accept `instansi_id` and removed localStorage/global defaults. Now the login flow must check the per-instansi face toggle after fetching the user, instead of using the global `FACE_RECOGNITION_ENABLED` var.

## Step

**File:** `js/auth.js`

Current lines 73-96:
```javascript
          // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
          const isFaceEnabled = typeof FACE_RECOGNITION_ENABLED !== 'undefined' ? FACE_RECOGNITION_ENABLED : true;
          const hasFace = !!(user.face_histogram && user.face_histogram !== '[]' && user.face_histogram !== '[]' && user.face_histogram !== '')
            || !!(user.face_photo && user.face_photo !== '' && user.face_photo !== 'null')
            || !!(user.foto_base64 && user.foto_base64 !== '')
            || !!(user.descriptor && user.descriptor !== '[]');
          const userNip = String(user.nip || '').trim();
          const targetId = String(user.telegram_id || user.id);
          
          const finalizeLogin = async () => {
            // Simple token — tidak perlu server-side session
            const token = 'usr_' + targetId + '_' + Date.now();
            setSession(token, { nip: userNip, role: user.role || 'USER', instansi_id: user.instansi_id || '' });
            window.MY_ID = targetId;
            localStorage.setItem(STORAGE_KEYS.USER_ID, window.MY_ID);
            localStorage.setItem('MY_NIP', userNip);
            localStorage.setItem('MY_ROLE', String(user.role || 'USER').toUpperCase());
            localStorage.setItem('MY_NAME', String(user.nama || 'User'));
            localStorage.setItem(STORAGE_KEYS.USER_OBJ, JSON.stringify(user));
            const finalInst = (user.instansi_id || user.Instansi_Id || '').trim();
            if (finalInst) localStorage.setItem('MY_INSTANSI', finalInst);
            else localStorage.removeItem('MY_INSTANSI');
            location.reload();
          };

          if (isFaceEnabled && typeof openCamOverlay === 'function') {
             // Sembunyikan form login
```

Replace the face check block (from `// ── FACE VERIFICATION LOGIN` through `finalizeLogin`) with:

```javascript
          // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
          // Check per-instansi face toggle from pengaturan table
          let isFaceEnabled = false;
          try {
            const userInstansi = (user.instansi_id || user.Instansi_Id || '').trim();
            if (userInstansi) {
              const faceRes = await apiGet(P.faceToggle + '&instansi_id=' + userInstansi);
              if (faceRes.ok) {
                const rawFT = faceRes.rows?.length ? faceRes.rows[0] : (faceRes?.data ?? {});
                const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
                isFaceEnabled = d?.enabled === true || d?.enabled === '1' || d?.enabled === 1;
              }
            }
          } catch (_) {}
          // Ponytail: API error/timeout → safe default = OFF, no face required

          const hasFace = !!(user.face_histogram && user.face_histogram !== '[]' && user.face_histogram !== '[]' && user.face_histogram !== '')
            || !!(user.face_photo && user.face_photo !== '' && user.face_photo !== 'null')
            || !!(user.foto_base64 && user.foto_base64 !== '')
            || !!(user.descriptor && user.descriptor !== '[]');
          const userNip = String(user.nip || '').trim();
          const targetId = String(user.telegram_id || user.id);
          
          const finalizeLogin = async () => {
            const token = 'usr_' + targetId + '_' + Date.now();
            setSession(token, { nip: userNip, role: user.role || 'USER', instansi_id: user.instansi_id || '' });
            window.MY_ID = targetId;
            localStorage.setItem(STORAGE_KEYS.USER_ID, window.MY_ID);
            localStorage.setItem('MY_NIP', userNip);
            localStorage.setItem('MY_ROLE', String(user.role || 'USER').toUpperCase());
            localStorage.setItem('MY_NAME', String(user.nama || 'User'));
            localStorage.setItem(STORAGE_KEYS.USER_OBJ, JSON.stringify(user));
            const finalInst = (user.instansi_id || user.Instansi_Id || '').trim();
            if (finalInst) localStorage.setItem('MY_INSTANSI', finalInst);
            else localStorage.removeItem('MY_INSTANSI');
            location.reload();
          };

          if (isFaceEnabled && typeof openCamOverlay === 'function') {
```

The key change: `isFaceEnabled` is now set by an API call per-instansi instead of reading the global `FACE_RECOGNITION_ENABLED` variable.

## Verify

Run `node -c "js/auth.js"` — expected: no errors.

## Commit

```
git add js/auth.js
git commit -m "fix: login checks face toggle per-instansi after user fetch"
```
