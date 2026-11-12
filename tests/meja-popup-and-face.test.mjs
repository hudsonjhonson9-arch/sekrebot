import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('mejaOverlayResult is top-level child of body in index.html and www/index.html', () => {
  for (const file of ['index.html', 'www/index.html']) {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    const html = raw.replace(/\r\n/g, '\n');
    
    // Check that mejaOverlayResult is defined
    assert.ok(html.includes('id="mejaOverlayResult"'), `${file} should contain #mejaOverlayResult`);

    // Verify it is NOT inside camOverlay or cam-body
    const camOverlayStart = html.indexOf('id="camOverlay"');
    const camBodyClosing = html.indexOf('</div>\n  </div>', camOverlayStart);
    const mejaIndex = html.indexOf('id="mejaOverlayResult"');

    assert.ok(camOverlayStart > 0, `${file} has camOverlay`);
    assert.ok(camBodyClosing > camOverlayStart, `${file} has closing for camOverlay`);
    assert.ok(mejaIndex > camBodyClosing, `${file}: #mejaOverlayResult (${mejaIndex}) must be after #camOverlay closing tag (${camBodyClosing})`);
    
    // mejaOverlayResult must be placed outside camOverlay
    const isInsideCamOverlay = html.slice(camOverlayStart, camBodyClosing).includes('id="mejaOverlayResult"');
    assert.strictEqual(isInsideCamOverlay, false, `${file}: #mejaOverlayResult must NOT be nested inside .cam-body or #camOverlay`);

    // Check inline style has inset:0 and margin:auto
    assert.ok(html.includes('inset:0 !important; margin:auto !important;'), `${file}: #mejaOverlayResult should use inset:0 and margin:auto`);
  }
});

test('CSS rules for #mejaOverlayResult use inset:0 and margin:auto for rock-solid centering', () => {
  for (const file of ['css/styles.css', 'www/css/styles.css']) {
    const css = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(css.includes('inset: 0 !important;'), `${file}: CSS should contain inset: 0 !important;`);
    assert.ok(css.includes('margin: auto !important;'), `${file}: CSS should contain margin: auto !important;`);
    assert.ok(css.includes('z-index: 50000 !important;'), `${file}: CSS should contain z-index: 50000 !important;`);
  }
});

test('syncFaceToServer supports dual payloads and targetNip', () => {
  for (const file of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('targetNip'), `${file} syncFaceToServer should accept targetNip`);
    assert.ok(js.includes('user_id: uid'), `${file} should send user_id`);
    assert.ok(js.includes('id: uid'), `${file} should send id for legacy compatibility`);
    assert.ok(js.includes('face_photo: dataUrl'), `${file} should send face_photo`);
    assert.ok(js.includes('face_histogram: descriptorArray'), `${file} should send face_histogram`);
  }
});

