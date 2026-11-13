import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFrameQuality, mergeDescriptors, nextEnrollShot, similarityOf, THRESHOLDS } from '../js/face-quality.js';

const okMetrics = { faceRatioH: 0.5, centerOffset: 0.05, brightness: 120, stabilityMs: 500, livenessScore: 0.6 };
const D512 = n => Array(512).fill(n);

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

test('nextEnrollShot: descriptor 1024-dim (Human faceres) diterima, bukan skipped', () => {
  const D1024 = n => Array(1024).fill(n);
  const r1 = nextEnrollShot([], { descriptor: D1024(1), dataUrl: 'A' }, 3);
  assert.ok(!r1.skipped); assert.equal(r1.done, false); assert.equal(r1.shots.length, 1);
  const shots = [1, 2, 3].map(n => ({ descriptor: D1024(n), dataUrl: 'S' + n }));
  const r2 = nextEnrollShot(shots.slice(0, 2), shots[2], 3);
  assert.equal(r2.done, true); assert.equal(r2.descriptor.length, 1024);
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
