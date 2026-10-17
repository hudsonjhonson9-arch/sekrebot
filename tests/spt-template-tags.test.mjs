import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const ROOT = path.resolve(import.meta.dirname, '..');
const sptSrc = fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js'), 'utf8');
const win = {};
new Function('window', sptSrc)(win);
const T = win.TugasSPT;

// Tag yang tidak ada di objek tags dicatat di sini: kalau terisi, artinya nama tag
// di template ≠ nama yang dihasilkan builder -> dokumen tercetak KOSONG.
const tidakTerisi = [];

function renderDocx(file, tags) {
  const zip = new PizZip(fs.readFileSync(path.join(ROOT, file)));
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' }, paragraphLoop: true, linebreaks: true,
    nullGetter: part => { if (part && part.value !== undefined) tidakTerisi.push(String(part.value)); return ''; }
  });
  doc.render(tags);
  const xml = doc.getZip().file('word/document.xml').asText();
  return { xml, text: xml.replace(/<[^>]+>/g, '') };
}

// Kedalaman <w:p> maks + jumlah paragraf bersarang: CT_P tak boleh memuat CT_P
// (kalau ini >1, Word minta "repair" dan bisa membuang baris NIP.).
function pDepth(xml) {
  const re = /<w:p(\s[^>]*)?\/?>|<\/w:p>/g;
  let max = 0, depth = 0, nested = 0, m;
  while ((m = re.exec(xml))) {
    if (m[0] === '</w:p>') depth--;
    else if (!m[0].endsWith('/>')) { depth++; if (depth > 1) nested++; if (depth > max) max = depth; }
  }
  return { max, nested };
}

const NIP1 = '19721102 200112 1 001';
const NIP2 = '19800315 200501 1 011';
const grup = {
  items: [
    { id: '1', nip: NIP1, nama: 'AAA', tanggal: '2026-07-02', keterangan: 'Rapat koordinasi', created_by_nip: '9', instansi_id: 'bapperida' },
    { id: '2', nip: NIP2, nama: 'BBB', tanggal: '2026-07-02', keterangan: 'Rapat koordinasi', created_by_nip: '9', instansi_id: 'bapperida' }
  ],
  perjadin: null
};
const master = {
  [NIP1]: { nip: NIP1, nama: 'AAA', pangkat: 'PEMBINATK1', jabatan: 'KEPALABIDANGX' },
  [NIP2]: { nip: NIP2, nama: 'BBB', pangkat: 'PENATATK1', jabatan: 'ANALISX' }
};
const perjadin = {
  nomor: 'BP4D.011.7/69/53.12/ST/01/2026', nomorSPPD: '001/SPPD/2026',
  maksud: 'Rapat koordinasi', tempatTujuan: 'Kupang',
  tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04'
};

test('SPT: setiap placeholder template punya nilai (tanpa tag tak dikenal)', () => {
  tidakTerisi.length = 0;
  const { text } = renderDocx('spt_template.docx', T.bangunTagsSPT(grup, perjadin, master));
  assert.deepEqual(tidakTerisi, [], 'tag template tanpa nilai: ' + tidakTerisi.join(', '));
  assert.ok(!/\{[A-Za-z][A-Za-z0-9]*\}/.test(text), 'masih ada tag {..} yang belum tergantikan');
});

test('SPT: nilai pelaksana + nomor + kepala benar-benar masuk', () => {
  const { text } = renderDocx('spt_template.docx', T.bangunTagsSPT(grup, perjadin, master));
  for (const s of ['BP4D.011.7/69/53.12/ST/01/2026', 'AAA', 'BBB', 'PEMBINATK1', 'KEPALABIDANGX', NIP2, 'Kupang']) {
    assert.ok(text.includes(s), 'SPT kehilangan nilai: ' + s);
  }
});

test('SPPD: setiap placeholder template punya nilai (tanpa tag tak dikenal)', () => {
  tidakTerisi.length = 0;
  const { text } = renderDocx('sppd_template.docx', T.bangunTagsSPPD(grup.items[0], grup, perjadin, master));
  assert.deepEqual(tidakTerisi, [], 'tag template tanpa nilai: ' + tidakTerisi.join(', '));
  assert.ok(!/\{[A-Za-z][A-Za-z0-9]*\}/.test(text), 'masih ada tag {..} yang belum tergantikan');
});

test('SPPD: isi SPPD benar dan tidak menyisakan nomor/format template lama', () => {
  const { text } = renderDocx('sppd_template.docx', T.bangunTagsSPPD(grup.items[0], grup, perjadin, master));
  for (const s of ['001/SPPD/2026', 'AAA', NIP1, 'PEMBINATK1', 'KEPALABIDANGX', '3 (Tiga) Hari', '2 Juli 2026', '4 Juli 2026', 'Kupang']) {
    assert.ok(text.includes(s), 'SPPD kehilangan nilai: ' + s);
  }
  assert.ok(!text.includes('2025'), 'SPPD masih menyisakan tahun template lama (2025)');
  assert.ok(!text.includes('42 /SPPD'), 'SPPD masih menyisakan nomor template lama');
});

