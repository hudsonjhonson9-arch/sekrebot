// ═══════════════════════════════════════════════════════════════
// Bangun bast_template.docx DARI docx asli (aset-bapperida).
//
//   TEMPLATE_SRC=... node scripts/build-bast-template.js
//
// Membaca docx template BAST kendaraan dinas (format persis sesuai
// dokumen BAPPERIDA), lalu MENYULAM placeholder docxtemplater pada
// posisi nilai yang sama (sisakan layout/kop/format aslinya).
// Keluaran: public/bast_template.docx + ./bast_template.docx
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../../aset-bapperida/aset-bapperida/docx_template/bast_kendaraan.docx');
const OUTS = [path.join(__dirname, '../public/bast_template.docx'), path.join(__dirname, '../bast_template.docx')];

const PLACEHOLDERS = [
  '{Nomor}', '{HariTanggal}',
  '{P1Nama}', '{P1NIP}', '{P1Jabatan}', '{P1Alamat}',
  '{P2Nama}', '{P2NIP}', '{P2Jabatan}', '{P2Alamat}',
  '{JumlahUnit}', '{RodaText}',
  '{#asets}', '{No}', '{ModelJenis}', '{MerkType}', '{Warna}', '{Tahun}',
  '{NoRangka}', '{NoMesin}', '{KodeBarang}', '{NoPolisi}', '{/asets}'
];

// — teks yang akan dijadikan placeholder, per-tag —
// "whole: {Tag}"  → ganti SELURUH isi paragraf dengan {Tag}
// {target: repl}  → ganti substring target di dalam paragraf
const RULES = [
  { kind: 'patches', if: s => s.includes('Nomor :'),
    patches: [['BAST.4234 /BP4D.011.7/53.12//6/2026', '{Nomor}']] },
  { kind: 'whole', if: s => s.startsWith('Pada hari ini'), tag: '{HariTanggal}' },
  // PIHAK PERTAMA
  { kind: 'whole', if: s => s === 'Charles Hermana Weru, S.Sos', tag: '{P1Nama}' },
  { kind: 'whole', if: s => s === '19721102 200112 1 001', tag: '{P1NIP}' },
  { kind: 'whole', if: s => s === 'NIP. 19721102 200112 1 001', tag: 'NIP. {P1NIP}' },
  { kind: 'whole', if: s => s === 'Kepala Badan Pencanaan Kabupaten Sumba Barat', tag: '{P1Jabatan}' },
  // PIHAK KEDUA
  { kind: 'whole', if: s => s === 'Agustinus mada leko', tag: '{P2Nama}' },
  { kind: 'whole', if: s => s === 'NIP. 19763010 200801 1 004', tag: 'NIP. {P2NIP}' },
  { kind: 'whole', if: s => s === 'NIP. 19763010 2008 1004', tag: 'NIP. {P2NIP}' },
  { kind: 'whole', if: s => s.startsWith('Pengurus barang'), tag: '{P2Jabatan}' },
  // kalimat penyerahan -> sembunyikan jumlah unit & tipe roda
  { kind: 'patches', if: s => s.startsWith('Dengan ini PIHAK PERTAMA menyerahkan'),
    patches: [['satu unit', '{JumlahUnit} unit'], ['roda dua', 'roda {RodaText}']] },
  // baris data tabel identitas kendaraan (1 baris sampel -> loop {#asets})
  { kind: 'whole', if: s => s === '1.', tag: '{#asets}{No}' },
  { kind: 'whole', if: s => s === 'Mega pro', tag: '{ModelJenis}' },
  { kind: 'whole', if: s => s === 'honda', tag: '{MerkType}' },
  { kind: 'whole', if: s => s === 'Hitam', tag: '{Warna}' },
  { kind: 'whole', if: s => s === '2011', tag: '{Tahun}' },
  { kind: 'whole', if: s => s === 'MHKC22114bk044063', tag: '{NoRangka}' },
  { kind: 'whole', if: s => s === 'KCZIE1043987', tag: '{NoMesin}' },
  { kind: 'whole', if: s => s === '132020101003', tag: '{KodeBarang}' },
  { kind: 'whole', if: s => s === 'ED 2779 WB', tag: '{NoPolisi}{/asets}' }
];

