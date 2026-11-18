import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES, hasPermission, requirePermission } from './auth.js';
import { createAbsenRolesRouter } from './absen-roles.js';
import { PERMISSIONS_CATALOG } from './absen-roles-db.js';

const TOKEN = 'a'.repeat(192);

const ADMIN = {
  id: '7',
  nip: '198001012000011001',
  role: 'ADMIN',
  instansi_id: 'bapperida',
  is_admin: true,
};

const USER = {
  id: '42',
  nip: '199900000000001001',
  role: 'USER',
  instansi_id: 'bapperida',
  is_admin: false,
};

function setupHarness({ session = ADMIN, rolesState = [], usersState = [] } = {}) {
  const sql = [];
  const app = express();
  app.use(express.json());

  // In-memory state for testing
  let roles = rolesState.length > 0 ? [...rolesState] : [
    {
      id: 'SUPERADMIN',
      nama: 'Superadmin',
      deskripsi: 'Semua Akses',
      is_system: true,
      permissions: ['*'],
      user_count: 1,
    },
    {
      id: 'ADMIN',
      nama: 'Administrator',
      deskripsi: 'Admin OPD',
      is_system: true,
      permissions: ['presensi.view_all', 'admin.roles'],
      user_count: 1,
    },
    {
      id: 'USER',
      nama: 'Pegawai Standar',
      deskripsi: 'Pegawai Standar',
      is_system: true,
      permissions: ['presensi.view_own'],
      user_count: 5,
    },
  ];

  let users = usersState.length > 0 ? [...usersState] : [
    {
      id: '42',
      nama: 'Budi Pegawai',
      nip: '199900000000001001',
      role: 'USER',
      is_admin: false,
      app_permissions: { absensi: { enabled: true, role: 'USER' } },
    },
  ];

  const dbMock = {
    getRoles: async () => roles,
    getRoleById: async (_p, id) => roles.find((r) => r.id === String(id).toUpperCase()) || null,
    createRole: async (_p, { id, nama, deskripsi, permissions }) => {
      const cleanId = String(id).toUpperCase();
      if (!cleanId || cleanId.length < 2) throw new Error('ID role harus 2-50 karakter alfanumerik / underscore.');
      if (!nama) throw new Error('Nama role wajib diisi.');
      if (roles.some((r) => r.id === cleanId)) {
        const err = new Error(`Role dengan ID '${cleanId}' sudah ada.`);
        err.code = 'ROLE_EXISTS';
        throw err;
      }
      const newRole = {
        id: cleanId,
        nama,
        deskripsi: deskripsi || '',
        is_system: false,
        permissions: permissions || [],
        user_count: 0,
      };
      roles.push(newRole);
      return newRole;
    },
    updateRole: async (_p, id, { nama, deskripsi, permissions }) => {
      const cleanId = String(id).toUpperCase();
      const existing = roles.find((r) => r.id === cleanId);
      if (!existing) {
        const err = new Error(`Role '${cleanId}' tidak ditemukan.`);
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (nama !== undefined) {
        if (!nama.trim()) throw new Error('Nama role tidak boleh kosong.');
        existing.nama = nama.trim();
      }
      if (deskripsi !== undefined) existing.deskripsi = deskripsi;
      if (permissions !== undefined) existing.permissions = permissions;
      return existing;
    },
    deleteRole: async (_p, id) => {
      const cleanId = String(id).toUpperCase();
      const idx = roles.findIndex((r) => r.id === cleanId);
      if (idx === -1) {
        const err = new Error(`Role '${cleanId}' tidak ditemukan.`);
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (roles[idx].is_system) {
        const err = new Error('Role sistem tidak dapat dihapus.');
        err.code = 'SYSTEM_ROLE';
        throw err;
      }
      if (roles[idx].user_count > 0) {
        const err = new Error(`Role tidak dapat dihapus karena masih digunakan oleh ${roles[idx].user_count} pegawai.`);
        err.code = 'IN_USE';
        throw err;
      }
      roles.splice(idx, 1);
      return { ok: true, id: cleanId };
    },
    assignUserRole: async (_p, { userId, nip, roleId }) => {
      const cleanRoleId = String(roleId).toUpperCase();
      const role = roles.find((r) => r.id === cleanRoleId);
      if (!role) {
        const err = new Error(`Role '${cleanRoleId}' tidak ditemukan.`);
        err.code = 'NOT_FOUND';
        throw err;
      }
      const user = users.find((u) => u.id === String(userId) || u.nip === String(nip));
      if (!user) {
        const err = new Error('Pegawai tidak ditemukan.');
        err.code = 'NOT_FOUND';
        throw err;
      }
      user.role = cleanRoleId;
      user.is_admin = ['SUPERADMIN', 'ADMIN'].includes(cleanRoleId);
      user.app_permissions = {
        ...user.app_permissions,
        absensi: { ...(user.app_permissions?.absensi || {}), role: cleanRoleId },
      };
      return user;
    },
  };

  const rolesRouter = createAbsenRolesRouter(dbMock);
  app.use('/api/admin/roles', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }), rolesRouter);
  app.use('/api/absen-roles', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }), rolesRouter);

  return { app, sql, getRolesState: () => roles, getUsersState: () => users };
}

