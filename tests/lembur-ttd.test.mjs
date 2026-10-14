import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'tugas_lembur.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function fnBody(name) {
  const start = src.indexOf('window.' + name + ' =');
  assert.ok(start >= 0, name + ' harus ada di js/tugas_lembur.js');
  const next = src.indexOf('\nwindow.', start + 1);
  return src.slice(start, next > 0 ? next : start + 20000);
}

test('rekap lembur: hasil valid = ada lembur nyata (menit > 0, tanpa keterangan)', () => {
  const body = fnBody('generateLemburPDF');
  assert.match(body, /const hasValidLembur = Object\.values\(groups\)\.some/,
    'flag hasValidLembur harus dihitung dari data rekap');
  assert.match(body, /!d\.ket && \(d\.mins \|\| 0\) > 0/,
    'kriteria valid: tanpa keterangan dan menit lembur > 0');
});

test('rekap lembur: TTD sel tabel hanya digambar untuk sel valid', () => {
  const body = fnBody('generateLemburPDF');
  assert.match(body, /if \(!val \|\| val\.ket \|\| !\(val\.mins > 0\)\) return/,
    'didDrawCell skip sel tanpa keterangan DAN sel tanpa lembur (mins <= 0)');
});

test('rekap lembur: footer Mengetahui diberi gambar TTD Kepala jika hasil valid', () => {
  const body = fnBody('generateLemburPDF');
  assert.match(body, /kabanSig/, 'lookup ttd kepala dari nipSigMap/sigMap');
  assert.match(body, /if \(hasValidLembur && kabanSig\)/,
    'gambar TTD hanya saat hasil rekap valid dan ttd tersedia');
  assert.match(body, /doc\.addImage\(kabanSig, kbFmt, signatureX - 15, footerY \+ 14, 30, 15/,
    'gambar ttd diposisikan di blok tanda tangan (30x15mm, seperti rekap absensi)');
});

test('cache-buster tugas_lembur.js di-bump di index.html', () => {
  assert.match(html, /js\/tugas_lembur\.js\?v=\d{8}[a-z]?/,
    'index.html harus memuat tugas_lembur.js dengan ?v= tanggal');
});
