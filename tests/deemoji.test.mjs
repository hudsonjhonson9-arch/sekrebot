import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Sama dengan scripts/deemoji.mjs. U+2190-21FF (panah "→") sengaja dikecualikan.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23C0}-\u{23FF}\u{2705}\u{274C}\u{2753}\u{2757}\u{2764}\u{2714}\u{2716}\u{2717}\u{2B55}\u{2795}\u{2796}]/u;

// Target transform: seluruh js/*.js (kecuali *.min.js) + index.html.
function targets() {
  const jsDir = path.join(ROOT, 'js');
  const js = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !/\.min\./.test(f)).map(f => 'js/' + f);
  return [...js, 'index.html'];
}

test('tidak ada emoji tersisa di js/ dan index.html', () => {
  const hits = [];
  for (const rel of targets()) {
    fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (EMOJI.test(l)) hits.push(rel + ':' + (i + 1) + ': ' + l.trim().slice(0, 90));
    });
  }
  assert.deepEqual(hits, [], 'emoji harus diganti ikon Font Awesome (scripts/deemoji.mjs)');
});

test('setiap ikon fas yang dipakai js/ dan index.html ada di runeicons.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/lib/runeicons.css'), 'utf8');
  const used = new Set();
  for (const rel of targets()) {
    for (const m of fs.readFileSync(path.join(ROOT, rel), 'utf8').matchAll(/class="[^"]*?\b(fa-[a-z0-9-]+)/g)) used.add(m[1]);
  }
  const missing = [...used].filter(i => !css.includes('.fas.' + i + ' '));
  assert.deepEqual(missing, [], 'ikon hilang dari css/lib/runeicons.css');
  const broken = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1])
    .filter(u => !fs.existsSync(path.resolve(path.join(ROOT, 'css/lib'), u)));
  assert.deepEqual(broken, [], 'file SVG mask tidak ada');
});

// Ikon tak ter-render bila ditulis lewat textContent/setText atau di dalam <option>.
// Varian berbasis-variabel: literal ikon disimpan di variabel lalu dikirim ke sink
// lewat baris lain — line-scoped test di bawah tidak melihatnya.
test('tidak ada ikon fas dialirkan lewat variabel ke sink teks (textContent / setText)', () => {
  const bad = [];
  for (const rel of targets()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const vars = new Set();
    for (const m of src.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*<i class="fas/g)) vars.add(m[1]);
    if (!vars.size) continue;
    src.split(/\r?\n/).forEach((l, i) => {
      if (!/(\.textContent\s*=|dom\.setText\s*\()/.test(l)) return;
      const rhs = l.replace(/(\.textContent\s*=|dom\.setText\s*\()/, '');
      for (const v of vars) if (new RegExp('\\b' + v + '\\b').test(rhs)) {
        bad.push(rel + ':' + (i + 1) + ': ' + l.trim().slice(0, 90)); break;
      }
    });
  }
  assert.deepEqual(bad, []);
});

test('tidak ada ikon fas di sink teks (textContent / dom.setText / <option>)', () => {
  const bad = [];
  for (const rel of targets()) {
    fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (l.indexOf('<i class="fas') < 0) return;
      const sink = l.indexOf('.textContent') >= 0 || l.indexOf('dom.setText(') >= 0
        || (l.indexOf('<option') >= 0 && /<i class="fas/.test(l));
      if (sink) bad.push(rel + ':' + (i + 1) + ': ' + l.trim().slice(0, 90));
    });
  }
  assert.deepEqual(bad, []);
});
