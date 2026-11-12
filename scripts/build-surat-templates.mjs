// ═══════════════════════════════════════════════════════════════
// Bangun spt_template.docx & sppd_template.docx dari dokumen
// format baru (docs/format-spt-sppd-2026.docx, salinan
// "surat tugas dan sppd 2026.docx").
//   TEMPLATE_SRC=... node scripts/build-surat-templates.mjs
// Keluaran: {root,www,public}/{spt,sppd}_template.docx (6 berkas).
//
// Dokumen sumber = 1 SPT + 6 SPPD sampel berjajar. Tiap surat di-
// potong sebagai slice kontigu dari body (posisi paragraf/atribut
// asli utuh), tag disulam per-indeks-paragraf (lihat docx-patch.js),
// lalu operasi baris (hapus/duplikasi) menerapkan struktur baru:
//   SPT  : loop {#dasarRows} 1 baris (baris dasar-2 dihapus),
//          loop pelaksana 2 baris (orang + spacer; spacer2-8 ikut
//          orang2-8 dihapus), duplikasi baris paraf -> 3 baris.
//   SPPD : baris KTU dihapus oleh desain (tidak ada di format baru),
//          duplikasi baris paraf -> 3 baris, tag pengesahan I/II/IV.
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadParagraphs, applyByIndex, spliceInto, assertPlaceholders, parText } from './docx-patch.js';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../docs/format-spt-sppd-2026.docx');
const DIRS = ['..', '../www', '../public'];

// ── peta paragraf (indeks deterministik; sumber di-commit) ─────────
// WHOLE: ganti seluruh isi paragraf (dicek ulang parText == want).
const SPT_WHOLE = {
  9: 'Nomor : {Nomor}',
  13: '{#dasarRows}{No}.',
  14: '{Teks}{/dasarRows}',
  24: '{KepadaLabel}',
  25: '{TitikLabel}',
  26: '{#pelaksana}{No}.',
  35: '{Nama}',
  36: '{PangkatGol}',
  37: '{NIP}',
  38: '{Jabatan}',
  196: '{Untuk}',
  199: '{DitetapkanDi}',
  202: '{TanggalSurat}',
  212: '{KepalaNama}',
  213: '{KepalaPangkat}',
  214: 'NIP. {KepalaNIP}',
  218: '{Paraf1}',
  221: '{Paraf2}'
};
const SPPD_WHOLE = {
  15: '{KpaNama}',
  19: '{Nama}',
  20: 'NIP. {NIP}',
  24: '{PangkatGolongan}',
  28: '{JabatanInstansi}',
  32: '{TingkatBiaya}',
  36: '{Maksud}',
  40: '{AlatAngkut}',
  44: '{TempatBerangkat}',
  48: '{TempatTujuan}',
  52: '{LamaHari}',
  56: '{TanggalBerangkat}',
  60: '{TanggalKembali}',
  81: '{Instansi}',
  85: '{MataAnggaran}',
  93: '{DitetapkanDi}',
  96: '{TanggalPenetapan}',
  105: '{KepalaNama}',
  106: '{KepalaPangkat}',
  107: 'NIP. {KepalaNIP}',
  112: '{Paraf1}',
  115: '{Paraf2}',
  132: '{TempatBerangkat}',
  135: '{TempatTujuan}',
  137: '{TanggalBerangkat}',
  139: 'KEPALA BIDANG PERENCANAAN, PENGENDALIAN DAN EVALUASI PEMBANGUNAN DAERAH,',
  145: '{BidangNama}',
  146: 'NIP. {BidangNIP}',
  153: '{TempatTujuan}',
  154: '{TanggalBerangkat}',
  159: '{TempatTujuan}',
  160: '{TanggalKembali}',
  219: '{TempatBerangkat}',
  220: '{TanggalKembali}',
  231: '{SekretarisNama}',
  232: 'NIP. {SekretarisNIP}'
};
// PATCHES: nomor SPPD memakai layout tab asli, hanya angkanya diganti.
const SPPD_PATCHES = {
  9: [['72/SPPD/202666 / SPPD / 2024', '{NomorSPPD}']]
};

