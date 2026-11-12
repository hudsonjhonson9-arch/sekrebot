# Plan: Kualitas Wajah & Akurasi Pengenalan

Spec: `docs/superpowers/specs/2026-11-12-kualitas-wajah-dan-akurasi-pengenalan-design.md` (commit `937cb9c`)
Eksekusi: TDD task-per-task, test-first, commit per task. Jalankan `npm test` sebelum Task 1 (baseline harus 706 hijau).

## Global Constraints

- **Mirror**: setiap edit `js/X.js` → copy identik ke `www/js/X.js`; edit `css/styles.css` → `www/css/styles.css`; edit `index.html` → `www/index.html` (beda nomor baris ±3, isi sama). Verifikasi: `git diff --no-index js/face.js www/js/face.js` — hanya boleh beda komentar pre-existing yang sudah ada sebelum sesi ini.
- **Cache-buster**: setiap JS/berubah → bump `?v=` di **dua** `index.html`. Nilai sesi ini: `js/face.js?v=20261112a` → `20261112b` (root baris ~3424, www ~3421); tag baru `js/face-quality.js?v=20261112a`. Tidak ada test yang mem-pin `face.js?v` (diverifikasi: `rg "face\.js\?v" tests/` kosong) — aman di-bump. `admin-face.js` TIDAK berubah → tidak di-bump.
- **Test registration**: `package.json` `scripts.test` daftar eksplisit → `tests/face-quality.test.mjs` WAJIB ditambahkan di Task 1.
- **Fakta kunci yang mengubah spec (deviation terdokumentasi):**
  1. `package.json` punya `"type": "module"` → spec menulis "UMD guard + createRequire" **tidak valid**. `js/face-quality.js` dibuat **ES module murni** (`export`), di-load browser via `<script type="module">`, diuji Node via `import` langsung, dan diimpor `server/media.js` langsung. Deviation ini memenuhi intent spec (bisa diuji unit + dipakai server) tanpa createRequire.
  2. **`Human.match.similarity` BUKAN cosine** — diverifikasi dari `node_modules/@vladmandic/human/dist/human.esm.js:44526-44550`: `distance = round(100*25*Σdiff²)/100`, lalu `sim = round100(clamp((1 - sqrt(dist)/100 - 0.2)/0.6, 0, 1))`. Spec menulis "cosine" — plan memakai rumus asli Human (sesuai instruksi spec "diverifikasi dari pustaka, jangan karang"). Unit test mengunci nilai numeriknya.
  3. Teks panduan threshold ditaruh **statis di `index.html` ×2** (bukan `js/admin-face.js`): teks statis tidak butuh JS → menghindari 2 edit mirror + bump. Acceptance "teks panduan tampil di bawah slider" tetap terpenuhi.
  4. Pesan tambahan `Terlalu besar — menjauh dari kamera` untuk `faceRatioH > 95%` (spek tabel hanya memberi teks untuk kasus terlalu kecil).
- **Jangan ubah**: `POST /face` body & respons sukses; `syncFaceToServer` (klien sudah menampilkan `body.message` via `window._lastAiError` → Swal `face.js:479-483`); perilaku `skipVerifikasi` selain 1 baris; slider/threshold admin; `meja-handler.js` selain signature opsional ke-5.
- **Fail-open**: bila `window.FaceQuality` belum ter-load (module defer), gate/burst jangan memblokir — fallback ke perilaku lama.

---

## Task 1 — Modul `js/face-quality.js` + unit test

**Files**: `js/face-quality.js` (baru), `tests/face-quality.test.mjs` (baru), `package.json`.

**Test-first** — tulis `tests/face-quality.test.mjs`, jalankan → merah (module belum ada):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFrameQuality, mergeDescriptors, similarityOf, THRESHOLDS } from '../js/face-quality.js';

const okMetrics = { faceRatioH: 0.5, centerOffset: 0.05, brightness: 120, stabilityMs: 500, livenessScore: 0.6 };

