### Task 2: Frontend — `P.webLogin` + `setNativeToken` (config.js)

**Files:**
- Modify: `js/config.js` (`P` map ~baris 245; tambah fungsi setelah `clearSession` ~baris 232)
- Modify: `www/js/config.js` (sync)

**Interfaces:**
- Produces: `P.webLogin` = `'/api/auth/login'`; fungsi global `setNativeToken(token)` yang menulis ke `_nativeToken` DAN `localStorage._native_token` (dipakai Task 3).

- [ ] **Step 1: Tambah `webLogin` ke P map**

Di `js/config.js`, tambahkan setelah `sessionLogin: '/api/auth/session',` (baris 246):

```js
  sessionLogin: '/api/auth/session',
  webLogin: '/api/auth/login',
```

- [ ] **Step 2: Tambah `setNativeToken`**

Di `js/config.js`, tambahkan setelah fungsi `clearSession()` (sebelum `function _getSessionRole()`):

```js
// Sesi web/NIP: token 192 hex dari /api/auth/login disimpan sebagai _native_token
// supaya nativeFetch memakainya, dan di localStorage supaya bertahan reload.
function setNativeToken(token) {
  _nativeToken = token;
  try { localStorage.setItem('_native_token', token); } catch { /* mode privat */ }
}
```

- [ ] **Step 3: Sync ke www/**

Run (PowerShell):
```powershell
Copy-Item js\config.js www\js\config.js -Force
```
Expected: tidak ada output error; `www/js/config.js` identik dengan `js/config.js`.

- [ ] **Step 4: Cek tidak ada syntax error**

Run: `node --check js/config.js; node --check www/js/config.js`
Expected: tidak ada output error.

- [ ] **Step 5: Commit**

```bash
git add js/config.js www/js/config.js
git commit -m "feat: P.webLogin + setNativeToken untuk sesi web"
```

---

