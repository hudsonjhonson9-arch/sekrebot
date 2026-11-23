import { query as defaultQuery } from './db.js';

export const PERMISSIONS_CATALOG = [
  {
    module: 'presensi',
    name: 'Presensi',
    permissions: [
      { id: 'presensi.view_own', name: 'Lihat Presensi Sendiri', description: 'Melihat riwayat presensi pribadi' },
      { id: 'presensi.view_all', name: 'Lihat Presensi Semua Pegawai', description: 'Melihat rekap & log presensi seluruh pegawai' },
      { id: 'presensi.record', name: 'Catat Presensi', description: 'Melakukan check-in dan check-out presensi' },
      { id: 'presensi.manual_entry', name: 'Input Presensi Manual', description: 'Menambah atau mengoreksi log presensi manual' },
    ],
  },
  {
    module: 'keterangan',
    name: 'Keterangan & Izin',
    permissions: [
      { id: 'keterangan.view', name: 'Lihat Keterangan', description: 'Melihat daftar pengajuan keterangan/izin' },
      { id: 'keterangan.create', name: 'Ajukan Keterangan', description: 'Mengajukan surat keterangan/izin/sakit' },
      { id: 'keterangan.approve', name: 'Persetujuan Keterangan', description: 'Menyetujui atau menolak pengajuan keterangan' },
    ],
  },
  {
    module: 'lembur',
    name: 'Lembur',
    permissions: [
      { id: 'lembur.view', name: 'Lihat Lembur', description: 'Melihat pengajuan dan riwayat lembur' },
      { id: 'lembur.create', name: 'Ajukan Lembur', description: 'Membuat surat perintah atau pengajuan lembur' },
      { id: 'lembur.verify', name: 'Verifikasi Lembur', description: 'Memverifikasi pengajuan lembur tingkat bidang/bagian' },
      { id: 'lembur.approve', name: 'Persetujuan Lembur', description: 'Menyetujui pengajuan lembur akhir' },
    ],
  },
  {
    module: 'perjadin',
    name: 'Perjalanan Dinas (SPPD)',
    permissions: [
      { id: 'perjadin.view', name: 'Lihat SPT/SPPD', description: 'Melihat daftar surat tugas dan SPPD' },
      { id: 'perjadin.create', name: 'Buat SPT/SPPD', description: 'Membuat dokumen SPT dan SPPD' },
      { id: 'perjadin.approve', name: 'Persetujuan SPT/SPPD', description: 'Menyetujui atau menandatangani SPT dan SPPD' },
    ],
  },
  {
    module: 'aset',
    name: 'Aset',
    permissions: [
      { id: 'aset.view', name: 'Lihat Aset', description: 'Melihat katalog barang dan riwayat peminjaman sendiri' },
      { id: 'aset.pinjam', name: 'Pinjam Aset / Scan QR', description: 'Meminjam barang atau scan QR label aset' },
      { id: 'aset.laporan', name: 'Laporan Aset Permen 47', description: 'Melihat dan mengekspor Laporan Pengadaan Barang Permen 47' },
      { id: 'aset.tiket', name: 'Tiket & Peminjaman Aset', description: 'Mengelola tiket peminjaman dan pengembalian barang' },
      { id: 'aset.pemeliharaan', name: 'Kartu Pemeliharaan Aset', description: 'Melihat, mencatat, dan mencetak Kartu Pemeliharaan BMD' },
      { id: 'aset.pengaturan', name: 'Pengaturan Aset & Master', description: 'Mengatur master barang, ruangan, dan konfigurasi aset' },
      { id: 'aset.manage', name: 'Kelola Aset & Mutasi', description: 'Penerimaan, mutasi stok, opname, dan master barang' },
      { id: 'aset.approve', name: 'Persetujuan Aset', description: 'Menyetujui permohonan pinjam dan pemeliharaan aset' },
    ],
  },
  {
    module: 'arsip',
    name: 'Arsip Digital',
    permissions: [
      { id: 'arsip.view', name: 'Akses Arsip', description: 'Membaca dan mengunduh arsip dokumen digital' },
      { id: 'arsip.upload', name: 'Unggah Arsip', description: 'Mengunggah dan mengelola dokumen arsip digital' },
    ],
  },
  {
    module: 'admin',
    name: 'Menu Panel Admin & Sistem',
    permissions: [
      { id: 'admin.monitoring', name: 'Monitoring Hari Ini', description: 'Pantau presensi realtime seluruh pegawai' },
      { id: 'admin.izin', name: 'Konfirmasi Izin & Input Keterangan', description: 'Setujui izin/cuti/sakit dan input keterangan pegawai' },
      { id: 'admin.users', name: 'Master Pegawai & Face AI', description: 'Kelola pegawai, reset wajah, dan reset password' },
      { id: 'admin.roles', name: 'Kelola Role & Hak Akses', description: 'Membuat, mengubah, dan menetapkan role pegawai' },
      { id: 'admin.geofence', name: 'Geofencing, Face AI & Password', description: 'Atur lokasi/radius kantor, wajib wajah, dan wajib password' },
      { id: 'admin.jam_libur', name: 'Jam Kerja, Libur & Kontrol Absen', description: 'Atur jadwal shift, hari libur, jam jaga, dan akumulasi' },
      { id: 'admin.rekap', name: 'Rekap Semua Pegawai & TPP', description: 'Lihat rekap, unduh PDF/Excel, dan cetak Rekap TPP' },
      { id: 'admin.kiosk', name: 'Terminal Meja Absen (Kiosk)', description: 'Akses mode scanner wajah AI di lobi kantor' },
      { id: 'admin.instansi', name: 'Pengaturan Instansi', description: 'Mengubah profil, logo, dan pengaturan kop instansi' },
      { id: 'admin.devices', name: 'Kelola Perangkat Meja', description: 'Mendaftarkan dan mencabut token perangkat Meja Absen' },
      { id: 'admin.dev', name: 'Developer & Diagnostik', description: 'Pantau kesehatan subsistem dan log error aplikasi' },
    ],
  },
];