// paragraf "Kabupaten Sumba Barat" (baris ke-2 jabatan P2) -> dihapus
// (terletak tepat setelah paragraf "Pengurus barang...")
const REMOVE_AFTER_PRESENCE = ['Pengurus barang'];

// ── utilitas patch ──────────────────────────────────────────────
const tOf = run => {
  const m = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
  if (!m) return null;
  return { open: m[0].slice(0, m[0].indexOf('>') + 1), text: m[1] };
};

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
  const keys = Object.keys(edits)
    .map(Number)
    .sort((a, b) => b - a); // terapkan dari belakang agar offset run lain aman
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

function patchParagraph(para, patches) {
  let out = para;
  for (const [target, repl] of patches) out = applyOne(out, target, repl);
  return out;
}

// ── main ───────────────────────────────────────────────────────
const buf = fs.readFileSync(SRC);
const zip = new PizZip(buf);
const docXml = zip.file('word/document.xml').asText();

// pecah jadi paragraf (docx selalu bukan bersarang utk w:p)
const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const offset = [];
let m;
while ((m = paraRe.exec(docXml))) offset.push({ raw: m[0], start: m.index });

const texts = offset.map(o => Array.from(o.raw.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), x => x[1]).join(''));

const counters = {};
const alamatCount = { n: 0 };
const newParas = offset.map(({ raw, start }, i) => {
  const s = texts[i];
  // paragraf "Kabupaten Sumba Barat" setelah "Pengurus barang" -> kosongkan (hapus isi)
  if (s.trim() === 'Kabupaten Sumba Barat' && i > 0 && texts[i - 1].startsWith('Pengurus barang')) {
    return { raw: '', start };
  }
  // Alamat PIHAK PERTAMA (pertama) / PIHAK KEDUA (kedua)
  if (s === 'Waikabubak') {
    alamatCount.n += 1;
    const tag = alamatCount.n === 1 ? '{P1Alamat}' : '{P2Alamat}';
    return { raw: rewriteWhole(raw, tag), start };
  }
  for (const rule of RULES) {
    if (!rule.if(s)) continue;
    if (rule.kind === 'whole') {
      return { raw: rewriteWhole(raw, rule.tag), start };
    }
    return { raw: patchParagraph(raw, rule.patches), start };
  }
  return { raw, start };
});

function rewriteWhole(par, tag) {
  // ganti seluruh teks paragraf: run pertama (berisi teks) -> tag, sisanya kosong
  const runs = Array.from(par.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => m[0]);
  let done = false;
  let out = par;
  for (const r of runs) {
    const t = tOf(r);
    if (!t) continue;
    if (!done && t.text.trim() !== '') {
      out = spliceRun(out, r, t.open + tag + '</w:t>');
      done = true;
    } else if (t.text.length) {
      out = spliceRun(out, r, t.open + '</w:t>');
    }
  }
  return out;
}

function spliceRun(par, rawRun, newT) {
  // ganti <w:t..>..</w:t> pertama pada rawRun dengan newT, di posisi aslinya
  const i = par.indexOf(rawRun);
  const t = tOf(rawRun);
  const inner = t.open + t.text + '</w:t>';
  const replaced = rawRun.slice(0, rawRun.indexOf(inner)) + newT + rawRun.slice(rawRun.indexOf(inner) + inner.length);
  return par.slice(0, i) + replaced + par.slice(i + rawRun.length);
}

let newXml = docXml;
for (let i = offset.length - 1; i >= 0; i--) {
  newXml = newXml.slice(0, offset[i].start) + newParas[i].raw + newXml.slice(offset[i].start + offset[i].raw.length);
}

// validasi: semua placeholder ada
for (const p of PLACEHOLDERS) {
  if (!newXml.includes(p)) {
    console.error('[FAIL] Placeholder TIDAK ditemukan di hasil:', p);
    process.exit(1);
  }
}

zip.file('word/document.xml', newXml);
for (const out of OUTS) {
  fs.writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('[OK]', out, fs.statSync(out).size, 'bytes');
}
console.log('Placeholder aktif:', PLACEHOLDERS.filter(p => !p.startsWith('{/') && p !== '{#asets}').length + ' tag, loop aset aktif');