-- Migration 006: Create absen_roles table for Absensi RBAC
-- CRITICAL NON-COLLISION: Isolated table for absensi. Never touch sd_roles or user_credentials.

CREATE TABLE IF NOT EXISTS absen_roles (
    id VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    deskripsi TEXT,
    is_system BOOLEAN DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default system roles with is_system = true
INSERT INTO absen_roles (id, nama, deskripsi, is_system, permissions)
VALUES
    ('SUPERADMIN', 'Superadmin', 'Semua Akses Sistem', true, '["*"]'::jsonb),
    ('ADMIN', 'Administrator', 'Administrator OPD / Instansi', true, '["presensi.view_all", "presensi.manual_entry", "keterangan.view", "keterangan.approve", "lembur.view", "lembur.verify", "lembur.approve", "perjadin.view", "perjadin.create", "perjadin.approve", "aset.view", "aset.manage", "arsip.view", "arsip.upload", "admin.users", "admin.roles", "admin.instansi"]'::jsonb),
    ('KEPALA', 'Kepala', 'Pimpinan / Approval', true, '["presensi.view_all", "keterangan.view", "keterangan.approve", "lembur.view", "lembur.approve", "perjadin.view", "perjadin.approve", "aset.view", "aset.approve", "arsip.view"]'::jsonb),
    ('SEKRETARIS', 'Sekretaris', 'Verifikasi Administrasi & Approval', true, '["presensi.view_all", "keterangan.view", "keterangan.approve", "lembur.view", "lembur.verify", "perjadin.view", "perjadin.create", "perjadin.approve", "aset.view", "arsip.view", "arsip.upload"]'::jsonb),
    ('KABID', 'Kepala Bidang', 'Kepala Bidang / Approval', true, '["presensi.view_all", "keterangan.view", "keterangan.approve", "lembur.view", "lembur.verify", "perjadin.view", "perjadin.approve", "aset.view", "arsip.view"]'::jsonb),
    ('BENDAHARA_BARANG', 'Bendahara Barang', 'Pengelola Aset / Barang', true, '["presensi.view_own", "presensi.record", "aset.view", "aset.pinjam", "aset.manage", "aset.approve", "arsip.view"]'::jsonb),
    ('USER', 'Pegawai Standar', 'Pegawai Standar', true, '["presensi.view_own", "presensi.record", "keterangan.view", "keterangan.create", "lembur.view", "lembur.create", "perjadin.view", "aset.view", "aset.pinjam", "arsip.view"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
