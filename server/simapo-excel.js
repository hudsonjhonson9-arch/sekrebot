import PizZip from 'pizzip';

const BULAN_INDONESIA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function colName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

export function formatTglIndo(d) {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = BULAN_INDONESIA[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function resolvePeriode(periode, tahun) {
  const y = Number(tahun) || new Date().getFullYear();
  const p = String(periode || 'TAHUNAN').toUpperCase();
  let startDate = `${y}-01-01`;
  let endDate = `${y}-12-31`;
  let label = `Tahun ${y}`;
  let tglTtd = `31 Desember ${y}`;

  if (p === 'TW1') {
    startDate = `${y}-01-01`;
    endDate = `${y}-03-31`;
    label = `Triwulan I Tahun ${y}`;
    tglTtd = `31 Maret ${y}`;
  } else if (p === 'TW2') {
    startDate = `${y}-04-01`;
    endDate = `${y}-06-30`;
    label = `Triwulan II Tahun ${y}`;
    tglTtd = `30 Juni ${y}`;
  } else if (p === 'TW3') {
    startDate = `${y}-07-01`;
    endDate = `${y}-09-30`;
    label = `Triwulan III Tahun ${y}`;
    tglTtd = `30 September ${y}`;
  } else if (p === 'TW4') {
    startDate = `${y}-10-01`;
    endDate = `${y}-12-31`;
    label = `Triwulan IV Tahun ${y}`;
    tglTtd = `31 Desember ${y}`;
  } else if (p === 'SM1') {
    startDate = `${y}-01-01`;
    endDate = `${y}-06-30`;
    label = `Semester I Tahun ${y}`;
    tglTtd = `30 Juni ${y}`;
  } else if (p === 'SM2') {
    startDate = `${y}-07-01`;
    endDate = `${y}-12-31`;
    label = `Semester II Tahun ${y}`;
    tglTtd = `31 Desember ${y}`;
  }
  return { periode: p, tahun: y, startDate, endDate, label, tglTtd };
}

export function groupPermen47Rows(items) {
  if (!items || !items.length) {
    return { hierarchicalRows: [], totalNilai: 0, leafCount: 0 };
  }

  const categoryMap = new Map();
  let totalNilai = 0;

  items.forEach((item) => {
    const catName = String(item.nama_kategori || 'BARANG PAKAI HABIS LAINNYA').trim();
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, { name: catName, items: [] });
    }
    const jumlah = Number(item.jumlah) || 1;
    const harga = Number(item.harga_satuan) || 0;
    const nilai = Number(item.total_nilai) || (jumlah * harga);
    totalNilai += nilai;

    categoryMap.get(catName).items.push({
      ...item,
      jumlah,
      harga_satuan: harga,
      total_nilai: nilai,
      biaya_atribusi: 0,
      nilai_perolehan: nilai,
      harga_satuan_perolehan: jumlah > 0 ? Math.round(nilai / jumlah) : harga,
    });
  });

  const hierarchicalRows = [];
  let itemNo = 1;

  // Level 1: 1 ASET
  hierarchicalRows.push({
    is_header: true,
    level: 1,
    kode_parts: [1, '', '', '', '', '', ''],
    nama: 'ASET',
    total_nilai: totalNilai,
    nilai_perolehan: totalNilai,
  });

  // Level 2: 1.1 ASET LANCAR
  hierarchicalRows.push({
    is_header: true,
    level: 2,
    kode_parts: [1, 1, '', '', '', '', ''],
    nama: 'ASET LANCAR',
    total_nilai: totalNilai,
    nilai_perolehan: totalNilai,
  });

  // Level 3: 1.1.7 PERSEDIAAN
  hierarchicalRows.push({
    is_header: true,
    level: 3,
    kode_parts: [1, 1, 7, '', '', '', ''],
    nama: 'PERSEDIAAN',
    total_nilai: totalNilai,
    nilai_perolehan: totalNilai,
  });

  // Level 4: 1.1.7.01 BARANG PAKAI HABIS
  hierarchicalRows.push({
    is_header: true,
    level: 4,
    kode_parts: [1, 1, 7, 1, '', '', ''],
    nama: 'BARANG PAKAI HABIS',
    total_nilai: totalNilai,
    nilai_perolehan: totalNilai,
  });

  let catIdx = 1;
  for (const [catName, catGroup] of categoryMap.entries()) {
    const catTotal = catGroup.items.reduce((s, it) => s + it.total_nilai, 0);
    const catVol = catGroup.items.reduce((s, it) => s + it.jumlah, 0);

    // Level 5: Sub-objek (Kategori)
    hierarchicalRows.push({
      is_header: true,
      level: 5,
      kode_parts: [1, 1, 7, 1, catIdx, '', ''],
      nama: catName.toUpperCase(),
      jumlah: catVol,
      total_nilai: catTotal,
      nilai_perolehan: catTotal,
    });

    catGroup.items.forEach((it, iIdx) => {
      // Parse dot code if provided or assign Permen 47 coordinates
      const rawCode = String(it.kodebarang || '').trim();
      const dotParts = rawCode.split('.').filter(Boolean);
      let p;
      if (dotParts.length >= 7 && dotParts[0] === '1' && dotParts[1] === '1') {
        p = dotParts.slice(0, 7).map((x) => (isNaN(Number(x)) ? x : Number(x)));
      } else {
        p = [1, 1, 7, 1, catIdx, 1, iIdx + 1];
      }

      hierarchicalRows.push({
        is_header: false,
        no: itemNo++,
        level: 7,
        ...it,
        kode_parts: p,
      });
    });
    catIdx++;
  }

  return { hierarchicalRows, totalNilai, leafCount: itemNo - 1 };
}

