// Bedah sekali-jalan sppd_template.docx: tag nama keras -> tag, sel KTU kosong -> {KtuNama}/{KtuNIP},
// tabel paraf SPT disalin (font Arial) sebelum <w:sectPr>. Idempoten: lari kedua kali keluar 0.
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';

const ROOT = path.resolve(import.meta.dirname, '..');
const SALINAN = ['sppd_template.docx', 'www/sppd_template.docx', 'public/sppd_template.docx'];

const baca = f => new PizZip(fs.readFileSync(path.join(ROOT, f)));

function tabelParafSPT(xmlSPT) {
  const i = xmlSPT.indexOf('{Paraf1}');
  if (i < 0) throw new Error('{Paraf1} tidak ada di spt_template.docx');
  const mulai = xmlSPT.lastIndexOf('<w:tbl>', i);
  let depth = 0, j = mulai;
  while (j < xmlSPT.length) {
    const buka = xmlSPT.indexOf('<w:tbl>', j), tutup = xmlSPT.indexOf('</w:tbl>', j);
    if (tutup < 0) throw new Error('</w:tbl> tidak seimbang');
    if (buka >= 0 && buka < tutup) { depth++; j = buka + 7; }
    else { depth--; j = tutup + 8; if (!depth) return xmlSPT.slice(mulai, j); }
  }
  throw new Error('tabel paraf tidak tertutup');
}

// Kedalaman <w:p> maksimum + jumlah paragraf bersarang (CT_P tak boleh memuat CT_P).
function pDepth(s) {
  const re = /<w:p(\s[^>]*)?\/?>|<\/w:p>/g;
  let max = 0, depth = 0, nested = 0, m;
  while ((m = re.exec(s))) {
    if (m[0] === '</w:p>') depth--;
    else if (!m[0].endsWith('/>')) { depth++; if (depth > 1) nested++; if (depth > max) max = depth; }
  }
  return { max, nested };
}

// Isi paragraf pertama (tanpa tag <w:p> pembungkus) — untuk cek satu-paragraf.
function paragrafPertama(s) {
  const m = /<w:p(\s[^>]*)?>/.exec(s);
  if (!m) return '';
  const open = m.index + m[0].length;
  const end = s.indexOf('</w:p>', open);
  return end < 0 ? '' : s.slice(open, end);
}

function bedah() {
  const spt = baca('spt_template.docx').file('word/document.xml').asText();
  // ponytail: brief menulis pola `<w:ascii="Bookman Old Style"`, padahal di XML nyata atribut
  // rFonts selalu berspasi-depan (` w:ascii=...`) sehingga replacement jadi no-op senyap.
  // Ganti nilai font saja — menutup ascii/hAnsi/cs/eastAsia sekaligus.
  const parafTbl = tabelParafSPT(spt).replace(/"Bookman Old Style"/g, '"Arial"');

  const zip = baca('sppd_template.docx');
  let xml = zip.file('word/document.xml').asText();

  const sudah = xml.includes('{BidangNama}') && xml.includes('{KtuNama}') && xml.includes('{Paraf1}');
  if (sudah) { console.log('sudah dipatch, tidak ada yang dikerjakan'); return null; }

  const ganti = (dari, ke) => {
    const n = xml.split(dari).length - 1;
    if (n !== 1) throw new Error(`needle ${JSON.stringify(dari)} muncul ${n}× (harus 1)`);
    xml = xml.replace(dari, ke);
  };
  ganti('BERLIAN MAGU WERU,S.Sos', '{BidangNama}');
  ganti('Nip. 19690619 200903 1 001', 'NIP. {BidangNIP}');

  // Sel KTU (tabel Table3, 2 kolom): sel-2 kosong -> {KtuNama} + paragraf NIP. {KtuNIP}
  const ktu = xml.indexOf('KTU Bapperida');
  if (ktu < 0) throw new Error('label KTU Bapperida tidak ditemukan');
  const tbl = xml.slice(xml.lastIndexOf('<w:tbl>', ktu), xml.indexOf('</w:tbl>', ktu) + 8);
  const tc2 = tbl.split('<w:tc>')[2];
  if (!tc2) throw new Error('sel nama KTU tidak ditemukan');
  const kosong = /<w:r [^>]*><w:rPr><w:rtl w:val="0"\/><\/w:rPr><\/w:r>/;
  if ((tc2.match(kosong) || []).length !== 1) throw new Error('run kosong sel KTU tidak unik');
  const rPr = '<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
  // Satu paragraf: nama, <w:br/> (dua baris), lalu NIP. — bukan <w:p> di dalam <w:p>
  // (WordprocessingML CT_P tak boleh memuat CT_P; Word bisa minta "repair").
  const isi = `<w:r>${rPr}<w:t xml:space="preserve">{KtuNama}</w:t></w:r>`
    + `<w:r>${rPr}<w:br/></w:r>`
    + `<w:r>${rPr}<w:t xml:space="preserve">NIP. {KtuNIP}</w:t></w:r>`;
  const tcBaru = tc2.replace(kosong, isi);
  xml = xml.replace(tc2, tcBaru);   // tc2 unik (berisi id paragraf 00000080)

  // Guard sel KTU: ketiga run ada di SATU paragraf, nama lalu <w:br/> lalu NIP.
  const selP = paragrafPertama(tcBaru);
  if (!selP.includes('{KtuNama}') || !selP.includes('<w:br/>') || !selP.includes('NIP. {KtuNIP}'))
    throw new Error('sel KTU harus satu paragraf: {KtuNama} <w:br/> NIP. {KtuNIP}');
  if (/<w:p(\s|>)/.test(selP)) throw new Error('sel KTU punya <w:p> bersarang');

  // Blok paraf di akhir dokumen (tanpa page-break; Word mengalirkan sendiri)
  const sect = xml.lastIndexOf('<w:sectPr');
  if (sect < 0) throw new Error('<w:sectPr> tidak ditemukan');
  const judul = '<w:p><w:pPr><w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>'
    + '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="24"/></w:rPr>'
    + '<w:t xml:space="preserve">Paraf:</w:t></w:r></w:p>';
  xml = xml.slice(0, sect) + judul + parafTbl + xml.slice(sect);

  // Hard guard akhir: seluruh dokumen tak boleh punya <w:p> bersarang.
  const d = pDepth(xml);
  if (d.max !== 1 || d.nested !== 0)
    throw new Error(`struktur XML tak sah: max <w:p> depth=${d.max}, nested=${d.nested} (harus 1/0)`);

  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const hasil = bedah();
if (hasil) for (const f of SALINAN) { fs.writeFileSync(path.join(ROOT, f), hasil); console.log('ditulis:', f); }