async function requestApi(app, method, path, body, token = TOKEN) {
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: json };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GET /api/admin/roles mengembalikan daftar roles dengan user_count', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'GET', '/api/admin/roles');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 3);
  assert.equal(res.body.data[0].id, 'SUPERADMIN');
  assert.equal(res.body.data[0].user_count, 1);
});

test('GET /api/admin/roles/permissions-list mengembalikan katalog perizinan lengkap', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'GET', '/api/admin/roles/permissions-list');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.data, PERMISSIONS_CATALOG);
});

test('GET /api/admin/roles/:id mengembalikan detail role atau 404', async () => {
  const h = setupHarness();
  const resOk = await requestApi(h.app, 'GET', '/api/admin/roles/ADMIN');
  assert.equal(resOk.status, 200);
  assert.equal(resOk.body.ok, true);
  assert.equal(resOk.body.data.id, 'ADMIN');

  const resNotFound = await requestApi(h.app, 'GET', '/api/admin/roles/UNKNOWN_ROLE');
  assert.equal(resNotFound.status, 404);
  assert.equal(resNotFound.body.ok, false);
});

test('POST /api/admin/roles membuat role custom baru', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'POST', '/api/admin/roles', {
    id: 'BENDAHARA_PENGELUARAN',
    nama: 'Bendahara Pengeluaran',
    deskripsi: 'Verifikasi keuangan dan SPPD',
    permissions: ['perjadin.view', 'perjadin.approve'],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.id, 'BENDAHARA_PENGELUARAN');
  assert.equal(res.body.data.is_system, false);

  // Duplikasi ditolak 409
  const resDup = await requestApi(h.app, 'POST', '/api/admin/roles', {
    id: 'BENDAHARA_PENGELUARAN',
    nama: 'Bendahara Pengeluaran',
  });
  assert.equal(resDup.status, 409);
  assert.equal(resDup.body.ok, false);
});

test('PUT /api/admin/roles/:id memperbarui role', async () => {
  const h = setupHarness();
  // Buat custom role dulu
  await requestApi(h.app, 'POST', '/api/admin/roles', {
    id: 'STAF_KHUSUS',
    nama: 'Staf Khusus',
    deskripsi: 'Deskripsi awal',
    permissions: ['presensi.view_own'],
  });

  const res = await requestApi(h.app, 'PUT', '/api/admin/roles/STAF_KHUSUS', {
    nama: 'Staf Ahli Khusus',
    deskripsi: 'Deskripsi baru',
    permissions: ['presensi.view_own', 'aset.view'],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.nama, 'Staf Ahli Khusus');
  assert.deepEqual(res.body.data.permissions, ['presensi.view_own', 'aset.view']);

  // Update role tak dikenal 404
  const resNotFound = await requestApi(h.app, 'PUT', '/api/admin/roles/TIDAK_ADA', {
    nama: 'Baru',
  });
  assert.equal(resNotFound.status, 404);
});

test('DELETE /api/admin/roles/:id menolak menghapus system role dengan 400', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'DELETE', '/api/admin/roles/SUPERADMIN');
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.message, /Role sistem tidak dapat dihapus/);
});

test('DELETE /api/admin/roles/:id menolak menghapus role yang masih memiliki user dengan 400', async () => {
  const h = setupHarness({
    rolesState: [
      { id: 'OPERATOR', nama: 'Operator', is_system: false, user_count: 2 },
    ],
  });
  const res = await requestApi(h.app, 'DELETE', '/api/admin/roles/OPERATOR');
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.message, /masih digunakan oleh 2 pegawai/);
});

