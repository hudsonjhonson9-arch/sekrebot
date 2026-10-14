import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Form log (tambah/edit) dulu menebak ID_Log dari cache rekap: tombol "tambah
// pulang" bisa mengarah ke log MASUK/keterangan terakhir dan menimpanya.
// Sekarang: ID_Log hanya datang dari baris yang benar-benar diedit; penambahan
// mengandalkan upsert server per (pegawai, tanggal, jenis) yang exact-match.

const ROOT = path.resolve(import.meta.dirname, '..');
const adminLog = fs.readFileSync(path.join(ROOT, 'js', 'admin-log.js'), 'utf8');
const rekap = fs.readFileSync(path.join(ROOT, 'js', 'rekap.js'), 'utf8');
const logSrv = fs.readFileSync(path.join(ROOT, 'server', 'log.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function fnBody(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i > -1, `penanda awal ada: ${startMarker}`);
  const j = src.indexOf(endMarker, i + startMarker.length);
  assert.ok(j > -1, `penanda akhir ada: ${endMarker}`);
  return src.slice(i, j);
}

const openLogEditor = fnBody(adminLog, 'async function openLogEditor', 'function closeLogEditor');
// saveLog adalah fungsi terakhir di berkas — sisanya sampai EOF.
const saveLog = adminLog.slice(adminLog.indexOf('async function saveLog'));

test('openLogEditor: ID_Log hanya dari baris log yang diedit, bukan tebakan cache', () => {
  assert.match(openLogEditor, /const existingId = log \? getLogId\(log\) : '';/);
  assert.ok(!openLogEditor.includes('_rawMasukLog'), 'jangan intip cache _rawMasukLog');
  assert.ok(!openLogEditor.includes('_rawPulangLog'), 'jangan intip cache _rawPulangLog');
  assert.ok(!openLogEditor.includes('_rawKetLog'), 'jangan intip cache _rawKetLog');
  assert.ok(!openLogEditor.includes('apiGet(P.log'), 'jangan auto-edit lewat fetch log harian');
  assert.ok(!openLogEditor.includes('ID_Log terbesar'), 'jangan pilih log terbaru hari itu sebagai target');
});

test('saveLog: tanpa smart-detection _raw*Log; pesan sukses ikut d.updated server', () => {
  assert.ok(!saveLog.includes('_rawMasukLog'), 'saveLog tidak menebak dari cache masuk');
  assert.ok(!saveLog.includes('_rawPulangLog'), 'saveLog tidak menebak dari cache pulang');
  assert.ok(!saveLog.includes('Switching to EDIT mode'), 'log auto-switch mode edit dihapus');
  assert.match(saveLog, /d\.updated \|\| isEdit/, 'respons /add (updated:true) dipakai untuk pesan diperbarui');
});

test('rekap: tombol Edit hanya menarget log jenis itu sendiri, bukan jatuh ke log keterangan', () => {
  assert.ok(!rekap.includes('_rawMasukLog || p._rawKetLog'), 'edit masuk tidak jatuh ke log keterangan');
  assert.ok(!rekap.includes('_rawPulangLog || p._rawKetLog'), 'edit pulang tidak jatuh ke log keterangan');
  assert.match(rekap, /p\._rawMasukLog \? `/);
  assert.match(rekap, /p\._rawPulangLog \? `/);
});

test('server /add: upsert exact (pegawai+tanggal+jenis), bukan fuzzy', () => {
  const resolve = fnBody(logSrv, 'async function resolveExistingLogId', 'router.get');
  assert.match(resolve, /"Jenis Absen"=\$3/, 'match jenis exact, bukan LIKE/includes');
  assert.match(logSrv, /UPDATE "Log_Absen" SET "Tanggal"=\$1, "Jam"=\$2, "Jenis Absen"=\$3, "Ket"=\$4\s*\n\s*WHERE "ID_Log" = \$5/);
});

test('_autoJenisLog: jenis eksplisit (hint tombol / pilihan admin) tidak boleh ditimpa auto', () => {
  const auto = fnBody(adminLog, 'function _autoJenisLog', "document.getElementById('inLogJam')");
  assert.match(auto, /if \(_logJenisDisentuh\) return;/, 'guard flag eksplisit di baris pertama');
  const open = fnBody(adminLog, 'async function openLogEditor', 'function closeLogEditor');
  assert.match(open, /_logJenisDisentuh = !!\(log \|\| hintJenis\);/, 'edit & tambah-dengan-hint menandai jenis eksplisit');
  assert.match(adminLog, /getElementById\('inLogJenis'\)\?\.addEventListener\('change', function \(\) \{ _logJenisDisentuh = true; \}\)/,
    'pilihan manual admin menandai jenis eksplisit');
});

test('cache-buster admin-log & rekap ikut di-bump', () => {
  assert.match(html, /js\/admin-log\.js\?v=\d{8}[a-z]?/);
  assert.match(html, /js\/rekap\.js\?v=\d{8}[a-z]?/);
});
