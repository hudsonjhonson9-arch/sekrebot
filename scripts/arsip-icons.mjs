#!/usr/bin/env node
/* WS4: samakan ikon absensi yang beririsan dengan ikon arsip (peta-ekonomi).
   Baca PATHS dari peta-ekonomi/src/components/ui.jsx, tulis icons/custom/fa-<fa>.svg,
   set runeicons-map.json[fa]=null (pakai custom), lalu jalankan runeicons-sync.mjs.
   Pemakaian: node scripts/arsip-icons.mjs [--path <ui.jsx>] */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ai = process.argv.indexOf('--path');
const uiPath = ai > -1
  ? resolve(process.argv[ai + 1])
  : join(root, '..', 'peta-ekonomi', 'src', 'components', 'ui.jsx');

// fa-name (tanpa prefix fa-) -> kunci PATHS di arsip
const ALIAS = {
  archive: 'archive', 'box-archive': 'archive',
  building: 'building',
  calendar: 'calendar', 'calendar-alt': 'calendar',
  'chart-bar': 'chart',
  check: 'check', 'check-circle': 'checkCircle',
  'chevron-down': 'chevronDown',
  clock: 'clock', desktop: 'monitor', download: 'download', edit: 'edit',
  'exclamation-triangle': 'alert',
  'file-alt': 'file', folder: 'folder', 'folder-open': 'folder',
  globe: 'world', history: 'history', link: 'link', moon: 'moon',
  plus: 'plus', 'plus-circle': 'plus', search: 'search',
  'shield-alt': 'shield', sun: 'sun', sync: 'refresh', 'sync-alt': 'refresh',
  tags: 'tag', times: 'x', trash: 'trash', upload: 'upload', users: 'users',
  bell: 'bell',
};

const src = readFileSync(uiPath, 'utf8');
const start = src.indexOf('const PATHS');
const block = src.slice(start, src.indexOf('\n};', start));
const PATHS = {};
for (const m of block.matchAll(/([A-Za-z0-9_]+)\s*:\s*"([^"]*)"/g)) PATHS[m[1]] = m[2];

const svg = (d) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n` +
  `<path d="${d}" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n</svg>\n`;

const mapPath = join(root, 'scripts/runeicons-map.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
let wrote = 0, skipped = [];
for (const [fa, key] of Object.entries(ALIAS)) {
  const d = PATHS[key];
  if (!d) { skipped.push(`${fa}->${key}`); continue; }
  writeFileSync(join(root, 'icons/custom', `fa-${fa}.svg`), svg(d));
  map[fa] = null;
  wrote++;
}
writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
console.log(`arsip-icons: ${wrote} custom SVG ditulis, map diperbarui (${Object.values(map).filter((v) => v === null).length} custom total)`);
if (skipped.length) console.error('PATHS arsip tidak ada untuk: ' + skipped.join(', '));
