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
});

test('SPPD: render mengisi slot bidang/KTU/paraf yang baru', () => {
  const base = T.bangunTagsSPPD(grup.items[0], grup, perjadin, master);
  const tags = { ...base, KtuNama: 'KTU UJI', KtuNIP: '333' };
  const { text } = renderDocx('sppd_template.docx', tags);
  for (const s of [base.BidangNama, base.BidangNIP, 'KTU UJI', '333', base.Paraf1, base.Paraf2, base.Paraf3])
    assert.ok(s && text.includes(s), 'SPPD slot baru kosong: ' + s);
});