test('gate: semua kriteria lolos -> pass tanpa reason', () => {
  const r = evaluateFrameQuality(okMetrics, { livenessThreshold: 0.4 });
  assert.equal(r.pass, true); assert.equal(r.reason, null);
});
test('gate: alasan pertama sesuai tabel spek (ukuran/posisi/terang/gelap/stabilitas/liveness)', () => {
  assert.equal(evaluateFrameQuality({ ...okMetrics, faceRatioH: 0.2 }, { livenessThreshold: 0.4 }).reason, 'Terlalu kecil — dekatkan ke kamera');
  assert.equal(evaluateFrameQuality({ ...okMetrics, faceRatioH: 0.97 }, { livenessThreshold: 0.4 }).reason, 'Terlalu besar — menjauh dari kamera');
  assert.equal(evaluateFrameQuality({ ...okMetrics, centerOffset: 0.2 }, { livenessThreshold: 0.4 }).reason, 'Geser wajah ke tengah bingkai');
  assert.equal(evaluateFrameQuality({ ...okMetrics, brightness: 40 }, { livenessThreshold: 0.4 }).reason, 'Terlalu gelap — pindah ke tempat lebih terang');
  assert.equal(evaluateFrameQuality({ ...okMetrics, brightness: 230 }, { livenessThreshold: 0.4 }).reason, 'Terlalu terang — kurangi cahaya langsung');
  assert.equal(evaluateFrameQuality({ ...okMetrics, stabilityMs: 100 }, { livenessThreshold: 0.4 }).reason, 'Diam sejenak…');
  assert.equal(evaluateFrameQuality({ ...okMetrics, livenessScore: 0.2 }, { livenessThreshold: 0.4 }).reason, 'Verifikasi keaslian…');
});
test('gate: livenessEnabled=false melewati baris liveness', () => {
  const r = evaluateFrameQuality({ ...okMetrics, livenessScore: 0 }, { livenessThreshold: 0.4, livenessEnabled: false });
  assert.equal(r.pass, true);
});
test('gate: ambang THRESHOLDS sesuai spek', () => {
  assert.equal(THRESHOLDS.faceRatioMin, 0.30); assert.equal(THRESHOLDS.faceRatioMax, 0.95);
  assert.equal(THRESHOLDS.centerTolerance, 0.12);
  assert.equal(THRESHOLDS.brightnessMin, 60); assert.equal(THRESHOLDS.brightnessMax, 210);
  assert.equal(THRESHOLDS.stabilityMs, 300);
});
test('merge: 3 deskriptor 512-dim -> rata-rata polos (tanpa normalisasi L2)', () => {
  const a = Array(512).fill(0), b = Array(512).fill(1), c = Array(512).fill(2);
  const m = mergeDescriptors([a, b, c]);
  assert.equal(m.length, 512); assert.ok(Math.abs(m[0] - 1) < 1e-9); assert.ok(Math.abs(m[123] - 1) < 1e-9);
});
test('merge: input 1 elemen / panjang beda -> kembalikan elemen pertama', () => {
  assert.deepEqual(mergeDescriptors([[1, 2, 3]]), [1, 2, 3]);
  assert.deepEqual(mergeDescriptors([[1, 2], [1, 2, 3]]), [1, 2]);
  assert.deepEqual(mergeDescriptors([]), null);
  assert.deepEqual(mergeDescriptors([new Float32Array([0.5, 0.25])]), [0.5, 0.25]);
});
test('similarityOf 128-dim: 1 - euclid/1.5, clamp >= 0', () => {
  const a = Array(128).fill(0), b = Array(128).fill(0);
  assert.equal(similarityOf(a, b), 1);
  const c = Array(128).fill(1.5); // euclid = 1.5*sqrt(128) >> 1.5 -> 0
  assert.equal(similarityOf(a, c), 0);
});
test('similarityOf 512-dim: formula Human (rounding dikunci)', () => {
  // beda 1 elemen sebesar 5: sum=25, dist=625, root=25, norm=(1-0.25-0.2)/0.6=0.9166.. -> 0.92
  const a = Array(512).fill(0), b = Array(512).fill(0); b[0] = 5;
  assert.equal(similarityOf(a, b), 0.92);
  assert.equal(similarityOf(a, a), 1);
});
test('similarityOf: dimensi campur/kosong/tidak sama -> null (skip, jangan crash)', () => {
  assert.equal(similarityOf([0.1, 0.2], [0.1, 0.2]), null);
  assert.equal(similarityOf(Array(512).fill(0), Array(128).fill(0)), null);
  assert.equal(similarityOf(null, [1]), null);
});
test('window.FaceQuality ter-assign tanpa meledak di Node', async () => {
  assert.equal(typeof globalThis.window, 'undefined'); // guard typeof harus aman
  const src = await import('node:fs').then(fs => fs.readFileSync('js/face-quality.js', 'utf8'));
  assert.ok(src.includes("typeof window"));
});
```

**Implementasi** `js/face-quality.js`:

```js
export const THRESHOLDS = {
  faceRatioMin: 0.30, faceRatioMax: 0.95, centerTolerance: 0.12,
  brightnessMin: 60, brightnessMax: 210, stabilityMs: 300, ambiguousDelta: 0.05,
};

export function evaluateFrameQuality(m, opts = {}) {
  const t = THRESHOLDS;
  let reason = null;
  if (!(m.faceRatioH >= t.faceRatioMin)) reason = 'Terlalu kecil — dekatkan ke kamera';
  else if (m.faceRatioH > t.faceRatioMax) reason = 'Terlalu besar — menjauh dari kamera';
  else if (m.centerOffset > t.centerTolerance) reason = 'Geser wajah ke tengah bingkai';
  else if (m.brightness < t.brightnessMin) reason = 'Terlalu gelap — pindah ke tempat lebih terang';
  else if (m.brightness > t.brightnessMax) reason = 'Terlalu terang — kurangi cahaya langsung';
  else if (m.stabilityMs < t.stabilityMs) reason = 'Diam sejenak…';
  else if (opts.livenessEnabled !== false && (m.livenessScore || 0) < (opts.livenessThreshold ?? 0.4)) reason = 'Verifikasi keaslian…';
  return { pass: !reason, reason };
}

export function mergeDescriptors(list) {
  const arrs = (list || []).filter(Boolean).map(x => Array.isArray(x) ? x : Array.from(x));
  if (arrs.length === 0) return null;
  const len = arrs[0].length;
  if (len === 0 || arrs.some(a => a.length !== len)) return arrs[0];
  if (arrs.length === 1) return arrs[0];
  const out = new Array(len).fill(0);           // rata-rata polos, TANPA normalisasi L2 —
  for (const a of arrs) for (let i = 0; i < len; i++) out[i] += a[i] / arrs.length;
  return out;
}

function euclid(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

// Salinan persis Human.match.similarity (human.esm.js:44526-44550; order 2, multiplier 25, min .2, max .8)
function humanSimilarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  const dist = Math.round(100 * 25 * sum) / 100;
  if (dist === 0) return 1;
  const norm = (1 - Math.sqrt(dist) / 100 - 0.2) / 0.6;
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100;
}

export function similarityOf(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  if (a.length >= 512) return humanSimilarity(a, b);
  if (a.length === 128) return Math.max(0, 1 - euclid(a, b) / 1.5);
  return null;
}

