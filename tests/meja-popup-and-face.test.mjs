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
