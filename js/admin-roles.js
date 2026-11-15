/**
 * admin-roles.js - Role Management & Permission Matrix UI
 * Absensi & SIMAPO Sistem Informasi Manajemen Aset & Pegawai
 * Adheres strictly to the 20 Anti-Slop Golden UI/UX Rules.
 */

(function (root, factory) {
  const exports = factory();
  if (typeof window !== 'undefined') {
    Object.assign(window, exports);
    window.ADMIN_ROLES = exports;
  }
  if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, exports);
    globalThis.ADMIN_ROLES = exports;
  }
  if (typeof module === 'object' && module && module.exports) {
    module.exports = exports;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Cache state
  let _rolesList = [];
  let _permissionsCatalog = null;
  let _usersList = null;
  let _isLoadingRoles = false;

  const MODULE_ICONS = {
    presensi: 'fa-calendar-alt',
    keterangan: 'fa-file-signature',
    lembur: 'fa-clock',
    perjadin: 'fa-briefcase',
    aset: 'fa-boxes',
    arsip: 'fa-archive',
    admin: 'fa-cog',
  };

  const DEFAULT_CATALOG = [
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
      name: 'Administrasi Sistem',
      permissions: [
        { id: 'admin.users', name: 'Kelola Pegawai', description: 'Tambah, ubah, hapus, dan reset password pegawai' },
        { id: 'admin.roles', name: 'Kelola Role & Hak Akses', description: 'Membuat dan mengelola role dan hak akses pengguna' },
        { id: 'admin.instansi', name: 'Pengaturan Instansi', description: 'Mengubah profil, logo, dan pengaturan instansi' },
        { id: 'admin.devices', name: 'Kelola Perangkat Meja', description: 'Mendaftarkan dan mencabut token perangkat Meja Absen' },
      ],
    },
  ];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getEl(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  async function performFetch(path, opts = {}) {
    if (typeof apiFetch === 'function') {
      return apiFetch(path, opts);
    }
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    return fetch(path, { ...opts, headers });
  }

  /**
   * Mengambil katalog hak akses dari server atau fallback default.
   */
  async function fetchPermissionsCatalog() {
    if (_permissionsCatalog) return _permissionsCatalog;
    try {
      const res = await performFetch('/api/admin/roles/permissions-list');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          _permissionsCatalog = json.data;
          return _permissionsCatalog;
        }
      }
    } catch (e) {
      console.warn('[admin-roles] Gagal mengambil katalog permissions dari server, menggunakan default:', e.message);
    }
    _permissionsCatalog = DEFAULT_CATALOG;
    return _permissionsCatalog;
  }

  /**
   * Muat daftar role dari /api/admin/roles dan render ke #rolesMgmtList
   */
  async function loadRolesList() {
    const listEl = getEl('rolesMgmtList');
    if (!listEl) return;

    if (_isLoadingRoles) return;
    _isLoadingRoles = true;

    listEl.innerHTML = `
      <div style="padding:24px; text-align:center; color:var(--muted); font-size:12px;">
        <i class="fas fa-sync fa-spin" style="margin-right:8px; color:var(--gold);"></i>Memuat data role & hak akses...
      </div>
    `;

    try {
      const res = await performFetch('/api/admin/roles');
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      const json = await res.json();
      const roles = Array.isArray(json.data) ? json.data : (Array.isArray(json.rows) ? json.rows : []);
      _rolesList = roles;

      if (!roles.length) {
        listEl.innerHTML = `
          <div class="empty-state" style="padding:20px; text-align:center; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px;">
            <div style="font-size:24px; color:var(--muted); margin-bottom:8px;"><i class="fas fa-shield-alt"></i></div>
            <div style="font-size:12px; font-weight:700; color:var(--white);">Belum Ada Role Terdaftar</div>
            <div style="font-size:11px; color:var(--muted); margin-top:4px;">Klik tombol "Tambah Role" untuk membuat role baru.</div>
          </div>
        `;
        return;
      }

      const html = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${roles.map(role => {
            const isSystem = !!role.is_system;
            const uCount = Number(role.user_count || 0);
            const perms = Array.isArray(role.permissions) ? role.permissions : [];
            const isSuper = perms.includes('*');
            const permCount = isSuper ? 'Semua Hak Akses (*)' : `${perms.length} Wewenang`;

            const typeBadge = isSystem
              ? `<span style="background:rgba(99,102,241,0.15); color:#818cf8; border:1px solid rgba(99,102,241,0.3); font-size:9.5px; font-weight:700; border-radius:4px; padding:2px 6px; letter-spacing:0.3px;">SISTEM</span>`
              : `<span style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); font-size:9.5px; font-weight:700; border-radius:4px; padding:2px 6px; letter-spacing:0.3px;">KUSTOM</span>`;

            return `
              <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-size:13px; font-weight:800; color:var(--white);">${escapeHtml(role.nama || role.id)}</span>
                    <code style="font-family:monospace; font-size:11px; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; color:#cbd5e1; border:1px solid rgba(255,255,255,0.06); font-variant-numeric:tabular-nums;">${escapeHtml(role.id)}</code>
                    ${typeBadge}
                  </div>
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span class="tabular-nums" style="font-variant-numeric:tabular-nums; font-size:10.5px; background:rgba(99,102,241,0.12); color:#818cf8; border:1px solid rgba(99,102,241,0.25); border-radius:6px; padding:3px 8px; font-weight:600;">
                      <i class="fas fa-lock" style="margin-right:4px;"></i><span class="tabular-nums">${permCount}</span>
                    </span>
                    <span class="tabular-nums" style="font-variant-numeric:tabular-nums; font-size:11px; color:var(--white); background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:3px 8px;">
                      <i class="fas fa-users" style="color:var(--muted); margin-right:4px;"></i><strong class="tabular-nums" style="font-variant-numeric:tabular-nums;">${uCount}</strong> Pegawai
                    </span>
                  </div>
                </div>

                <div style="font-size:11px; color:var(--muted); line-height:1.4;">
                  ${escapeHtml(role.deskripsi || 'Tidak ada deskripsi')}
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05); flex-wrap:wrap;">
                  <button type="button" class="btn-sm-admin" onclick="openAssignModal('${escapeHtml(role.id)}')" style="background:rgba(99,102,241,0.12); color:#818cf8; border:1px solid rgba(99,102,241,0.25); font-size:11px; font-weight:600;">
                    <i class="fas fa-user-shield"></i> Tugaskan Pegawai
                  </button>
                  <button type="button" class="btn-sm-admin" onclick="openRoleForm('${escapeHtml(role.id)}')" style="background:rgba(255,255,255,0.05); color:var(--white); border:1px solid var(--border); font-size:11px; font-weight:600;">
                    <i class="fas fa-edit"></i> Edit Hak Akses
                  </button>
                  ${isSystem ? `
                    <button type="button" class="btn-sm-admin" disabled style="opacity:0.35; cursor:not-allowed; background:rgba(239,68,68,0.05); color:#ef4444; border:1px solid rgba(239,68,68,0.1); font-size:11px;" title="Role sistem tidak dapat dihapus">
                      <i class="fas fa-trash"></i> Hapus
                    </button>
                  ` : `
                    <button type="button" class="btn-sm-admin" onclick="deleteRole('${escapeHtml(role.id)}')" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25); font-size:11px; font-weight:600;">
                      <i class="fas fa-trash"></i> Hapus
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      listEl.innerHTML = html;
    } catch (e) {
      console.error('[admin-roles] loadRolesList error:', e);
      listEl.innerHTML = `
        <div style="padding:16px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:12px; color:#f87171; font-size:12px; text-align:center;">
          <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Gagal memuat daftar role (${escapeHtml(e.message)}).
          <div style="margin-top:8px;">
            <button type="button" class="btn-sm-admin" onclick="loadRolesList()" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.35);">
              <i class="fas fa-sync"></i> Coba Lagi
            </button>
          </div>
        </div>
      `;
    } finally {
      _isLoadingRoles = false;
    }
  }

  /**
   * Render matriks hak akses ke dalam container accordion modul
   */
  async function renderPermissionsMatrix(selectedPermissions = []) {
    const container = getEl('permissionsMatrixContainer');
    if (!container) return;

    const catalog = await fetchPermissionsCatalog();
    const isAll = selectedPermissions.includes('*');

    container.innerHTML = catalog.map(mod => {
      const iconClass = MODULE_ICONS[mod.module] || 'fa-folder';
      const allModChecked = !isAll && mod.permissions.every(p => selectedPermissions.includes(p.id));
      const checkedModCount = isAll ? mod.permissions.length : mod.permissions.filter(p => selectedPermissions.includes(p.id)).length;

      return `
        <div class="role-module-card" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:10px; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.03); cursor:pointer; user-select:none;" onclick="toggleModuleAccordion('${mod.module}')">
            <div style="display:flex; align-items:center; gap:8px;">
              <i class="fas ${iconClass}" style="color:var(--gold); font-size:13px;"></i>
              <span style="font-weight:700; font-size:11.5px; color:var(--white);">${escapeHtml(mod.name)}</span>
              <span id="badge_mod_${mod.module}" class="tabular-nums" style="font-size:10px; color:var(--muted); font-variant-numeric:tabular-nums; margin-left:4px;">
                (<span class="tabular-nums">${checkedModCount}</span>/<span class="tabular-nums">${mod.permissions.length}</span>)
              </span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;" onclick="event.stopPropagation()">
              <label style="font-size:10px; color:var(--muted); display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" id="chk_all_${mod.module}" ${isAll || allModChecked ? 'checked' : ''} onchange="toggleModulePermissions('${mod.module}', this.checked)" style="cursor:pointer;" />
                Pilih Semua
              </label>
              <button type="button" class="btn-icon" style="background:transparent; border:none; color:var(--muted); font-size:11px; cursor:pointer;" onclick="toggleModuleAccordion('${mod.module}')">
                <i class="fas fa-chevron-down" id="chevron_${mod.module}"></i>
              </button>
            </div>
          </div>

          <div id="mod_body_${mod.module}" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:8px; padding:12px; border-top:1px solid rgba(255,255,255,0.05);">
            ${mod.permissions.map(p => {
              const isChecked = isAll || selectedPermissions.includes(p.id);
              return `
                <label for="perm_${p.id}" style="display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border-radius:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); cursor:pointer; transition:background 0.15s ease;">
                  <input type="checkbox" class="role-perm-cb" id="perm_${p.id}" value="${p.id}" data-module="${mod.module}" ${isChecked ? 'checked' : ''} onchange="updateModuleCheckState('${mod.module}')" style="margin-top:2px; cursor:pointer;" />
                  <div style="flex:1; min-width:0;">
                    <div style="font-size:11px; font-weight:700; color:var(--white);">${escapeHtml(p.name)}</div>
                    <div style="font-size:9.5px; color:var(--muted); line-height:1.35; margin-top:2px;">${escapeHtml(p.description)}</div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleModuleAccordion(moduleKey) {
    const body = getEl(`mod_body_${moduleKey}`);
    const chevron = getEl(`chevron_${moduleKey}`);
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'grid' : 'none';
    if (chevron) {
      chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
  }

  function toggleModulePermissions(moduleKey, checked) {
    if (typeof document === 'undefined') return;
    const cbs = document.querySelectorAll(`.role-perm-cb[data-module="${moduleKey}"]`);
    cbs.forEach(cb => { cb.checked = !!checked; });
    updateModuleCheckState(moduleKey);
  }

  function toggleAllPermissions(checked) {
    if (typeof document === 'undefined') return;
    const cbs = document.querySelectorAll('.role-perm-cb');
    cbs.forEach(cb => { cb.checked = !!checked; });

    const catalog = _permissionsCatalog || DEFAULT_CATALOG;
    catalog.forEach(mod => {
      const allCb = getEl(`chk_all_${mod.module}`);
      if (allCb) allCb.checked = !!checked;
      updateModuleCheckState(mod.module);
    });
  }

  function updateModuleCheckState(moduleKey) {
    if (typeof document === 'undefined') return;
    const cbs = document.querySelectorAll(`.role-perm-cb[data-module="${moduleKey}"]`);
    const total = cbs.length;
    let checked = 0;
    cbs.forEach(cb => { if (cb.checked) checked++; });

    const allCb = getEl(`chk_all_${moduleKey}`);
    if (allCb) {
      allCb.checked = total > 0 && checked === total;
    }
    const badge = getEl(`badge_mod_${moduleKey}`);
    if (badge) {
      badge.innerHTML = `(<span class="tabular-nums">${checked}</span>/<span class="tabular-nums">${total}</span>)`;
    }
  }

  /**
   * Buka form edit/tambah role
   */
  async function openRoleForm(roleId) {
    const form = getEl('roleEditForm');
    if (!form) return;

    await fetchPermissionsCatalog();

    const titleEl = getEl('roleFormTitle');
    const inputId = getEl('roleInputId');
    const inputNama = getEl('roleInputNama');
    const inputDesc = getEl('roleInputDesc');
    const modeEl = getEl('roleEditMode');

    if (roleId) {
      // Edit existing role
      let role = _rolesList.find(r => String(r.id) === String(roleId));
      if (!role) {
        try {
          const res = await performFetch('/api/admin/roles/' + encodeURIComponent(roleId));
          if (res.ok) {
            const json = await res.json();
            if (json.ok && json.data) role = json.data;
          }
        } catch (e) {
          console.warn('[admin-roles] Gagal fetch detail role:', e);
        }
      }

      if (modeEl) modeEl.value = 'edit';
      if (titleEl) titleEl.innerHTML = `<i class="fas fa-edit"></i> Ubah Hak Akses Role: <span style="color:var(--white);">${escapeHtml(role?.nama || roleId)}</span>`;
      if (inputId) {
        inputId.value = roleId;
        inputId.disabled = true;
      }
      if (inputNama) inputNama.value = role?.nama || '';
      if (inputDesc) inputDesc.value = role?.deskripsi || '';

      const perms = Array.isArray(role?.permissions) ? role?.permissions : [];
      await renderPermissionsMatrix(perms);
    } else {
      // Create new custom role
      if (modeEl) modeEl.value = 'create';
      if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus-circle"></i> Tambah Role & Hak Akses Baru';
      if (inputId) {
        inputId.value = '';
        inputId.disabled = false;
      }
      if (inputNama) inputNama.value = '';
      if (inputDesc) inputDesc.value = '';

      await renderPermissionsMatrix([]);
    }

    form.style.display = 'block';
    setTimeout(() => {
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  /**
   * Tutup form edit/tambah role
   */
  function closeRoleForm() {
    const form = getEl('roleEditForm');
    if (form) form.style.display = 'none';
    const inputId = getEl('roleInputId');
    const inputNama = getEl('roleInputNama');
    const inputDesc = getEl('roleInputDesc');
    if (inputId) {
      inputId.value = '';
      inputId.disabled = false;
    }
    if (inputNama) inputNama.value = '';
    if (inputDesc) inputDesc.value = '';
  }

  /**
   * Simpan role (POST create atau PUT update)
   */
  async function saveRole() {
    const modeEl = getEl('roleEditMode');
    const inputId = getEl('roleInputId');
    const inputNama = getEl('roleInputNama');
    const inputDesc = getEl('roleInputDesc');

    const mode = modeEl?.value || 'create';
    const id = (inputId?.value || '').trim().toUpperCase();
    const nama = (inputNama?.value || '').trim();
    const deskripsi = (inputDesc?.value || '').trim();

    if (!id) {
      alertNotice('warning', 'Validasi Gagal', 'Kode Role wajib diisi.');
      return;
    }

    if (!/^[A-Z0-9_]{2,40}$/.test(id)) {
      alertNotice('warning', 'Format Tidak Sesuai', 'Kode Role hanya boleh huruf kapital, angka, dan underscore (2-40 karakter).');
      return;
    }

    if (!nama) {
      alertNotice('warning', 'Validasi Gagal', 'Nama Role wajib diisi.');
      return;
    }

    // Collect permissions
    let permissions = [];
    if (typeof document !== 'undefined') {
      const cbs = document.querySelectorAll('.role-perm-cb:checked');
      permissions = Array.from(cbs).map(cb => cb.value);
    }

    // Superadmin safeguard
    if (id === 'SUPERADMIN' && permissions.length > 0) {
      permissions = ['*'];
    }

    const saveBtn = getEl('btnSaveRole');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Menyimpan...';
    }

    try {
      let res;
      if (mode === 'create') {
        res = await performFetch('/api/admin/roles', {
          method: 'POST',
          body: JSON.stringify({ id, nama, deskripsi, permissions }),
        });
      } else {
        res = await performFetch('/api/admin/roles/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify({ nama, deskripsi, permissions }),
        });
      }

      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || 'Gagal menyimpan role.');
      }

      alertNotice('success', 'Berhasil', json.message || 'Role berhasil disimpan.');
      closeRoleForm();
      loadRolesList();
    } catch (e) {
      alertNotice('error', 'Gagal', e.message || 'Terjadi kesalahan sistem.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Role';
      }
    }
  }

  /**
   * Hapus custom role
   */
  async function deleteRole(roleId) {
    if (!roleId) return;

    let confirmed = false;
    if (typeof Swal !== 'undefined') {
      const res = await Swal.fire({
        icon: 'warning',
        title: 'Hapus Role?',
        text: `Apakah Anda yakin ingin menghapus role '${roleId}'? Tindakan ini tidak dapat dibatalkan.`,
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#ef4444',
      });
      confirmed = res.isConfirmed;
    } else if (typeof confirm !== 'undefined') {
      confirmed = confirm(`Apakah Anda yakin ingin menghapus role '${roleId}'?`);
    } else {
      confirmed = true;
    }

    if (!confirmed) return;

    try {
      const res = await performFetch('/api/admin/roles/' + encodeURIComponent(roleId), {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || 'Gagal menghapus role.');
      }
      alertNotice('success', 'Terhapus', json.message || 'Role berhasil dihapus.');
      loadRolesList();
    } catch (e) {
      alertNotice('error', 'Gagal', e.message || 'Terjadi kesalahan saat menghapus role.');
    }
  }

  /**
   * Buka modal penugasan role ke pegawai
   */
  async function openAssignModal(roleId, userId) {
    const modal = getEl('roleAssignModal');
    if (!modal) return;

    modal.style.display = 'flex';

    // 1. Populate roles select
    const roleSelect = getEl('assignSelectRole');
    if (roleSelect) {
      if (!_rolesList.length) {
        await loadRolesList();
      }
      roleSelect.innerHTML = `
        <option value="">-- Pilih Role / Hak Akses --</option>
        ${_rolesList.map(r => `
          <option value="${escapeHtml(r.id)}" ${roleId && String(r.id) === String(roleId) ? 'selected' : ''}>
            ${escapeHtml(r.nama || r.id)} (${escapeHtml(r.id)})
          </option>
        `).join('')}
      `;
    }

    // 2. Populate pegawai select
    const userSelect = getEl('assignSelectPegawai');
    if (userSelect) {
      userSelect.innerHTML = '<option value="">Memuat daftar pegawai...</option>';
      try {
        let users = _usersList;
        if (!users || !users.length) {
          if (typeof window !== 'undefined' && Array.isArray(window.userListOrder) && window.userListOrder.length > 0) {
            users = window.userListOrder;
          } else if (typeof apiGet === 'function' && typeof P !== 'undefined' && P.userList) {
            const ur = await apiGet(P.userList + '?format=full');
            users = (ur.rows && ur.rows.length) ? ur.rows : (Array.isArray(ur.data) ? ur.data : []);
          } else {
            const res = await performFetch('/api/user-list?format=full');
            if (res.ok) {
              const ujson = await res.json();
              users = Array.isArray(ujson.data) ? ujson.data : (Array.isArray(ujson) ? ujson : []);
            }
          }
          _usersList = users;
        }

        if (Array.isArray(users) && users.length > 0) {
          userSelect.innerHTML = `
            <option value="">-- Pilih Pegawai --</option>
            ${users.map(u => {
              const uid = String(u.id || u.ID || '');
              const nip = String(u.nip || u.NIP || '').trim();
              const nama = u.nama || u.Nama || u.username || 'Tanpa Nama';
              const curRole = u.role || u.Role || 'USER';
              const isSelected = (userId && (String(userId) === uid || String(userId) === nip));
              return `
                <option value="${escapeHtml(uid)}" data-nip="${escapeHtml(nip)}" ${isSelected ? 'selected' : ''}>
                  ${escapeHtml(nama)} — NIP. ${nip || '-'} [${escapeHtml(curRole)}]
                </option>
              `;
            }).join('')}
          `;
        } else {
          userSelect.innerHTML = '<option value="">Tidak ada data pegawai</option>';
        }
      } catch (e) {
        console.error('[admin-roles] Gagal memuat pegawai:', e);
        userSelect.innerHTML = '<option value="">Gagal memuat pegawai</option>';
      }
    }
  }

  /**
   * Tutup modal penugasan role
   */
  function closeAssignModal() {
    const modal = getEl('roleAssignModal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Simpan penugasan role pegawai
   */
  async function saveAssignRole() {
    const userSelect = getEl('assignSelectPegawai');
    const roleSelect = getEl('assignSelectRole');

    const selectedOption = userSelect?.options[userSelect.selectedIndex];
    const userId = userSelect?.value || '';
    const nip = selectedOption ? selectedOption.getAttribute('data-nip') : '';
    const roleId = roleSelect?.value || '';

    if (!userId && !nip) {
      alertNotice('warning', 'Pilih Pegawai', 'Silakan pilih pegawai yang akan ditugaskan.');
      return;
    }
    if (!roleId) {
      alertNotice('warning', 'Pilih Role', 'Silakan pilih role yang akan diberikan.');
      return;
    }

    const saveBtn = getEl('btnSaveAssignRole');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Menyimpan...';
    }

    try {
      const res = await performFetch('/api/admin/roles/assign', {
        method: 'POST',
        body: JSON.stringify({ userId, nip, roleId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || 'Gagal menetapkan role pegawai.');
      }

      alertNotice('success', 'Berhasil Ditugaskan', json.message || 'Role pegawai berhasil diperbarui.');
      closeAssignModal();
      loadRolesList();
      if (typeof window !== 'undefined' && typeof window.loadAdminMgmt === 'function') {
        window.loadAdminMgmt();
      }
      if (typeof window !== 'undefined' && typeof window.loadAdminFaceReg === 'function') {
        window.loadAdminFaceReg();
      }
    } catch (e) {
      alertNotice('error', 'Gagal', e.message || 'Terjadi kesalahan sistem.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Simpan Penugasan';
      }
    }
  }

  function alertNotice(type, title, message) {
    const swalObj = typeof Swal !== 'undefined' ? Swal : (typeof window !== 'undefined' ? window.Swal : null);
    const alertFn = typeof alert === 'function' ? alert : (typeof window !== 'undefined' && typeof window.alert === 'function' ? window.alert : null);

    if (swalObj && typeof swalObj.fire === 'function') {
      swalObj.fire({
        icon: type === 'fail' ? 'error' : type,
        title: title,
        text: message,
      });
    } else if (alertFn) {
      alertFn(`${title}: ${message}`);
    } else {
      console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }
  }

  // Auto-init jika card sudah terpasang
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const card = getEl('adminRolesCard');
      if (card && card.closest && card.closest('.admin-section')) {
        const sec = card.closest('.admin-section');
        if (sec.style.display !== 'none') {
          loadRolesList();
        }
      }
    });
  }

  return {
    loadRolesList,
    openRoleForm,
    closeRoleForm,
    saveRole,
    deleteRole,
    openAssignModal,
    closeAssignModal,
    saveAssignRole,
    renderPermissionsMatrix,
    toggleAllPermissions,
    toggleModulePermissions,
    toggleModuleAccordion,
    updateModuleCheckState,
    fetchPermissionsCatalog,
  };
});
