# Multi-Photo Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiap pendaftaran wajah mengambil 3 foto (preview Pakai/Ulang per foto) lalu menyimpan 1 descriptor hasil rata-rata — tanpa mengubah API, DB, atau alur verifikasi/absen.

**Architecture:** Loop multi-shot ditaruh di satu titik-dorong `openCamOverlay` → `_previewUse` di `js/face.js`. Opt-in memakai bendera `isRegister: true` yang sudah ada di 6 pemanggil enrolmen (verifikasi/absen/meja tidak punya bendera ini → tetap 1 tembak). Helper murni `nextEnrollShot` di `js/face-quality.js` (divia `window.FaceQuality`) menangani akumulasi/validasi/merge; `dataUrl` final = shot pertama (field `result` tidak membawa skor — fallback spec).

**Tech Stack:** JS browser ES5-ish + global bridge `window.FaceQuality`; test `node --test` gaya repo (source-scan + unit murni); mirror `js/` ↔ `www/js/`.

**Spec:** `docs/superpowers/specs/2026-11-12-multi-photo-enrollment-design.md`

## Global Constraints

- `ENROLL_SHOTS = 3` tetap (konstanta, bukan konfigurasi user).
- Opt-in HANYA via `isRegister: true`; pemanggil `auth.js:213` (verifikasi login), `absen.js`, `meja.js`, dan bukti foto **tidak boleh** berubah perilaku.
- Tanpa perubahan server/DB/n8n/`POST /api/media/face`; kontrak hasil `_finishUserCapture({dataUrl, descriptor, faceOk, livenessOk})` dipertahankan.
- Setiap edit file WAJIB sinkron ke mirror: `js/X` → `www/js/X`, `index.html` → `www/index.html`; cek `git diff --no-index js/X www/js/X` = 0 beda.
- Edit file HTML HANYA via tool Edit (larangan `Set-Content`/redirect PowerShell — PS5.1 merusak encoding, BOM/mojibake).
- Tanpa BOM di file yang diubah (3 byte pertama tetap `<!D` untuk index.html).
- Tag cache-buster perubahan: `js/face.js` → `?v=20261112d`, `js/face-quality.js` → `?v=20261112b`, tepat 1× per file di dua `index.html`; pin di `tests/meja-popup-and-face.test.mjs:109-110` ikut diperbarui.
- Seluruh suite `node --test tests/` hijau di akhir tiap task.

## Review Focus

1. **Alur verifikasi ikut jadi 3-shot** — yang diharapkan: login biometric/absen/meja tetap 1 tembak. Test: kontrak di Task 2 (jumlah `isRegister: true` per file = auth 2, admin 1, admin-face 1, desktop 1, face 1; `meja.js`/`absen.js` = 0).
2. **Shot rusak (descriptor null/bukan 512) merusak merge** — yang diharapkan: shot ditolak, jumlah terkunci tak bertambah. Test unit Task 1 (kasus `skipped`).
3. **Merge bukan rata-rata benar / dimensi bukan 512** — yang diharapkan: elemen-wise mean 512-dim. Test unit Task 1 (kasus 3-shot done).
4. **Cancel di tengah loop menyimpan state setengah jadi** — yang diharapkan: shot terbuang, callback tak dipanggil. Test: kontrak Task 2 — reset `_enrollShots/_enrollTaken` di `openCamOverlay` (per-instance state, tutup overlay = selesai tanpa panggil cb).
5. **Tag basi / mirror putus setelah edit** — yang diharapkan: tag baru persis di dua index.html, mirror 0 beda. Test: suite penuh + pin tag Task 3 + cek mirror eksplisit.

---

### Task 1: Helper murni `nextEnrollShot`

**Files:**
- Modify: `js/face-quality.js` (fungsi baru setelah `mergeDescriptors`, + entri di baris `window.FaceQuality = {...}` paling bawah)
- Modify: `tests/face-quality.test.mjs`
- Mirror: `www/js/face-quality.js` (sinkron di step commit)

**Interfaces:**
- Consumes: `mergeDescriptors(list)` (sudah ada, `js/face-quality.js:19`).
- Produces: `export function nextEnrollShot(taken, shot, need)` —
  - `taken`: `Array<{descriptor: number[], dataUrl: string}>`
  - `shot`: `{descriptor: number[]|null, dataUrl: string}`
  - `need`: number (3)
  - returns `{ shots: Array, done: boolean, skipped?: boolean, descriptor?: number[512], dataUrl?: string }`
  - aturan: shot invalid (descriptor bukan array / panjang !== 512) → `{shots: taken, done: false, skipped: true}`;
    `shots.length < need` → `{shots, done: false}`;
    `shots.length >= need` → `{shots, done: true, descriptor: mergeDescriptors(shots.map(s => s.descriptor)), dataUrl: shots[0].dataUrl}`.
  - diekspor juga via `window.FaceQuality.nextEnrollShot`.