if (typeof window !== 'undefined') window.FaceQuality = { THRESHOLDS, evaluateFrameQuality, mergeDescriptors, similarityOf };
```

Catatan: `evaluateFrameQuality` mengembalikan `{pass, reason}` tunggal (reason pertama yang gagal, urutan tabel spek) — `score` dihilangkan: satu-satunya pemakaian (ranking frame burst) cukup brightness saja, lihat Task 4 (YAGNI).

**Registrasi test**: `package.json` → `scripts.test` tambahkan ` tests/face-quality.test.mjs` di akhir daftar.

**Verify**: `node --test tests/face-quality.test.mjs` hijau, lalu `npm test` tetap 706+9=715 hijau.
**Commit**: `feat(face-quality): modul gate kualitas + merge/similarity murni (TDD)`

---

## Task 2 — Markup `index.html` ×2: preview actions, tag module, bump cache-buster + styles.css ×2

**Files**: `index.html`, `www/index.html`, `css/styles.css`, `www/css/styles.css`, `tests/meja-popup-and-face.test.mjs`.

**Test-first** — tambah ke `tests/meja-popup-and-face.test.mjs` (gaya source-assert yang sudah ada di file itu):

```js
test('face-quality: markup preview + tag module + bump di dua index.html', () => {
  for (const f of ['index.html', 'www/index.html']) {
    const html = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(html.includes('id="camPreviewUse"'), f + ': tombol Pakai');
    assert.ok(html.includes('id="camPreviewRetry"'), f + ': tombol Ulang');
    assert.ok(html.includes('id="camPreviewMeta"'), f + ': meta preview');
    assert.ok(html.includes('js/face-quality.js?v=20261112a'), f + ': tag module');
    assert.ok(html.includes('js/face.js?v=20261112b'), f + ': bump face.js');
    const tag = html.indexOf('js/face-quality.js'), face = html.indexOf('js/face.js?v=');
    assert.ok(tag > -1 && face > -1 && tag < face, f + ': tag module sebelum face.js');
  }
});
test('face-quality: style tombol preview ada di dua styles.css', () => {
  for (const f of ['css/styles.css', 'www/css/styles.css']) {
    const css = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(css.includes('.cam-preview-actions'));
    assert.ok(css.includes('#camPreviewUse'));
  }
});
```

**Implementasi**:
1. `index.html` + `www/index.html`:
   - Ganti baris camPreview (root ~3275 / www ~3272) menjadi:
     ```html
     <div class="cam-preview" id="camPreview"><img id="camPreviewImg" src=""><div class="cam-preview-info" id="camPreviewMeta"></div><div class="cam-preview-actions"><button id="camPreviewUse" type="button">Pakai Foto Ini</button><button id="camPreviewRetry" type="button">Ambil Ulang</button></div></div>
     ```
   - Sisipkan sebelum tag `js/face.js`:
     ```html
     <script type="module" src="js/face-quality.js?v=20261112a"></script>
     ```
   - `js/face.js?v=20261112a` → `js/face.js?v=20261112b` (kedua file).
2. `css/styles.css` + `www/css/styles.css`: sisipkan SETELAH rule `.cpb-warn { background: rgba(245, 158, 11, .15); color: var(--warning)` (~baris 1610):
   ```css
   .cam-preview-actions { display: flex; gap: 8px; padding: 8px 10px; background: rgba(30, 41, 59, .9) }
   .cam-preview-actions button { flex: 1; padding: 9px 8px; border: 0; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer }
   #camPreviewUse { background: var(--success, #22c55e); color: #04140a }
   #camPreviewRetry { background: transparent; color: #e2e8f0; border: 1px solid var(--border, #334155) }
   ```

**Verify**: `npm test` (715+2=717 hijau) + `git diff --no-index index.html www/index.html` (hanya beda pre-existing).
**Commit**: `feat(face): markup preview Pakai/Ulang + load module face-quality`

---

## Task 3 — Gate kualitas di `js/face.js` (deteksi, enable tombol, force 10 detik)

**Files**: `js/face.js`, `www/js/face.js`, `tests/meja-popup-and-face.test.mjs`.

**Test-first** (source-assert, jalankan → merah):

```js
test('gate: wiring kualitas di face.js (dua mirror identik)', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(js.includes('box: f.box'), f + ': box dibawa dari Human');
    assert.ok(js.includes('window.FaceQuality.evaluateFrameQuality'), f + ': panggil gate');
    assert.ok(js.includes('_gateForceTimer'), f + ': timer force 10 detik');
    assert.ok(js.includes('Tetap Ambil'), f + ': label force');
    assert.ok(js.includes("_lastHumanScore = '1.00'"), f + ': skipVerifikasi set skor liveness');
    assert.ok(!js.includes('Munculkan tombol capture manual lebih cepat'), f + ': timer 3 detik lama dihapus');
    assert.ok(js.includes("livenessEnabled: window.FS_LIVENESS_MOBILE !== false"), f + ': honor toggle liveness');
  }
});
```

**Implementasi** (anchor per unique-string, nomor baris akan bergeser):

1. **State** dekat `_mejaStartTime` (~:579):
   ```js
   let _gate = { pass: false, boxHist: [] };
   let _gateForceTimer = null, _previewIdleTimer = null, _pendingCapture = null, _ambigSince = 0;
   let _gateCnv = null;
   ```
   (variabel preview/ambig dipakai Task 5/6 — dideklarasikan sekalian di sini).

2. **Helper brightness + gate** (taruh sebelum `startDetectLoop`, ~:1193):
   ```js
   function _sampleBrightness(src) {
     if (!_gateCnv) { _gateCnv = document.createElement('canvas'); _gateCnv.width = 32; _gateCnv.height = 32; }
     const cx = _gateCnv.getContext('2d', { willReadFrequently: true });
     cx.drawImage(src, 0, 0, 32, 32);
     const d = cx.getImageData(0, 0, 32, 32).data;
     let s = 0;
     for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
     return Math.round(s / (d.length / 4));
   }
   // ponytail: gate fail-open — bila module belum ter-load, lewatkan (jangan blokir kamera)
   function _gateEvaluate(vid, box) {
     const now = Date.now();
     const hist = _gate.boxHist;
     let stabilityMs = 0;
     if (box) {
       const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
       hist.push({ t: now, cx, cy });
       while (hist.length && now - hist[0].t > 800) hist.shift();
       const last = hist[hist.length - 1];
       let t0 = last.t;
       for (let i = hist.length - 1; i >= 0; i--) {
         const dx = Math.abs(hist[i].cx - last.cx) / vid.videoWidth;
         const dy = Math.abs(hist[i].cy - last.cy) / vid.videoHeight;
         if (dx > 0.03 || dy > 0.03) break;
         t0 = hist[i].t;
       }
       stabilityMs = now - t0;
     }
     const metrics = {
       faceRatioH: box ? box.height / vid.videoHeight : 0,
       centerOffset: box ? Math.max(
         Math.abs((box.x + box.width / 2) / vid.videoWidth - 0.5) * 2,
         Math.abs((box.y + box.height / 2) / vid.videoHeight - 0.5) * 2) : 1,
       brightness: _sampleBrightness(vid),
       stabilityMs,
       livenessScore: parseFloat(_lastHumanScore) || 0,
     };
     if (!window.FaceQuality) return { pass: true, reason: null };
     return window.FaceQuality.evaluateFrameQuality(metrics, {
       livenessThreshold: typeof FS_LIVENESS_SCORE !== 'undefined' ? FS_LIVENESS_SCORE : 0.4,
       livenessEnabled: window.FS_LIVENESS_MOBILE !== false,
     });
   }
   ```

3. **Box masuk detection** (:1253-1257): tambahkan `box: f.box,` ke objek `detection = { landmarks, descriptor, box: f.box, _isHumanLive }`.

4. **Hapus timer 3 detik** (:1206-1209) — blok komentar `// Munculkan tombol capture manual lebih cepat (3 detik)...` + `setTimeout(..., 3000)` dihapus seluruhnya.

