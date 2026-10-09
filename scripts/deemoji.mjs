#!/usr/bin/env node
// ganti emoji -> ikon Font Awesome (fas) di js/*.js + index.html.
// konteks teks-murni (alert/confirm/console/Swal/.title/Telegram/WA/PDF) -> emoji DIHAPUS.
// sisanya -> <i class="fas fa-X"></i>. .textContent = '<emoji>' / dom.setText(id,'<emoji>')
// -> diubah ke .innerHTML / dom.setHTML agar ikon benar-benar ter-render.
// pakai: node scripts/deemoji.mjs [--dry] [--only=<substr>]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = path.join(ROOT, 'css', 'lib', 'runeicons.css');
const DRY = process.argv.includes('--dry');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';

// emoji(base, tanpa FE0F) -> kelas FA. null = hapus (tak ada padanan ikon layak).
const MAP = {
  '🖥': 'desktop', '⚠': 'exclamation-triangle', '✅': 'check', '❌': 'times',
  '💾': 'save', '📍': 'map-marker-alt', '📅': 'calendar', '🔌': 'plug',
  '⏳': 'hourglass-half', '🔄': 'sync', '🏃': 'running', '🗑': 'trash',
  '👤': 'user', '🛡': 'shield-alt', '🔍': 'search', '📷': 'camera',
  '🔵': 'circle', '➕': 'plus', '📸': 'camera', '🙏': 'praying-hands',
  '🤒': 'thermometer-half', '💼': 'briefcase', '📋': 'clipboard-list', '📝': 'edit',
  '✍': 'pen', '⏰': 'clock', '🟢': 'circle', '✕': 'times', '👥': 'users',
  '✏': 'edit', '🎓': 'graduation-cap', '📭': 'envelope-open-text', '🏢': 'building',
  '📄': 'file-alt', '🚫': 'ban', '🌙': 'moon', '🪪': 'id-card', '🏖': 'umbrella-beach',
  '🏛': 'landmark', '📊': 'chart-bar', '📂': 'folder-open', '🧠': 'brain',
  '🕐': 'clock', '⚙': 'cog', '🌐': 'globe', '📏': 'ruler', '🗺': 'map',
  '🏠': 'home', '📎': 'paperclip', '📤': 'upload', '⏱': 'stopwatch',
  '📜': 'scroll', '📴': 'mobile-alt', '🤖': 'robot', '👑': 'crown',
  '🖋': 'pen-fancy', '📡': 'satellite-dish', '📶': 'signal', '🔗': 'link',
  '🖼': 'image', '🌤': 'cloud-sun', '📌': 'thumbtack', '📱': 'mobile-alt',
  '⬜': 'square', '🏅': 'medal', '🌟': 'star', '💧': 'tint', '💨': 'wind',
  '🌡': 'thermometer-half', '🆔': 'id-card', '⚪': 'circle', '👔': 'user-tie',
  '🟤': 'circle', '🎨': 'palette', '👕': 'tshirt', '🔒': 'lock', '😶': 'meh-blank',
  '🎉': 'glass-cheers', '❓': 'question', '📈': 'chart-line', '🔴': 'circle',
  '🎯': 'bullseye', '🚀': 'rocket', '📥': 'download', '🌧': 'cloud-rain',
  '🕒': 'clock', '💡': 'lightbulb', '💎': 'gem', '💤': 'bed', '😐': 'meh-blank',
  '⬇': 'arrow-down', '⬆': 'arrow-up', '🎖': 'medal', '💰': 'money-bill',
  '🔔': 'bell', '👍': 'thumbs-up', '👁': 'eye', '🟡': 'circle', '☀': 'sun',
  '☁': 'cloud', '🌫': 'smog', '🌦': 'cloud-sun-rain', '❄': 'snowflake',
  '⛈': 'cloud-showers-heavy', '🌩': 'cloud-showers-heavy', '🛰': 'satellite', '📁': 'folder',
  '🚪': 'door-open', '⚡': 'bolt', '🛠': 'tools', '⏹': 'stop', '🪑': 'chair',
  '➖': 'minus', '📦': 'box',
};
const BASE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23C0}-\u{23FF}\u{2714}\u{2716}\u{2B55}\u{2795}\u{2796}]/u;
const EMOJI_ANY = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23C0}-\u{23FF}\u{2705}\u{274C}\u{2753}\u{2757}\u{2764}\u{2714}\u{2716}\u{2717}\u{2B55}\u{2795}\u{2796}]/gu;
const IS_EMOJI = new RegExp(EMOJI_ANY.source, 'u');

