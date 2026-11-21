/* Stitch Mobile Admin: Master Pegawai & Biometrik AI + Kelola Role & Hak Akses */
(function (w) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const el = (id) => document.getElementById(id);

  let pegawaiCache = [];
  let rolesCache = [];
  let activeFaceFilter = 'all'; // 'all' | 'face' | 'no-face'
  let activeRoleFilter = '';
  let assignSheetState = { userId: '', nip: '', nama: '', currentRole: 'USER', selectedRole: 'USER' };
  let roleDetailState = { roleId: '', mode: 'members' };

  function normRole(role) {
    const val = String(role || 'USER').trim().toUpperCase().replace(/\s+/g, '_');
    return val || 'USER';
  }

  function getAuthToken() {
    if (typeof w.getStitchToken === 'function') {
      const t = w.getStitchToken();
      if (t) return t;
    }
    if (typeof w.getNativeToken === 'function') {
      const t = w.getNativeToken();
      if (t) return t;
    }
    try {
      return localStorage.getItem('_native_token')
        || localStorage.getItem('native_token')
        || localStorage.getItem('_sess_token')
        || '';
    } catch (_) {
      return '';
    }
  }

  async function requestJson(url, opts = {}) {
    const token = getAuthToken();
    const headers = Object.assign({}, opts.headers || {});
    if (token && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + token;
    }
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    let json = null;
    try {
      json = await res.json();
    } catch (_) {
      json = null;
    }
    if (res.status === 401) throw new Error('Sesi berakhir. Silakan login kembali.');
    if (res.status === 403) throw new Error((json && json.message) || 'Akses ditolak: khusus Administrator.');
    if (!res.ok || !json || json.ok === false) {
      throw new Error((json && json.message) || ('HTTP ' + res.status));
    }
    return json;
  }

  function notify(type, title, message) {
    if (typeof w.showDynamicIsland === 'function') {
      w.showDynamicIsland({ type, title, message });
      return;
    }
    if (w.Swal) {
      const icon = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success';
      w.Swal.fire(title, message, icon);
    }
  }

  async function confirmDialog({ title, text, confirmText, confirmColor }) {
    if (w.Swal) {
      const res = await w.Swal.fire({
        title,
        text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: confirmColor || '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: confirmText || 'Ya, Lanjutkan',
        cancelButtonText: 'Batal',
      });
      return Boolean(res && res.isConfirmed);
    }
    return w.confirm(title + '\n' + text);
  }

  function getInitials(nama) {
    const parts = String(nama || 'P')
      .trim()
      .split(/\s+/)
      .filter((p) => p && !p.includes('.'));
    const ini = parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    return ini || 'P';
  }

  function roleBadgeClass(roleId) {
    const r = normRole(roleId);
    if (r === 'SUPERADMIN') return 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300';
    if (r === 'ADMIN') return 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300';
    if (r === 'KEPALA' || r === 'SEKRETARIS' || r === 'KABID' || r === 'IRBAN') {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300';
    }
    if (r === 'BENDAHARA_BARANG') return 'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }

  function getSharedUsers() {
    if (pegawaiCache.length) return pegawaiCache;
    if (w.state && Array.isArray(w.state.allUsers) && w.state.allUsers.length) {
      pegawaiCache = w.state.allUsers.slice();
    }
    return pegawaiCache;
  }

  function syncSharedUsers(list) {
    pegawaiCache = Array.isArray(list) ? list : [];
    if (w.state && typeof w.state === 'object') {
      w.state.allUsers = pegawaiCache.slice();
    }
  }

  function updatePegawaiFilterChipsUI() {
    const chips = document.querySelectorAll('.admin-pegawai-chip');
    chips.forEach((btn) => {
      const mode = btn.getAttribute('data-pegawai-filter');
      const active = mode === activeFaceFilter;
      btn.className = active
        ? 'admin-pegawai-chip min-h-[40px] px-3.5 py-2 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0 cursor-pointer transition-colors'
        : 'admin-pegawai-chip min-h-[40px] px-3.5 py-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shrink-0 cursor-pointer transition-colors';
    });

    const roleChip = el('adminPegawaiRoleChip');
    const roleLabel = el('adminPegawaiRoleChipLabel');
    if (roleChip && roleLabel) {
      if (activeRoleFilter) {
        roleLabel.textContent = 'Role: ' + activeRoleFilter;
        roleChip.classList.remove('hidden');
        roleChip.classList.add('inline-flex');
      } else {
        roleChip.classList.add('hidden');
        roleChip.classList.remove('inline-flex');
      }
    }
  }

  function renderPegawaiList() {
    const container = el('adminPegawaiList');
    const countBadge = el('adminPegawaiCountBadge');
    if (!container) return;

    const searchInput = el('adminPegawaiSearch');
    const q = String(searchInput ? searchInput.value : '').trim().toLowerCase();
    const all = getSharedUsers();

    const filtered = all.filter((u) => {
      const hasFace = Boolean(u.has_face);
      if (activeFaceFilter === 'face' && !hasFace) return false;
      if (activeFaceFilter === 'no-face' && hasFace) return false;
      if (activeRoleFilter && normRole(u.role) !== activeRoleFilter) return false;
      if (!q) return true;
      const hay = [u.nama, u.nip, u.bidang, u.jabatan, u.role]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });

    if (countBadge) {
      countBadge.textContent = filtered.length === all.length
        ? `${all.length} Pegawai`
        : `${filtered.length} / ${all.length} Pegawai`;
    }

    if (!filtered.length) {
      container.innerHTML = `
        <div class="col-span-full p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
          <span class="material-symbols-outlined text-[28px] text-slate-300 dark:text-slate-600 block mb-1">person_search</span>
          <p class="font-bold text-slate-600 dark:text-slate-300">Tidak ada pegawai yang cocok</p>
          <p class="text-[11px] mt-0.5">Ubah kata kunci pencarian atau filter status biometrik.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((u) => {
      const id = String(u.id || '');
      const nip = String(u.nip || '');
      const nama = String(u.nama || 'Pegawai');
      const jabatan = String(u.jabatan || 'Aparatur');
      const bidang = String(u.bidang || 'BAPPERIDA');
      const role = normRole(u.role || 'USER');
      const hasFace = Boolean(u.has_face);

      const facePill = hasFace
        ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 whitespace-nowrap">Wajah AI</span>'
        : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap">Belum Daftar</span>';
      const rolePill = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap ${roleBadgeClass(role)}">${esc(role)}</span>`;

      const resetFaceBtn = hasFace
        ? `<button type="button" data-pegawai-action="reset-face" data-user-id="${esc(id)}" data-nip="${esc(nip)}" data-nama="${esc(nama)}" class="min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-900/50 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
             <span class="material-symbols-outlined text-[16px]">face_retouching_off</span>
             <span>Reset Wajah</span>
           </button>`
        : '';

      return `
        <div class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 flex flex-col gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-extrabold text-xs font-mono shrink-0">
              ${esc(getInitials(nama))}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <p class="text-xs font-extrabold text-slate-900 dark:text-white truncate">${esc(nama)}</p>
              </div>
              <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums truncate mt-0.5">${esc(nip || '-')}</p>
              <p class="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">${esc(jabatan)} • ${esc(bidang)}</p>
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                ${facePill}
                ${rolePill}
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
            <button type="button" data-pegawai-action="reset-password" data-user-id="${esc(id)}" data-nip="${esc(nip)}" data-nama="${esc(nama)}" class="min-h-[40px] px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/50 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">lock_reset</span>
              <span>Reset Sandi</span>
            </button>
            ${resetFaceBtn}
            <button type="button" data-pegawai-action="assign-role" data-user-id="${esc(id)}" data-nip="${esc(nip)}" data-nama="${esc(nama)}" data-role="${esc(role)}" class="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ml-auto">
              <span class="material-symbols-outlined text-[16px]">manage_accounts</span>
              <span>Ubah Role</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadAdminPegawaiMobile(forceRefresh = false) {
    const container = el('adminPegawaiList');
    if (!forceRefresh && getSharedUsers().length > 0) {
      updatePegawaiFilterChipsUI();
      renderPegawaiList();
      return getSharedUsers();
    }
    if (container && !pegawaiCache.length) {
      container.innerHTML = '<div class="col-span-full p-6 text-center text-xs text-slate-400">Memuat daftar pegawai...</div>';
    }
    try {
      const json = await requestJson('/api/stitch/bootstrap');
      syncSharedUsers(json.users || []);
      updatePegawaiFilterChipsUI();
      renderPegawaiList();
      return pegawaiCache;
    } catch (err) {
      if (container) {
        container.innerHTML = `<div class="col-span-full p-5 text-center text-xs text-rose-500 font-bold">${esc(err.message)}</div>`;
      }
      return [];
    }
  }

  function filterAdminPegawaiMobile() {
    renderPegawaiList();
  }

  function setAdminPegawaiFilter(mode) {
    activeFaceFilter = (mode === 'face' || mode === 'no-face') ? mode : 'all';
    updatePegawaiFilterChipsUI();
    renderPegawaiList();
  }

  function clearAdminPegawaiRoleFilter() {
    activeRoleFilter = '';
    updatePegawaiFilterChipsUI();
    renderPegawaiList();
  }

  async function adminResetPasswordMobile(userId, nama) {
    const id = String(userId || '').trim();
    if (!/^\d+$/.test(id)) {
      notify('error', 'ID Tidak Valid', 'ID pegawai tidak valid untuk reset sandi.');
      return false;
    }
    const confirmed = await confirmDialog({
      title: 'Reset Sandi Pegawai',
      text: `Sandi akun ${nama || 'pegawai ini'} akan dikembalikan ke sandi bawaan (BapperidaSB2026). Lanjutkan?`,
      confirmText: 'Ya, Reset Sandi',
      confirmColor: '#d97706',
    });
    if (!confirmed) return false;

    try {
      const json = await requestJson('/api/user-reset-password', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      notify('success', 'Sandi Direset', json.message || `Sandi ${nama} dikembalikan ke default.`);
      return true;
    } catch (err) {
      notify('error', 'Gagal Reset Sandi', err.message);
      return false;
    }
  }

  async function adminResetFaceMobile(nip, nama) {
    const cleanNip = String(nip || '').trim();
    if (!cleanNip) {
      notify('error', 'NIP Kosong', 'NIP pegawai tidak ditemukan untuk reset wajah.');
      return false;
    }
    const confirmed = await confirmDialog({
      title: 'Reset Data Wajah AI',
      text: `Data biometrik wajah ${nama || cleanNip} akan dihapus agar pegawai dapat merekam ulang wajah. Lanjutkan?`,
      confirmText: 'Ya, Reset Wajah',
      confirmColor: '#e11d48',
    });
    if (!confirmed) return false;

    try {
      const json = await requestJson('/api/stitch/admin/face-reset', {
        method: 'POST',
        body: JSON.stringify({ nip: cleanNip }),
      });
      const updated = getSharedUsers().map((u) => (
        String(u.nip || '') === cleanNip ? Object.assign({}, u, { has_face: false }) : u
      ));
      syncSharedUsers(updated);
      renderPegawaiList();
      notify('success', 'Biometrik Wajah Direset', json.message || `Data wajah ${nama || cleanNip} telah dikosongkan.`);
      return true;
    } catch (err) {
      notify('error', 'Gagal Reset Wajah', err.message);
      return false;
    }
  }

  /* ── Custom Stitch Bottom Sheet: Ubah Role Pegawai ─────────────────── */
  function openSheetPanel(backdropId, panelId, rootId) {
    const root = el(rootId);
    const backdrop = el(backdropId);
    const panel = el(panelId);
    if (!root || !backdrop || !panel) return;
    root.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.remove('opacity-0');
      backdrop.classList.add('opacity-100');
      panel.classList.remove('translate-y-full');
      panel.classList.add('translate-y-0');
    });
  }

  function closeSheetPanel(backdropId, panelId, rootId) {
    const root = el(rootId);
    const backdrop = el(backdropId);
    const panel = el(panelId);
    if (!root || !backdrop || !panel) return;
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    panel.classList.remove('translate-y-0');
    panel.classList.add('translate-y-full');
    setTimeout(() => {
      root.classList.add('hidden');
    }, 280);
  }

  function renderAssignRoleOptions() {
    const listEl = el('assignRoleOptionsList');
    if (!listEl) return;

    const searchEl = el('assignRoleSearchInput');
    const q = String(searchEl ? searchEl.value : '').trim().toLowerCase();
    const filtered = rolesCache.filter((r) => {
      if (!q) return true;
      const name = String(r.nama || r.name || '').toLowerCase();
      const id = String(r.id || '').toLowerCase();
      const desc = String(r.deskripsi || r.description || '').toLowerCase();
      return name.includes(q) || id.includes(q) || desc.includes(q);
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Tidak ada role yang cocok.</div>';
      return;
    }

    listEl.innerHTML = filtered.map((r) => {
      const rId = normRole(r.id);
      const rName = r.nama || r.name || rId;
      const rDesc = r.deskripsi || r.description || '-';
      const isSelected = rId === assignSheetState.selectedRole;
      const cardCls = isSelected
        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-blue-400';
      const iconName = isSelected ? 'radio_button_checked' : 'radio_button_unchecked';
      const iconCls = isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400';

      return `
        <button type="button" data-assign-role-id="${esc(rId)}" class="w-full min-h-[44px] p-3 rounded-2xl border ${cardCls} text-left flex items-start gap-3 transition-all cursor-pointer">
          <span class="material-symbols-outlined text-[20px] mt-0.5 shrink-0 ${iconCls}">${iconName}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-extrabold text-slate-900 dark:text-white truncate">${esc(rName)}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">${esc(rId)}</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">${esc(rDesc)}</p>
          </div>
        </button>
      `;
    }).join('');
  }

  async function openAssignRoleSheet(userId, nama, currentRole) {
    const cleanId = String(userId || '').trim();
    const userObj = getSharedUsers().find((u) => String(u.id || '') === cleanId) || {};
    const curRole = normRole(currentRole || userObj.role || 'USER');

    assignSheetState = {
      userId: cleanId,
      nip: String(userObj.nip || ''),
      nama: String(nama || userObj.nama || 'Pegawai'),
      currentRole: curRole,
      selectedRole: curRole,
    };

    const nameEl = el('assignRoleTargetName');
    const curBadgeEl = el('assignRoleCurrentBadge');
    const searchEl = el('assignRoleSearchInput');
    if (nameEl) nameEl.textContent = assignSheetState.nip ? `${assignSheetState.nama} (${assignSheetState.nip})` : assignSheetState.nama;
    if (curBadgeEl) curBadgeEl.textContent = curRole;
    if (searchEl) searchEl.value = '';

    openSheetPanel('drawerAssignRoleBackdrop', 'drawerAssignRolePanel', 'drawerAssignRole');

    if (!rolesCache.length) {
      const listEl = el('assignRoleOptionsList');
      if (listEl) listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Memuat daftar role...</div>';
      await loadAdminRolesMobile();
    }
    renderAssignRoleOptions();
  }

  function closeAssignRoleSheet() {
    closeSheetPanel('drawerAssignRoleBackdrop', 'drawerAssignRolePanel', 'drawerAssignRole');
  }

  function filterAssignRoleOptions() {
    renderAssignRoleOptions();
  }

  function selectAssignRoleOption(roleId) {
    assignSheetState.selectedRole = normRole(roleId);
    renderAssignRoleOptions();
  }

  async function assignUserRoleRequest(userId, nip, roleId) {
    return requestJson('/api/admin/roles/assign', {
      method: 'POST',
      body: JSON.stringify({
        userId: userId || undefined,
        nip: nip || undefined,
        roleId: normRole(roleId),
      }),
    });
  }

  function applyLocalRoleUpdate(userId, nip, nextRole) {
    const cleanRole = normRole(nextRole);
    const updated = getSharedUsers().map((u) => {
      const matchId = userId && String(u.id || '') === String(userId);
      const matchNip = nip && String(u.nip || '') === String(nip);
      return (matchId || matchNip) ? Object.assign({}, u, { role: cleanRole }) : u;
    });
    syncSharedUsers(updated);
    renderPegawaiList();
  }

  async function submitAssignRoleSheet() {
    const btn = el('btnSubmitAssignRole');
    const { userId, nip, nama, selectedRole } = assignSheetState;
    if (!selectedRole) {
      notify('warning', 'Pilih Role', 'Silakan pilih salah satu role terlebih dahulu.');
      return false;
    }

    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span><span>Menyimpan...</span>';
    }

    try {
      const json = await assignUserRoleRequest(userId, nip, selectedRole);
      applyLocalRoleUpdate(userId, nip, selectedRole);
      closeAssignRoleSheet();
      await loadAdminRolesMobile(true);
      notify('success', 'Role Diperbarui', json.message || `Role ${nama} diubah menjadi ${selectedRole}.`);
      return true;
    } catch (err) {
      notify('error', 'Gagal Mengubah Role', err.message);
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  /* ── Section 2: Kelola Role & Hak Akses ───────────────────────────── */
  function extractPermissionModules(permissions) {
    const perms = Array.isArray(permissions) ? permissions : [];
    if (perms.includes('*')) {
      return ['presensi', 'keterangan', 'lembur', 'perjadin', 'aset', 'arsip', 'admin'];
    }
    const seen = new Set();
    const modules = [];
    perms.forEach((p) => {
      const mod = String(p || '').split('.')[0].trim().toLowerCase();
      if (mod && !seen.has(mod)) {
        seen.add(mod);
        modules.push(mod);
      }
    });
    return modules;
  }

  function renderRolesList() {
    const container = el('adminRolesList');
    const badge = el('adminRolesCountBadge');
    if (!container) return;

    if (badge) badge.textContent = `${rolesCache.length} Role`;

    if (!rolesCache.length) {
      container.innerHTML = '<div class="col-span-full p-6 text-center text-xs text-slate-400">Belum ada data role di database.</div>';
      return;
    }

    container.innerHTML = rolesCache.map((role) => {
      const id = normRole(role.id);
      const name = role.nama || role.name || id;
      const desc = role.deskripsi || role.description || '-';
      const userCount = Number(role.user_count || 0);
      const modules = extractPermissionModules(role.permissions);
      const isWildcard = Array.isArray(role.permissions) && role.permissions.includes('*');

      const tagsHtml = modules.length
        ? modules.map((m) => `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">${esc(m)}</span>`).join('')
        : '<span class="px-2 py-0.5 rounded-md text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800">Dasar</span>';

      return `
        <button type="button" data-role-card-id="${esc(id)}" class="min-h-[44px] w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-indigo-400 dark:hover:border-indigo-500 p-4 flex flex-col gap-3 transition-all cursor-pointer group">
          <div class="flex items-start justify-between gap-2 w-full">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h4 class="text-xs font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">${esc(name)}</h4>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${roleBadgeClass(id)}">${esc(id)}</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${esc(desc)}</p>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold tabular-nums bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 shrink-0">${userCount} pegawai</span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5 w-full">
            ${isWildcard ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">Semua Akses</span>' : ''}
            ${tagsHtml}
          </div>

          <div class="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 w-full flex items-center justify-between text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            <span>Kelola anggota &amp; penetapan</span>
            <span class="material-symbols-outlined text-[16px]">chevron_right</span>
          </div>
        </button>
      `;
    }).join('');
  }

  async function loadAdminRolesMobile(forceRefresh = false) {
    const container = el('adminRolesList');
    if (!forceRefresh && rolesCache.length > 0) {
      renderRolesList();
      return rolesCache;
    }
    if (container && !rolesCache.length) {
      container.innerHTML = '<div class="col-span-full p-6 text-center text-xs text-slate-400">Memuat daftar role &amp; hak akses...</div>';
    }
    try {
      const json = await requestJson('/api/admin/roles');
      rolesCache = Array.isArray(json.data) ? json.data : (Array.isArray(json.rows) ? json.rows : []);
      renderRolesList();
      return rolesCache;
    } catch (err) {
      if (container) {
        container.innerHTML = `<div class="col-span-full p-5 text-center text-xs text-rose-500 font-bold">${esc(err.message)}</div>`;
      }
      return [];
    }
  }

  /* ── Custom Stitch Bottom Sheet: Detail Role & Penetapan Pegawai ───── */
  function setRoleDetailMode(mode) {
    roleDetailState.mode = mode === 'assign' ? 'assign' : 'members';
    const tabMembers = el('roleDetailTabMembers');
    const tabAssign = el('roleDetailTabAssign');
    if (tabMembers && tabAssign) {
      const activeCls = 'flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer transition-colors';
      const idleCls = 'flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer transition-colors';
      tabMembers.className = roleDetailState.mode === 'members' ? activeCls : idleCls;
      tabAssign.className = roleDetailState.mode === 'assign' ? activeCls : idleCls;
    }
    renderRoleDetailUsers();
  }

  function renderRoleDetailUsers() {
    const listEl = el('roleDetailUsersList');
    if (!listEl) return;

    const targetRole = normRole(roleDetailState.roleId);
    const searchEl = el('roleDetailSearchInput');
    const q = String(searchEl ? searchEl.value : '').trim().toLowerCase();
    const allUsers = getSharedUsers();

    const filtered = allUsers.filter((u) => {
      const uRole = normRole(u.role);
      if (roleDetailState.mode === 'members' && uRole !== targetRole) return false;
      if (!q) return true;
      const hay = [u.nama, u.nip, u.bidang, u.jabatan, uRole]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });

    if (!filtered.length) {
      const emptyMsg = roleDetailState.mode === 'members'
        ? 'Belum ada pegawai yang memegang role ini.'
        : 'Tidak ada pegawai yang cocok dengan pencarian.';
      listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">${emptyMsg}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((u) => {
      const id = String(u.id || '');
      const nip = String(u.nip || '');
      const nama = String(u.nama || 'Pegawai');
      const uRole = normRole(u.role);
      const alreadyAssigned = uRole === targetRole;

      const actionBtn = alreadyAssigned
        ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 shrink-0">Terpasang</span>'
        : `<button type="button" data-role-assign-user="${esc(id)}" data-nip="${esc(nip)}" data-nama="${esc(nama)}" class="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shrink-0 cursor-pointer transition-colors">Tetapkan</button>`;

      return `
        <div class="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-2.5">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(nama)}</p>
            <p class="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">${esc(nip || '-')}</p>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono ${roleBadgeClass(uRole)}">${esc(uRole)}</span>
              <span class="text-[10px] text-slate-400 truncate">${esc(u.bidang || 'BAPPERIDA')}</span>
            </div>
          </div>
          ${actionBtn}
        </div>
      `;
    }).join('');
  }

  async function openRoleDetailSheet(roleId) {
    const cleanRoleId = normRole(roleId);
    const role = rolesCache.find((r) => normRole(r.id) === cleanRoleId);
    if (!role) return;

    roleDetailState.roleId = cleanRoleId;
    w._activeRoleDetailId = cleanRoleId;
    const delBtn = el('btnRoleDetailDelete');
    if (delBtn) {
      if (role.is_system) {
        delBtn.classList.add('hidden');
        delBtn.classList.remove('flex');
      } else {
        delBtn.classList.remove('hidden');
        delBtn.classList.add('flex');
      }
    }
    const titleEl = el('roleDetailTitle');
    const idBadgeEl = el('roleDetailIdBadge');
    const descEl = el('roleDetailDesc');
    const permsEl = el('roleDetailPerms');
    const searchEl = el('roleDetailSearchInput');

    if (titleEl) titleEl.textContent = role.nama || role.name || cleanRoleId;
    if (idBadgeEl) idBadgeEl.textContent = cleanRoleId;
    if (descEl) descEl.textContent = `${role.deskripsi || role.description || '-'} (${Number(role.user_count || 0)} pegawai)`;
    if (searchEl) searchEl.value = '';

    if (permsEl) {
      const modules = extractPermissionModules(role.permissions);
      permsEl.innerHTML = modules.map((m) => (
        `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">${esc(m)}</span>`
      )).join('');
    }

    openSheetPanel('drawerRoleDetailBackdrop', 'drawerRoleDetailPanel', 'drawerRoleDetail');

    if (!getSharedUsers().length) {
      const listEl = el('roleDetailUsersList');
      if (listEl) listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Memuat daftar pegawai...</div>';
      await loadAdminPegawaiMobile(true);
    }
    setRoleDetailMode('members');
  }

  function closeRoleDetailSheet() {
    closeSheetPanel('drawerRoleDetailBackdrop', 'drawerRoleDetailPanel', 'drawerRoleDetail');
  }

  async function assignEmployeeToCurrentRole(userId, nama, nip) {
    const targetRole = normRole(roleDetailState.roleId);
    if (!targetRole) return false;
    try {
      const json = await assignUserRoleRequest(userId, nip, targetRole);
      applyLocalRoleUpdate(userId, nip, targetRole);
      await loadAdminRolesMobile(true);
      const updatedRole = rolesCache.find((r) => normRole(r.id) === targetRole);
      const descEl = el('roleDetailDesc');
      if (descEl && updatedRole) {
        descEl.textContent = `${updatedRole.deskripsi || updatedRole.description || '-'} (${Number(updatedRole.user_count || 0)} pegawai)`;
      }
      renderRoleDetailUsers();
      notify('success', 'Role Ditetapkan', json.message || `${nama} kini memegang role ${targetRole}.`);
      return true;
    } catch (err) {
      notify('error', 'Gagal Menetapkan Role', err.message);
      return false;
    }
  }

  function applyRoleFilterToPegawai() {
    activeRoleFilter = normRole(roleDetailState.roleId);
    closeRoleDetailSheet();
    updatePegawaiFilterChipsUI();
    renderPegawaiList();
    const section = el('adminSectionPegawai');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Delegated Click Handlers ──────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const pegawaiBtn = e.target.closest && e.target.closest('[data-pegawai-action]');
    if (pegawaiBtn) {
      const action = pegawaiBtn.getAttribute('data-pegawai-action');
      const userId = pegawaiBtn.getAttribute('data-user-id') || '';
      const nip = pegawaiBtn.getAttribute('data-nip') || '';
      const nama = pegawaiBtn.getAttribute('data-nama') || 'Pegawai';
      const role = pegawaiBtn.getAttribute('data-role') || 'USER';
      if (action === 'reset-password') adminResetPasswordMobile(userId, nama);
      else if (action === 'reset-face') adminResetFaceMobile(nip, nama);
      else if (action === 'assign-role') openAssignRoleSheet(userId, nama, role);
      return;
    }

    const assignOpt = e.target.closest && e.target.closest('[data-assign-role-id]');
    if (assignOpt) {
      selectAssignRoleOption(assignOpt.getAttribute('data-assign-role-id'));
      return;
    }

    const roleCard = e.target.closest && e.target.closest('[data-role-card-id]');
    if (roleCard) {
      openRoleDetailSheet(roleCard.getAttribute('data-role-card-id'));
      return;
    }

    const roleAssignBtn = e.target.closest && e.target.closest('[data-role-assign-user]');
    if (roleAssignBtn) {
      assignEmployeeToCurrentRole(
        roleAssignBtn.getAttribute('data-role-assign-user'),
        roleAssignBtn.getAttribute('data-nama') || 'Pegawai',
        roleAssignBtn.getAttribute('data-nip') || ''
      );
    }
  });

  /* ── Kontrol Absen (Jam Jaga) & Peringatan Akumulasi (Mobile) ──────── */
  function getMobInstansiId() {
    try {
      return (localStorage.getItem('_sess_inst')
        || localStorage.getItem('MY_INSTANSI')
        || w._session?.instansi_id
        || 'bapperida').trim() || 'bapperida';
    } catch (_) {
      return 'bapperida';
    }
  }

  function normalizeMobJam(raw) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || '').trim());
    if (!m) return '';
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  async function loadMobileKontrolAkumulasi() {
    const instId = getMobInstansiId();
    const kEnabled = el('mobKontrolEnabled');
    const kTol = el('mobKontrolToleransi');
    const kTimes = el('mobKontrolTimesInput');
    const aEnabled = el('mobAkumulasiEnabled');
    const aAmbang = el('mobAkumulasiAmbang');

    if (!kEnabled && !aEnabled) return;

    const tasks = [];
    if (kEnabled || kTol || kTimes) {
      tasks.push(
        requestJson(`/api/kontrol-absen?instansi_id=${encodeURIComponent(instId)}`)
          .then((json) => {
            const cfg = json.data?.config || json.config || {};
            if (kEnabled) kEnabled.checked = !!cfg.enabled;
            if (kTol) kTol.value = parseInt(cfg.toleransi, 10) || 30;
            if (kTimes) {
              const list = Array.isArray(cfg.times)
                ? cfg.times.map((t) => normalizeMobJam(t.jam)).filter(Boolean)
                : [];
              kTimes.value = list.join(', ');
            }
          })
          .catch((err) => {
            console.warn('[mobile-admin] gagal memuat kontrol-absen:', err.message);
          })
      );
    }

    if (aEnabled || aAmbang) {
      tasks.push(
        requestJson(`/api/peringatan-akumulasi?instansi_id=${encodeURIComponent(instId)}`)
          .then((json) => {
            const cfg = json.data?.config || json.config || {};
            if (aEnabled) aEnabled.checked = !!cfg.enabled;
            if (aAmbang) {
              const val = parseInt(cfg.ambang_menit, 10) || 435;
              aAmbang.value = Math.min(Math.max(val, 30), 1440);
            }
          })
          .catch((err) => {
            console.warn('[mobile-admin] gagal memuat peringatan-akumulasi:', err.message);
          })
      );
    }

    await Promise.all(tasks);
  }

  async function saveMobileKontrolAbsen() {
    const kEnabled = el('mobKontrolEnabled');
    const kTol = el('mobKontrolToleransi');
    const kTimes = el('mobKontrolTimesInput');
    const btn = el('btnSaveMobKontrol');

    const rawTokens = String(kTimes?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const times = [];
    for (const tok of rawTokens) {
      const jam = normalizeMobJam(tok);
      if (!jam) {
        notify('error', 'Format Jam Tidak Valid', `Jam "${tok}" harus berformat HH:MM (contoh: 10:00, 12:00).`);
        if (kTimes) kTimes.focus();
        return;
      }
      if (!seen.has(jam)) {
        seen.add(jam);
        times.push({ jam, aktif: true });
      }
    }

    const tolParsed = parseInt(kTol?.value, 10);
    const toleransi = Number.isFinite(tolParsed) && tolParsed > 0 ? tolParsed : 30;
    if (kTol) kTol.value = toleransi;
    if (kTimes) kTimes.value = times.map((t) => t.jam).join(', ');
    const enabled = !!kEnabled?.checked;

    if (btn) btn.disabled = true;
    try {
      await requestJson('/api/kontrol-absen', {
        method: 'POST',
        body: JSON.stringify({
          instansi_id: getMobInstansiId(),
          enabled,
          toleransi,
          times
        })
      });
      notify('success', 'Kontrol Absen Tersimpan', `Jam Jaga ${enabled ? 'aktif' : 'nonaktif'} (${times.length} jadwal, toleransi ${toleransi} menit).`);
    } catch (err) {
      notify('error', 'Gagal Menyimpan Kontrol Absen', err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function saveMobilePeringatanAkumulasi() {
    const aEnabled = el('mobAkumulasiEnabled');
    const aAmbang = el('mobAkumulasiAmbang');
    const btn = el('btnSaveMobAkumulasi');

    const raw = parseInt(aAmbang?.value, 10);
    const ambang_menit = Math.min(Math.max(Number.isFinite(raw) ? raw : 435, 30), 1440);
    if (aAmbang) aAmbang.value = ambang_menit;
    const enabled = !!aEnabled?.checked;

    if (btn) btn.disabled = true;
    try {
      await requestJson('/api/peringatan-akumulasi', {
        method: 'POST',
        body: JSON.stringify({
          instansi_id: getMobInstansiId(),
          enabled,
          ambang_menit
        })
      });
      const jam = Math.floor(ambang_menit / 60);
      const sisa = ambang_menit % 60;
      notify('success', 'Peringatan Akumulasi Tersimpan', `Notifikasi ${enabled ? 'aktif' : 'nonaktif'} pada ambang ${jam}j ${sisa}m (${ambang_menit} menit).`);
    } catch (err) {
      notify('error', 'Gagal Menyimpan Peringatan Akumulasi', err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ── Role Editor (Buat / Edit / Hapus Role & Permissions) ──────────── */
  let permissionsCatalogCache = null;
  let roleEditorEditId = '';

  async function ensurePermissionsCatalog() {
    if (Array.isArray(permissionsCatalogCache) && permissionsCatalogCache.length) return permissionsCatalogCache;
    const json = await requestJson('/api/admin/roles/permissions-list');
    permissionsCatalogCache = Array.isArray(json.data) ? json.data : [];
    return permissionsCatalogCache;
  }

  async function openRoleEditorSheet(editRoleId = '') {
    const cleanEditId = editRoleId ? normRole(editRoleId) : '';
    roleEditorEditId = cleanEditId;
    const existing = cleanEditId ? rolesCache.find((r) => normRole(r.id) === cleanEditId) : null;

    const modal = el('drawerRoleEditor');
    const titleEl = el('roleEditorTitle');
    const idInput = el('roleEditorIdInput');
    const namaInput = el('roleEditorNamaInput');
    const descInput = el('roleEditorDescInput');
    const permsBox = el('roleEditorPermsBox');
    if (!modal) return;

    closeRoleDetailSheet();
    if (titleEl) titleEl.textContent = existing ? `Edit Role: ${existing.nama || cleanEditId}` : 'Buat Role Baru';
    if (idInput) {
      idInput.value = existing ? cleanEditId : '';
      idInput.disabled = Boolean(existing);
    }
    if (namaInput) namaInput.value = existing ? (existing.nama || '') : '';
    if (descInput) descInput.value = existing ? (existing.deskripsi || '') : '';

    modal.classList.remove('hidden');
    if (permsBox) permsBox.innerHTML = '<div class="text-slate-400 text-center py-4">Memuat daftar perizinan...</div>';

    try {
      const catalog = await ensurePermissionsCatalog();
      const currentPerms = new Set(Array.isArray(existing?.permissions) ? existing.permissions : []);
      const isWildcard = currentPerms.has('*');
      if (permsBox) {
        permsBox.innerHTML = catalog.map((grp) => `
          <div class="pb-2 border-b border-slate-200/70 dark:border-slate-700/70 last:border-b-0">
            <div class="font-bold text-[11px] text-indigo-600 dark:text-indigo-400 uppercase mb-1.5">${esc(grp.name || grp.module)}</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              ${(grp.permissions || []).map((p) => {
                const checked = isWildcard || currentPerms.has(p.id) ? 'checked' : '';
                return `<label class="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer">
                  <input type="checkbox" data-role-perm="${esc(p.id)}" ${checked} ${isWildcard ? 'disabled' : ''} class="mt-0.5 w-4 h-4 accent-blue-600 rounded" />
                  <span class="min-w-0">
                    <span class="block font-semibold text-[11px] text-slate-800 dark:text-slate-100 leading-tight">${esc(p.name)}</span>
                    <span class="block text-[10px] text-slate-400 leading-tight">${esc(p.description || '')}</span>
                  </span>
                </label>`;
              }).join('')}
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      if (permsBox) permsBox.innerHTML = `<div class="text-rose-500 text-center py-4 font-semibold">${esc(err.message)}</div>`;
    }
  }

  function closeRoleEditorSheet() {
    const modal = el('drawerRoleEditor');
    if (modal) modal.classList.add('hidden');
  }

  async function submitRoleEditorSheet() {
    const btn = el('btnSubmitRoleEditor');
    const idVal = normRole(el('roleEditorIdInput')?.value || '');
    const namaVal = String(el('roleEditorNamaInput')?.value || '').trim();
    const descVal = String(el('roleEditorDescInput')?.value || '').trim();
    if (!roleEditorEditId && (!idVal || idVal.length < 2)) {
      notify('warning', 'ID Role Wajib', 'Masukkan ID role minimal 2 karakter (huruf/angka/underscore).');
      return;
    }
    if (!namaVal) {
      notify('warning', 'Nama Role Wajib', 'Masukkan nama tampilan role.');
      return;
    }

    const existing = roleEditorEditId ? rolesCache.find((r) => normRole(r.id) === roleEditorEditId) : null;
    const isWildcard = Array.isArray(existing?.permissions) && existing.permissions.includes('*');
    const perms = isWildcard
      ? ['*']
      : Array.from(document.querySelectorAll('#roleEditorPermsBox input[data-role-perm]:checked'))
          .map((cb) => cb.getAttribute('data-role-perm'))
          .filter(Boolean);

    if (btn) btn.disabled = true;
    try {
      if (roleEditorEditId) {
        await requestJson(`/api/admin/roles/${encodeURIComponent(roleEditorEditId)}`, {
          method: 'PUT',
          body: JSON.stringify({ nama: namaVal, deskripsi: descVal, permissions: perms }),
        });
        notify('success', 'Role Diperbarui', `Role ${namaVal} berhasil disimpan.`);
      } else {
        await requestJson('/api/admin/roles', {
          method: 'POST',
          body: JSON.stringify({ id: idVal, nama: namaVal, deskripsi: descVal, permissions: perms }),
        });
        notify('success', 'Role Dibuat', `Role baru ${namaVal} (${idVal}) berhasil ditambahkan.`);
      }
      closeRoleEditorSheet();
      await loadAdminRolesMobile(true);
    } catch (err) {
      notify('error', 'Gagal Menyimpan Role', err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteRoleFromDetail() {
    const targetId = normRole(roleDetailState.roleId);
    if (!targetId) return;
    const ok = await confirmDialog({
      title: `Hapus Role ${targetId}?`,
      text: 'Role custom yang tidak digunakan pegawai akan dihapus permanen.',
      confirmText: 'Ya, Hapus Role',
      confirmColor: '#e11d48',
    });
    if (!ok) return;
    try {
      await requestJson(`/api/admin/roles/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
      closeRoleDetailSheet();
      await loadAdminRolesMobile(true);
      notify('success', 'Role Dihapus', `Role ${targetId} berhasil dihapus.`);
    } catch (err) {
      notify('error', 'Gagal Menghapus Role', err.message);
    }
  }

  /* ── Keamanan Login (Wajib Password & Pegawai Wajib Scan Wajah) ────── */
  let mobMandatoryFaceNips = [];

  function renderMobileMandatoryFaceChips() {
    const chipsEl = el('mobMandatoryFaceChips');
    if (!chipsEl) return;
    if (!mobMandatoryFaceNips.length) {
      chipsEl.innerHTML = '<span class="text-[11px] text-slate-400">Belum ada pegawai wajib scan wajah.</span>';
      return;
    }
    const users = getSharedUsers();
    const map = {};
    users.forEach((u) => {
      const n = String(u.nip || '').trim();
      if (n) map[n] = u.nama || u.username || n;
    });
    chipsEl.innerHTML = mobMandatoryFaceNips.map((nip) => {
      const label = map[nip] ? `${map[nip]} (${nip})` : nip;
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[11px] font-semibold">
        <span>${esc(label)}</span>
        <button type="button" onclick="removeMobileMandatoryFaceNip('${esc(nip)}')" class="hover:text-rose-500 font-bold cursor-pointer" aria-label="Hapus">&times;</button>
      </span>`;
    }).join('');
  }

  function populateMobileMandatoryFaceSelect() {
    const sel = el('mobMandatoryFaceSelect');
    if (!sel) return;
    const users = getSharedUsers();
    const opts = ['<option value="">-- Pilih pegawai untuk ditambahkan --</option>'];
    users.forEach((u) => {
      const nip = String(u.nip || '').trim();
      const nama = String(u.nama || u.username || nip).trim();
      if (nip) opts.push(`<option value="${esc(nip)}">${esc(nama)} — ${esc(nip)}</option>`);
    });
    sel.innerHTML = opts.join('');
  }

  async function loadMobileSecuritySettings() {
    const instId = getMobInstansiId();
    const pwdEl = el('mobRequirePasswordToggle');
    const chipsEl = el('mobMandatoryFaceChips');
    if (!pwdEl && !chipsEl) return;

    populateMobileMandatoryFaceSelect();
    const tasks = [];
    if (pwdEl) {
      tasks.push(
        requestJson(`/api/password-toggle?instansi_id=${encodeURIComponent(instId)}`)
          .then((json) => { pwdEl.checked = !!json.enabled; })
          .catch(() => {})
      );
    }
    if (chipsEl) {
      tasks.push(
        requestJson(`/api/media/face-settings?instansi_id=${encodeURIComponent(instId)}`)
          .then((json) => {
            const s = json.settings || json.data?.settings || {};
            mobMandatoryFaceNips = Array.isArray(s.mandatory_nips)
              ? s.mandatory_nips.map((x) => String(x || '').trim()).filter(Boolean)
              : [];
            renderMobileMandatoryFaceChips();
          })
          .catch(() => {})
      );
    }
    await Promise.all(tasks);
  }

  async function saveMobileRequirePassword() {
    const pwdEl = el('mobRequirePasswordToggle');
    if (!pwdEl) return;
    const enabled = !!pwdEl.checked;
    try {
      await requestJson('/api/password-toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled, instansi_id: getMobInstansiId() }),
      });
      notify('success', 'Keamanan Login Diperbarui', `Wajib password saat login ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (err) {
      pwdEl.checked = !enabled;
      notify('error', 'Gagal Menyimpan', err.message);
    }
  }

  async function persistMobileMandatoryFaceNips() {
    try {
      await requestJson('/api/media/face-settings', {
        method: 'POST',
        body: JSON.stringify({ instansi_id: getMobInstansiId(), settings: { mandatory_nips: mobMandatoryFaceNips } }),
      });
      notify('success', 'Wajib Scan Wajah Disimpan', `${mobMandatoryFaceNips.length} pegawai wajib scan wajah saat login.`);
    } catch (err) {
      notify('error', 'Gagal Menyimpan Wajib Wajah', err.message);
    }
  }

  function addMobileMandatoryFaceNip() {
    const sel = el('mobMandatoryFaceSelect');
    if (!sel) return;
    const nip = String(sel.value || '').trim();
    if (!nip) return;
    if (!mobMandatoryFaceNips.includes(nip)) {
      mobMandatoryFaceNips.push(nip);
      renderMobileMandatoryFaceChips();
      persistMobileMandatoryFaceNips();
    }
    sel.value = '';
  }

  function removeMobileMandatoryFaceNip(nip) {
    const clean = String(nip || '').trim();
    mobMandatoryFaceNips = mobMandatoryFaceNips.filter((x) => x !== clean);
    renderMobileMandatoryFaceChips();
    persistMobileMandatoryFaceNips();
  }

  w.loadAdminPegawaiMobile = loadAdminPegawaiMobile;
  w.filterAdminPegawaiMobile = filterAdminPegawaiMobile;
  w.setAdminPegawaiFilter = setAdminPegawaiFilter;
  w.clearAdminPegawaiRoleFilter = clearAdminPegawaiRoleFilter;
  w.adminResetPasswordMobile = adminResetPasswordMobile;
  w.adminResetFaceMobile = adminResetFaceMobile;
  w.openAssignRoleSheet = openAssignRoleSheet;
  w.closeAssignRoleSheet = closeAssignRoleSheet;
  w.filterAssignRoleOptions = filterAssignRoleOptions;
  w.selectAssignRoleOption = selectAssignRoleOption;
  w.submitAssignRoleSheet = submitAssignRoleSheet;
  w.loadAdminRolesMobile = loadAdminRolesMobile;
  w.openRoleDetailSheet = openRoleDetailSheet;
  w.closeRoleDetailSheet = closeRoleDetailSheet;
  w.setRoleDetailMode = setRoleDetailMode;
  w.renderRoleDetailUsers = renderRoleDetailUsers;
  w.applyRoleFilterToPegawai = applyRoleFilterToPegawai;
  w.openRoleEditorSheet = openRoleEditorSheet;
  w.closeRoleEditorSheet = closeRoleEditorSheet;
  w.submitRoleEditorSheet = submitRoleEditorSheet;
  w.deleteRoleFromDetail = deleteRoleFromDetail;
  w.loadMobileSecuritySettings = loadMobileSecuritySettings;
  w.saveMobileRequirePassword = saveMobileRequirePassword;
  w.addMobileMandatoryFaceNip = addMobileMandatoryFaceNip;
  w.removeMobileMandatoryFaceNip = removeMobileMandatoryFaceNip;
  w.loadMobileKontrolAkumulasi = loadMobileKontrolAkumulasi;
  w.saveMobileKontrolAbsen = saveMobileKontrolAbsen;
  w.saveMobilePeringatanAkumulasi = saveMobilePeringatanAkumulasi;
})(window);