- [ ] **Step 1: Tulis test gagal** — tambah ke `tests/face-quality.test.mjs` (impor dari modul + `globalThis.window` mengikuti pola file yang ada):

```js
test('nextEnrollShot: <3 shot -> done false, shot terkunci bertambah', () => {
  const r1 = nextEnrollShot([], { descriptor: D512(1), dataUrl: 'A' }, 3);
  assert.equal(r1.done, false); assert.equal(r1.shots.length, 1); assert.ok(!r1.skipped);
  const r2 = nextEnrollShot(r1.shots, { descriptor: D512(2), dataUrl: 'B' }, 3);
  assert.equal(r2.done, false); assert.equal(r2.shots.length, 2);
});

test('nextEnrollShot: shot ke-3 -> done, descriptor = rata-rata 512-dim, dataUrl = shot pertama', () => {
  const shots = [1, 2, 3].map(n => ({ descriptor: D512(n), dataUrl: 'S' + n }));
  const r = nextEnrollShot(shots.slice(0, 2), shots[2], 3);
  assert.equal(r.done, true);
  assert.equal(r.descriptor.length, 512);
  assert.ok(Math.abs(r.descriptor[0] - 2) < 1e-9); // mean(1,2,3)
  assert.equal(r.dataUrl, 'S1');
});

test('nextEnrollShot: descriptor null / bukan 512 -> skipped, tak menambah count', () => {
  const taken = [{ descriptor: D512(1), dataUrl: 'A' }];
  const r = nextEnrollShot(taken, { descriptor: null, dataUrl: 'X' }, 3);
  assert.equal(r.skipped, true); assert.equal(r.done, false);
  assert.equal(r.shots.length, 1); assert.equal(r.shots[0].dataUrl, 'A');
});
```

(`D512(n)` = helper lokal test mengembalikan array 512 elemen `n`; bila fixture sejenis sudah ada di file, pakai itu.)

- [ ] **Step 2: Jalankan, pastikan FAIL** — `node --test tests/face-quality.test.mjs` → FAIL "nextEnrollShot is not a function / not exported".

- [ ] **Step 3: Implement di `js/face-quality.js`** — fungsi persis kontrak di blok Interfaces (tubuh memanggil `mergeDescriptors` yang sudah ada), tambahkan `nextEnrollShot` ke objek `window.FaceQuality` di baris terakhir.

- [ ] **Step 4: Jalankan, pastikan PASS** — `node --test tests/face-quality.test.mjs` → semua PASS.

- [ ] **Step 5: Sinkron mirror + commit**

```powershell
Copy-Item js\face-quality.js www\js\face-quality.js -Force
git add js/face-quality.js www/js/face-quality.js tests/face-quality.test.mjs
git commit -m "feat(face): helper nextEnrollShot — akumulasi+merge 3 shot enrolmen"
```

---

### Task 2: Wiring loop di `js/face.js` + kontrak pemanggil

**Files:**
- Create: `tests/multi-photo-enrollment.test.mjs`
- Modify: `js/face.js` — area state `~:590`, `openCamOverlay` `~:901-909`, `_previewUse` `:1656-1663`, `_previewRetry` `:1671-1680`
- Mirror: `www/js/face.js`

**Interfaces:**
- Consumes: `window.FaceQuality.nextEnrollShot(taken, shot, need)` (Task 1); `setCamStatus(type, icon, title, sub)` (`face.js:1703`); pola re-arm `_previewRetry` (`face.js:1671-1680`) sebagai template gate + force-timer 10 dtk.
- Produces: state `_enrollShots` (0 = non-enrolmen) & `_enrollTaken` (array) di scope `face.js`; kontrak hasil `_finishUserCapture({dataUrl, descriptor, faceOk, livenessOk})` tidak berubah.

- [ ] **Step 1: Tulis test kontrak gagal** — `tests/multi-photo-enrollment.test.mjs` (source-scan gaya `log-edit-fix.test.mjs`, baca file via `fs`):

```js
const js = f => readFileSync(join(root, 'js', f), 'utf8');
const count = (s, re) => (s.match(re) || []).length;

test('opt-in: isRegister: true hanya di 6 pemanggil enrolmen', () => {
  assert.equal(count(js('auth.js'), /isRegister:\s*true/g), 2);      // login-regen + daftar
  assert.equal(count(js('admin.js'), /isRegister:\s*true/g), 1);
  assert.equal(count(js('admin-face.js'), /isRegister:\s*true/g), 1);
  assert.equal(count(js('desktop.js'), /isRegister:\s*true/g), 1);   // adminCaptureFaceFor
  assert.equal(count(js('face.js'), /isRegister:\s*true/g), 1);      // registerFaceFromPreview
  assert.equal(count(js('meja.js'), /isRegister:\s*true/g), 0);
  assert.equal(count(js('absen.js'), /isRegister:\s*true/g), 0);
});

test('wiring: ENROLL_SHOTS=3, gate opt-in via isRegister, loop pakai nextEnrollShot', () => {
  const f = js('face.js');
  assert.match(f, /ENROLL_SHOTS\s*=\s*3/);
  assert.match(f, /_enrollShots\s*=\s*onDone\?\.isRegister\s*\?\s*ENROLL_SHOTS\s*:\s*0/);
  assert.match(f, /nextEnrollShot\(/);
  assert.match(f, /_enrollTaken\s*=\s*\[\];/);   // reset per pembukaan overlay (cancel bersih)
});
```

