import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const extSrc = fs.readFileSync(path.join(ROOT, 'js', 'simapo-ext.js'), 'utf8');

// Ambil isi fungsi: dari `window.<name> =` sampai assignment berikutnya.
function fnBody(name) {
  const start = extSrc.indexOf('window.' + name + ' =');
  assert.ok(start >= 0, name + ' harus ada di js/simapo-ext.js');
  const next = extSrc.indexOf('\nwindow.', start + 1);
  return extSrc.slice(start, next > 0 ? next : start + 8000);
}

test('daftar aset (layar master) selalu menampilkan Tahun Aset', () => {
  const body = fnBody('renderAdminSimapoMaster');
  assert.match(body, /Tahun \$\{u\.tahunperolehan \|\| '—'\}/, 'chip Tahun wajib tampil, fallback —');
  assert.doesNotMatch(body, /tahunperolehan \? ' · ' \+ u\.tahunperolehan/,
    'tahun tidak boleh disembunyikan lagi saat null');
});

test('export Excel "Daftar Aset" punya kolom Tahun Aset sebelum QR Code', () => {
  const body = fnBody('simapoMasterExportExcel');
  assert.match(body, /'No', 'Nama Aset', 'Kode Barang', 'No\. Inventaris', 'Tahun Aset', 'QR Code'/);
  assert.match(body, /row\.getCell\(5\)\.value = u\.tahunperolehan \|\| '-'/);
  assert.match(body, /ws\.mergeCells\('A1:F1'\)/, 'judul melebar ke kolom F');
  assert.match(body, /tl: \{ col: 5\.1,/, 'gambar QR pindah ke kolom 6 (ExcelJS 0-based)');
  assert.match(body, /key: 'tahun', width: 12/);
});
