#!/usr/bin/env node
/* Sinkron ikon: scripts/runeicons-map.json -> icons/ri/*.svg (unduh) + css/lib/runeicons.css.
   Nilai null di map = ikon custom, wajib ada di icons/custom/fa-<nama>.svg.
   Pemakaian: node scripts/runeicons-sync.mjs [--force] */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const BASE = 'https://raw.githubusercontent.com/Runeicons/runeicons/main/public/normal';

const map = JSON.parse(readFileSync(join(root, 'scripts/runeicons-map.json'), 'utf8'));
mkdirSync(join(root, 'icons/ri'), { recursive: true });

const missing = [];
for (const [fa, ri] of Object.entries(map)) {
  if (ri === null) {
    if (!existsSync(join(root, 'icons/custom', `fa-${fa}.svg`))) missing.push(`icons/custom/fa-${fa}.svg`);
    continue;
  }
  const [folder, ...rest] = ri.split('-');
  const base = rest.join('-');
  const out = join(root, 'icons/ri', `${ri}.svg`);
  if (existsSync(out) && !force) continue;
  const res = await fetch(`${BASE}/${folder}/${base}.svg`);
  if (!res.ok) throw new Error(`${ri}: HTTP ${res.status} (${BASE}/${folder}/${base}.svg)`);
  writeFileSync(out, (await res.text()).trim() + '\n');
  console.log('ok', ri);
}
if (missing.length) {
  console.error('custom SVG hilang:\n' + missing.map((m) => '  ' + m).join('\n'));
  process.exit(1);
}

const lines = [
  '/* GENERATE: node scripts/runeicons-sync.mjs — jangan diedit manual.',
  '   Ikon = mask SVG (currentColor), menggantikan Font Awesome. */',
  '.fas { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em;',
  '  font-style: normal; overflow: hidden; }',
];
for (const [fa, ri] of Object.entries(map)) {
  const file = ri === null ? `icons/custom/fa-${fa}.svg` : `icons/ri/${ri}.svg`;
  // ponytail: hash isi file → bust cache CDN (max-age 7 hari), URL berubah hanya saat SVG berubah
  const v = createHash('sha1').update(readFileSync(join(root, file))).digest('hex').slice(0, 8);
  const url = `../../${file}?v=${v}`;
  lines.push(
    `.fas.fa-${fa} { background: currentColor;` +
      ` -webkit-mask: url(${url}) center / contain no-repeat;` +
      ` mask: url(${url}) center / contain no-repeat; }`
  );
}
writeFileSync(join(root, 'css/lib/runeicons.css'), lines.join('\n') + '\n');
const nRi = readdirSync(join(root, 'icons/ri')).length;
console.log(`css/lib/runeicons.css ditulis: ${Object.keys(map).length} selector, ${nRi} SVG ri, ${Object.values(map).filter((v) => v === null).length} custom`);