- [ ] **Step 2: Jalankan, pastikan FAIL** — `node --test tests/multi-photo-enrollment.test.mjs` → FAIL (identitas belum ada di face.js).

- [ ] **Step 3: Implement di `js/face.js`**

  a. Deklarasi (bersama `let _gateForceTimer` `:590`): `const ENROLL_SHOTS = 3;` + `let _enrollShots = 0, _enrollTaken = [];`
  b. Di `openCamOverlay` tepat setelah reset `_gate` (`:901-902`): `_enrollShots = onDone?.isRegister ? ENROLL_SHOTS : 0; _enrollTaken = [];`
  c. Label tombol pembuka (`:909`): bila `_enrollShots > 1`, `btnCap.innerHTML` = `<i class="fas fa-camera"></i> Ambil Foto (1)/` + `_enrollShots`.
  d. `_previewUse` (`:1656`): setelah `_hidePreview()` & cabang `kind === 'meja'`, sebelum `return _finishUserCapture(p.result)`:

```js
if (_enrollShots > 0) {
  const step = window.FaceQuality.nextEnrollShot(_enrollTaken, p.result, _enrollShots);
  _enrollTaken = step.shots;
  if (!step.done) {
    setCamStatus(step.skipped ? 'warn' : 'ok', '<i class="fas fa-camera"></i>',
      step.skipped ? 'Wajah Tidak Terbaca' : `Foto ${_enrollTaken.length}/${_enrollShots} Tersimpan`,
      step.skipped ? 'Coba ambil lagi' : 'Geser sedikit posisi, ambil foto berikutnya');
    // re-arm persis pola _previewRetry: tampilkan video, reset _gate,
    // btnCapture label `Ambil Foto (n+1)/3` + disabled ikuti _gate.pass,
    // force-timer 10 dtk 'Tetap Ambil'
    return;
  }
  return _finishUserCapture({ ...p.result, descriptor: step.descriptor, dataUrl: step.dataUrl });
}
```

  e. `_previewRetry` (`:1673`): saat mode enrolmen (`_enrollShots > 1`), label btnCapture memakai `Ambil Foto (${_enrollTaken.length + 1})/${_enrollShots}` alih-alih `Ambil Foto & Lanjutkan`.

- [ ] **Step 4: Jalankan kontrak → PASS** — `node --test tests/multi-photo-enrollment.test.mjs`.

- [ ] **Step 5: Suite penuh + mirror + commit**

```powershell
node --test tests/   # seluruh suite hijau (termasuk mirror & pin tag lama — tag belum diubah di task ini)
Copy-Item js\face.js www\js\face.js -Force
if (git diff --no-index --exit-code js\face.js www\js\face.js) { 'MIRROR OK' }
git add js/face.js www/js/face.js tests/multi-photo-enrollment.test.mjs
git commit -m "feat(face): loop enrolmen 3 foto — preview per shot, merge sebelum simpan"
```

---

### Task 3: Bump cache-buster + verifikasi akhir

**Files:**
- Modify: `index.html`, `www/index.html` (tag `js/face.js` & `js/face-quality.js`)
- Modify: `tests/meja-popup-and-face.test.mjs:109-110` (pin)

**Interfaces:**
- Consumes: hasil Task 1-2.
- Produces: nilai tag final `js/face.js?v=20261112d` dan `js/face-quality.js?v=20261112b`.

- [ ] **Step 1: Edit tag di kedua `index.html`** (tool Edit, bukan PowerShell): `js/face.js?v=20261112b` → `js/face.js?v=20261112d`; `js/face-quality.js?v=20261112a` → `js/face-quality.js?v=20261112b`.

- [ ] **Step 2: Perbarui pin** `tests/meja-popup-and-face.test.mjs:109-110` ke nilai baru.

- [ ] **Step 3: Verifikasi penuh**

```powershell
node --test tests/                          # semua hijau
git diff --no-index --exit-code js\face.js www\js\face.js; echo "mirror js exit=$LASTEXITCODE"   # 0
git diff --no-index --exit-code js\face-quality.js www\js\face-quality.js; echo $LASTEXITCODE     # 0
# BOM check: 3 byte pertama kedua index.html = 3C 21 44 ('<!D')
git diff --stat                             # hanya baris yang memang diubah
```

- [ ] **Step 4: Commit akhir (unit review user)**

```powershell
git add index.html www/index.html tests/meja-popup-and-face.test.mjs
git commit -m "chore(face): bump cache-buster multi-photo enrollment + verifikasi suite"
```
