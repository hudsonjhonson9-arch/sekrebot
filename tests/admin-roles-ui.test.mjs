import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const wwwIndexHtml = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
const adminRolesJs = fs.readFileSync(path.join(ROOT, 'js/admin-roles.js'), 'utf8');
const wwwAdminRolesJs = fs.readFileSync(path.join(ROOT, 'www/js/admin-roles.js'), 'utf8');
const uiJs = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const wwwUiJs = fs.readFileSync(path.join(ROOT, 'www/js/ui.js'), 'utf8');

test('index.html dan www/index.html tersinkronisasi 100% identik', () => {
  assert.equal(indexHtml, wwwIndexHtml, 'index.html dan www/index.html harus identik tanpa selisih');
});

test('js/admin-roles.js dan www/js/admin-roles.js tersinkronisasi 100% identik', () => {
  assert.equal(adminRolesJs, wwwAdminRolesJs, 'js/admin-roles.js dan www/js/admin-roles.js harus identik');
});

test('js/ui.js dan www/js/ui.js tersinkronisasi 100% identik', () => {
  assert.equal(uiJs, wwwUiJs, 'js/ui.js dan www/js/ui.js harus identik');
});

test('Menu card roles dengan data-admin-card="roles" terpasang di index.html & www/index.html', () => {
  for (const [name, content] of [['index.html', indexHtml], ['www/index.html', wwwIndexHtml]]) {
    assert.ok(content.includes('data-admin-card="roles"'), `${name} harus memuat data-admin-card="roles"`);
    assert.ok(content.includes("openAdminCard('roles')"), `${name} harus memanggil openAdminCard('roles')`);
    assert.ok(content.includes('Kelola Role & Hak Akses') || content.includes('Kelola Role &amp; Hak Akses'), `${name} harus memuat judul Kelola Role & Hak Akses`);
    assert.ok(content.includes('fa-shield-alt'), `${name} harus menggunakan ikon RuneIcon fa-shield-alt`);
  }
});

test('Container #adminRolesCard, #rolesMgmtList, #roleEditForm, #roleAssignModal ada di index.html & www', () => {
  for (const [name, content] of [['index.html', indexHtml], ['www/index.html', wwwIndexHtml]]) {
    assert.ok(content.includes('id="adminRolesCard"'), `${name} harus memuat #adminRolesCard`);
    assert.ok(content.includes('id="rolesMgmtList"'), `${name} harus memuat #rolesMgmtList`);
    assert.ok(content.includes('id="roleEditForm"'), `${name} harus memuat #roleEditForm`);
    assert.ok(content.includes('id="roleAssignModal"'), `${name} harus memuat #roleAssignModal`);
  }
});

test('Field input dan tombol form role management lengkap di index.html & www', () => {
  const requiredElements = [
    'id="btnTambahRole"',
    'id="btnAssignRole"',
    'id="btnRefreshRoles"',
    'id="roleInputId"',
    'id="roleInputNama"',
    'id="roleInputDesc"',
    'id="btnSaveRole"',
    'id="btnCancelRole"',
    'id="assignSelectPegawai"',
    'id="assignSelectRole"',
    'id="btnSaveAssignRole"',
    'id="btnCancelAssignRole"',
  ];

  for (const [name, content] of [['index.html', indexHtml], ['www/index.html', wwwIndexHtml]]) {
    for (const elId of requiredElements) {
      assert.ok(content.includes(elId), `${name} harus memuat elemen ${elId}`);
    }
  }
});

test('Script js/admin-roles.js dimuat di index.html & www/index.html', () => {
  for (const [name, content] of [['index.html', indexHtml], ['www/index.html', wwwIndexHtml]]) {
    assert.match(content, /<script\s+src="js\/admin-roles\.js(\?v=[^"]+)?"\s*><\/script>/, `${name} harus memuat tag script js/admin-roles.js`);
  }
});

test('window.openAdminCard memetakan cardKey "roles" ke section "user" dan target "adminRolesCard"', () => {
  for (const [name, content] of [['index.html', indexHtml], ['js/ui.js', uiJs]]) {
    assert.match(
      content,
      /'roles':\s*\{\s*section:\s*'user',\s*group:\s*'Manajemen Kepegawaian',\s*title:\s*'Kelola Role & Hak Akses',\s*target:\s*'adminRolesCard'\s*\}/,
      `${name} harus mendaftarkan card roles dengan benar di openAdminCard`
    );
  }
});

function loadAdminRoles(customDoc = null, customWin = {}) {
  const doc = customDoc || { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} };
  const win = { document: doc, ...customWin };
  new Function('window', 'document', adminRolesJs)(win, doc);
  return win;
}

test('js/admin-roles.js mendefinisikan dan mengekspor seluruh fungsi wewenang yang diwajibkan', () => {
  const win = loadAdminRoles();
  const exported = win.ADMIN_ROLES || win;

  const requiredFns = [
    'loadRolesList',
    'openRoleForm',
    'closeRoleForm',
    'saveRole',
    'deleteRole',
    'openAssignModal',
    'closeAssignModal',
    'saveAssignRole',
    'renderPermissionsMatrix',
    'toggleAllPermissions',
    'toggleModulePermissions',
  ];

  for (const fn of requiredFns) {
    assert.equal(typeof exported[fn], 'function', `js/admin-roles.js harus mendefinisikan fungsi ${fn}`);
  }
});

test('Anti-slop rules: penggunaan tabular-nums dan bebas emoji mentah di markup & JS role', () => {
  // 1. Cek tidak ada emoji mentah di adminRolesCard markup
  const rolesCardMatch = indexHtml.match(/id="adminRolesCard"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(rolesCardMatch, 'Harus menemukan blok markup adminRolesCard');
  const cardMarkup = rolesCardMatch[0];
  const rawEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(rawEmojiRegex.test(cardMarkup), false, 'Tidak boleh ada emoji mentah di markup adminRolesCard');

  // 2. Cek tidak ada emoji mentah di js/admin-roles.js
  assert.equal(rawEmojiRegex.test(adminRolesJs), false, 'Tidak boleh ada emoji mentah di js/admin-roles.js');

  // 3. Tabular numbers dipasang pada counter
  assert.ok(indexHtml.includes('tabular-nums'), 'Markup harus menerapkan styling tabular-nums untuk angka');
  assert.ok(adminRolesJs.includes('tabular-nums'), 'JS harus menerapkan styling tabular-nums untuk angka');
});

test('Validasi saveRole menolak id dan nama kosong', async () => {
  let alertMsg = '';
  const docMock = {
    getElementById: (id) => {
      if (id === 'roleInputId') return { value: '' };
      if (id === 'roleInputNama') return { value: '' };
      if (id === 'roleInputDesc') return { value: '' };
      if (id === 'roleEditMode') return { value: 'create' };
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const win = loadAdminRoles(docMock, {
    alert: (msg) => { alertMsg = msg; },
  });

  await win.saveRole();
  assert.match(alertMsg, /Kode Role wajib diisi/i, 'Harus memvalidasi Kode Role wajib diisi');
});