5. **Eval + enable di loop**: sisipkan SETELAH blok status (:1301, setelah `setCamStatus('ok', ... 'Verifikasi Keaslian...')`), SEBELUM `if (window._isMejaMode)`:
   ```js
   const gateR = _gateEvaluate(vid, detection.box || null);
   if (!_gate.pass && gateR.pass) {
     _gate.pass = true;
     if ($('btnCapture') && !window._isMejaMode) $('btnCapture').disabled = false;
   }
   if (!gateR.pass && !window._isMejaMode) {
     setCamStatus('warn', '<i class="fas fa-sliders-h"></i>', 'Kualitas Foto Kurang', gateR.reason);
   }
   ```
   Lalu:
   - Auto-capture meja :1330 → `if (_isLive && !_autoCaptured && _livenessState.faceOk && gateR.pass)` (pakai nilai segar — kiosk harus lolos gate saat itu juga).
   - Fallback auto meja :1350 → tambah `&& gateR.pass`.
   - Auto non-meja :1370 → `if (!_autoCaptured && _modelsReady && _isLive && gateR.pass)`.
   - `gateR` dipakai juga di blok `window._isMejaMode` yang dimulai :1290 — karena deklarasi disisipkan sebelumnya, pastikan sisipan diletakkan **sebelum** `if (window._isMejaMode) { ... }` (:1303) sehingga variabel tersedia; blok auto-capture meja ada di dalamnya ✓.

6. **Reset**: `openCamOverlay` — sisipkan `_gate = { pass: false, boxHist: [] }; clearTimeout(_gateForceTimer);` tepat setelah `$('camPreview').classList.remove('show');` (:889). `startDetectLoop` — `_gate.boxHist.length = 0;` setelah `_isLive = false;` (:1204).

7. **Force 10 detik**: di `openCamOverlay`, setelah blok `btnCap` (:897):
   ```js
   clearTimeout(_gateForceTimer);
   _gateForceTimer = setTimeout(() => {
     if (window._isMejaMode) return;
     const b = $('btnCapture');
     if (b && b.disabled) {
       b.disabled = false;
       b.innerHTML = '<i class="fas fa-forward"></i> Tetap Ambil';
       setCamStatus('warn', '<i class="fas fa-forward"></i>', 'Kualitas Belum Ideal', 'Boleh tetap ambil foto');
     }
   }, 10000);
   ```

8. **Cleanup timer**: di `closeCamOverlay`, **baris pertama fungsi** (sebelum `if (window._isMejaMode)` di :1036):
   ```js
   clearTimeout(_gateForceTimer);
   clearTimeout(_previewIdleTimer);
   _pendingCapture = null;
   ```

9. **skipVerifikasi** (:1534-1539): tambah `_lastHumanScore = '1.00';` setelah `_isLive = true;`.

**Catatan perilaku**: jalur `loadAIModels` gagal (:996 `btnCap.disabled = false`) TIDAK diubah — tetap escape hatch.

**Verify**: `npm test` (717+1=718 hijau).
**Commit**: `feat(face): gate kualitas live (ukuran/posisi/terang/stabil/liveness) + force 10 detik`

---

## Task 4 — Burst 3 frame di `doCapture`

**Files**: `js/face.js`, `www/js/face.js`, `tests/meja-popup-and-face.test.mjs`.

**Test-first**:

```js
test('burst: doCapture menangkap 3 frame, merge, tanpa stop stream dini', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = readFileSync(join(ROOT, f), 'utf8');
    const start = js.indexOf('async function doCapture');
    const body = js.slice(start, js.indexOf('async function skipVerifikasi'));
    assert.ok(body.includes('Menangkap ${i}/3'), f + ': status progres');
    assert.ok(body.includes('mergeDescriptors'), f + ': merge 3 descriptor');
    assert.ok(body.includes('setTimeout(r, 700)'), f + ': jeda 700ms');
    assert.ok(body.includes('Date.now() + 3000'), f + ': deadline 3 detik');
    assert.ok(!body.includes('stopCamStream()'), f + ': stream TIDAK di-stop di doCapture (preview/Ulang butuh stream)');
    assert.ok(!body.includes('closeCamOverlay'), f + ': tutup overlay dipindah ke Pakai (Task 5)');
  }
});
```

**Implementasi** — ganti isi `try { ... }` di `doCapture` (:1442-1516) dengan struktur berikut (guard vid/cnv, drawing mirror, compress, meja-match, cb dipertahankan persis; yang berubah ditandai):