// validasi bundle: pastikan tiap kelas ada, kalau tidak fallback 'circle'
const css = fs.existsSync(CSS) ? fs.readFileSync(CSS, 'utf8') : '';
const hasClass = c => css.includes('.fas.fa-' + c + ' ');
const MISSING = new Set();
const cls = c => { if (!c) return null; if (hasClass(c)) return c; MISSING.add(c); return 'circle'; };
const icon = c => `<i class="fas fa-${c}"></i>`;

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git|android|docs|n8n|dist|lib/.test(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.js') && !/\.min\./.test(e.name)) acc.push(p);
  }
  return acc;
}
const files = walk(path.join(ROOT, 'js'), []).concat(path.join(ROOT, 'index.html'));
const target = files.filter(f => !ONLY || f.includes(ONLY));

// baris yang seluruh emoji-nya harus dihapus (sink teks murni)
const textOnly = l =>
  /\b(alert|confirm|console\.(log|warn|error|info|debug)|prompt)\s*\(/.test(l) ||
  /\bSwal\b/.test(l) || /\.title\s*=/.test(l) || /document\.title/.test(l) ||
  /Telegram|telegram|wa\.me|whatsapp|WAHA|sendMessage/i.test(l) ||
  /\bpdf\b|PDF|doc\.text|jsPDF/.test(l) || /\.placeholder\s*=/.test(l);

// <emoji>(FE0F)? -> part
function convertRun(text) {
  return text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23C0}-\u{23FF}\u{2705}\u{274C}\u{2753}\u{2757}\u{2764}\u{2714}\u{2716}\u{2717}\u{2B55}\u{2795}\u{2796}]+/gu, run => {
    const bare = run.replace(/\uFE0F/g, '');
    const c = cls(MAP[bare]);
    return c ? icon(c) : ''; // null/tak dikenal -> hapus
  });
}

let totConv = 0, totDel = 0; const perFile = [];
for (const f of target) {
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  let conv = 0, del = 0;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const hasEmoji = IS_EMOJI.test(l);
    const hasIcon = l.indexOf('<i class="fas') >= 0;
    if (!hasEmoji && !hasIcon) continue;
    if (hasEmoji && textOnly(l)) {
      del += (l.match(EMOJI_ANY) || []).length;
      lines[i] = l.replace(EMOJI_ANY, ''); // buang emoji dari sink teks murni
      continue;
    }
    if (hasEmoji) {
      conv += (l.match(EMOJI_ANY) || []).length;
      l = convertRun(l);
    }
    // perbaikan sink (idempoten): ikon FA tak ter-render lewat textContent/setText/<option>/attr
    if (l.indexOf('<i class="fas') >= 0) {
      if (l.indexOf('.textContent') >= 0) l = l.replace(/\.textContent/g, '.innerHTML');
      if (l.indexOf('dom.setText(') >= 0) l = l.replace(/dom\.setText\(/g, 'dom.setHTML(');
      if (l.indexOf('<option') >= 0) l = l.replace(/<i class="fas fa-[a-z0-9-]+"[^>]*><\/i>\s*/g, '');
      l = l.replace(/(title|placeholder|value)="([^"]*)<i class="fas fa-[a-z0-9-]+"><\/i>([^"]*)"/g, '$1="$2$3"');
    }
    lines[i] = l;
  }
  src = lines.join('\n');
  if (src !== before) {
    conv > 0 && totConv !== undefined; totConv += conv; totDel += del;
    perFile.push([path.relative(ROOT, f).replace(/\\/g, '/'), conv, del]);
    if (!DRY) fs.writeFileSync(f, src);
  } else { totConv += conv; totDel += del; }
}
perFile.sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
console.log((DRY ? '[DRY] ' : '[WROTE] ') + 'files changed: ' + perFile.length);
console.log('replace->ikon:', totConv, ' hapus:', totDel);
for (const [f, c, d] of perFile.slice(0, 40)) console.log(String(c).padStart(4) + ' ikon ' + String(d).padStart(3) + ' hapus  ' + f);
if (MISSING.size) console.log('KELAS HILANG DARI BUNDLE (fallback circle):', [...MISSING].join(', '));
