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
  const broken = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].split('?')[0])
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
    // Kotor: identifier yang pernah di-assignment string JS berisi <i class="fas.
    // Wajib diawali ' atau ` — " setelah = adalah atribut HTML (style=/class=/value=), bukan JS.
    const tainted = (id) => new RegExp('(?:^|[^.\\w])' + id + '\\s*=\\s*[\'`][^;\\n]*<i class="fas').test(src);
    src.split(/\r?\n/).forEach((l, i) => {
      // Nilai yang masuk sink (bukan prefix baris), dipotong di ; pertama.
      const m = l.match(/\.textContent\s*=\s*([^;]+)/) || l.match(/dom\.setText\s*\(\s*[^,)]+,\s*([^)]+)/);
      if (!m) return;
      const val = m[1];
      if (/<i class="fas/.test(val)) { bad.push(rel + ':' + (i + 1) + ': ' + l.trim().slice(0, 90)); return; }
      for (const id of val.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
        if (tainted(id[1])) { bad.push(rel + ':' + (i + 1) + ': ' + l.trim().slice(0, 90)); break; }
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
