import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initAbsenRolesTable,
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignUserRole,
  DEFAULT_ROLES,
  PERMISSIONS_CATALOG,
} from './absen-roles-db.js';

test('DEFAULT_ROLES memuat 7 peran sistem dengan is_system = true', () => {
  const ids = DEFAULT_ROLES.map((r) => r.id);
  assert.deepEqual(ids, [
    'SUPERADMIN',
    'ADMIN',
    'KEPALA',
    'SEKRETARIS',
    'KABID',
    'BENDAHARA_BARANG',
    'USER',
  ]);
  for (const r of DEFAULT_ROLES) {
    assert.equal(r.is_system, true, `Role ${r.id} harus is_system = true`);
    assert.ok(Array.isArray(r.permissions), `Role ${r.id} harus memiliki permissions array`);
  }
  const superadmin = DEFAULT_ROLES.find((r) => r.id === 'SUPERADMIN');
  assert.deepEqual(superadmin.permissions, ['*']);
});

test('PERMISSIONS_CATALOG memuat 7 modul (presensi, keterangan, lembur, perjadin, aset, arsip, admin)', () => {
  const modules = PERMISSIONS_CATALOG.map((m) => m.module);
  assert.deepEqual(modules, [
    'presensi',
    'keterangan',
    'lembur',
    'perjadin',
    'aset',
    'arsip',
    'admin',
  ]);
  for (const mod of PERMISSIONS_CATALOG) {
    assert.ok(mod.name, `Modul ${mod.module} harus memiliki nama`);
    assert.ok(Array.isArray(mod.permissions) && mod.permissions.length > 0, `Modul ${mod.module} harus memuat permissions`);
    for (const p of mod.permissions) {
      assert.match(p.id, new RegExp(`^${mod.module}\\.`));
      assert.ok(p.name);
    }
  }
});

test('NON-COLLISION: query SQL absen-roles-db tidak pernah menyentuh sd_roles atau user_credentials', async () => {
  const executedSql = [];
  const mockPool = {
    query: async (text, params) => {
      executedSql.push({ text, params });
      return { rows: [] };
    },
  };

  await initAbsenRolesTable(mockPool);
  for (const { text } of executedSql) {
    assert.doesNotMatch(text, /sd_roles/i, 'Kritis: sd_roles (peta-ekonomi) tersentuh');
    assert.doesNotMatch(text, /user_credentials/i, 'Kritis: user_credentials tersentuh');
    assert.match(text, /absen_roles/i, 'Harus memakai tabel terisolasi absen_roles');
  }
});

test('initAbsenRolesTable membuat tabel absen_roles dan melakukan seed default roles', async () => {
  const executed = [];
  const mockPool = {
    query: async (text, params) => {
      executed.push({ text, params });
      return { rows: [] };
    },
  };

  const res = await initAbsenRolesTable(mockPool);
  assert.deepEqual(res, { ok: true });
  assert.ok(executed.length >= 8); // 1 create table + 7 default roles
  assert.match(executed[0].text, /CREATE TABLE IF NOT EXISTS absen_roles/);
  assert.match(executed[1].text, /INSERT INTO absen_roles/);
});

test('getRoles mengembalikan role beserta user_count dan permissions array', async () => {
  const mockRows = [
    {
      id: 'SUPERADMIN',
      nama: 'Superadmin',
      deskripsi: 'Semua Akses',
      is_system: true,
      permissions: JSON.stringify(['*']),
      created_at: new Date(),
      user_count: '2',
    },
    {
      id: 'OPERATOR',
      nama: 'Operator',
      deskripsi: 'Custom role',
      is_system: false,
      permissions: ['presensi.record'],
      created_at: new Date(),
      user_count: 0,
    },
  ];

  const mockPool = {
    query: async (text) => {
      assert.match(text, /FROM absen_roles r/);
      assert.match(text, /LEFT JOIN user_list u/);
      return { rows: mockRows };
    },
  };

  const roles = await getRoles(mockPool);
  assert.equal(roles.length, 2);
  assert.equal(roles[0].user_count, 2);
  assert.deepEqual(roles[0].permissions, ['*']);
  assert.equal(roles[1].user_count, 0);
  assert.deepEqual(roles[1].permissions, ['presensi.record']);
});