test('sppd_template: tag ttd/paraf baru ada, nama keras hilang, 3 salinan identik', () => {
  const ROOT = path.resolve(import.meta.dirname, '..');
  const berkas = ['sppd_template.docx', 'www/sppd_template.docx', 'public/sppd_template.docx'];
  const isi = berkas.map(b => fs.readFileSync(path.join(ROOT, b)));
  assert.ok(isi[0].equals(isi[1]) && isi[0].equals(isi[2]), 'tiga salinan sppd_template.docx harus identik');
  const xml = new PizZip(isi[0]).file('word/document.xml').asText();
  for (const tag of ['{BidangNama}', '{BidangNIP}', '{KtuNama}', '{KtuNIP}', '{Paraf1}', '{Paraf2}', '{Paraf3}'])
    assert.ok(xml.includes(tag), 'tag hilang: ' + tag);
  assert.ok(!xml.includes('BERLIAN MAGU WERU'), 'nama keras masih ada');
  assert.ok(!xml.includes('Nip. 19690619'), 'NIP keras masih ada');
  const paraf = xml.slice(xml.lastIndexOf('<w:tbl>', xml.indexOf('{Paraf1}')), xml.indexOf('</w:tbl>', xml.indexOf('{Paraf1}')) + 8);
  assert.ok(paraf.includes('<w:tblStyle w:val="TableGrid"'), 'tabel paraf (TableGrid) tidak tersalin');
  assert.ok(!/Bookman Old Style/.test(paraf), 'font tabel paraf harus Arial');
  assert.ok(xml.indexOf('{Paraf1}') < xml.lastIndexOf('<w:sectPr'), 'blok paraf harus sebelum <w:sectPr>');
  const d = pDepth(xml);
  assert.equal(d.max, 1, 'sppd_template punya <w:p> bersarang (max depth ' + d.max + ')');
  assert.equal(d.nested, 0, 'sppd_template punya ' + d.nested + ' paragraf bersarang');
});

test('SPPD: render mengisi slot bidang/KTU/paraf yang baru', () => {
  const base = T.bangunTagsSPPD(grup.items[0], grup, perjadin, master);
  const tags = { ...base, KtuNama: 'KTU UJI', KtuNIP: '333' };
  const { text } = renderDocx('sppd_template.docx', tags);
  for (const s of [base.BidangNama, base.BidangNIP, 'KTU UJI', '333', base.Paraf1, base.Paraf2, base.Paraf3])
    assert.ok(s && text.includes(s), 'SPPD slot baru kosong: ' + s);
});

// Flatten XML ke teks baris-demi-baris: <w:br/> jadi baris baru, paragraf & baris tabel juga.
function flatten(xml) {
  return xml.replace(/<w:br\b[^>]*>/g, '\n').replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n').replace(/<[^>]+>/g, '');
}

// E2E: pakai builder nyata + template nyata, semua orang dipilih (kepala/sekretaris/bidang/KTU + 3 paraf).
test('E2E: SPPD & SPT merender pilihan ttd/paraf (nama + jabatan, tepat 3 baris paraf)', () => {
  const p = {
    ...perjadin,
    kepala: { nama: 'KEPALA UJI', pangkat: 'PEMBINA UJI', nip: '111' },
    sekretaris: { nama: 'SEKRETARIS UJI', nip: '222' },
    bidang: { nama: 'BIDANG UJI', nip: '333' },
    ktu: { nama: 'KTU UJI', nip: '444' },
    paraf: [
      { nama: 'PARAF A', jabatan: 'JABATAN A' },
      { nama: 'PARAF B', jabatan: 'JABATAN B' },
      { nama: 'PARAF C', jabatan: 'JABATAN C' }
    ]
  };
  const baris = [['PARAF A', 'JABATAN A'], ['PARAF B', 'JABATAN B'], ['PARAF C', 'JABATAN C']];
  const hitung = t => t.split('\n').filter(l => /^\s*PARAF [ABC]$/.test(l)).length;

  // SPPD: Kepala Bidang + NIP, sel KTU + NIP, blok paraf 3 baris.
  const sppd = flatten(renderDocx('sppd_template.docx', T.bangunTagsSPPD(grup.items[0], grup, p, master)).xml);
  assert.ok(!sppd.includes('{') && !sppd.includes('}'), 'SPPD menyisakan kurung kurawal');
  assert.ok(sppd.includes('BIDANG UJI') && sppd.includes('NIP. 333'), 'SPPD: Kepala Bidang + NIP kosong');
  const ktu = sppd.slice(sppd.indexOf('KTU Bapperida'), sppd.indexOf('Berangkat dari'));
  assert.ok(ktu.includes('KTU UJI') && ktu.includes('NIP. 444'), 'SPPD: sel KTU + NIP kosong');
  assert.ok(ktu.includes('KTU UJI\nNIP. 444'), 'SPPD: sel KTU harus nama lalu baris NIP. (dipisah <w:br/>)');
  const pSp = sppd.slice(sppd.indexOf('Paraf Hirarki'));
  baris.forEach(([n, j], i) => assert.ok(pSp.includes(n + '\n' + j), `SPPD paraf baris ${i + 1} bukan nama lalu jabatan`));
  assert.equal(hitung(pSp), 3, 'SPPD harus tepat 3 baris paraf');

  // SPT: Paraf1..3 = nama lalu jabatan, dua baris.
  const spt = flatten(renderDocx('spt_template.docx', T.bangunTagsSPT(grup, p, master)).xml);
  assert.ok(!spt.includes('{') && !spt.includes('}'), 'SPT menyisakan kurung kurawal');
  const pSt = spt.slice(spt.indexOf('Paraf Hirarki'));
  baris.forEach(([n, j], i) => assert.ok(pSt.includes(n + '\n' + j), `SPT paraf baris ${i + 1} bukan nama lalu jabatan`));
  assert.equal(hitung(pSt), 3, 'SPT harus tepat 3 baris paraf');
});
