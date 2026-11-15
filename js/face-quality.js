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

export function nextEnrollShot(taken, shot, need) {
  if (!shot || !Array.isArray(shot.descriptor) || shot.descriptor.length < 512) {
    return { shots: taken, done: false, skipped: true };
  }
  const shots = [...taken, shot];
  if (shots.length < need) return { shots, done: false };
  return {
    shots, done: true,
    descriptor: mergeDescriptors(shots.map(s => s.descriptor)),
    dataUrl: shots[0].dataUrl,
  };
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

if (typeof window !== 'undefined') window.FaceQuality = { THRESHOLDS, evaluateFrameQuality, mergeDescriptors, nextEnrollShot, similarityOf };