export function buildWorkbook(sheets) {
  const zip = new PizZip();

  let sheetOverrides = '';
  let sheetRels = '';
  let workbookSheets = '';

  sheets.forEach((sh, idx) => {
    const id = idx + 1;
    sheetOverrides += `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    sheetRels += `<Relationship Id="rIdSheet${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`;
    const safeName = escapeXml(sh.name || `Sheet${id}`).slice(0, 31);
    workbookSheets += `<sheet name="${safeName}" sheetId="${id}" r:id="rIdSheet${id}"/>`;
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${sheetRels}
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${workbookSheets}
  </sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="4">
    <font><name val="Calibri"/><sz val="11"/></font>
    <font><b/><name val="Calibri"/><sz val="11"/></font>
    <font><b/><name val="Calibri"/><sz val="12"/></font>
    <font><b/><name val="Calibri"/><sz val="14"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
    </border>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="double"><color auto="1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/styles.xml', stylesXml);

  sheets.forEach((sh, idx) => {
    const id = idx + 1;
    let sheetDataXml = '';
    const merges = sh.merges || [];
    const cols = sh.cols || [];

    let colsXml = '';
    if (cols.length) {
      colsXml = '<cols>' + cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 12}" customWidth="1"/>`).join('') + '</cols>';
    }

    const rows = sh.rows || [];
    rows.forEach((r, rIdx) => {
      const rowNum = r.rowNum || (rIdx + 1);
      const cells = r.cells || [];
      let rowXml = `<row r="${rowNum}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}>`;
      cells.forEach((cell, cIdx) => {
        const colNum = cell.colNum || (cIdx + 1);
        const cellRef = `${colName(colNum)}${rowNum}`;
        const s = cell.style != null ? ` s="${cell.style}"` : '';
        const val = cell.value;
        if (val == null || val === '') {
          if (cell.style != null) {
            rowXml += `<c r="${cellRef}"${s}/>`;
          }
        } else if (typeof val === 'number') {
          rowXml += `<c r="${cellRef}"${s}><v>${val}</v></c>`;
        } else {
          rowXml += `<c r="${cellRef}" t="inlineStr"${s}><is><t>${escapeXml(val)}</t></is></c>`;
        }
      });
      rowXml += '</row>';
      sheetDataXml += rowXml;
    });

    let mergeCellsXml = '';
    if (merges.length) {
      mergeCellsXml = `<mergeCells count="${merges.length}">` +
        merges.map((m) => `<mergeCell ref="${m}"/>`).join('') +
        '</mergeCells>';
    }

    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>
    ${sheetDataXml}
  </sheetData>
  ${mergeCellsXml}
</worksheet>`;

    zip.file(`xl/worksheets/sheet${id}.xml`, worksheetXml);
  });

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function generatePermen47Excel({ periode, tahun, instansi_id, rows, total_nilai, instansi_nama }) {
  const p = resolvePeriode(periode, tahun);
  const agencyName = (instansi_nama || instansi_id || 'BAPPERIDA').toUpperCase();
  const { hierarchicalRows, totalNilai } = (rows && rows.length && rows[0]?.is_header !== undefined)
    ? { hierarchicalRows: rows, totalNilai: total_nilai || 0 }
    : groupPermen47Rows(rows || []);

  const sheetRows = [];
  const merges = [];

  // Title block (Rows 1-6)
  sheetRows.push({
    rowNum: 1,
    height: 24,
    cells: [{ colNum: 1, value: 'Laporan Pengadaan BMD Berupa Aset Lancar Persediaan', style: 2 }],
  });
  merges.push('A1:AA1');

  sheetRows.push({
    rowNum: 2,
    height: 20,
    cells: [{ colNum: 1, value: 'Pengguna Barang', style: 2 }],
  });
  merges.push('A2:AA2');

  sheetRows.push({
    rowNum: 3,
    height: 20,
    cells: [{ colNum: 1, value: agencyName, style: 2 }],
  });
  merges.push('A3:AA3');

  sheetRows.push({
    rowNum: 4,
    height: 20,
    cells: [{ colNum: 1, value: p.label, style: 2 }],
  });
  merges.push('A4:AA4');

  sheetRows.push({
    rowNum: 5,
    cells: [
      { colNum: 1, value: 'Provinsi', style: 1 },
      { colNum: 9, value: ': Nusa Tenggara Timur', style: 1 },
    ],
  });
  merges.push('A5:H5');

  sheetRows.push({
    rowNum: 6,
    cells: [
      { colNum: 1, value: 'Kabupaten', style: 1 },
      { colNum: 9, value: ': Sumba Barat', style: 1 },
    ],
  });
  merges.push('A6:H6');

  // Blank row 7
  sheetRows.push({ rowNum: 7, cells: [] });

  // Table Headers (Rows 8-11)
  sheetRows.push({
    rowNum: 8,
    height: 28,
    cells: [
      { colNum: 1, value: 'No.', style: 3 },
      { colNum: 2, value: 'Penggolongan dan Kodefikasi Barang', style: 3 },
      { colNum: 9, value: 'Nama Barang', style: 3 },
      { colNum: 10, value: 'Spesifikasi Nama Barang', style: 3 },
      { colNum: 11, value: 'Merek', style: 3 },
      { colNum: 12, value: 'Jumlah Barang', style: 3 },
      { colNum: 13, value: 'Satuan Barang', style: 3 },
      { colNum: 14, value: 'Harga Satuan', style: 3 },
      { colNum: 15, value: 'Total Nilai Barang', style: 3 },
      { colNum: 16, value: 'Total Biaya Atribusi', style: 3 },
      { colNum: 17, value: 'Nilai Perolehan Barang', style: 3 },
      { colNum: 18, value: 'Harga Satuan Perolehan', style: 3 },
      { colNum: 19, value: 'Sub Kegiatan dan Rekening Anggaran Belanja Daerah atas Pengadaan Barang', style: 3 },
      { colNum: 23, value: 'Tanggal Perolehan', style: 3 },
      { colNum: 24, value: 'Dokumen Sumber Perolehan', style: 3 },
      { colNum: 27, value: 'Ket.', style: 3 },
    ],
  });
  merges.push('A8:A10', 'B8:I8', 'J8:J10', 'K8:K10', 'L8:L10', 'M8:M10', 'N8:N9', 'O8:O9', 'P8:P9', 'Q8:Q9', 'R8:R9', 'S8:V8', 'W8:W10', 'X8:Z8', 'AA8:AA10');

  sheetRows.push({
    rowNum: 9,
    cells: [
      { colNum: 2, value: 'Kode Barang', style: 3 },
      { colNum: 9, value: 'Nama Barang', style: 3 },
      { colNum: 19, value: 'Sub Kegiatan', style: 3 },
      { colNum: 21, value: 'Rekening Belanja Daerah', style: 3 },
      { colNum: 24, value: 'Bentuk Kontrak', style: 3 },
      { colNum: 25, value: 'Nama Penyedia', style: 3 },
      { colNum: 26, value: 'No.', style: 3 },
    ],
  });
  merges.push('B9:H10', 'I9:I10', 'S9:T9', 'U9:V9', 'X9:X10', 'Y9:Y10', 'Z9:Z10');

  sheetRows.push({
    rowNum: 10,
    cells: [
      { colNum: 14, value: '( Rp)', style: 3 },
      { colNum: 15, value: '( Rp)', style: 3 },
      { colNum: 16, value: '( Rp)', style: 3 },
      { colNum: 17, value: '( Rp)', style: 3 },
      { colNum: 18, value: '( Rp)', style: 3 },
      { colNum: 19, value: 'Kode Sub Kegiatan', style: 3 },
      { colNum: 20, value: 'Nama Sub Kegiatan', style: 3 },
      { colNum: 21, value: 'Kode Rekening', style: 3 },
      { colNum: 22, value: 'Uraian Belanja', style: 3 },
    ],
  });

  // Row 11: Column numbers
  sheetRows.push({
    rowNum: 11,
    cells: [
      { colNum: 1, value: 1, style: 3 },
      { colNum: 2, value: 2, style: 3 },
      { colNum: 9, value: 3, style: 3 },
      { colNum: 10, value: 4, style: 3 },
      { colNum: 11, value: 5, style: 3 },
      { colNum: 12, value: 6, style: 3 },
      { colNum: 13, value: 7, style: 3 },
      { colNum: 14, value: 8, style: 3 },
      { colNum: 15, value: '9 = 6 X 8', style: 3 },
      { colNum: 16, value: 10, style: 3 },
      { colNum: 17, value: '11 = 9 + 10', style: 3 },
      { colNum: 18, value: '12 = 11 : 6', style: 3 },
      { colNum: 19, value: 13, style: 3 },
      { colNum: 20, value: 14, style: 3 },
      { colNum: 21, value: 15, style: 3 },
      { colNum: 22, value: 16, style: 3 },
      { colNum: 23, value: 17, style: 3 },
      { colNum: 24, value: 18, style: 3 },
      { colNum: 25, value: 19, style: 3 },
      { colNum: 26, value: 20, style: 3 },
      { colNum: 27, value: 21, style: 3 },
    ],
  });
  merges.push('B11:H11');

  // Fill in data rows starting at Row 12
  let curRow = 12;
  hierarchicalRows.forEach((r) => {
    const cells = [];
    const kp = Array.isArray(r.kode_parts) ? r.kode_parts : [];

    if (r.is_header) {
      cells.push({ colNum: 1, value: '', style: 5 });
      for (let c = 0; c < 7; c++) {
        cells.push({ colNum: 2 + c, value: kp[c] ?? '', style: 12 });
      }
      cells.push({ colNum: 9, value: r.nama || '', style: 7 });
      cells.push({ colNum: 10, value: '', style: 4 });
      cells.push({ colNum: 11, value: '', style: 5 });
      cells.push({ colNum: 12, value: r.jumlah || '', style: r.jumlah ? 8 : 5 });
      cells.push({ colNum: 13, value: '', style: 5 });
      cells.push({ colNum: 14, value: '', style: 6 });
      cells.push({ colNum: 15, value: r.total_nilai || '', style: r.total_nilai ? 8 : 6 });
      cells.push({ colNum: 16, value: '', style: 6 });
      cells.push({ colNum: 17, value: r.nilai_perolehan || '', style: r.nilai_perolehan ? 8 : 6 });
      cells.push({ colNum: 18, value: '', style: 6 });
      for (let c = 19; c <= 27; c++) {
        cells.push({ colNum: c, value: '', style: 4 });
      }
    } else {
      // Leaf item row
      cells.push({ colNum: 1, value: r.no || '', style: 5 });
      for (let c = 0; c < 7; c++) {
        cells.push({ colNum: 2 + c, value: kp[c] ?? '', style: 5 });
      }
      cells.push({ colNum: 9, value: r.nama_barang || r.nama || '', style: 4 });
      cells.push({ colNum: 10, value: r.spesifikasi || '', style: 4 });
      cells.push({ colNum: 11, value: r.merek || '', style: 5 });
      cells.push({ colNum: 12, value: Number(r.jumlah) || 0, style: 6 });
      cells.push({ colNum: 13, value: r.satuan || 'Unit', style: 5 });
      cells.push({ colNum: 14, value: Number(r.harga_satuan) || 0, style: 6 });
      cells.push({ colNum: 15, value: Number(r.total_nilai) || 0, style: 6 });
      cells.push({ colNum: 16, value: Number(r.biaya_atribusi) || 0, style: 6 });
      cells.push({ colNum: 17, value: Number(r.nilai_perolehan) || 0, style: 6 });
      cells.push({ colNum: 18, value: Number(r.harga_satuan_perolehan) || 0, style: 6 });
      cells.push({ colNum: 19, value: r.sub_kegiatan || '', style: 4 });
      cells.push({ colNum: 20, value: r.nama_sub_kegiatan || '', style: 4 });
      cells.push({ colNum: 21, value: r.kode_rekening || '', style: 4 });
      cells.push({ colNum: 22, value: r.uraian_belanja || '', style: 4 });
      cells.push({ colNum: 23, value: r.tgl_nota ? formatTglIndo(r.tgl_nota) : '', style: 5 });
      cells.push({ colNum: 24, value: r.bentuk_kontrak || '', style: 4 });
      cells.push({ colNum: 25, value: r.nama_penyedia || '', style: 4 });
      cells.push({ colNum: 26, value: r.dokumen_sumber || r.no_nota || '', style: 4 });
      cells.push({ colNum: 27, value: r.keterangan || '', style: 4 });
    }

    sheetRows.push({ rowNum: curRow++, cells });
  });

  // Total Row
  sheetRows.push({
    rowNum: curRow,
    height: 22,
    cells: [
      { colNum: 1, value: '', style: 9 },
      { colNum: 2, value: 'J U M L A H     T O T A L', style: 9 },
      ...Array.from({ length: 12 }, (_, i) => ({ colNum: 3 + i, value: '', style: 9 })),
      { colNum: 15, value: totalNilai, style: 10 },
      { colNum: 16, value: 0, style: 10 },
      { colNum: 17, value: totalNilai, style: 10 },
      { colNum: 18, value: 0, style: 10 },
      ...Array.from({ length: 9 }, (_, i) => ({ colNum: 19 + i, value: '', style: 9 })),
    ],
  });
  merges.push(`B${curRow}:N${curRow}`);
  curRow++;

  // Signature Block
  curRow++;
  sheetRows.push({
    rowNum: curRow++,
    cells: [{ colNum: 19, value: `Waikabubak, ${p.tglTtd}`, style: 1 }],
  });
  sheetRows.push({
    rowNum: curRow++,
    cells: [{ colNum: 19, value: 'Kepala Badan Perencanaan Pembangunan, Penelitian dan Pengembangan Daerah', style: 1 }],
  });
  sheetRows.push({
    rowNum: curRow++,
    cells: [{ colNum: 19, value: 'Kabupaten Sumba Barat,', style: 1 }],
  });
  curRow += 3;
  sheetRows.push({
    rowNum: curRow++,
    cells: [{ colNum: 19, value: 'Charles Hermana Weru,S.Sos', style: 1 }],
  });
  sheetRows.push({
    rowNum: curRow++,
    cells: [{ colNum: 19, value: 'Pembina Utama Muda', style: 0 }],
  });
  sheetRows.push({
    rowNum: curRow++,
    cells: [{ colNum: 19, value: 'Nip. 19721102 200112 1 001', style: 0 }],
  });

  const cols = [
    { width: 5 },
    { width: 4.5 }, { width: 4.5 }, { width: 4.5 }, { width: 4.5 }, { width: 4.5 }, { width: 4.5 }, { width: 4.5 },
    { width: 35 }, { width: 22 }, { width: 15 }, { width: 12 }, { width: 12 },
    { width: 16 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 16 },
    { width: 22 }, { width: 20 }, { width: 18 }, { width: 20 },
    { width: 16 }, { width: 18 }, { width: 20 }, { width: 18 }, { width: 15 },
  ];

  return buildWorkbook([{
    name: 'Permen 47',
    cols,
    rows: sheetRows,
    merges,
  }]);
}

export function generateKartuPemeliharaanExcel({ cards = [], instansi_nama }) {
  const agencyName = (instansi_nama || 'BAPPERIDA').toUpperCase();
  const tglToday = formatTglIndo(new Date());

  const sheetRows = [];
  const merges = [];
  let curRow = 3;

  const cardList = cards.length ? cards : [{
    nama_barang: 'Aset Belum Dipelihara',
    kodebarang: '-',
    spesifikasi: '-',
    nomorinventaris: '-',
    items: [],
  }];

  cardList.forEach((card) => {
    // Row: Header title
    sheetRows.push({
      rowNum: curRow,
      height: 24,
      cells: [
        { colNum: 1, value: 'KARTU PEMELIHARAAN', style: 11 },
        { colNum: 2, value: '', style: 11 },
        { colNum: 3, value: '', style: 11 },
        { colNum: 4, value: '', style: 11 },
        { colNum: 5, value: '', style: 11 },
        { colNum: 6, value: '', style: 11 },
        { colNum: 7, value: '', style: 11 },
      ],
    });
    merges.push(`A${curRow}:G${curRow}`);
    curRow++;

    // Row: NIBAR
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 6, value: `NIBAR   : ${card.nomorinventaris || card.kodebarang || '-'}`, style: 1 },
      ],
    });
    curRow++;

    // Row: Pengguna Barang
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 1, value: 'Pengguna Barang', style: 0 },
        { colNum: 3, value: ':', style: 5 },
        { colNum: 5, value: '(7)', style: 5 },
        { colNum: 6, value: agencyName, style: 1 },
      ],
    });
    merges.push(`A${curRow}:B${curRow}`, `F${curRow}:G${curRow}`);
    curRow++;

    // Row: Kuasa Pengguna Barang
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 1, value: 'Kuasa Pengguna Barang', style: 0 },
        { colNum: 3, value: ':', style: 5 },
        { colNum: 5, value: '(8)', style: 5 },
        { colNum: 6, value: '-', style: 0 },
      ],
    });
    merges.push(`A${curRow}:B${curRow}`, `F${curRow}:G${curRow}`);
    curRow++;

    // Row: Kode Barang
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 1, value: 'Kode Barang', style: 0 },
        { colNum: 3, value: ':', style: 5 },
        { colNum: 5, value: '(9)', style: 5 },
        { colNum: 6, value: card.kodebarang || '-', style: 1 },
      ],
    });
    merges.push(`A${curRow}:B${curRow}`, `F${curRow}:G${curRow}`);
    curRow++;

    // Row: Nama Barang
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 1, value: 'Nama Barang', style: 0 },
        { colNum: 3, value: ':', style: 5 },
        { colNum: 5, value: '(10)', style: 5 },
        { colNum: 6, value: card.nama_barang || '-', style: 1 },
      ],
    });
    merges.push(`A${curRow}:B${curRow}`, `F${curRow}:G${curRow}`);
    curRow++;

    // Row: Spesifikasi Barang
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 1, value: 'Spesifikasi Barang', style: 0 },
        { colNum: 3, value: ':', style: 5 },
        { colNum: 5, value: '(11)', style: 5 },
        { colNum: 6, value: card.spesifikasi || '-', style: 0 },
      ],
    });
    merges.push(`A${curRow}:B${curRow}`, `F${curRow}:G${curRow}`);
    curRow++;

    // Table Header
    sheetRows.push({
      rowNum: curRow,
      height: 24,
      cells: [
        { colNum: 1, value: 'No.', style: 3 },
        { colNum: 2, value: 'Tanggal Pemeliharaan', style: 3 },
        { colNum: 3, value: 'Jenis Pemeliharaan', style: 3 },
        { colNum: 4, value: 'Biaya Pemeliharaan (Rp)', style: 3 },
        { colNum: 5, value: 'Nama Penyedia', style: 3 },
        { colNum: 6, value: 'Bentuk Kontrak', style: 3 },
        { colNum: 7, value: 'Ket.', style: 3 },
      ],
    });
    curRow++;

    // Column Numbers
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 1, value: '(7)', style: 3 },
        { colNum: 2, value: '(8)', style: 3 },
        { colNum: 3, value: '(9)', style: 3 },
        { colNum: 4, value: '(10)', style: 3 },
        { colNum: 5, value: '(11)', style: 3 },
        { colNum: 6, value: '(12)', style: 3 },
        { colNum: 7, value: '(13)', style: 3 },
      ],
    });
    curRow++;

    // Maintenance Rows
    const items = Array.isArray(card.items) ? card.items : [];
    let totalBiaya = 0;

    if (!items.length) {
      sheetRows.push({
        rowNum: curRow,
        cells: [
          { colNum: 1, value: '-', style: 5 },
          { colNum: 2, value: '-', style: 5 },
          { colNum: 3, value: 'Belum ada riwayat pemeliharaan', style: 4 },
          { colNum: 4, value: 0, style: 6 },
          { colNum: 5, value: '-', style: 5 },
          { colNum: 6, value: '-', style: 5 },
          { colNum: 7, value: '-', style: 5 },
        ],
      });
      curRow++;
    } else {
      items.forEach((it, iIdx) => {
        const biaya = Number(it.biaya) || 0;
        totalBiaya += biaya;
        sheetRows.push({
          rowNum: curRow,
          cells: [
            { colNum: 1, value: iIdx + 1, style: 5 },
            { colNum: 2, value: formatTglIndo(it.tgl_pemeliharaan), style: 5 },
            { colNum: 3, value: it.jenis_pemeliharaan || '', style: 4 },
            { colNum: 4, value: biaya, style: 6 },
            { colNum: 5, value: it.nama_penyedia || '', style: 4 },
            { colNum: 6, value: it.bentuk_kontrak || '', style: 5 },
            { colNum: 7, value: it.keterangan || '', style: 4 },
          ],
        });
        curRow++;
      });
    }

    // Total Row
    sheetRows.push({
      rowNum: curRow,
      height: 20,
      cells: [
        { colNum: 1, value: 'JUMLAH', style: 9 },
        { colNum: 2, value: '', style: 9 },
        { colNum: 3, value: '', style: 9 },
        { colNum: 4, value: totalBiaya, style: 10 },
        { colNum: 5, value: '', style: 9 },
        { colNum: 6, value: '', style: 9 },
        { colNum: 7, value: '', style: 9 },
      ],
    });
    merges.push(`A${curRow}:C${curRow}`);
    curRow++;

    // Spacing before signature
    curRow++;

    // Signature Block
    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 2, value: 'Mengetahui,', style: 1 },
        { colNum: 6, value: `Waikabubak, ${tglToday}`, style: 1 },
      ],
    });
    curRow++;

    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 2, value: 'Pengguna Barang', style: 1 },
        { colNum: 6, value: 'Pejabat Penatausahaan Pengguna Barang', style: 1 },
      ],
    });
    curRow += 4;

    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 2, value: 'Charles Hermana Weru, S.Sos', style: 1 },
        { colNum: 6, value: 'Alexander R. M., SE', style: 1 },
      ],
    });
    curRow++;

    sheetRows.push({
      rowNum: curRow,
      cells: [
        { colNum: 2, value: 'NIP. 19721102 200112 1 001', style: 0 },
        { colNum: 6, value: 'NIP. 19780512 201001 1 008', style: 0 },
      ],
    });
    curRow += 3; // Gap between cards
  });

  const cols = [
    { width: 6 },
    { width: 22 },
    { width: 35 },
    { width: 25 },
    { width: 28 },
    { width: 20 },
    { width: 20 },
  ];

  return buildWorkbook([{
    name: 'KARTU PEMELIHARAAN',
    cols,
    rows: sheetRows,
    merges,
  }]);
}