const SPT_TAGS = [
  '{Nomor}', '{#dasarRows}', '{No}', '{Teks}', '{/dasarRows}',
  '{KepadaLabel}', '{TitikLabel}', '{#pelaksana}', '{Nama}', '{PangkatGol}',
  '{NIP}', '{Jabatan}', '{/pelaksana}', '{Untuk}', '{DitetapkanDi}',
  '{TanggalSurat}', '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}',
  '{Paraf1}', '{Paraf2}', '{Paraf3}'
];
const SPPD_TAGS = [
  '{NomorSPPD}', '{KpaNama}', '{Nama}', '{NIP}', '{PangkatGolongan}',
  '{JabatanInstansi}', '{TingkatBiaya}', '{Maksud}', '{AlatAngkut}',
  '{TempatBerangkat}', '{TempatTujuan}', '{LamaHari}', '{TanggalBerangkat}',
  '{TanggalKembali}', '{Instansi}', '{MataAnggaran}', '{DitetapkanDi}',
  '{TanggalPenetapan}', '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}',
  '{BidangNama}', '{BidangNIP}', '{Paraf1}', '{Paraf2}', '{Paraf3}',
  '{SekretarisNama}', '{SekretarisNIP}'
];

const FORBID_SPT = [
  'CHARLES HERMANA WERU', 'Imanuel M. Kalegotana', 'Jackson Ubulele',
  'Achmad Aqil', 'Yulius Efrianto', 'Nota Dinas Sekretaris Daerah',
  'BAPPERIDA.011.7/32/53.12/ST/09/2026', '17 September 2026',
  'Dalam Rangka Evaluasi Konsistensi', '2025'
];
const FORBID_SPPD = [
  'CHARLES HERMANA WERU', 'Imanuel M. Kalegotana', '72/SPPD/202666',
  'Dalam Rangka Evaluasi Konsistensi', '21 September 2026',
  '24 September 2026', '17 September 2026', 'Kupang', 'Pesawat',
  'KASUBAG UMUM DAN KEPEGAWAIAN', 'Yohanes Bergmans', '2024', '2025'
];

// ── alat struktural ────────────────────────────────────────────────
function assertText(paras, i, want) {
  const got = parText(paras[i].raw);
  if (got !== want) throw new Error(`paragraf ${i}: "${got}" != "${want}" (sumber berganti?)`);
}

// rewriteWhole versi dipaksa: paragraf tanpa teks non-kosong tetap
// menerima tag (dipakai sel spacer yang kosong untuk {/pelaksana}).
function rewriteWholeForce(par, tag) {
  let done = false;
  let out = par.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, m => {
    const open = m.slice(0, m.indexOf('>') + 1);
    const text = m.slice(open.length, m.length - '</w:t>'.length);
    if (!done && text.trim() !== '') { done = true; return open + tag + '</w:t>'; }
    if (text.length) return open + '</w:t>';
    return m;
  });
  if (done) return out;
  let injected = false;
  out = out.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, m => {
    if (injected) return m;
    injected = true;
    return m.slice(0, m.indexOf('>') + 1) + tag + '</w:t>';
  });
  if (injected) return out;
  const at = out.lastIndexOf('</w:p>');
  if (at < 0) throw new Error('bukan paragraf: ' + par.slice(0, 60));
  return out.slice(0, at) + `<w:r><w:t xml:space="preserve">${tag}</w:t></w:r>` + out.slice(at);
}

// jangkauan <w:tr> top-level (tabel tak bersarang di surat ini).
function rowRanges(xml) {
  const re = /<w:tr\b[^>]*>|<\/w:tr>/g;
  const out = [];
  let start = null;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0][1] === 'w') start = m.index;
    else if (start !== null) { out.push({ s: start, e: re.lastIndex }); start = null; }
  }
  return out;
}

function rowAt(ranges, off, label) {
  const i = ranges.findIndex(r => off >= r.s && off < r.e);
  if (i < 0) throw new Error(`${label}: offset ${off} di luar tabel`);
  return i;
}

function dupParafRow(xml, paras, idxParaf2) {
  const ranges = rowRanges(xml);
  const i = rowAt(ranges, paras[idxParaf2].start, 'baris paraf');
  const r = ranges[i];
  const row = xml.slice(r.s, r.e);
  if (!row.includes('{Paraf2}')) throw new Error('baris paraf tidak memuat {Paraf2}');
  const copy = row
    .replace(/\s+w14:paraId="[^"]*"/g, '')
    .replace(/\s+w14:textId="[^"]*"/g, '')
    .replace('{Paraf2}', '{Paraf3}');
  if (!copy.includes('{Paraf3}')) throw new Error('duplikasi baris paraf gagal');
  return xml.slice(0, r.e) + copy + xml.slice(r.e);
}