```js
try {
  const vid = $('camVideo');
  const cnv = $('camCanvas');
  if (!vid || vid.videoWidth === 0) throw new Error('Kamera belum siap, silakan coba lagi.');
  const ctx = cnv.getContext('2d');
  cnv.width = vid.videoWidth;
  cnv.height = vid.videoHeight;

  const drawFrame = () => {              // seperti :1452-1457 (mirror)
    ctx.save(); ctx.translate(cnv.width, 0); ctx.scale(-1, 1); ctx.drawImage(vid, 0, 0); ctx.restore();
  };
  const compress = async () => await compressImage(cnv.toDataURL('image/jpeg', 0.9), 640, 0.7);

  const shots = [];
  const deadline = Date.now() + 3000;
  for (let i = 1; i <= 3; i++) {
    if (Date.now() > deadline) break;
    setCamStatus('ok', '<i class="fas fa-camera"></i>', `Menangkap ${i}/3...`, 'Diam sejenak');
    drawFrame();
    const dataUrl = await compress();
    if (dataUrl.length < 5000) { if (i < 3) await new Promise(r => setTimeout(r, 700)); continue; }
    const desc = await getFaceDescriptor(cnv);       // tetap: ekstraksi per frame
    if (desc) shots.push({ dataUrl, desc, bright: _sampleBrightness(cnv) });
    if (i < 3) await new Promise(r => setTimeout(r, 700));
  }

  let dataUrl, descriptor;
  if (shots.length) {
    shots.sort((a, b) => b.bright - a.bright);       // frame terbaik = terang paling sedekat 128
    dataUrl = shots[0].dataUrl;
    descriptor = (window.FaceQuality && shots.length > 1)
      ? window.FaceQuality.mergeDescriptors(shots.map(s => s.desc))
      : shots[0].desc;
  } else if (preDescriptor) {                        // meja: frame burst gagal, pakai descriptor loop
    drawFrame();
    dataUrl = await compress();
    if (dataUrl.length < 5000) throw new Error('Gagal mengambil gambar yang jelas. Pastikan cahaya cukup.');
    descriptor = preDescriptor;
  } else {
    throw new Error('Gagal mengambil gambar yang jelas. Pastikan cahaya cukup.');
  }

  console.log('[AI] Phase 3: Features extracted. Length:', descriptor?.length);
  _captureData = { dataUrl };
  // HAPUS baris lama: if (!window._isMejaMode) stopCamStream();   ← stream hidup sampai overlay ditutup
  try {
    if (window._isMejaMode) {
      /* blok meja :1487-1498 TETAP, hanya tambah opts ambiguous di call → Task 6 */
    } else {
      console.log('[AI] Phase 4: Preview menunggu konfirmasi Pengguna.');
      // Task 5 menaruh preview DI SINI
    }
  } finally { _forceResetAiState(true); }
} catch (e) { ... :1520-1530 TETAP ... }
```

Detail yang harus dipertahankan: `_aiProcessing` re-lock setelah `stopDetectLoop()` (:1437-1440); path `!descriptor` lama (:1477-1482) tergantikan logika `shots` (ekstraksi gagal per-frame = shot tidak masuk; semua gagal tanpa preDescriptor → throw → catch :1520 menampilkan 'Gagal Memproses' + tombol 'Coba Lagi' — stream masih hidup, jadi retry benar-benar bisa).

Blok non-meja saat ini (:1499-1516) **dikosongkan dulu** (Task 5 mengisinya dengan preview) — komentar `// Preview menunggu konfirmasi` boleh dibiarkan.

**Verify**: `npm test` (718+1=719 hijau).
**Commit**: `feat(face): burst 3 frame + merge descriptor terbaik, stream tetap hidup`

---

## Task 5 — Alur preview: Pakai / Ulang / auto-Pakai 15 detik (meja)

**Files**: `js/face.js`, `www/js/face.js`, `tests/meja-popup-and-face.test.mjs`.

**Test-first**:

```js
test('preview: show/cleanup/idle-15s di dua mirror', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(js.includes("_pendingCapture = { kind: 'user'"), f + ': pending non-meja');
    assert.ok(js.includes("_pendingCapture = { kind: 'meja'"), f + ': pending meja');
    assert.ok(js.includes("$('camPreview').classList.add('show')"), f + ': tampilkan preview');
    assert.ok(js.includes('}, 15000)'), f + ': auto-Pakai 15 detik');
    assert.ok(js.includes("onclick = _previewUse") || js.includes('.onclick = _previewUse'), f + ': wire tombol Pakai');
    assert.ok(js.includes("$('camPreviewUse').click()"), f + ': timer memicu Pakai');
    const close = js.slice(js.indexOf('function closeCamOverlay'), js.indexOf('function stopCamStream'));
    assert.ok(close.includes('clearTimeout(_previewIdleTimer)'), f + ': timer dibersihkan saat tutup');
    assert.ok(close.includes('_pendingCapture = null'), f + ': pending dibersihkan saat tutup');
    assert.ok(close.indexOf('clearTimeout') < close.indexOf('window._isMejaMode'), f + ': cleanup sebelum cabang meja');
  }
});
```

**Implementasi**:

1. **Fungsi preview** (taruh setelah `skipVerifikasi`, ~:1540):

```js
function _hidePreview() {
  $('camPreview').classList.remove('show');
  $('camPreviewImg').src = '';
  $('camPreviewMeta').innerHTML = '';
  $('camVideoWrap').style.display = 'block';
}
function _finishUserCapture(result) {
  const cb = _absenCallbackAfterCam;
  closeCamOverlay(false);
  if (!cb) return;
  if (typeof cb === 'function') return cb(result);
  if (cb.onDone) return cb.onDone(result);
}
function _previewUse() {
  clearTimeout(_previewIdleTimer);
  const p = _pendingCapture; _pendingCapture = null;
  _hidePreview();
  if (!p) return Promise.resolve();
  if (p.kind === 'meja') return _onMejaAbsenMatchFound(p.meja.id, p.meja.descriptor, p.meja.dataUrl, p.meja.score, { ambiguous: false });
  return _finishUserCapture(p.result);
}
function _previewRetry() {
  clearTimeout(_previewIdleTimer);
  const p = _pendingCapture; _pendingCapture = null;
  _hidePreview();
  if (p && p.kind === 'meja') {
    _autoCaptured = false;
  } else {
    const b = $('btnCapture');
    if (b) { b.style.display = 'flex'; b.disabled = !_gate.pass; b.innerHTML = '<i class="fas fa-camera"></i> Ambil Foto & Lanjutkan'; }
  }
  startDetectLoop();
}
```

2. **Wire tombol** — di `openCamOverlay`, setelah deklarasi `btnCap` (:897):
   ```js
   const _pvUse = $('camPreviewUse'), _pvRetry = $('camPreviewRetry');
   if (_pvUse) _pvUse.onclick = _previewUse;
   if (_pvRetry) _pvRetry.onclick = _previewRetry;
   ```
   (assignment, bukan addEventListener → buka overlay berulang tidak menumpuk listener).

