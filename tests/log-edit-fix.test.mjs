import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Bug edit log:
//   A — inLogTanggal diisi `_dari` (awal periode) → UPDATE memindahkan log.
//   B — dropdown #inLogJenis tanpa opsi DL/TB/TANPA BERITA/ALPA/PULANG LUAR
//       → select.value jadi '' → server 400 PESAN_TIDAK_LENGKAP.
//   C — pegawai bisa "diganti" saat edit padahal server mengabaikannya.
//   D — hari TANPA BERITA tidak punya tombol edit (hanya "+") → admin menambah
//       log baru alih-alih mengedit yang sudah ada.

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const adminLog = read('js/admin-log.js');
const rekap = read('js/rekap.js');
const html = read('index.html');
const wwwHtml = read('www/index.html');
const wwwAdminLog = read('www/js/admin-log.js');
const wwwRekap = read('www/js/rekap.js');

function fnBody(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i > -1, `penanda awal ada: ${startMarker}`);
  const j = src.indexOf(endMarker, i + startMarker.length);
  assert.ok(j > -1, `penanda akhir ada: ${endMarker}`);
  return src.slice(i, j);
}

const open = fnBody(adminLog, 'async function openLogEditor', 'function closeLogEditor');

test('Bug A: tanggal edit diambil dari baris log (log.Tanggal), bukan _dari periode', () => {
  assert.match(open, /const tglLog = log \? String\(log\.Tanggal \|\| log\.tanggal \|\| ''\)\.slice\(0, 10\) : '';/);
  assert.match(open, /\$\('inLogTanggal'\)\.value = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(tglLog\)/,
    'validasi YYYY-MM-DD dari log, fallback ke date');
  assert.ok(!open.includes("$('inLogTanggal').value = date || fmtD(nowWITA());"),
    'jangan pakai _dari sebagai nilai utama saat edit');
});

test('Bug B: jenis dari log yang tak ada di dropdown tetap jadi opsi (ensure-option)', () => {
  assert.match(open, /selJenis\.appendChild\(optJenis\)/, 'opsi dibuat dinamis');
  assert.match(open, /document\.createElement\('option'\)/);
  assert.match(open, /selJenis\.value = jenisVal \|\| 'MASUK'/);
});

test('Bug C: pegawai dikunci saat mode edit (subjek tak bisa diganti)', () => {
  assert.match(open, /ddInput\.disabled = !!existingId/);
  assert.match(open, /\$\('inLogPegawaiDd'\)/, 'wrapper dropdown searchable ikut dikunci');
  assert.match(open, /ddWrap\.style\.pointerEvents = existingId \? 'none' : ''/);
});

function jenisOptions(h) {
  const m = h.match(/<select id="inLogJenis"[\s\S]*?<\/select>/);
  assert.ok(m, 'select #inLogJenis ada');
  return [...m[0].matchAll(/<option value="([^"]+)"/g)].map((x) => x[1]);
}

test('Bug B: index.html punya opsi DL, TB, TANPA BERITA, ALPA, PULANG LUAR (root + www)', () => {
  for (const h of [html, wwwHtml]) {
    const opts = jenisOptions(h);
    for (const j of ['DL', 'TB', 'TANPA BERITA', 'ALPA', 'PULANG LUAR']) {
      assert.ok(opts.includes(j), `opsi ${j} ada (ada: ${opts.join(', ')})`);
    }
  }
});

test('Bug D: kartu ket juga dirender untuk hari alpa yang punya _rawKetLog', () => {
  assert.match(rekap, /\$\{\(isKet \|\| \(isAlpa && p\._rawKetLog\)\) \? `/,
    'hari TANPA BERITA/TB masuk cabang ket → tombol edit muncul');
  // tombol edit _rawKetLog tetap di dalam cabang ket
  const ketBranch = rekap.slice(rekap.indexOf('${(isKet || (isAlpa && p._rawKetLog)) ?'));
  assert.match(ketBranch, /openLogEditor\('\$\{p\.id\}', '\$\{_dari\}', \$\{JSON\.stringify\(p\._rawKetLog\)/);
});

test('mirror: www/js/admin-log.js & www/js/rekap.js identik dengan versi root', () => {
  assert.equal(wwwAdminLog, adminLog);
  assert.equal(wwwRekap, rekap);
});

test('cache-buster admin-log, rekap & desktop ikut di-bump di kedua index.html', () => {
  for (const h of [html, wwwHtml]) {
    assert.match(h, /js\/admin-log\.js\?v=20261108/);
    assert.match(h, /js\/rekap\.js\?v=20261108/);
    assert.match(h, /js\/desktop\.js\?v=9996/);
    assert.match(h, /css\/styles\.css\?v=20261112b/);
    assert.match(h, /js\/state\.js\?v=(?:20261108|20261111a)/);
    assert.match(h, /js\/profil\.js\?v=20261109/);
    assert.match(h, /js\/admin-mgmt\.js\?v=5/);
    assert.match(h, /js\/ui\.js\?v=20261109/);
  }
});
