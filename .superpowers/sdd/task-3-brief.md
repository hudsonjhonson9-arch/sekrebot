### Task 3: Frontend — alur login pakai `/api/auth/login` (auth.js)

**Files:**
- Modify: `js/auth.js` — `handleAuthAction('login')`, khususnya: blok validasi `apiGet(P.userList)` (baris 50-71), penambahan `setNativeToken` sebelum face-toggle (baris 73), dan `finalizeLogin` (baris 106-119).
- Modify: `www/js/auth.js` (sync)

**Interfaces:**
- Konsumsi: `P.webLogin` dan `setNativeToken` (Task 2).
- Produksi: `window.MY_ID`, `_sess_*`, `_native_token` terisi dari respons server; alur face-verify tidak berubah (masih memanggil `openCamOverlay`).

- [ ] **Step 1: Ganti blok validasi NIP + token palsu**

Di `js/auth.js`, GANTI keseluruhan blok dari `const res = await apiGet(\`${P.userList}?nip=${nip}\`);` (baris 50) sampai akhir `finalizeLogin` (baris 119) dengan kode berikut.

Blok LAMA yang dihapus dimulai persis dengan:

```js
          const res = await apiGet(`${P.userList}?nip=${nip}`);
```

dan berakhir dengan (baris 118-119):

```js
            location.reload();
          };
```

Blok BARU:

```js
          // Login NIP (web, non-Telegram): satu panggilan menerbitkan sesi native
          // dan mengembalikan baris user; tidak lagi butuh /api/user-list (yang
          // berada di balik requireRole dan tak terjangkau sebelum punya token).
          const loginRes = await fetch(API_BASE + P.webLogin, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip }),
          });
          const loginBody = await loginRes.json().catch(() => ({}));
          if (!loginRes.ok) throw new Error(loginBody?.message || 'Login gagal. Coba lagi.');

          const user = loginBody.user;
          if (!user || !user.id) throw new Error('Data pegawai tidak lengkap. Hubungi admin.');

          const sessionToken = loginBody.session_token;
          const userNip = String(user.nip || '').trim();
          const targetId = String(user.id);

          // Token native harus siap SEBELUM panggilan face-toggle/face lain agar
          // tidak 401 (endpoints media dibalik requireRole).
          setNativeToken(sessionToken);

          // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
          // Check per-instansi face toggle from pengaturan table
          let isFaceEnabled = false;
          try {
            const userInstansi = (user.instansi_id || user.Instansi_Id || '').trim();
            console.log('[FaceToggle] userInstansi:', userInstansi);
            if (userInstansi) {
              const faceRes = await apiGet(P.faceToggle, { instansi_id: userInstansi });
              console.log('[FaceToggle] faceRes:', faceRes);
              if (faceRes.ok) {
                const rawFT = faceRes.rows?.length ? faceRes.rows[0] : (faceRes?.data ?? {});
                const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
                console.log('[FaceToggle] parsed:', d);
                isFaceEnabled = d?.enabled === true || d?.enabled === '1' || d?.enabled === 1 || d?.value === '1';
                console.log('[FaceToggle] isFaceEnabled:', isFaceEnabled);
              } else {
                console.warn('[FaceToggle] API not ok:', faceRes.status);
              }
            } else {
              console.warn('[FaceToggle] instansi_id empty on user');
            }
          } catch (e) {
            console.warn('[FaceToggle] error:', e);
          }
          // Ponytail: API error/timeout → safe default = OFF, no face required

          const hasFace = !!(user.face_histogram && user.face_histogram !== '[]' && user.face_histogram !== '')
            || !!(user.face_photo && user.face_photo !== '' && user.face_photo !== 'null')
            || !!(user.foto_base64 && user.foto_base64 !== '')
            || !!(user.descriptor && user.descriptor !== '[]');

          const finalizeLogin = async () => {
            setNativeToken(sessionToken);
            setSession(sessionToken, { nip: userNip, role: user.role || 'USER', instansi_id: user.instansi_id || '' });
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
```

Setelah blok ini, sisa fungsi (blok `if (isFaceEnabled && typeof openCamOverlay === 'function')` sampai akhir) tetap SAMA — hanya memastikan tidak ada referensi `rawData`/`res`/`userList` yang tersisa. Blok itu sudah memakai `user`, `userNip`, `targetId`, `hasFace`, `finalizeLogin`, `isFaceEnabled` — semuanya ada di definisi baru.

- [ ] **Step 2: Verifikasi tidak ada sisa referensi lama**

Run (PowerShell):
```powershell
Select-String -Path js\auth.js -Pattern 'rawData|res\.rows|res\.data|P\.userList\?nip' | Select-Object LineNumber, Line
```
Expected: tidak ada baris yang match (blok `P.userList` hanya mungkin tersisa di cabang **register** — itu di luar scope dan boleh ada; cabang register memakai `cek.rows` dari `apiGet(P.userList)` — string persis `cek = await apiGet`). Kalau `Select-String` menemukan `P.userList?nip=${nip}` di dalam cabang login, ulangi Step 1 (blok lama belum terganti sempurna).

Catatan: pemakaian `P.userList` di **cabang register** (`const cek = await apiGet(\`${P.userList}?nip=${payload.nip}\`);`) sengaja dibiarkan — di luar scope.

- [ ] **Step 3: Cek syntax**

Run: `node --check js/auth.js`
Expected: tidak ada output error.

- [ ] **Step 4: Sync ke www/**

Run (PowerShell):
```powershell
Copy-Item js\auth.js www\js\auth.js -Force
```
Expected: tidak ada output error.

- [ ] **Step 5: Commit**

```bash
git add js/auth.js www/js/auth.js
git commit -m "feat: login web pakai /api/auth/login, token native asli"
```

