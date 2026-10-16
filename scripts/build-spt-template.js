// ═══════════════════════════════════════════════════════════════
// Bangun spt_template.docx dari "Salinan Surat Tugas.docx".
//   TEMPLATE_SRC=... node scripts/build-spt-template.js
// Keluaran: public/spt_template.docx + ./spt_template.docx
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadParagraphs, applyByIndex, spliceInto, assertPlaceholders } from './docx-patch.js';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../Salinan Surat Tugas.docx');
const OUTS = [path.join(__dirname, '../public/spt_template.docx'), path.join(__dirname, '../spt_template.docx')];

// indeks paragraf deterministik (template ini file tetap yang di-commit).
// Lihat docs/superpowers/specs/2026-10-16-spt-sppd-generator-design.md §9.
const WHOLE = {
  9: 'Nomor : {Nomor}',
  14: '{Dasar}',
  20: '{#pelaksana}{No}.',
  29: '{Nama}',
  30: '{PangkatGol}',
  31: '{NIP}',
  32: '{Jabatan}{/pelaksana}',
  37: '{Untuk}',
  41: '{DitetapkanDi}',
  44: '{TanggalSurat}',
  55: '{KepalaNama}',
  56: '{KepalaPangkat}',
  57: 'NIP. {KepalaNIP}',
  62: '{Paraf1}',
  65: '{Paraf2}',
  68: '{Paraf3}'
};
const PATCHES = {};
const BLANK = [];

const PLACEHOLDERS = [
  '{Nomor}', '{Dasar}', '{#pelaksana}', '{No}', '{Nama}', '{PangkatGol}', '{NIP}',
  '{Jabatan}', '{/pelaksana}', '{Untuk}', '{DitetapkanDi}', '{TanggalSurat}',
  '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}', '{Paraf1}', '{Paraf2}', '{Paraf3}'
];

const zip = new PizZip(fs.readFileSync(SRC));
const docXml = zip.file('word/document.xml').asText();
const paras = loadParagraphs(docXml);
const newXml = spliceInto(docXml, paras, applyByIndex(paras, WHOLE, PATCHES, BLANK));

assertPlaceholders(newXml, PLACEHOLDERS);
zip.file('word/document.xml', newXml);
for (const out of OUTS) {
  fs.writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('[OK]', out, fs.statSync(out).size, 'bytes');
}
console.log('Tag SPT aktif:', PLACEHOLDERS.filter(p => !/^\{[/#]/.test(p)).length);
