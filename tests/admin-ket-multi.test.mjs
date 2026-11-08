import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Input keterangan panel Admin Ops: dulu hanya 1 pegawai per submit.
// Sekarang multi-select (loop client-side): pill terpilih, validasi bukti 1x,
// upload bukti sekali lalu drive_link dipakai ulang, request_id unik per
// pegawai, laporan hasil parsial, refresh konfirmasi di akhir.

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const desktop = read('js/desktop.js');
const html = read('index.html');
const wwwDesktop = read('www/js/desktop.js');
const wwwHtml = read('www/index.html');

function fnBody(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i > -1, `penanda awal ada: ${startMarker}`);
  const j = src.indexOf(endMarker, i + startMarker.length);
  assert.ok(j > -1, `penanda akhir ada: ${endMarker}`);
  return src.slice(i, j);
}

const select = fnBody(desktop, 'function selectAdminKetPegawai', '// Sinkronkan hidden select');
const simpan = fnBody(desktop, 'async function adminSimpanKeterangan', 'function initSuperadminAdminKetScoping');

test('selection multi: toggle add/remove di _adminKetSelected', () => {
  assert.match(desktop, /let _adminKetSelected = \[\]/);
  assert.match(select, /_adminKetSelected\.findIndex/);
  assert.match(select, /_adminKetSelected\.splice\(idx, 1\)/, 'klik lagi = lepas');
  assert.match(select, /_adminKetSelected\.push\(\{ id, nama, nip \}\)/, 'klik = tambah');
  assert.match(select, /renderAdminKetPills\(\)/);
});

test('pill terpilih dirender & hidden select ikut tersinkron', () => {
  assert.match(desktop, /function renderAdminKetPills/);
  assert.match(desktop, /\$\('adminKetSelectedPills'\)/);
  assert.match(desktop, /class="pegawai-pill"/, 'pola pill sama dengan tugas_lembur');
  assert.match(desktop, /function syncAdminKetHiddenSelect/);
  // multi-select: dropdown TIDAK tertutup saat memilih
  assert.ok(!select.includes('toggleAdminKetDropdown(true)'), 'dropdown tetap terbuka');
});

test('submit: loop per pegawai dengan request_id unik per index', () => {
  assert.match(simpan, /for \(let i = 0; i < targets\.length; i\+\+\)/);
  assert.match(simpan, /request_id: `admin_ket_\$\{p\.nip \|\| p\.id\}_\$\{ts\}_\$\{i\}`/,
    'unik per pegawai — tanpa ini request kedua dianggap duplikat');
  assert.match(simpan, /const targets = _adminKetSelected\.slice\(\)/);
});

test('submit: bukti divalidasi SEBELUM loop (1x), lalu drive_link dipakai ulang', () => {
  const iVal = simpan.indexOf("jns.value === 'TUGAS' && !adaBukti");
  const iLoop = simpan.indexOf('for (let i = 0; i < targets.length; i++)');
  assert.ok(iVal > -1 && iLoop > -1 && iVal < iLoop, 'validasi bukti sebelum loop');
  assert.match(simpan, /payload\.drive_link = driveLink/, 'pegawai berikutnya reuse link');
  assert.match(simpan, /data\?\.data\?\.drive_link/, 'link diambil dari respons upload pertama');
  // setelah loop pertama sukses, base64 tidak dikirim ulang
  assert.match(simpan, /if \(driveLink\) \{[\s\S]*?payload\.drive_link = driveLink;[\s\S]*?\} else if \(_adminKetFileBase64\)/);
});

test('submit: hasil parsial + refresh konfirmasi di akhir loop', () => {
  assert.match(simpan, /const sukses = results\.filter\(r => r\.ok\)/);
  assert.match(simpan, /const gagal = results\.filter\(r => !r\.ok\)/);
  assert.match(simpan, /Tersimpan Sebagian/, 'ada pesan untuk kasus parsial');
  // yang gagal tetap terpilih agar bisa diulang
  assert.match(simpan, /_adminKetSelected = _adminKetSelected\.filter\(p => gagalIds\.has\(String\(p\.id\)\)\)/);
  assert.ok(simpan.indexOf('loadKonfirmasiAdmin') > -1, 'refresh konfirmasi dipanggil setelah loop');
});

test('index.html: pill container + label multi + select multiple (root + www)', () => {
  for (const h of [html, wwwHtml]) {
    assert.match(h, /id="adminKetSelectedPills"/);
    assert.match(h, /boleh pilih lebih dari 1/);
    assert.match(h, /<select id="adminKetPegawai" style="display:none" multiple>/);
  }
});

test('mirror: www/js/desktop.js identik dengan versi root', () => {
  assert.equal(wwwDesktop, desktop);
});