test('DELETE /api/admin/roles/:id berhasil menghapus custom role kosong', async () => {
  const h = setupHarness({
    rolesState: [
      { id: 'UNUSED_ROLE', nama: 'Unused', is_system: false, user_count: 0 },
    ],
  });
  const res = await requestApi(h.app, 'DELETE', '/api/admin/roles/UNUSED_ROLE');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(h.getRolesState().length, 0);
});

test('POST /api/admin/roles/assign menetapkan role dan memperbarui app_permissions', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'POST', '/api/admin/roles/assign', {
    userId: '42',
    roleId: 'ADMIN',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.role, 'ADMIN');
  assert.equal(res.body.data.is_admin, true);
  assert.equal(res.body.data.app_permissions?.absensi?.role, 'ADMIN');
});

test('POST /api/admin/roles/assign menolak jika role tidak ditemukan', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'POST', '/api/admin/roles/assign', {
    userId: '42',
    roleId: 'ROLE_GAIB',
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
});

test('/api/absen-roles bekerja identik sebagai alias route', async () => {
  const h = setupHarness();
  const res = await requestApi(h.app, 'GET', '/api/absen-roles');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.length, 3);
});

test('RBAC: Pegawai biasa (USER) ditolak 403 saat mencoba memodifikasi role', async () => {
  const h = setupHarness({ session: USER });
  const postRes = await requestApi(h.app, 'POST', '/api/admin/roles', {
    id: 'HACKER_ROLE',
    nama: 'Hacker',
  });
  assert.equal(postRes.status, 403);
  assert.equal(postRes.body.ok, false);

  const putRes = await requestApi(h.app, 'PUT', '/api/admin/roles/USER', {
    nama: 'User Diubah',
  });
  assert.equal(putRes.status, 403);

  const deleteRes = await requestApi(h.app, 'DELETE', '/api/admin/roles/USER');
  assert.equal(deleteRes.status, 403);

  const assignRes = await requestApi(h.app, 'POST', '/api/admin/roles/assign', {
    userId: '42',
    roleId: 'SUPERADMIN',
  });
  assert.equal(assignRes.status, 403);
});

test('hasPermission memverifikasi wildcard dan module-level permissions', () => {
  assert.equal(hasPermission(['*'], 'anything'), true);
  assert.equal(hasPermission(['presensi.record'], 'presensi.record'), true);
  assert.equal(hasPermission(['presensi.*'], 'presensi.record'), true);
  assert.equal(hasPermission(['presensi.*'], 'presensi.view_own'), true);
  assert.equal(hasPermission(['presensi.*'], 'keterangan.view'), false);
  assert.equal(hasPermission(['presensi.record'], 'presensi.view_own'), false);
  assert.equal(hasPermission([], 'presensi.record'), false);
  assert.equal(hasPermission(null, 'presensi.record'), false);
});

test('requirePermission mengizinkan user dengan permission yang sesuai dan menolak yang tidak', async () => {
  const app = express();
  const mockQuery = async (text, params) => {
    if (params[0] === 'ADMIN') {
      return { rows: [{ permissions: ['admin.users', 'presensi.*'] }] };
    }
    return { rows: [{ permissions: ['presensi.view_own'] }] };
  };

  app.get('/test-admin', requirePermission('admin.users', {
    lookup: async () => ADMIN,
    query: mockQuery,
  }), (_req, res) => res.json({ ok: true, access: 'granted' }));

  app.get('/test-user', requirePermission('admin.users', {
    lookup: async () => USER,
    query: mockQuery,
  }), (_req, res) => res.json({ ok: true, access: 'granted' }));

  const resAdmin = await requestApi(app, 'GET', '/test-admin');
  assert.equal(resAdmin.status, 200);
  assert.equal(resAdmin.body.access, 'granted');

  const resUser = await requestApi(app, 'GET', '/test-user');
  assert.equal(resUser.status, 403);
  assert.equal(resUser.body.ok, false);
});

test('NON-COLLISION: sd_roles dan user_credentials TIDAK PERNAH disentuh di seluruh flow', () => {
  // Verifikasi statis bahwa file router dan db tidak memuat teks 'sd_roles'
  import('node:fs').then((fs) => {
    const rolesContent = fs.readFileSync('server/absen-roles.js', 'utf8');
    const dbContent = fs.readFileSync('server/absen-roles-db.js', 'utf8');
    assert.doesNotMatch(rolesContent, /sd_roles/i);
    assert.doesNotMatch(rolesContent, /user_credentials/i);
    assert.doesNotMatch(dbContent, /sd_roles/i);
    assert.doesNotMatch(dbContent, /user_credentials/i);
  });
});