3. **Branch non-meja di `doCapture** (mengganti placeholder Task 4):
   ```js
   console.log('[AI] Phase 4: Preview menunggu konfirmasi Pengguna.');
   _pendingCapture = { kind: 'user', result: { dataUrl, descriptor, faceOk: _livenessState.faceOk || !!descriptor, livenessOk: _isLive || false } };
   $('camPreviewImg').src = dataUrl;
   $('camPreviewMeta').textContent = 'Periksa foto sebelum melanjutkan';
   $('camPreview').classList.add('show');
   $('camVideoWrap').style.display = 'none';
   const capBtn = $('btnCapture');
   if (capBtn) capBtn.style.display = 'none';
   setCamStatus('ok', '<i class="fas fa-check"></i>', 'Periksa Foto', 'Pakai foto ini atau ambil ulang');
   ```
   (`finally :1517` tetap melepas `_aiProcessing` → kedua tombol bisa diklik.)

4. **Branch meja** (sebelum `_onMejaAbsenMatchFound(bestMatch.id, ...)` :1498):
   ```js
   if (bestMatch.id && bestMatch.id !== 'unknown' && !bestMatch.ambiguous) {
     const profile = window._mejaUserMap ? window._mejaUserMap[bestMatch.id] : null;
     _pendingCapture = { kind: 'meja', meja: { id: bestMatch.id, descriptor, dataUrl, score: bestMatch.score } };
     $('camPreviewImg').src = dataUrl;
     $('camPreviewMeta').innerHTML = '<span class="cam-preview-badge cpb-ok"><i class="fas fa-check-circle"></i> COCOK ' + Math.round(bestMatch.score * 100) + '%</span> ' + (profile ? profile.nama : bestMatch.id);
     $('camPreview').classList.add('show');
     $('camVideoWrap').style.display = 'none';
     setCamStatus('ok', '<i class="fas fa-check-circle"></i>', 'Periksa Foto', 'Pakai foto ini atau ambil ulang (15 detik)');
     clearTimeout(_previewIdleTimer);
     _previewIdleTimer = setTimeout(() => { if (_pendingCapture && _pendingCapture.kind === 'meja') $('camPreviewUse').click(); }, 15000);
   } else {
     await _onMejaAbsenMatchFound(bestMatch.id, descriptor, dataUrl, bestMatch.score, { ambiguous: !!bestMatch.ambiguous });
   }
   ```

**Catatan desain**: overlay tidak ditutup sebelum "Pakai"; `closeCamOverlay(false)` hanya di `_finishUserCapture` → perilau cb persis seperti :1501-1515 lama (termasuk `triggeredByUser=false` → tanpa onCancel). Esc/✕ → `closeCamOverlay(true)` → cleanup di Task 3 sudah menghapus pending+timer. `Ulang` meja: loop dijalankan ulang, `_autoCaptured` direset, tombol capture tetap tersembunyi (kiosk). `Ulang` non-meja: `btnCapture` dikembalikan sesuai status gate.

**Verify**: `npm test` (719+1=720 hijau).
**Commit**: `feat(face): preview Pakai/Ulang semua alur + auto-Pakai 15 detik mode meja`

---

## Task 6 — Ambigu Δ < 0.05 di `matchMejaCandidate` + pesan

**Files**: `js/face.js`, `www/js/face.js`, `js/meja-handler.js`, `www/js/meja-handler.js`, `tests/meja-popup-and-face.test.mjs`.

**Test-first**:

```js
test('ambigu: runner-up + pesan + signature handler', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = readFileSync(join(ROOT, f), 'utf8');
    const m = js.slice(js.indexOf('async function matchMejaCandidate'), js.indexOf('/**', js.indexOf('async function matchMejaCandidate')));
    assert.ok(m.includes('second'), f + ': tracking runner-up');
    assert.ok(m.includes('ambiguous: true'), f + ': flag ambigu');
    assert.ok(m.includes('- second') || m.includes('bestMatch.score - second'), f + ': delta best-second');
    assert.ok(js.includes('Wajah Terlalu Mirip'), f + ': pesan ambigu');
    assert.ok(js.includes('opts.ambiguous') || js.includes('{ ambiguous: !!bestMatch.ambiguous }'), f + ': kirim ke handler');
    assert.ok(js.includes('_ambigSince'), f + ': tahan pesan ambigu 2 detik');
  }
  for (const f of ['js/meja-handler.js', 'www/js/meja-handler.js']) {
    const js = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(js.includes('opts = {}'), f + ': parameter opsional ke-5');
    assert.ok(js.includes('WAJAH MENYERUPAI PEGAWA LAIN'), f + ': teks unknown-karena-ambigu');
  }
});
```

**Implementasi**:

1. `matchMejaCandidate` (:304, :329-343):
   ```js
   let bestMatch = { id: 'unknown', score: 0 };
   let second = 0;                                   // runner-up
   ...
   if (similarity > bestMatch.score) { second = bestMatch.score; bestMatch = { id: ref.id, score: similarity }; }
   else if (similarity > second) second = similarity;
   ...
   if (bestMatch.score < threshold) return { id: 'unknown', score: bestMatch.score };
   if (second > 0 && bestMatch.score - second < (window.FaceQuality ? window.FaceQuality.THRESHOLDS.ambiguousDelta : 0.05)) {
     return { id: 'unknown', score: bestMatch.score, ambiguous: true };
   }
   return bestMatch;
   ```
2. **Call detect-loop** (:1310-1344): di blok `else` (:1341):
   ```js
   } else {
     if (match && match.ambiguous) {
       _ambigSince = Date.now();
       setCamStatus('bad', '<i class="fas fa-exclamation-triangle"></i>', 'Wajah Terlalu Mirip', 'Menyerupai lebih dari satu pegawai — coba lagi dengan sudut berbeda');
     }
     _lastMatchedId = null;
     _matchStabilityCount = 0;
   }
   ```
   Guard overwrite di :1293-1295:
   ```js
   } else if (!_lastMatchedId && !(window._ambigSince && Date.now() - _ambigSince < 2000)) {
     setCamStatus('ok', ...mencocokkan...);
   }
   ```
   (`_ambigSince` = var global dari Task 3; set 0 saat match valid ditemukan — sisipkan `_ambigSince = 0;` setelah `if (match && match.id !== 'unknown') {`.)
3. **doCapture meja** — sudah dikirim via `{ ambiguous: !!bestMatch.ambiguous }` (Task 5).
4. `meja-handler.js:4`: signature → `async function _onMejaAbsenMatchFound(telegramId, descriptor, dataUrl, distance, opts = {})`. Blok unknown (:57-79): bila `opts.ambiguous`, ganti teks:
   - `_moNama.textContent = 'TERLALU MIRIP';`
   - `_moStatus.textContent = 'WAJAH MENYERUPAI PEGAWA LAIN';`
   - `_moDetail.textContent = 'Coba lagi dengan sudut/pencahayaan berbeda…';`
   - `_setMejaStatus(..., 'Wajah Terlalu Mirip', 'Menyerupai lebih dari satu pegawai')`
   - `setCamStatus('bad', ..., 'Wajah Terlalu Mirip', 'Coba lagi dengan sudut berbeda')`
   teks non-ambigu TIDAK diubah.

**Verify**: `npm test` (720+1=721 hijau).
**Commit**: `feat(face): tolak kandidat ambigu (delta < 0.05) dengan pesan jelas`

---

## Task 7 — Collision check di `POST /face` (server) + test

**Files**: `server/media.js`, `server/media.test.js`.

**Test-first** — tambah ke `server/media.test.js` (di area /face, sesudah test :692-760; harness `query` custom sudah tersedia):

```js
const D512 = Array(512).fill(0.01);            // descriptor 512-dim "baru"
const D512_DUP = [...D512];                    // identik -> similarity 1
const twinSql = (text) => /face-twin/.test(text);

test('face: dup kembar >= threshold -> 409, TANPA upload Drive', async () => {
  const h = harness({
    query: async (text) => {
      if (twinSql(text)) return { rows: [{ id: '7', nip: '111', nama: 'Budi', face_histogram: JSON.stringify(D512_DUP) }] };
      if (/FROM pengaturan WHERE key='face_threshold'/.test(text)) return { rows: [] };   // default 0.55
      if (/FROM "user_list"/i.test(text)) return { rows: [row({ id: '77', nip: '77', instansi_id: 'bapperida' })] };
      if (/UPDATE "user_list"/i.test(text)) return { rows: [{ id: '77' }] };
      return { rows: [] };
    },
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77, face_descriptor: D512 });
  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
  assert.match(res.body.message, /Budi/);
  assert.equal(h.gas.length, 0, 'upload Drive tidak boleh terjadi');
});

test('face: dup di bawah threshold -> lanjut 200', async () => {
  const near = [...D512]; near[0] += 0.6;      // beda jauh -> similarity jauh di bawah 0.55
  const h = harness({
    query: async (text) => {
      if (twinSql(text)) return { rows: [{ id: '7', nip: '111', nama: 'Budi', face_histogram: JSON.stringify(near) }] };
      if (/FROM pengaturan WHERE key='face_threshold'/.test(text)) return { rows: [] };
      if (/FROM "user_list"/i.test(text)) return { rows: [row({ id: '77', nip: '77' })] };
      if (/UPDATE "user_list"/i.test(text)) return { rows: [{ id: '77' }] };
      return { rows: [] };
    },
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77, face_descriptor: D512 });
  assert.equal(res.status, 200);
  assert.equal(h.gas.length, 1);
});

test('face: update milik sendiri (uid sama) -> lolos dari cek duplikat', async () => {
  const h = harness({
    query: async (text) => {
      if (twinSql(text)) return { rows: [{ id: '7', nip: '111', nama: 'Budi', face_histogram: JSON.stringify(D512_DUP) }] };
      if (/FROM pengaturan WHERE key='face_threshold'/.test(text)) return { rows: [] };
      return undefined;                        // pakai stub default: target = pemanggil (ME.id 42)
    },
  });
  const res = await post(h, '/api/media/face', { ...FACE, face_descriptor: D512 }); // user_id 42 = ME
  assert.equal(res.status, 200);
  assert.equal(h.gas.length, 1);
});

test('face: threshold pengaturan instansi dipakai (0.90 -> skor 0.92 tetap ditolak)', async () => {
  const b = Array(512).fill(0); b[0] = 5;      // similarity Human = 0.92 (lihat Task 1)
  const h = harness({
    query: async (text) => {
      if (twinSql(text)) return { rows: [{ id: '7', nip: '111', nama: 'Ani', face_histogram: JSON.stringify(b) }] };
      if (/FROM pengaturan WHERE key='face_threshold'/.test(text)) return { rows: [{ value: '0.90' }] };
      if (/FROM "user_list"/i.test(text)) return { rows: [row({ id: '77', nip: '77' })] };
      if (/UPDATE "user_list"/i.test(text)) return { rows: [{ id: '77' }] };
      return { rows: [] };
    },
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77, face_descriptor: [...Array(512).fill(0)] });
  assert.equal(res.status, 409);               // 0.92 >= 0.90
});

test('face: descriptor 2-dim / beda panjang -> cek dilewati (regresi test lama tetap 200)', async () => {
  const h = harness({
    query: async (text) => {
      if (twinSql(text)) return { rows: [{ id: '7', nip: '111', nama: 'Budi', face_histogram: JSON.stringify(D512_DUP) }] };
      if (/FROM pengaturan WHERE key='face_threshold'/.test(text)) return { rows: [] };
      return undefined;
    },
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77, face_descriptor: [0.1, 0.2] });
  assert.equal(res.status, 200);
});
```

Catatan harness: fungsi `query` custom **menggantikan** seluruh default stub → setiap test wajib menangan sendiri `FROM "user_list"` (target) dan `UPDATE "user_list"`; tanpa custom, stub lama mengembalikan `userRow` tanpa `face_histogram` → cek dup dilewati otomatis (semua test lama aman).

**Implementasi** `server/media.js`:

1. Impor di atas file:
   ```js
   import { similarityOf, THRESHOLDS } from '../js/face-quality.js';
   ```
2. Setelah blok `_reset` (:198), sebelum `let image;` (:200), sisipkan:
   ```js
   const newDesc = Array.isArray(req.body?.face_descriptor) ? req.body.face_descriptor : null;
   if (newDesc && newDesc.length && String(targetId) !== String(req.user.id)) {
     // /* face-twin */ — anchor untuk test stub
     const twinRows = (await query(`/* face-twin */ SELECT id, nip, nama, face_histogram FROM "user_list" WHERE id <> $1::bigint AND COALESCE(instansi_id,'') IS NOT DISTINCT FROM COALESCE($2,'') AND COALESCE(face_histogram,'') NOT IN ('','[]','null')`, [targetId, target.instansi_id ?? null])).rows;
     const thRow = (await query(`SELECT value FROM pengaturan WHERE key='face_threshold' AND instansi_id=$1 LIMIT 1`, [target.instansi_id ?? null])).rows[0];
     const threshold = thRow ? (parseFloat(thRow.value) || 0.55) : 0.55;
     for (const r of twinRows) {
       let fd = r.face_histogram;
       try { fd = typeof fd === 'string' ? JSON.parse(fd) : fd; } catch (_) { continue; }
       const sim = similarityOf(newDesc, fd);
       if (sim !== null && sim >= threshold) {
         return fail(res, 409, `Wajah ini mirip dengan data wajah ${r.nama} (NIP ${r.nip}) — wajah tidak boleh terdaftar ganda`);
       }
     }
   }
   ```
   Posisi ini: SETELAH `inScope` + `_reset`, SEBELUM `decodeDataUrl`/`upload` → tidak ada file Drive yatim saat ditolak. Self-exempt: `targetId === req.user.id` (String-safe, mengikuti pola fix D-1) → cek dilewati. Formula klien ↔ server sama: `similarityOf` 512 = `Human.match.similarity` yang juga dipakai `face.js:318`; 128 = `1 − euclid/1.5` identik `face.js:323`. Campur-dim → `null` → skip.

**Verify**: `npm test` (721+5=726 hijau).
**Commit**: `feat(media): tolak duplikat wajah antar-pegawai sebelum upload (409)`

---

## Task 8 — Panduan threshold di bawah slider (index.html ×2)

**Files**: `index.html`, `www/index.html`, `tests/meja-popup-and-face.test.mjs`.

**Test-first**:

```js
test('threshold hint: teks panduan di bawah dua slider di dua index.html', () => {
  for (const f of ['index.html', 'www/index.html']) {
    const html = readFileSync(join(ROOT, f), 'utf8');
    const i1 = html.indexOf('id="fsThreshold"'), i2 = html.indexOf('id="fsMejaThreshold"');
    assert.ok(i1 > -1 && i2 > -1, f + ': slider ada');
    const seg1 = html.slice(i1, i1 + 600), seg2 = html.slice(i2, i2 + 600);
    assert.ok(seg1.includes('0.55 seimbang'), f + ': hint threshold wajah');
    assert.ok(seg2.includes('0.55 seimbang'), f + ': hint threshold meja');
  }
});
```

**Implementasi** — sisipkan tepat setelah tag `<input id="fsThreshold" ...>` (root ~:2924, www ~:2921) dan setelah `<input id="fsMejaThreshold" ...>` (root ~:2935, www ~:2932):

```html
<div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5">0.55 seimbang · di bawah 0.5 longgar (risiko salah kenali) · di atas 0.65 ketat (risiko gagal cocok)</div>
```

(Deviation spek #3 di header: statis di HTML, bukan `js/admin-face.js` — tanpa JS, tanpa bump.)

**Verify**: `npm test` (726+1=727 hijau).
**Commit**: `docs(face): panduan ambang threshold di panel admin`

---

## Task 9 — Verifikasi akhir penuh

**Perintah & acceptance:**
1. `npm test` → **semua hijau (target 727)**, 0 gagal.
2. Mirror identik:
   ```
   git diff --no-index js/face.js www/js/face.js
   git diff --no-index js/meja-handler.js www/js/meja-handler.js
   git diff --no-index css/styles.css www/css/styles.css
   git diff --no-index index.html www/index.html
   ```
   Hanya beda pre-existing yang sudah ada sebelum sesi; jika ada drift baru → perbaiki mirror.
3. Cache-buster di dua index.html: `js/face.js?v=20261112b` + `js/face-quality.js?v=20261112a` masing-masing tepat satu kemunculan.
4. `www/js/face-quality.js` ada dan identik dengan `js/face-quality.js`.
5. Cek manual ringkas: tidak ada `stopCamStream()` tersisa di dalam `doCapture`; `scripts.test` memuat `tests/face-quality.test.mjs`.

**Commit**: `chore(face): verifikasi suite + mirror + cache-buster sesi kualitas wajah`

---

## Review Focus (5 masukan untuk reviewer)

1. **Stream & lifecycle (T4/T5)**: kamera mati hanya di `closeCamOverlay`; jalur error `doCapture` meninggalkan stream hidup agar 'Coba Lagi' berfungsi; Esc/✕ membatalkan preview tanpa memanggil `onDone`; timer 10s & 15s dibersihkan di baris pertama `closeCamOverlay` (sebelum cabang meja `return`) — cek tidak ada timer yang membakar klik setelah overlay tertutup.
2. **Gate bukan jebakan (T3)**: `FS_LIVENESS_MOBILE === false` melewati baris liveness; jalur AI gagal (:996) tetap menyalakan tombol; force 10 detik selalu tersedia; gate fail-open bila `window.FaceQuality` belum termuat.
3. **Collision benar & aman (T7)**: cek SEBELUM `upload()` (tidak ada Drive yatim); self-update (uid sama) lolos; threshold baca `pengaturan.face_threshold` instansi target (default 0.55); descriptor 2-dim/dim-campur → `null` → dilewati sehingga seluruh test lama tetap 200; formula 512 = persis `Human.match.similarity` (termasuk pembulatan `round100`).
4. **Bukan mengubah kontrak (T4/T5/T7)**: body & respons sukses `POST /face` tak berubah; `syncFaceToServer` tak diubah (pesan 409 mengalir via `body.message` → `window._lastAiError` → Swal); `skipVerifikasi` hanya +1 baris.
5. **Merge & ambigu (T1/T6)**: `mergeDescriptors` rata-rata polos TANPA normalisasi (threshold 0.55 Human-scaled sensitif skala); ambigu pakai delta `best − second < 0.05` dengan `second > 0` guard (satu kandidat di DB tidak pernah false-positive); status ambigu ditahan 2 detik (`_ambigSince`) agar tidak ditimpa status 'Mencocokkan…' frame berikutnya.

## Urutan Eksekusi & Stop Conditions

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9, masing-masing: tulis test dulu (merah) → implement (hijau) → `npm test` penuh → commit. Bila satu task gagal review → perbaiki task itu, jangan lanjut. Semua angka baris adalah anchor saat penulisan plan — cari dengan string unik yang diberikan, bukan angka, setelah edit sebelumnya menggeser baris.