function hapusBaris(xml, ranges, iFrom, iTo) {
  let out = xml;
  for (let i = iTo; i >= iFrom; i--) out = out.slice(0, ranges[i].s) + out.slice(ranges[i].e);
  return out;
}

function tutupLoopSpacer(xml, paras, idxKepada) {
  const ranges = rowRanges(xml);
  const iOrang = rowAt(ranges, paras[idxKepada].start, 'baris pelaksana');
  const spacer = ranges[iOrang + 1];
  if (!spacer) throw new Error('baris spacer tidak ada setelah baris pelaksana');
  const rowXml = xml.slice(spacer.s, spacer.e);
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let last = null;
  let m;
  while ((m = re.exec(rowXml))) last = { s: m.index, e: re.lastIndex };
  if (!last) throw new Error('baris spacer tanpa paragraf');
  const forced = rewriteWholeForce(rowXml.slice(last.s, last.e), '{/pelaksana}');
  if (!forced.includes('{/pelaksana}')) throw new Error('sisipkan {/pelaksana} gagal');
  return xml.slice(0, spacer.s + last.s) + forced + xml.slice(spacer.s + last.e);
}

// ── pemotongan surat dari body ─────────────────────────────────────
function bodySpans(xml, from, to) {
  const re = /<w:tbl>|<\/w:tbl>|<w:p\b[^>]*?\/>|<w:p\b[^>]*>|<\/w:p>|<w:sectPr\b[^>]*>/g;
  re.lastIndex = from;
  const out = [];
  let depth = 0;
  let start = null;
  let m;
  while ((m = re.exec(xml)) && m.index < to) {
    const t = m[0];
    if (depth === 0 && (t.startsWith('<w:p') || t === '<w:tbl>')) {
      if (t.endsWith('/>')) { out.push({ s: m.index, e: re.lastIndex, kind: 'p' }); continue; }
      start = m.index;
    }
    if (t === '<w:tbl>' || (t.startsWith('<w:p') && !t.endsWith('/>'))) depth++;
    else if (t === '</w:tbl>' || t === '</w:p>') {
      depth--;
      if (depth === 0 && start !== null) {
        out.push({ s: start, e: re.lastIndex, kind: t === '</w:tbl>' ? 'tbl' : 'p' });
        start = null;
      }
    } else if (depth === 0 && t.startsWith('<w:sectPr')) {
      const end = xml.indexOf('</w:sectPr>', m.index);
      if (end < 0) throw new Error('sectPr tanpa penutup');
      out.push({ s: m.index, e: end + '</w:sectPr>'.length, kind: 'sect' });
      re.lastIndex = out[out.length - 1].e;
    }
  }
  return out;
}

function ambilSectPr(xml) {
  const a = xml.indexOf('<w:sectPr');
  const b = xml.indexOf('</w:sectPr>');
  if (a < 0 || b < 0) throw new Error('sectPr tidak ditemukan');
  return xml.slice(a, b + '</w:sectPr>'.length);
}

// ── build ──────────────────────────────────────────────────────────
function buildSPT(chunk, sectPr, epilog, prolog) {
  let paras = loadParagraphs(chunk);
  let out = spliceInto(chunk, paras, applyByIndex(paras, SPT_WHOLE, {}, []));

  // duplikasi baris paraf -> 3 baris ({Paraf1..3})
  paras = loadParagraphs(out);
  assertText(paras, 220, '2.');
  assertText(paras, 221, '{Paraf2}');
  out = dupParafRow(out, paras, 221);

  // tutup {#pelaksana} di sel terakhir baris spacer pertama
  paras = loadParagraphs(out);
  assertText(paras, 24, '{KepadaLabel}');
  out = tutupLoopSpacer(out, paras, 24);

  // hapus baris dasar ke-2 + baris pelaksana 2..8 beserta spacers
  // (baris person2 = paragraf 45..59: dua paragraf kosong lalu '2.';
  //  spacer8 = 186..191; 192 = paragraf kosong luar tabel, dibiarkan)
  paras = loadParagraphs(out);
  assertText(paras, 15, '');
  assertText(paras, 18, 'DPA Bappelitbangda Kabupaten Sumba Barat TA 2026');
  assertText(paras, 47, '2.');
  assertText(paras, 191, '');
  {
    const ranges = rowRanges(out);
    const iDasar2 = rowAt(ranges, paras[15].start, 'baris dasar 2');
    if (!out.slice(ranges[iDasar2].s, ranges[iDasar2].e).includes('DPA Bappelitbangda'))
      throw new Error('baris dasar 2 tidak seperti dugaan');
    const iFrom = rowAt(ranges, paras[47].start, 'pelaksana 2');
    const iTo = rowAt(ranges, paras[191].start, 'spacer terakhir');
    if (iTo < iFrom) throw new Error('rentang hapus pelaksana terbalik');
    if (!out.slice(ranges[iFrom].s, ranges[iFrom].e).includes('Jackson Ubulele'))
      throw new Error('baris pelaksana 2 tidak seperti dugaan');
    out = hapusBaris(out, ranges, iFrom, iTo);
    out = hapusBaris(out, ranges, iDasar2, iDasar2);
  }
  return prolog + out + sectPr + epilog;
}