export const DEFAULT_ROLES = [
  {
    id: 'SUPERADMIN',
    nama: 'Superadmin',
    deskripsi: 'Semua Akses Sistem',
    is_system: true,
    permissions: ['*'],
  },
  {
    id: 'ADMIN',
    nama: 'Administrator',
    deskripsi: 'Administrator OPD / Instansi',
    is_system: true,
    permissions: [
      'presensi.view_all',
      'presensi.manual_entry',
      'keterangan.view',
      'keterangan.approve',
      'lembur.view',
      'lembur.verify',
      'lembur.approve',
      'perjadin.view',
      'perjadin.create',
      'perjadin.approve',
      'aset.view',
      'aset.pinjam',
      'aset.laporan',
      'aset.tiket',
      'aset.pemeliharaan',
      'aset.pengaturan',
      'aset.manage',
      'aset.approve',
      'arsip.view',
      'arsip.upload',
      'admin.monitoring',
      'admin.izin',
      'admin.users',
      'admin.roles',
      'admin.geofence',
      'admin.jam_libur',
      'admin.rekap',
      'admin.kiosk',
      'admin.instansi',
      'admin.dev',
    ],
  },
  {
    id: 'KEPALA',
    nama: 'Kepala',
    deskripsi: 'Pimpinan / Approval',
    is_system: true,
    permissions: [
      'presensi.view_all',
      'keterangan.view',
      'keterangan.approve',
      'lembur.view',
      'lembur.approve',
      'perjadin.view',
      'perjadin.approve',
      'aset.view',
      'aset.approve',
      'arsip.view',
      'admin.monitoring',
      'admin.izin',
      'admin.rekap',
    ],
  },
  {
    id: 'SEKRETARIS',
    nama: 'Sekretaris',
    deskripsi: 'Verifikasi Administrasi & Approval',
    is_system: true,
    permissions: [
      'presensi.view_all',
      'keterangan.view',
      'keterangan.approve',
      'lembur.view',
      'lembur.verify',
      'perjadin.view',
      'perjadin.create',
      'perjadin.approve',
      'aset.view',
      'arsip.view',
      'arsip.upload',
      'admin.monitoring',
      'admin.izin',
      'admin.rekap',
    ],
  },
  {
    id: 'KABID',
    nama: 'Kepala Bidang',
    deskripsi: 'Kepala Bidang / Approval',
    is_system: true,
    permissions: [
      'presensi.view_all',
      'keterangan.view',
      'keterangan.approve',
      'lembur.view',
      'lembur.verify',
      'perjadin.view',
      'perjadin.approve',
      'aset.view',
      'arsip.view',
      'admin.monitoring',
      'admin.izin',
      'admin.rekap',
    ],
  },
  {
    id: 'BENDAHARA_BARANG',
    nama: 'Bendahara Barang',
    deskripsi: 'Pengelola Aset / Barang',
    is_system: true,
    permissions: [
      'presensi.view_own',
      'presensi.record',
      'aset.view',
      'aset.pinjam',
      'aset.laporan',
      'aset.tiket',
      'aset.pemeliharaan',
      'aset.pengaturan',
      'aset.manage',
      'aset.approve',
      'arsip.view',
    ],
  },
  {
    id: 'USER',
    nama: 'Pegawai Standar',
    deskripsi: 'Pegawai Standar',
    is_system: true,
    permissions: [
      'presensi.view_own',
      'presensi.record',
      'keterangan.view',
      'keterangan.create',
      'lembur.view',
      'lembur.create',
      'perjadin.view',
      'aset.view',
      'aset.pinjam',
      'arsip.view',
    ],
  },
];