test('Face registration flows trigger Swal notifications', () => {
  for (const file of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('Foto Wajah Berhasil Diperbarui'), `${file} registerFaceFromPreview should show success alert`);
  }
  for (const file of ['js/desktop.js', 'www/js/desktop.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('Foto Wajah Tersimpan'), `${file} adminCaptureFaceFor should show success alert`);
  }
  for (const file of ['js/admin-face.js', 'www/js/admin-face.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('Pendaftaran Wajah Berhasil'), `${file} daftarWajahPaksa should show success alert`);
  }
});

test('Update wajah menampilkan loading sebelum save, dan timeout rantai konsisten', () => {
  for (const file of ['js/desktop.js', 'www/js/desktop.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    const start = js.indexOf('function adminCaptureFaceFor');
    assert.ok(start > -1, `${file} should define adminCaptureFaceFor`);
    const end = js.indexOf('function adminCaptureFace', start + 10);
    const slice = js.slice(start, end > start ? end : start + 1500);
    const loading = slice.indexOf('Swal.showLoading()');
    const save = slice.indexOf('saveFaceRefFor(');
    assert.ok(loading > -1, `${file} adminCaptureFaceFor should show a loading indicator`);
    assert.ok(save > loading, `${file} loading must open before saveFaceRefFor (before=${loading}, save=${save})`);
  }

  for (const file of ['js/config.js', 'www/js/config.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('opts.timeout || 15000'), `${file} nativeFetch should honour opts.timeout`);
  }

  for (const file of ['js/api.js', 'www/js/api.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('async function apiPost(endpoint, body, opts = {})'), `${file} apiPost should accept opts`);
  }

  for (const file of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert.ok(js.includes('{ timeout: 50000 }'), `${file} face upload must outlive the 45s gasUpsert budget`);
    assert.ok(!js.includes('${200}'), `${file} must not hardcode HTTP 200 in the error message`);
  }

  const nginx = fs.readFileSync(path.join(ROOT, 'nginx.conf'), 'utf-8');
  const m = nginx.match(/proxy_read_timeout\s+(\d+)s/);
  assert.ok(m && Number(m[1]) >= 60, `nginx proxy_read_timeout must cover the 45s gas budget, got: ${m && m[1]}`);
});

test('face-quality: markup preview + tag module + bump di dua index.html', () => {
  for (const f of ['index.html', 'www/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(html.includes('id="camPreviewUse"'), f + ': tombol Pakai');
    assert.ok(html.includes('id="camPreviewRetry"'), f + ': tombol Ulang');
    assert.ok(html.includes('id="camPreviewMeta"'), f + ': meta preview');
    assert.ok(html.includes('js/face-quality.js?v=20261112b'), f + ': tag module');
    assert.ok(html.includes('js/face.js?v=20261112d'), f + ': bump face.js');
    const tag = html.indexOf('js/face-quality.js'), face = html.indexOf('js/face.js?v=');
    assert.ok(tag > -1 && face > -1 && tag < face, f + ': tag module sebelum face.js');
  }
});

test('face-quality: style tombol preview ada di dua styles.css', () => {
  for (const f of ['css/styles.css', 'www/css/styles.css']) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(css.includes('.cam-preview-actions'));
    assert.ok(css.includes('#camPreviewUse'));
  }
});

test('gate: wiring kualitas di face.js (dua mirror identik)', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(js.includes('box: f.box'), f + ': box dibawa dari Human');
    assert.ok(js.includes('window.FaceQuality.evaluateFrameQuality'), f + ': panggil gate');
    assert.ok(js.includes('_gateForceTimer'), f + ': timer force 10 detik');
    assert.ok(js.includes('Tetap Ambil'), f + ': label force');
    assert.ok(js.includes("_lastHumanScore = '1.00'"), f + ': skipVerifikasi set skor liveness');
    assert.ok(!js.includes('Munculkan tombol capture manual lebih cepat'), f + ': timer 3 detik lama dihapus');
    assert.ok(js.includes('livenessEnabled: window.FS_LIVENESS_MOBILE !== false'), f + ': honor toggle liveness');
  }
});

test('burst: doCapture menangkap 3 frame, merge, tanpa stop stream dini', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
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

test('preview: show/cleanup/idle-15s di dua mirror', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(js.includes("_pendingCapture = { kind: 'user'"), f + ': pending non-meja');
    assert.ok(js.includes("_pendingCapture = { kind: 'meja'"), f + ': pending meja');
    assert.ok(js.includes("$('camPreview').classList.add('show')"), f + ': tampilkan preview');
    assert.ok(js.includes('}, 15000)'), f + ': auto-Pakai 15 detik');
    assert.ok(js.includes('onclick = _previewUse'), f + ': wire tombol Pakai');
    assert.ok(js.includes("$('camPreviewUse').click()"), f + ': timer memicu Pakai');
    const close = js.slice(js.indexOf('function closeCamOverlay'), js.indexOf('function stopCamStream'));
    assert.ok(close.includes('clearTimeout(_previewIdleTimer)'), f + ': timer dibersihkan saat tutup');
    assert.ok(close.includes('_pendingCapture = null'), f + ': pending dibersihkan saat tutup');
    assert.ok(close.indexOf('clearTimeout') < close.indexOf('window._isMejaMode'), f + ': cleanup sebelum cabang meja');
  }
});

test('ambigu: runner-up + pesan + signature handler', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = js.slice(js.indexOf('async function matchMejaCandidate'), js.indexOf('/**', js.indexOf('async function matchMejaCandidate')));
    assert.ok(m.includes('second'), f + ': tracking runner-up');
    assert.ok(m.includes('ambiguous: true'), f + ': flag ambigu');
    assert.ok(m.includes('- second') || m.includes('bestMatch.score - second'), f + ': delta best-second');
    assert.ok(js.includes('Wajah Terlalu Mirip'), f + ': pesan ambigu');
    assert.ok(js.includes('opts.ambiguous') || js.includes('{ ambiguous: !!bestMatch.ambiguous }'), f + ': kirim ke handler');
    assert.ok(js.includes('_ambigSince'), f + ': tahan pesan ambigu 2 detik');
  }
  for (const f of ['js/meja-handler.js', 'www/js/meja-handler.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(js.includes('opts = {}'), f + ': parameter opsional ke-5');
    assert.ok(js.includes('WAJAH MENYERUPAI PEGAWAI LAIN'), f + ': teks unknown-karena-ambigu');
  }
});

test('threshold hint: teks panduan di bawah dua slider di dua index.html', () => {
  for (const f of ['index.html', 'www/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const i1 = html.indexOf('id="fsThreshold"'), i2 = html.indexOf('id="fsMejaThreshold"');
    assert.ok(i1 > -1 && i2 > -1, f + ': slider ada');
    const seg1 = html.slice(i1, i1 + 600), seg2 = html.slice(i2, i2 + 600);
    assert.ok(seg1.includes('0.55 seimbang'), f + ': hint threshold wajah');
    assert.ok(seg2.includes('0.55 seimbang'), f + ': hint threshold meja');
  }
});

test('fix review: force timer re-armed di retry + doCapture batal bila overlay tertutup + bump tag', () => {
  for (const f of ['js/face.js', 'www/js/face.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const retry = js.slice(js.indexOf('function _previewRetry'), js.indexOf('function closeCamByUser'));
    assert.ok(retry.includes('_gateForceTimer = setTimeout'), f + ': retry re-arm force 10 detik');
    const cap = js.slice(js.indexOf('async function doCapture'), js.indexOf('async function skipVerifikasi'));
    assert.ok(cap.includes("classList.contains('hidden')) return"), f + ': guard overlay tertutup di tail doCapture');
    const close = js.slice(js.indexOf('function closeCamOverlay'), js.indexOf('function stopCamStream'));
    assert.ok(close.includes('clearTimeout(_gateForceTimer)'), f + ': force dibersihkan saat tutup');
  }
  for (const f of ['js/meja-handler.js', 'www/js/meja-handler.js']) {
    const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!js.includes('PEGAWA LAIN'), f + ': typo PEGAWA sudah diperbaiki');
  }
  for (const f of ['index.html', 'www/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(html.includes('css/styles.css?v=20261112c'), f + ': bump styles.css');
    assert.ok(html.includes('js/meja-handler.js?v=20261112a'), f + ': bump meja-handler.js');
  }
});
