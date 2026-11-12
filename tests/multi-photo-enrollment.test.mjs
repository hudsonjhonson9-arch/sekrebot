import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Task 2 — wiring loop enrolmen 3 foto di js/face.js:
//   - opt-in hanya lewat flag isRegister: true (6 pemanggil, sisanya 0)
//   - state _enrollShots (0 = non-enrolmen) & _enrollTaken direset per pembukaan
//   - loop memakai window.FaceQuality.nextEnrollShot (Task 1)

const root = join(import.meta.dirname, '..');
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
