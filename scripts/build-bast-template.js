// Regenerasi public/bast_template.docx.
// Template BAST dibuat dari kop/logo bast_kendaraan.docx (aset-bapperida) dan
// placeholder docxtemplater dengan delimiter { } agar bisa dirender dinamis.
//
// Cara pakai (sekali saja; template hasil sudah dicommit ke public/):
//   npm i -D docx           # di root repo (devDependency optional, hanya utk build)
//   node scripts/build-bast-template.js
//
// Sumber: aset-bapperida/aset-bapperida/docx_template/bast_kendaraan.docx
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        WidthType, AlignmentType, ImageRun } = require('docx');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, '../aset-bapperida/aset-bapperida/docx_template/bast_kendaraan.docx');
const OUT = [path.join(ROOT, 'bast_template.docx'), path.join(ROOT, 'public/bast_template.docx')];

function extractLogo(src) {
  const zip = new PizZip(fs.readFileSync(src));
  const n = zip.file('word/media/image1.png');
  if (!n) throw new Error('logo word/media/image1.png tidak ditemukan di ' + src);
  return Buffer.from(n.asBinary(), 'binary');
}

const LOGO = extractLogo(SRC);
const FONT = 'Times New Roman';

const B = (t, o = {}) => new Paragraph({ alignment: o.align, spacing: o.spacing || { line: 276 },
  children: [new TextRun({ text: t, bold: true, font: FONT, size: o.size || 22 })] });
const P = (t, o = {}) => new Paragraph({ alignment: o.align, spacing: o.spacing || { line: 276 },
  children: [new TextRun({ text: t, font: FONT, size: o.size || 22 })] });

function pihakTable(rows) {
  const widths = [1900, 300, 6200];
  return new Table({ width: { size: 8400, type: WidthType.DXA },
    rows: rows.map(r => new TableRow({ children: r.map((t, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 22, bold: i !== 2 })] })],
    })) })) });
}

const ASET_WIDTHS = [450, 1900, 1200, 1200, 1300, 750, 1300, 900, 1000, 1100, 1300];
const HEADERS = ['No', 'Nama Barang', 'Merk/Type', 'Model/Jenis', 'No. Inventaris', 'Tahun',
                 'Harga (Rp)', 'Kondisi', 'No. Polisi', 'Ruangan', 'Keterangan'];

function headerRow() {
  return new TableRow({ tableHeader: true, children: HEADERS.map((h, i) => new TableCell({
    width: { size: ASET_WIDTHS[i], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 60, right: 60 },
    shading: { fill: 'DCE6F1' },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, font: FONT, size: 18, bold: true })] })],
  })) });
}

function dataRow() {
  const vals = ['{#asets}{No}', '{NamaBarang}', '{MerkType}', '{Model}', '{NomorInventaris}',
                '{Tahun}', '{Harga}', '{Kondisi}', '{NoPolisi}', '{Ruangan}', '{Keterangan}{/asets}'];
  return new TableRow({ children: vals.map((t, i) => new TableCell({
    width: { size: ASET_WIDTHS[i], type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: FONT, size: 18 })] })],
  })) });
}

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  sections: [{ properties: { page: {
    size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1418, right: 1418 } } },
    children: [
      new Table({ width: { size: 9800, type: WidthType.DXA }, rows: [new TableRow({ children: [
        new TableCell({ width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 },
          verticalAlign: 'center',
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({
            data: LOGO, transformation: { width: 95, height: 110 }, type: 'png' })] })] }),
        new TableCell({ width: { size: 8300, type: WidthType.DXA }, verticalAlign: 'center', margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text: 'PEMERINTAH KABUPATEN SUMBA BARAT', bold: true, font: FONT, size: 30 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text: 'BADAN PERENCANAAN PEMBANGUNAN,', bold: true, font: FONT, size: 26 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text: 'RISET DAN INOVASI DAERAH', bold: true, font: FONT, size: 26 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text: 'JALAN WEEKAROU NO. - TELP. 0387 ( 21124 ) W A I K A B U B A K', font: FONT, size: 18 })] }),
          ]) ] })] }),
      new Paragraph({ text: '' }),
      B('BERITA ACARA SERAH TERIMA', { align: AlignmentType.CENTER, size: 28 }),
      B('BARANG/ASET MILIK DAERAH', { align: AlignmentType.CENTER, size: 28 }),
      B('Nomor : {Nomor}', { align: AlignmentType.CENTER, size: 24, spacing: { before: 120, line: 300 } }),
      new Paragraph({ text: '' }),
      P('Pada hari ini {HariTanggal} telah dilakukan serah terima Barang/Aset Milik Daerah antara pihak-pihak sebagai berikut :', { align: AlignmentType.JUSTIFIED }),
      new Paragraph({ text: '' }),
      P('PIHAK PERTAMA', { align: AlignmentType.CENTER }),
      pihakTable([['Nama', ':', '{P1Nama}'], ['NIP', ':', '{P1NIP}'], ['Jabatan', ':', '{P1Jabatan}'], ['Alamat', ':', '{P1Alamat}']]),
      P('Selanjutnya disebut PIHAK PERTAMA.', { align: AlignmentType.CENTER }),
      new Paragraph({ text: '' }),
      P('PIHAK KEDUA', { align: AlignmentType.CENTER }),
      pihakTable([['Nama', ':', '{P2Nama}'], ['NIP', ':', '{P2NIP}'], ['Jabatan', ':', '{P2Jabatan}'], ['Alamat', ':', '{P2Alamat}']]),
      P('Selanjutnya disebut PIHAK KEDUA.', { align: AlignmentType.CENTER }),
      new Paragraph({ text: '' }),
      P('Berdasarkan pertimbangan PIHAK PERTAMA, dengan ini PIHAK PERTAMA menyerahkan kepada PIHAK KEDUA Barang/Aset Milik Daerah yang ditetapkan menjadi tanggung jawab dan/atau pemegang PIHAK KEDUA, sebagai berikut :', { align: AlignmentType.JUSTIFIED }),
      new Paragraph({ text: '' }),
      new Table({ width: { size: 11200, type: WidthType.DXA }, rows: [headerRow(), dataRow()] }),
      new Paragraph({ text: '' }),
      P('Demikian Berita Acara Serah Terima ini dibuat rangkap 3 (tiga) dan ditandatangani oleh kedua belah pihak, untuk dipergunakan sebagaimana mestinya.', { align: AlignmentType.JUSTIFIED }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: '' }),
      new Table({ width: { size: 9800, type: WidthType.DXA }, rows: [
        new TableRow({ children: [new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [P('PIHAK PERTAMA,', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [P('PIHAK KEDUA,', { align: AlignmentType.CENTER })] })] }),
        new TableRow({ children: [new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [new Paragraph({ text: '' }), new Paragraph({ text: '' }), new Paragraph({ text: '' }), new Paragraph({ text: '' })] }),
          new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [new Paragraph({ text: '' }), new Paragraph({ text: '' }), new Paragraph({ text: '' }), new Paragraph({ text: '' })] })] }),
        new TableRow({ children: [new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [P('{P1Nama}', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [P('{P2Nama}', { align: AlignmentType.CENTER })] })] }),
        new TableRow({ children: [new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [P('NIP. {P1NIP}', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: 4900, type: WidthType.DXA }, children: [P('NIP. {P2NIP}', { align: AlignmentType.CENTER })] })] }),
      ] }),
    ] }],
});

Packer.toBuffer(doc).then(buf => {
  OUT.forEach(o => { fs.writeFileSync(o, buf); console.log('OK ->', o, buf.length, 'bytes'); });
});