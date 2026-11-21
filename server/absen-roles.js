import express from 'express';
import {
  PERMISSIONS_CATALOG,
  initAbsenRolesTable as defaultInitAbsenRolesTable,
  getRoles as defaultGetRoles,
  getRoleById as defaultGetRoleById,
  createRole as defaultCreateRole,
  updateRole as defaultUpdateRole,
  deleteRole as defaultDeleteRole,
  assignUserRole as defaultAssignUserRole,
} from './absen-roles-db.js';

function fail(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

function ok(res, data = {}, message) {
  return res.json({ ok: true, ...(message ? { message } : {}), ...data });
}

export function createAbsenRolesRouter(deps = {}) {
  const router = express.Router();
  const pool = deps.pool || (deps.query ? { query: deps.query } : null);

  const getRoles = deps.getRoles || ((p) => defaultGetRoles(p || pool));
  const getRoleById = deps.getRoleById || ((p, id) => defaultGetRoleById(p || pool, id));
  const createRole = deps.createRole || ((p, r) => defaultCreateRole(p || pool, r));
  const updateRole = deps.updateRole || ((p, id, r) => defaultUpdateRole(p || pool, id, r));
  const deleteRole = deps.deleteRole || ((p, id) => defaultDeleteRole(p || pool, id));
  const assignUserRole = deps.assignUserRole || ((p, a) => defaultAssignUserRole(p || pool, a));

  function requireAdmin(req, res) {
    const role = String(req.user?.role || '').trim().toUpperCase();
    const isAdmin = role === 'SUPERADMIN' || role === 'ADMIN' || req.user?.is_admin === true;
    if (!isAdmin) {
      fail(res, 403, 'Forbidden: Hanya admin yang dapat mengelola role.');
      return false;
    }
    return true;
  }

  // 1. GET permissions catalog
  router.get('/permissions-list', (req, res) => {
    return ok(res, { data: PERMISSIONS_CATALOG });
  });

  // 2. GET all roles with user counts
  router.get('/', async (req, res) => {
    try {
      const roles = await getRoles(pool);
      return ok(res, { data: roles, rows: roles });
    } catch (e) {
      if (e && e.code === '42P01') {
        try {
          await defaultInitAbsenRolesTable(pool);
          const roles = await getRoles(pool);
          return ok(res, { data: roles, rows: roles });
        } catch (retryErr) {
          console.error('[absen-roles] auto-init getRoles error:', retryErr);
        }
      }
      console.error('[absen-roles] getRoles error:', e);
      return fail(res, 500, 'Gagal mengambil daftar role.');
    }
  });

  // 3. GET single role by id
  router.get('/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const role = await getRoleById(pool, id);
      if (!role) {
        return fail(res, 404, `Role '${id}' tidak ditemukan.`);
      }
      return ok(res, { data: role });
    } catch (e) {
      console.error('[absen-roles] getRoleById error:', e);
      return fail(res, 500, 'Gagal mengambil detail role.');
    }
  });

  // 4. POST create custom role
  router.post('/', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const b = req.body || {};
      const newRole = await createRole(pool, {
        id: b.id,
        nama: b.nama,
        deskripsi: b.deskripsi,
        permissions: b.permissions,
      });
      return res.status(201).json({
        ok: true,
        data: newRole,
        message: 'Role berhasil dibuat.',
      });
    } catch (e) {
      if (e.code === 'ROLE_EXISTS' || e.code === '23505') {
        return fail(res, 409, e.message || 'ID Role sudah digunakan.');
      }
      if (e.message && e.message.includes('wajib') || e.message.includes('karakter')) {
        return fail(res, 400, e.message);
      }
      console.error('[absen-roles] createRole error:', e);
      return fail(res, 500, 'Gagal membuat role baru.');
    }
  });

  // 5. PUT update custom role / permissions
  router.put('/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const id = req.params.id;
      const b = req.body || {};
      const updated = await updateRole(pool, id, {
        nama: b.nama,
        deskripsi: b.deskripsi,
        permissions: b.permissions,
      });
      return ok(res, { data: updated }, 'Role berhasil diperbarui.');
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        return fail(res, 404, e.message);
      }
      if (e.message && e.message.includes('kosong')) {
        return fail(res, 400, e.message);
      }
      console.error('[absen-roles] updateRole error:', e);
      return fail(res, 500, 'Gagal memperbarui role.');
    }
  });

  // 6. DELETE delete custom role
  router.delete('/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const id = req.params.id;
      await deleteRole(pool, id);
      return ok(res, {}, 'Role berhasil dihapus.');
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        return fail(res, 404, e.message);
      }
      if (e.code === 'SYSTEM_ROLE' || e.code === 'IN_USE') {
        return fail(res, 400, e.message);
      }
      console.error('[absen-roles] deleteRole error:', e);
      return fail(res, 500, 'Gagal menghapus role.');
    }
  });

  // 7. POST assign user to role
  router.post('/assign', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const b = req.body || {};
      const userId = b.userId || b.id;
      const nip = b.nip;
      const roleId = b.roleId || b.role;

      if (!roleId) {
        return fail(res, 400, 'roleId wajib diisi.');
      }
      if (!userId && !nip) {
        return fail(res, 400, 'userId atau nip wajib diisi.');
      }

      const updatedUser = await assignUserRole(pool, { userId, nip, roleId });
      return ok(res, { data: updatedUser }, 'Role pegawai berhasil diperbarui.');
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        return fail(res, 404, e.message);
      }
      if (e.message && e.message.includes('wajib')) {
        return fail(res, 400, e.message);
      }
      console.error('[absen-roles] assignUserRole error:', e);
      return fail(res, 500, 'Gagal menetapkan role pegawai.');
    }
  });

  return router;
}
