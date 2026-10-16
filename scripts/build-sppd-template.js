// ═══════════════════════════════════════════════════════════════
// Bangun sppd_template.docx dari "8656838432_…_TUGAS.docx" (SPPD asli).
//   TEMPLATE_SRC=... node scripts/build-sppd-template.js
// Keluaran: public/sppd_template.docx + ./sppd_template.docx
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadParagraphs, applyByIndex, spliceInto, assertPlaceholders } from './docx-patch.js';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../8656838432_2026-07-02_2026-07-02_TUGAS.docx');
const OUTS = [path.join(__dirname, '../public/sppd_template.docx'), path.join(__dirname, '../sppd_template.docx')];

// indeks paragraf deterministik (lihat spec §9). Nyaris semua nilai multi-run →
// ganti seluruh paragraf; hanya pangkat Kepala yang dibiarkan di baris terpisah.
const WHOLE = {
  8: 'Nomor: {NomorSPPD}',
  14: '{KpaNama}',
  18: '{Nama}',
  19: 'NIP.{NIP}',
  23: '{PangkatGolongan}',
  27: '{JabatanInstansi}',
  31: '{TingkatBiaya}',
  35: '{Maksud}',
  39: '{AlatAngkut}',
  43: '{TempatBerangkat}',
  47: '{TempatTujuan}',
  51: '{LamaHari}',
  55: '{TanggalBerangkat}',
  59: '{TanggalKembali}',
  80: '{Instansi}',
  84: '{MataAnggaran}',
  93: '{DitetapkanDi}',
  96: '{TanggalPenetapan}',
  106: 'NIP: {KepalaNIP}',
  227: '{SekretarisNama}',
  228: 'NIP. {SekretarisNIP}'
};
const PATCHES = {
  105: [['CHARLES HERMANA WERU,S.Sos', '{KepalaNama}'], ['Pembina Utama Muda – IV/c', '{KepalaPangkat}']]
};
// isi contoh log Berangkat/Tiba I–IV + ruang tanggal tangan → dikosongkan
const BLANK = [128, 131, 133, 149, 150, 155, 156, 215, 216];

const PLACEHOLDERS = [
  '{NomorSPPD}', '{KpaNama}', '{Nama}', '{NIP}', '{PangkatGolongan}', '{JabatanInstansi}',
  '{TingkatBiaya}', '{Maksud}', '{AlatAngkut}', '{TempatBerangkat}', '{TempatTujuan}',
  '{LamaHari}', '{TanggalBerangkat}', '{TanggalKembali}', '{Instansi}', '{MataAnggaran}',
  '{DitetapkanDi}', '{TanggalPenetapan}', '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}',
  '{SekretarisNama}', '{SekretarisNIP}'
];

const zip = new PizZip(fs.readFileSync(SRC));
const docXml = zip.file('word/document.xml').asText();
const paras = loadParagraphs(docXml);
const newXml = spliceInto(docXml, paras, applyByIndex(paras, WHOLE, PATCHES, BLANK));

assertPlaceholders(newXml, PLACEHOLDERS);
// pastikan data contoh trip lama sudah hilang
if (newXml.includes('15 Juli 2025') || newXml.includes('18 Juli 2025')) {
  console.error('[FAIL] masih ada tanggal contoh (15/18 Juli 2025) di hasil');
  process.exit(1);
}
zip.file('word/document.xml', newXml);
for (const out of OUTS) {
  fs.writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('[OK]', out, fs.statSync(out).size, 'bytes');
}
