// scripts/docx-patch.js — utilitas sulam tag docxtemplater ke docx asli.
// Dipakai scripts/build-spt-template.js & scripts/build-sppd-template.js.
// Logika inti disalin dari scripts/build-bast-template.js (sudah dipakai produksi).

const tOf = run => {
  const m = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
  if (!m) return null;
  return { open: m[0].slice(0, m[0].indexOf('>') + 1), text: m[1] };
};

export function rewriteWhole(par, tag) {
  // ganti seluruh teks paragraf: <w:t> pertama yang berisi -> tag, sisanya dikosongkan.
  // Bekerja per-<w:t> (bukan per-run): satu run bisa memuat beberapa <w:t>.
  let done = false;
  return par.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, m => {
    const open = m.slice(0, m.indexOf('>') + 1);
    const text = m.slice(open.length, m.length - '</w:t>'.length);
    if (!done && text.trim() !== '') {
      done = true;
      return open + tag + '</w:t>';
    }
    if (text.length) return open + '</w:t>';
    return m;
  });
}

function applyOne(para, target, repl) {
  const runs = Array.from(para.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => ({ raw: m[0], start: m.index }));
  let full = '';
  const segs = [];
  runs.forEach((r, i) => {
    const t = tOf(r.raw);
    segs.push({ i, off: full.length, len: t ? t.text.length : 0 });
    full += t ? t.text : '';
  });
  const idx = full.indexOf(target);
  if (idx < 0) throw new Error('Target tidak ditemukan dalam paragraf: ' + JSON.stringify(target).slice(0, 60));
  const end = idx + target.length;
  const aff = segs.filter(s => s.off < end && s.off + s.len > idx && s.len > 0);
  const first = aff[0];
  const last = aff[aff.length - 1];
  const edits = {};
  for (const s of aff) {
    const cutA = Math.max(0, idx - s.off);
    const cutB = Math.max(0, Math.min(end, s.off + s.len) - s.off);
    const txt = tOf(runs[s.i].raw).text;
    let nt;
    if (s === first) nt = txt.slice(0, cutA) + repl + (s === last ? txt.slice(cutB) : '');
    else nt = s === last ? txt.slice(cutB) : '';
    edits[s.i] = nt;
  }
  let outPara = para;
  const keys = Object.keys(edits).map(Number).sort((a, b) => b - a);
  for (const key of keys) {
    const { raw } = runs[key];
    const t = tOf(raw);
    const inner = t.open + t.text + '</w:t>';
    const at = outPara.indexOf(raw);
    if (at < 0) throw new Error('Run tidak ditemukan saat patch');
    const replaced = raw.slice(0, raw.indexOf(inner)) + t.open + edits[key] + '</w:t>' + raw.slice(raw.indexOf(inner) + inner.length);
    outPara = outPara.slice(0, at) + replaced + outPara.slice(at + raw.length);
  }
  return outPara;
}

export function patchParagraph(para, patches) {
  let out = para;
  for (const [target, repl] of patches) out = applyOne(out, target, repl);
  return out;
}

export function loadParagraphs(docXml) {
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const out = [];
  let m;
  while ((m = re.exec(docXml))) {
    const raw = m[0];
    const text = Array.from(raw.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), x => x[1]).join('');
    out.push({ raw, start: m.index, text });
  }
  return out;
}

export const parText = par =>
  Array.from(par.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), m => m[1]).join('').replace(/\s+/g, ' ').trim();

// wholeMap: { index: '{Tag}' }, patchesMap: { index: [[target, repl], …] }, blankList: [index, …]
export function applyByIndex(paras, wholeMap = {}, patchesMap = {}, blankList = []) {
  const blanks = new Set(blankList);
  const newParas = paras.map(({ raw }, i) => {
    if (blanks.has(i)) {
      const out = rewriteWhole(raw, '');
      if (parText(out) !== '') throw new Error(`Paragraf ${i}: hasil blank tidak kosong: "${parText(out)}"`);
      return out;
    }
    if (wholeMap[i] !== undefined) {
      const out = rewriteWhole(raw, wholeMap[i]);
      const got = parText(out);
      const want = String(wholeMap[i]).replace(/\s+/g, ' ').trim();
      if (got !== want) throw new Error(`Paragraf ${i}: hasil "${got}" != "${want}"`);
      return out;
    }
    if (patchesMap[i] !== undefined) return patchParagraph(raw, patchesMap[i]);
    return raw;
  });
  return newParas;
}

export function spliceInto(docXml, paras, newParas) {
  let out = docXml;
  for (let i = paras.length - 1; i >= 0; i--) {
    out = out.slice(0, paras[i].start) + newParas[i] + out.slice(paras[i].start + paras[i].raw.length);
  }
  return out;
}

export function assertPlaceholders(xml, list) {
  for (const p of list) {
    if (!xml.includes(p)) {
      console.error('[FAIL] Placeholder TIDAK ditemukan di hasil:', p);
      process.exit(1);
    }
  }
}
