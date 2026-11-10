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

test('_autoJenisLog: pada log add dan edit, jenis absen langsung otomatis ditentukan dari jam', () => {
  const auto = fnBody(adminLog, 'function _autoJenisLog', "['input', 'change']");
  assert.match(auto, /sel\.value = tot <= jm \? 'MASUK' : tot < 720 \? 'DI LUAR JAM MASUK' : tot < jp \? 'DI LUAR JAM PULANG' : 'PULANG';/);
  const open = fnBody(adminLog, 'async function openLogEditor', 'function closeLogEditor');
  assert.match(open, /_autoJenisLog\(\)/, 'openLogEditor memanggil _autoJenisLog saat jam terisi');
  assert.match(adminLog, /addEventListener\(evt, _autoJenisLog\)/, 'event listener input dan change terpasang untuk auto-jenis');
});

test('cache-buster admin-log & rekap ikut di-bump', () => {
  assert.match(html, /js\/admin-log\.js\?v=\d{8}[a-z]?/);
  assert.match(html, /js\/rekap\.js\?v=\d{8}[a-z]?/);
});

// Izin tambah/edit log = boolean user_list.is_admin, bukan role/IS_ADMIN.
test('gate frontend openLogEditor & saveLog pakai isLogAdmin (bukan role)', () => {
  assert.match(openLogEditor, /typeof isLogAdmin === 'function' && isLogAdmin\(\)/);
  assert.ok(!openLogEditor.includes('userProfile?.role?.toLowerCase().includes'),
    'openLogEditor tidak boleh menentukan admin dari role');
  assert.ok(!openLogEditor.includes('window.IS_ADMIN'),
    'openLogEditor tidak boleh fallback ke window.IS_ADMIN');
  assert.match(saveLog, /typeof isLogAdmin === 'function' && isLogAdmin\(\)/);
  assert.ok(!saveLog.includes('userProfile?.role?.toLowerCase().includes'),
    'saveLog tidak boleh menentukan admin dari role');
});

test('server /add & /edit gate is_admin, bukan MEDIA_ROLES', () => {
  assert.match(logSrv, /if \(req\.user\?\.is_admin !== true\)/);
  const addBody = logSrv.slice(logSrv.indexOf("router.post('/add'"), logSrv.indexOf("router.post('/edit'"));
  const editBody = logSrv.slice(logSrv.indexOf("router.post('/edit'"));
  assert.ok(!addBody.includes('MEDIA_ROLES.has'), '/add tidak boleh gate lewat role');
  assert.ok(!editBody.includes('MEDIA_ROLES.has'), '/edit tidak boleh gate lewat role');
  assert.match(logSrv, /const media = MEDIA_ROLES\.has/, 'GET tetap pakai MEDIA_ROLES');
});

test('helper isLogAdmin ada di state.js dan dipakai admin-mgmt/rekap', () => {
  const state = fs.readFileSync(path.join(ROOT, 'js', 'state.js'), 'utf8');
  const adminMgmt = fs.readFileSync(path.join(ROOT, 'js', 'admin-mgmt.js'), 'utf8');
  const rekap = fs.readFileSync(path.join(ROOT, 'js', 'rekap.js'), 'utf8');
  const wwwState = fs.readFileSync(path.join(ROOT, 'www', 'js', 'state.js'), 'utf8');
  assert.match(state, /function isLogAdmin\(\)/);
  assert.match(state, /window\.isLogAdmin = isLogAdmin/);
  assert.equal(wwwState, state, 'www/js/state.js mirror');
  assert.match(adminMgmt, /isLogAdmin\(\)/);
  assert.ok(!adminMgmt.includes('canAddLog = IS_ADMIN'), 'btnTambahLog bukan dari IS_ADMIN');
  assert.match(rekap, /typeof isLogAdmin === 'function' && isLogAdmin\(\)/);
  assert.ok(!rekap.includes("isAdminRaw = isSA || (window.userProfile?.role"),
    'tombol edit rekap tidak boleh dari role');
});

// Panel admin (.admin-only / tab admin / window.IS_ADMIN) = boolean user_list.is_admin.
test('setter window.IS_ADMIN (ui/admin-mgmt/profil) pakai isLogAdmin, bukan role/NIP', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');
  const adminMgmt = fs.readFileSync(path.join(ROOT, 'js', 'admin-mgmt.js'), 'utf8');
  const profil = fs.readFileSync(path.join(ROOT, 'js', 'profil.js'), 'utf8');

  const applyAdminVis = ui.slice(ui.indexOf('function applyAdminVisibility'),
    ui.indexOf('window.applyAdminVisibility'));
  assert.match(applyAdminVis, /typeof isLogAdmin === 'function' && isLogAdmin\(\)/);
  assert.ok(!applyAdminVis.includes('ADMIN_NIPS.includes'),
    'applyAdminVisibility tidak boleh dari ADMIN_NIPS');
  assert.ok(!applyAdminVis.includes("myRole === 'ADMIN'"),
    'applyAdminVisibility tidak boleh dari role');
  assert.ok(!applyAdminVis.includes('!!window.IS_ADMIN'),
    'applyAdminVisibility tidak boleh menahan flag lama');

  const jamBlock = adminMgmt.slice(adminMgmt.indexOf('// Update global IS_ADMIN'),
    adminMgmt.indexOf("localStorage.setItem('jam_absen_bapperida'"));
  assert.match(jamBlock, /window\.IS_ADMIN = typeof isLogAdmin === 'function' && isLogAdmin\(\);/);
  assert.ok(!jamBlock.includes('ADMIN_NIPS.includes'), 'loadJamAbsen tidak boleh dari ADMIN_NIPS');
  assert.ok(!jamBlock.includes("myRole === 'ADMIN'"), 'loadJamAbsen tidak boleh dari role');

  const profileBlock = profil.slice(profil.indexOf('// Recalculate IS_ADMIN'),
    profil.indexOf('// Jika status admin berubah'));
  assert.match(profileBlock, /window\.IS_ADMIN = typeof isLogAdmin === 'function' && isLogAdmin\(\);/);
  assert.ok(!profileBlock.includes('ADMIN_NIPS.includes'), 'applyProfile tidak boleh dari ADMIN_NIPS');
  assert.ok(!profileBlock.includes("myRole === 'ADMIN'"), 'applyProfile tidak boleh dari role');
});
