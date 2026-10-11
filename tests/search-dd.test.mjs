import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const helpers = fs.readFileSync(path.join(ROOT, 'js/helpers.js'), 'utf8');
const rekap = fs.readFileSync(path.join(ROOT, 'js/rekap.js'), 'utf8');
const adminLog = fs.readFileSync(path.join(ROOT, 'js/admin-log.js'), 'utf8');
const constants = fs.readFileSync(path.join(ROOT, 'js/constants.js'), 'utf8');

// helpers.js: window + document stub (cukup untuk fungsi dropdown saja).
globalThis.document = { getElementById: () => null, addEventListener: () => {} };
const win = {};
new Function('window', 'document', helpers)(win, globalThis.document);

const FAKE_SEL = {
  value: 'b',
  selectedIndex: 2,
  options: [
    { value: '', text: '— Pilih —' },
    { value: 'a', text: 'Alpha' },
    { value: 'b', text: 'Beta <img src=x>' },
    { value: 'c', text: 'gamma' }
  ]
};

test('helpers.js punya makeSearchDd generik + dispatch change ke select tersembunyi', () => {
  assert.match(helpers, /function makeSearchDd\(/);
  assert.match(helpers, /function syncSearchDdLabel\(/);
  assert.match(helpers, /sel\.dispatchEvent\(new Event\('change'\)\)/, 'pick harus men-trigger onchange inline lama');
  assert.match(helpers, /sel\.style\.display = 'none'/, 'select asli disembunyikan, bukan dihapus');
  assert.match(helpers, /dataset\.ddReady/, 'guard double-init');
});

test('rekap.js memasang makeSearchDd pada ketiga filter + sync label', () => {
  assert.match(rekap, /makeSearchDd\('rekapInstansiSelect', \{ ph: 'Pilih instansi', h: 38 \}\)/);
  assert.match(rekap, /makeSearchDd\('rekapRoleFilter', \{ ph: 'Pilih role', h: 38 \}\)/);
  assert.match(rekap, /makeSearchDd\('rekapBidang', \{ ph: 'Semua bidang', h: 38 \}\)/);
  assert.match(rekap, /syncSearchDdLabel\('rekapBidang'\)/, 'label sinkron saat loadRekap menulis ulang opsi');
  assert.match(rekap, /syncSearchDdLabel\('rekapInstansiSelect'\)/, 'label sinkron saat scoping pre-select');
});

test('select native tetap ada sebagai value source, onchange inline utuh', () => {
  const inst = html.slice(html.indexOf('id="rekapInstansiSelect"'), html.indexOf('id="rekapInstansiSelect"') + 250);
  assert.match(inst, /onchange="onRekapInstansiChange\(\)"/);
  const role = html.slice(html.indexOf('id="rekapRoleFilter"'), html.indexOf('id="rekapRoleFilter"') + 250);
  assert.match(role, /onchange="loadRekap\(\)"/);
  const bid = html.slice(html.indexOf('id="rekapBidang"'), html.indexOf('id="rekapBidang"') + 250);
  assert.match(bid, /onchange="renderRekap\(lastRekapPegawai\)"/);
  assert.match(html, /id="inLogPegawai" class="form-input"/);
});

test('admin-log: dropdown inLogPegawai + race fix value di-set ulang setelah list load', () => {
  assert.match(adminLog, /makeSearchDd\('inLogPegawai', \{ ph: '— Pilih Pegawai —' \}\)/);
  assert.match(adminLog, /loadLogPegawaiList\(\)\.then\(function \(\) \{\s*if \(uid\) \$\('inLogPegawai'\)\.value = uid;/,
    'value harus di-set SETELAH opsi terisi, bukan sebelum');
  assert.match(adminLog, /syncSearchDdLabel\('inLogPegawai'\)/);
});

test('constants.js sinkronkan label rekapBidang setelah loadBidangList menulis ulang', () => {
  assert.match(constants, /syncSearchDdLabel\('rekapBidang'\)/);
});

test('label & filter dropdown runtime: rebuild dari opsi select, escape, selected', () => {
  globalThis.document.getElementById = (id) => (id === 'selX' ? FAKE_SEL : null);
  // open: semua opsi tampil, yang currentValue diberi .selected
  const all = win._ddItemsHtml('selX', '');
  assert.equal((all.match(/class="dropdown-item/g) || []).length, 4);
  assert.match(all, /dropdown-item selected[^>]*data-v="b"/);
  // filter case-insensitive
  assert.equal((win._ddItemsHtml('selX', 'ALP').match(/class="dropdown-item/g) || []).length, 1);
  assert.match(win._ddItemsHtml('selX', 'alp'), /Alpha/);
  // tidak ditemukan
  assert.match(win._ddItemsHtml('selX', 'zzz'), /Tidak ditemukan/);
  // escape markup dari option text
  assert.doesNotMatch(win._ddItemsHtml('selX', ''), /<img src=x>/);
  assert.match(win._ddItemsHtml('selX', ''), /&lt;img src=x&gt;/);
});

test('syncSearchDdLabel mengembalikan teks opsi terpilih ke input trigger', () => {
  const input = { value: '' };
  const wrap = { querySelector: () => input };
  globalThis.document.getElementById = (id) => {
    if (id === 'selY') return FAKE_SEL;
    if (id === 'selYDd') return wrap;
    return null;
  };
  win.syncSearchDdLabel('selY');
  assert.equal(input.value, 'Beta <img src=x>', 'label = text opsi terpilih (tanpa escape, ini value DOM)');
});

test('loadBidangList memakai guard typeof — aman dipanggil sebelum helpers load', () => {
  // helpers.js (3099) load SEBELUM constants.js? Tidak — constants (3087) sebelum helpers (3099),
  // jadi guard typeof wajib ada.
  assert.match(constants, /if \(typeof syncSearchDdLabel === 'function'\) syncSearchDdLabel\('rekapBidang'\)/);
});