function getExecutor(pool) {
  if (typeof pool === 'function') return pool;
  if (pool && typeof pool.query === 'function') return (text, params) => pool.query(text, params);
  return defaultQuery;
}

export async function initAbsenRolesTable(pool) {
  const exec = getExecutor(pool);
  await exec(`
    CREATE TABLE IF NOT EXISTS absen_roles (
      id VARCHAR(50) PRIMARY KEY,
      nama VARCHAR(100) NOT NULL,
      deskripsi TEXT,
      is_system BOOLEAN DEFAULT false,
      permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const r of DEFAULT_ROLES) {
    await exec(
      `INSERT INTO absen_roles (id, nama, deskripsi, is_system, permissions)
       VALUES ($1, $2, $3, true, $4::jsonb)
       ON CONFLICT (id) DO NOTHING;`,
      [r.id, r.nama, r.deskripsi, JSON.stringify(r.permissions)]
    );
  }
  return { ok: true };
}

export async function getRoles(pool) {
  const exec = getExecutor(pool);
  const sql = `
    SELECT 
      r.id, 
      r.nama, 
      r.deskripsi, 
      r.is_system, 
      r.permissions, 
      r.created_at,
      COALESCE(COUNT(DISTINCT u.id), 0)::int AS user_count
    FROM absen_roles r
    LEFT JOIN user_list u ON (
      UPPER(REPLACE(COALESCE(u.role, ''), ' ', '_')) = r.id
      OR UPPER(COALESCE(u.role, '')) = r.id
      OR UPPER(REPLACE(COALESCE(u.app_permissions->'absensi'->>'role', ''), ' ', '_')) = r.id
    )
    GROUP BY r.id, r.nama, r.deskripsi, r.is_system, r.permissions, r.created_at
    ORDER BY 
      CASE WHEN r.id = 'SUPERADMIN' THEN 1
           WHEN r.id = 'ADMIN' THEN 2
           WHEN r.id = 'KEPALA' THEN 3
           WHEN r.id = 'SEKRETARIS' THEN 4
           WHEN r.id = 'KABID' THEN 5
           WHEN r.id = 'BENDAHARA_BARANG' THEN 6
           WHEN r.id = 'USER' THEN 7
           ELSE 8 END,
      r.nama ASC;
  `;
  const { rows } = await exec(sql, []);
  return (rows || []).map((r) => ({
    ...r,
    user_count: Number(r.user_count) || 0,
    permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []),
  }));
}

export async function getRoleById(pool, id) {
  const exec = getExecutor(pool);
  const cleanId = String(id || '').trim().toUpperCase();
  const { rows } = await exec(
    'SELECT id, nama, deskripsi, is_system, permissions, created_at FROM absen_roles WHERE id = $1',
    [cleanId]
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []),
  };
}

export async function createRole(pool, { id, nama, deskripsi, permissions } = {}) {
  const exec = getExecutor(pool);
  const cleanId = String(id || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!cleanId || !/^[A-Z0-9_]{2,50}$/.test(cleanId)) {
    throw new Error('ID role harus 2-50 karakter alfanumerik / underscore.');
  }
  const cleanNama = String(nama || '').trim();
  if (!cleanNama) {
    throw new Error('Nama role wajib diisi.');
  }
  const cleanDesk = deskripsi !== undefined && deskripsi !== null ? String(deskripsi).trim() : '';
  const cleanPerms = Array.isArray(permissions) ? permissions.map((p) => String(p).trim()).filter(Boolean) : [];

  const existing = await getRoleById(pool, cleanId);
  if (existing) {
    const err = new Error(`Role dengan ID '${cleanId}' sudah ada.`);
    err.code = 'ROLE_EXISTS';
    throw err;
  }

  const { rows } = await exec(
    `INSERT INTO absen_roles (id, nama, deskripsi, is_system, permissions)
     VALUES ($1, $2, $3, false, $4::jsonb)
     RETURNING id, nama, deskripsi, is_system, permissions, created_at`,
    [cleanId, cleanNama, cleanDesk, JSON.stringify(cleanPerms)]
  );
  const r = rows[0];
  return {
    ...r,
    permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []),
  };
}

export async function updateRole(pool, id, { nama, deskripsi, permissions } = {}) {
  const exec = getExecutor(pool);
  const cleanId = String(id || '').trim().toUpperCase();
  const existing = await getRoleById(pool, cleanId);
  if (!existing) {
    const err = new Error(`Role '${cleanId}' tidak ditemukan.`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const cleanNama = nama !== undefined ? String(nama).trim() : existing.nama;
  if (!cleanNama) {
    throw new Error('Nama role tidak boleh kosong.');
  }
  const cleanDesk = deskripsi !== undefined ? String(deskripsi).trim() : existing.deskripsi;
  let cleanPerms = existing.permissions;
  if (permissions !== undefined) {
    cleanPerms = Array.isArray(permissions) ? permissions.map((p) => String(p).trim()).filter(Boolean) : [];
    if (cleanId === 'SUPERADMIN' && !cleanPerms.includes('*')) {
      cleanPerms.unshift('*');
    }
  }

  const { rows } = await exec(
    `UPDATE absen_roles
     SET nama = $1, deskripsi = $2, permissions = $3::jsonb
     WHERE id = $4
     RETURNING id, nama, deskripsi, is_system, permissions, created_at`,
    [cleanNama, cleanDesk, JSON.stringify(cleanPerms), cleanId]
  );
  const r = rows[0];
  return {
    ...r,
    permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []),
  };
}

export async function deleteRole(pool, id) {
  const exec = getExecutor(pool);
  const cleanId = String(id || '').trim().toUpperCase();
  const existing = await getRoleById(pool, cleanId);
  if (!existing) {
    const err = new Error(`Role '${cleanId}' tidak ditemukan.`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.is_system) {
    const err = new Error('Role sistem tidak dapat dihapus.');
    err.code = 'SYSTEM_ROLE';
    throw err;
  }

  const countRes = await exec(
    `SELECT COUNT(*)::int AS count FROM user_list
     WHERE UPPER(REPLACE(COALESCE(role, ''), ' ', '_')) = $1
        OR UPPER(COALESCE(role, '')) = $1
        OR UPPER(REPLACE(COALESCE(app_permissions->'absensi'->>'role', ''), ' ', '_')) = $1`,
    [cleanId]
  );
  const count = Number(countRes?.rows?.[0]?.count || 0);
  if (count > 0) {
    const err = new Error(`Role tidak dapat dihapus karena masih digunakan oleh ${count} pegawai.`);
    err.code = 'IN_USE';
    throw err;
  }

  await exec('DELETE FROM absen_roles WHERE id = $1', [cleanId]);
  return { ok: true, id: cleanId };
}

export async function assignUserRole(pool, { userId, nip, roleId } = {}) {
  const exec = getExecutor(pool);
  const cleanRoleId = String(roleId || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!cleanRoleId) {
    throw new Error('roleId wajib diisi.');
  }

  const role = await getRoleById(pool, cleanRoleId);
  if (!role) {
    const err = new Error(`Role '${cleanRoleId}' tidak ditemukan.`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const uId = userId ? String(userId).trim() : null;
  const uNip = nip ? String(nip).trim() : null;
  if (!uId && !uNip) {
    throw new Error('userId atau nip wajib diisi.');
  }

  const userRes = await exec(
    `SELECT id::text AS id, username AS nama, "NIP" AS nip, role, is_admin, app_permissions
     FROM user_list
     WHERE (id::text = $1 AND $1 IS NOT NULL)
        OR ("NIP" = $2 AND $2 IS NOT NULL)`,
    [uId, uNip]
  );
  if (!userRes.rows || userRes.rows.length === 0) {
    const err = new Error('Pegawai tidak ditemukan.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const targetUser = userRes.rows[0];

  const MEDIA_ROLE_IDS = new Set(['SUPERADMIN', 'ADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN']);
  const shouldBeAdmin = MEDIA_ROLE_IDS.has(cleanRoleId);

  let basePerms = {};
  if (targetUser.app_permissions && typeof targetUser.app_permissions === 'object' && !Array.isArray(targetUser.app_permissions)) {
    basePerms = { ...targetUser.app_permissions };
  } else if (typeof targetUser.app_permissions === 'string') {
    try {
      const parsed = JSON.parse(targetUser.app_permissions);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) basePerms = parsed;
    } catch {}
  }
  const prevAbsensi = (basePerms.absensi && typeof basePerms.absensi === 'object' && !Array.isArray(basePerms.absensi))
    ? basePerms.absensi
    : { enabled: true };
  basePerms.absensi = { ...prevAbsensi, enabled: prevAbsensi.enabled !== false, role: cleanRoleId };

  const updateSql = `
    UPDATE user_list
    SET role = $1,
        app_permissions = $2::jsonb,
        is_admin = $3::boolean
    WHERE id::text = $4
    RETURNING id::text AS id, username AS nama, "NIP" AS nip, role, is_admin, app_permissions
  `;
  const { rows } = await exec(updateSql, [cleanRoleId, JSON.stringify(basePerms), shouldBeAdmin, targetUser.id]);
  return rows[0];
}