function buildSPPD(chunk, sectPr, epilog, prolog) {
  let paras = loadParagraphs(chunk);
  let out = spliceInto(chunk, paras, applyByIndex(paras, SPPD_WHOLE, SPPD_PATCHES, []));

  // duplikasi baris paraf -> 3 baris
  paras = loadParagraphs(out);
  assertText(paras, 114, '2.');
  assertText(paras, 115, '{Paraf2}');
  out = dupParafRow(out, paras, 115);
  return prolog + out + sectPr + epilog;
}

function cek(xml, tags, forbid, label) {
  assertPlaceholders(xml, tags);
  // forbid dicek di body saja: prolog memuat namespace URI (mis. .../word/2024/...)
  const bi = xml.indexOf('<w:body>');
  const body = bi < 0 ? xml : xml.slice(bi + '<w:body>'.length);
  for (const s of forbid) {
    const i = body.indexOf(s);
    if (i >= 0) {
      console.error(`[FAIL] ${label}: data contoh masih ada:`, s,
        '| @' + i, JSON.stringify(body.slice(Math.max(0, i - 160), i + 80)));
      process.exit(1);
    }
  }
}

const buf = fs.readFileSync(SRC);
const docXml = new PizZip(buf).file('word/document.xml').asText();
const hits = [];
for (let i = docXml.indexOf('PEMERINTAH KABUPATEN'); i !== -1; i = docXml.indexOf('PEMERINTAH KABUPATEN', i + 1)) hits.push(i);
if (hits.length !== 7) {
  console.error('[FAIL] sumber bukan dokumen format baru (1 SPT + 6 SPPD), ditemukan', hits.length, 'kop');
  process.exit(1);
}
const b0 = docXml.indexOf('<w:body>') + '<w:body>'.length;
const bodyEnd = docXml.indexOf('</w:body>');
const spans = bodySpans(docXml, b0, bodyEnd);
const i1 = spans.findIndex(x => hits[1] >= x.s && hits[1] < x.e);
const i2 = spans.findIndex(x => hits[2] >= x.s && hits[2] < x.e);
if (i1 < 0 || i2 <= i1) throw new Error('segmen surat tidak terpetakan');
const prolog = docXml.slice(0, b0); // <?xml?> + <w:document> + <w:body>
const epilog = docXml.slice(bodyEnd);
const sectPr = ambilSectPr(docXml);

const chunkSPT = docXml.slice(b0, spans[i1].s);
const chunkSPPD = docXml.slice(spans[i1].s, spans[i2].s);
if (!chunkSPT.includes('SURAT PERINTAH TUGAS')) throw new Error('chunk SPT salah');
if (!chunkSPPD.includes('SURAT PERJALANAN DINAS (SPD)')) throw new Error('chunk SPPD salah');

const sptXml = buildSPT(chunkSPT, sectPr, epilog, prolog);
const sppdXml = buildSPPD(chunkSPPD, sectPr, epilog, prolog);
cek(sptXml, SPT_TAGS, FORBID_SPT, 'spt_template');
cek(sppdXml, SPPD_TAGS, FORBID_SPPD, 'sppd_template');

for (const [name, xml] of [['spt_template.docx', sptXml], ['sppd_template.docx', sppdXml]]) {
  const zip = new PizZip(buf);
  zip.file('word/document.xml', xml);
  const data = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  for (const d of DIRS) {
    const p = path.join(__dirname, d, name);
    fs.writeFileSync(p, data);
    console.log('[OK]', path.relative(path.join(__dirname, '..'), p), data.length, 'bytes');
  }
}
console.log('Tag SPT:', SPT_TAGS.filter(t => !/^\{[/#]/.test(t)).length, '· Tag SPPD:', SPPD_TAGS.filter(t => !/^\{[/#]/.test(t)).length);
