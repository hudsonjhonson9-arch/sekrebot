// ═══════════════════════════════════════════════════════════════
// RETHEME: ubah literal warna lama (emas/navy/warm) -> tema arsip (biru/slate)
// di styles.css (3 salinan) + index.html (3 salinan) + manifest.json.
//
// Cara pakai:
//   node scripts/retheme.mjs [--dry] [file...]
//   --dry: hanya hitung kemunculan, tanpa menulis. Default: tulis.
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'css/styles.css',
  'www/css/styles.css',
  'android/app/src/main/assets/public/css/styles.css',
  'index.html',
  'www/index.html',
  'android/app/src/main/assets/public/index.html',
  'manifest.json',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const once = (old) => new RegExp(esc(old), 'gi'); // hex/rgba: case-insensitif aman (target token huruf semua kecil)

// [lama, baru] — case-insensitive regex replace.
const MAP = [
  // Dark/umum: emas -> biru, navy -> slate
  ['#c9a84c', '#3B82F6'],
  ['#d4af37', '#3B82F6'],
  ['#9b6e1a', '#1D4ED8'],
  ['#a07828', '#1D4ED8'],
  ['#b8860b', '#2563EB'],
  ['#0a1628', '#0F172A'],
  ['#0d1b2a', '#0F172A'],
  ['#050c1e', '#0F172A'],
  ['#0a192f', '#0F172A'],
  ['#111827', '#0F172A'],
  ['#112240', '#1E293B'],
  ['#1a2a4a', '#1E293B'],
  ['#0f1e3a', '#1E293B'],
  ['#1a2035', '#1E293B'],
  ['#f0f4ff', '#F1F5F9'],
  ['#7a90b8', '#94A3B8'],
  // Light (warm) -> arsip LIGHT (nilai savar css dihand-edit terpisah)
  ['#8a6914', '#1D4ED8'],
  ['#2c2417', '#0F172A'],
  ['#6b5e4e', '#64748B'],
  ['#f8f6f1', '#F8FAFC'],
  ['#fffdf9', '#FFFFFF'],
  ['#f0ede5', '#F1F5F9'],
  ['#e0dbd0', '#CBD5E1'],
  ['#a89880', '#64748B'],
  ['#a3620a', '#D97706'],
  // rgba emas -> biru
  ['rgba(201, 168, 76,', 'rgba(59, 130, 246,'],
  ['rgba(201,168,76,', 'rgba(59,130,246,'],
  ['rgba(212, 175, 55,', 'rgba(59, 130, 246,'],
  ['rgba(212,175,55,', 'rgba(59,130,246,'],
  ['rgba(138, 105, 20,', 'rgba(29, 78, 216,'],
  ['rgba(138,105,20,', 'rgba(29,78,216,'],
  // rgba navy -> slate
  ['rgba(10, 22, 40,', 'rgba(15, 23, 42,'],
  ['rgba(10,22,40,', 'rgba(15,23,42,'],
  ['rgba(5, 12, 30,', 'rgba(15, 23, 42,'],
  ['rgba(5,12,30,', 'rgba(15,23,42,'],
  ['rgba(13, 27, 42,', 'rgba(15, 23, 42,'],
  ['rgba(13,27,42,', 'rgba(15,23,42,'],
  ['rgba(10, 22, 60,', 'rgba(15, 23, 42,'],
  ['rgba(10,22,60,', 'rgba(15,23,42,'],
  ['rgba(17, 34, 64,', 'rgba(30, 41, 59,'],
  ['rgba(17,34,64,', 'rgba(30,41,59,'],
  ['rgba(20, 35, 70,', 'rgba(30, 41, 59,'],
  ['rgba(20,35,70,', 'rgba(30,41,59,'],
  ['rgba(15, 40, 90,', 'rgba(30, 41, 59,'],
  ['rgba(15,40,90,', 'rgba(30,41,59,'],
  ['rgba(20, 60, 110,', 'rgba(30, 41, 59,'],
  ['rgba(20,60,110,', 'rgba(30,41,59,'],
  ['rgba(15, 30, 60,', 'rgba(30, 41, 59,'],
  ['rgba(15,30,60,', 'rgba(30,41,59,'],
  // rgba cream -> near-white
  ['rgba(255, 253, 249,', 'rgba(248, 250, 252,'],
  ['rgba(255,253,249,', 'rgba(248,250,252,'],
  ['rgba(248, 246, 241,', 'rgba(248, 250, 252,'],
  ['rgba(248,246,241,', 'rgba(248,250,252,'],
  // URL-encoded di data-URI svg
  ['%23c9a84c', '%233B82F6'],
  ['%238a6914', '%231D4ED8'],
  ['%230a1628', '%230F172A'],
  ['%23f0f4ff', '%23F1F5F9'],
];

const DRY = process.argv.includes('--dry');
const files = process.argv.filter((a) => !a.startsWith('-')).slice(2);
const targets = files.length ? files : FILES;

let totalFiles = 0;
let anyChanged = false;
for (const f of targets) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch (e) { console.log(`  !! lewati (tidak ada): ${f}`); continue; }
  const perPair = MAP.map(([old, now]) => {
    if (DRY) {
      const hit = src.split(old).length - 1; // dry: hitung exact (case-sensitive, dekati saja)
      return hit ? `${old}->${now} x${hit}` : null;
    }
    let hit = 0;
    let out = src.replace(once(old), () => { hit++; return now; });
    src = out;
    return hit ? `${old}->${now} x${hit}` : null;
  }).filter(Boolean);
  if (perPair.length) {
    totalFiles++;
    anyChanged = anyChanged || !DRY;
    console.log(`\n[${f}]`);
    perPair.forEach((x) => console.log('  ' + x));
    if (!DRY) writeFileSync(f, src, 'utf8');
  }
}

console.log(`\n${DRY ? '[DRY] ' : ''}diproses ${totalFiles}/${targets.length} file.`);
if (DRY && totalFiles) console.log('Jalankan tanpa --dry untuk menulis.');
if (!DRY && !anyChanged) console.log('Tidak ada literal yang tersisa.');