test('getRoleById mengembalikan role tunggal atau null jika tidak ada', async () => {
  const mockPool = {
    query: async (_text, params) => {
      if (params[0] === 'ADMIN') {
        return {
          rows: [
            {
              id: 'ADMIN',
              nama: 'Administrator',
              deskripsi: 'Admin OPD',
              is_system: true,
              permissions: '["admin.users"]',
              created_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const role = await getRoleById(mockPool, 'admin');
  assert.equal(role.id, 'ADMIN');
  assert.deepEqual(role.permissions, ['admin.users']);

  const notFound = await getRoleById(mockPool, 'NON_EXISTENT');
  assert.equal(notFound, null);
});

test('createRole membuat custom role dengan is_system = false', async () => {
  let insertParams = null;
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id')) return { rows: [] }; // belum ada
      if (text.includes('INSERT INTO absen_roles')) {
        insertParams = params;
        return {
          rows: [
            {
              id: params[0],
              nama: params[1],
              deskripsi: params[2],
              is_system: false,
              permissions: JSON.parse(params[3]),
              created_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const created = await createRole(mockPool, {
    id: 'auditor_aset',
    nama: 'Auditor Aset',
    deskripsi: 'Pemeriksa inventaris',
    permissions: ['aset.view'],
  });

  assert.equal(created.id, 'AUDITOR_ASET');
  assert.equal(created.nama, 'Auditor Aset');
  assert.equal(created.is_system, false);
  assert.deepEqual(created.permissions, ['aset.view']);
  assert.equal(insertParams[0], 'AUDITOR_ASET');
});

test('createRole menolak id tidak valid atau role yang sudah ada', async () => {
  const mockPool = {
    query: async (text) => {
      if (text.includes('SELECT id')) return { rows: [{ id: 'EXISTING' }] };
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => createRole(mockPool, { id: 'a', nama: 'Test' }),
    /ID role harus/
  );
  await assert.rejects(
    () => createRole(mockPool, { id: 'VALID_ID', nama: '' }),
    /Nama role wajib diisi/
  );
  await assert.rejects(
    () => createRole(mockPool, { id: 'EXISTING', nama: 'Existing' }),
    /sudah ada/
  );
});

test('updateRole memperbarui nama, deskripsi, dan permissions', async () => {
  let updatedParams = null;
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id')) {
        return {
          rows: [
            {
              id: 'AUDITOR',
              nama: 'Auditor Lama',
              deskripsi: 'Deskripsi Lama',
              is_system: false,
              permissions: ['aset.view'],
            },
          ],
        };
      }
      if (text.includes('UPDATE absen_roles')) {
        updatedParams = params;
        return {
          rows: [
            {
              id: 'AUDITOR',
              nama: params[0],
              deskripsi: params[1],
              is_system: false,
              permissions: JSON.parse(params[2]),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const updated = await updateRole(mockPool, 'AUDITOR', {
    nama: 'Auditor Baru',
    deskripsi: 'Deskripsi Baru',
    permissions: ['aset.view', 'aset.manage'],
  });

  assert.equal(updated.nama, 'Auditor Baru');
  assert.equal(updated.deskripsi, 'Deskripsi Baru');
  assert.deepEqual(updated.permissions, ['aset.view', 'aset.manage']);
  assert.equal(updatedParams[3], 'AUDITOR');
});

test('deleteRole menolak menghapus system role', async () => {
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id')) {
        return { rows: [{ id: params[0], is_system: true }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => deleteRole(mockPool, 'SUPERADMIN'),
    /Role sistem tidak dapat dihapus/
  );
});

test('deleteRole menolak menghapus role yang masih dipakai pegawai di user_list', async () => {
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id')) {
        return { rows: [{ id: params[0], is_system: false }] };
      }
      if (text.includes('SELECT COUNT')) {
        return { rows: [{ count: 3 }] }; // ada 3 user
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => deleteRole(mockPool, 'STAF_GUDANG'),
    /masih digunakan oleh 3 pegawai/
  );
});

test('deleteRole berhasil menghapus custom role yang tidak dipakai', async () => {
  let deletedId = null;
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id')) {
        return { rows: [{ id: params[0], is_system: false }] };
      }
      if (text.includes('SELECT COUNT')) {
        return { rows: [{ count: 0 }] };
      }
      if (text.includes('DELETE FROM absen_roles')) {
        deletedId = params[0];
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const res = await deleteRole(mockPool, 'UNUSED_ROLE');
  assert.deepEqual(res, { ok: true, id: 'UNUSED_ROLE' });
  assert.equal(deletedId, 'UNUSED_ROLE');
});

test('assignUserRole memperbarui role dan app_permissions pegawai', async () => {
  let updateParams = null;
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id') && text.includes('absen_roles')) {
        return { rows: [{ id: 'ADMIN' }] };
      }
      if (text.includes('SELECT id') && text.includes('user_list')) {
        return {
          rows: [
            {
              id: '42',
              nama: 'Ahmad Pegawai',
              nip: '198501012010011001',
              role: 'USER',
              is_admin: false,
              app_permissions: { absensi: { enabled: true, role: 'USER' } },
            },
          ],
        };
      }
      if (text.includes('UPDATE user_list')) {
        updateParams = params;
        return {
          rows: [
            {
              id: '42',
              nama: 'Ahmad Pegawai',
              nip: '198501012010011001',
              role: params[0],
              is_admin: params[2],
              app_permissions: JSON.parse(params[1]),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const assigned = await assignUserRole(mockPool, { userId: '42', roleId: 'ADMIN' });
  assert.equal(assigned.role, 'ADMIN');
  assert.equal(assigned.is_admin, true);
  assert.equal(updateParams[0], 'ADMIN');
  assert.deepEqual(JSON.parse(updateParams[1]), { absensi: { enabled: true, role: 'ADMIN' } });
  assert.equal(updateParams[2], true); // ADMIN -> media role -> is_admin = true
  assert.equal(updateParams[3], '42');
});

test('assignUserRole aman saat app_permissions kosong {} dan menurunkan is_admin saat downgrade ke USER', async () => {
  let updateParams = null;
  const mockPool = {
    query: async (text, params) => {
      if (text.includes('SELECT id') && text.includes('absen_roles')) return { rows: [{ id: 'USER' }] };
      if (text.includes('SELECT id') && text.includes('user_list')) {
        return { rows: [{ id: '42', nama: 'Ahmad', nip: '19850101', role: 'ADMIN', is_admin: true, app_permissions: {} }] };
      }
      if (text.includes('UPDATE user_list')) {
        updateParams = params;
        return { rows: [{ id: '42', role: params[0], is_admin: params[2], app_permissions: JSON.parse(params[1]) }] };
      }
      return { rows: [] };
    },
  };

  const assigned = await assignUserRole(mockPool, { userId: '42', roleId: 'USER' });
  assert.equal(assigned.role, 'USER');
  assert.equal(assigned.is_admin, false);
  assert.deepEqual(JSON.parse(updateParams[1]), { absensi: { enabled: true, role: 'USER' } });
  assert.equal(updateParams[2], false);
});
