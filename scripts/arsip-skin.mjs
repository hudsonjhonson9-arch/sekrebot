#!/usr/bin/env node
/* WS4: samakan gaya permukaan absensi dengan arsip (peta-ekonomi src/theme.js).
   Terapkan ke semua salinan css/styles.css. Idempoten (penanda blok dicek).
   Pemakaian: node scripts/arsip-skin.mjs */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'css/styles.css',
  'www/css/styles.css',
  'android/app/src/main/assets/public/css/styles.css',
];

// [cari, ganti] — literal, unik/aman (lihat verifikasi count)
const REPS = [
  ['border-radius: 18px;', 'border-radius: 14px;'],                                   // .card/.user-card (radiusLg arsip)
  ['backdrop-filter: blur(15px);', 'backdrop-filter: none;'],                          // buang glass
  ['backdrop-filter: blur(30px);', 'backdrop-filter: none;'],
  ['-webkit-backdrop-filter: blur(30px);', '-webkit-backdrop-filter: none;'],
  ['box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);', 'box-shadow: var(--shadow-md);'],
  ['--card-bg: rgba(30, 41, 59, .85);', '--card-bg: #1E293B;'],                        // solid (arsip DARK card)
  ['background: rgba(15, 23, 42, 0.95);', 'background: var(--card-bg);'],              // .bottom-nav
  ['border-radius: 28px 28px 0 0;', 'border-radius: 0;'],
  ['box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.7);', 'box-shadow: 0 -1px 3px rgba(0, 0, 0, .35);'],
  ['border-top: 1px solid rgba(59, 130, 246, 0.1);', 'border-top: 1px solid var(--border);'],
  ['background: rgba(30, 41, 59, 0.95);', 'background: var(--card-bg);'],              // .more-menu-content
  ['box-shadow: 0 15px 40px rgba(0,0,0,0.6);', 'box-shadow: var(--shadow-lg);'],
  ['padding: 16px 12px;', 'padding: 12px 14px;'],                                       // .header
];

const MARK = '/* WS4: token tema arsip';
const BLOCK = `

${MARK} (peta-ekonomi src/theme.js) */
:root {
  --radius: 10px; --radius-lg: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.3);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.4), 0 2px 4px -2px rgba(0,0,0,.3);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.4), 0 4px 6px -4px rgba(0,0,0,.3);
}
html.light-theme {
  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.08), 0 4px 6px -4px rgba(0,0,0,.04);
}
`;

for (const rel of FILES) {
  const p = join(root, rel);
  if (!existsSync(p)) { console.log('lewati (tidak ada):', rel); continue; }
  let css = readFileSync(p, 'utf8');
  const before = css;
  let n = 0;
  for (const [a, b] of REPS) {
    const parts = css.split(a);
    if (parts.length > 1) { n += parts.length - 1; css = parts.join(b); }
  }
  if (!css.includes(MARK)) css += BLOCK;
  if (css === before) { console.log('tanpa perubahan:', rel); continue; }
  writeFileSync(p, css);
  console.log(`${rel}: ${n} deklarasi diganti${css.includes(BLOCK) ? '' : ''}`);
}
