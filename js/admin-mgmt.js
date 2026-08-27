/* ════ ADMIN MGMT ════ */
/**
 * Muat daftar admin aktif dari server dan render ke tabel.
 * @returns {Promise<void>}
 */
async function loadAdminMgmt() {
  const el = $('adminMgmtList');
  if (!el) return;
  dom.shimmer(el.id, 1);
  try {
    // 1. Fetch full user list
    // Efficiently fetch only admin/management users from the new dedicated endpoint
    const instId = getScopedInstansiId() || 'bapperida';
    const ur = await apiGet(P.adminList, { instansi_id: instId });
    if (!ur.ok) throw new Error('Gagal memuat data pengguna');
    
    // SAFETY FIX: Prioritize ur.rows (parsed by apiGet) over raw ur.data
    // This prevents empty lists when n8n returns nested objects like [{data: [...]}]
    const rawList = (ur.rows && ur.rows.length > 0) ? ur.rows : (Array.isArray(ur.data) ? ur.data : []);
    
    // BE MORE INCLUSIVE: Accept any user that has a NIP, ID, or Telegram ID
    const users = rawList.filter(u => u && (u.nip || u.NIP || u.id || u.ID || u.telegram_id));
    
    const managementRoles = ['admin', 'superadmin', 'kepala', 'sekretaris', 'kabid', 'irban', 'inspektur'];
    
    // Filter users who have management roles OR are in the dynamic ADMIN_NIPS list
    const admins = users.filter(u => {
      const nip = String(u.nip || u.NIP || '').trim();
      const tid = String(u.id || u.ID || u.telegram_id || '').trim();
      const roleStr = String(u.role || u.Role || 'user').toLowerCase().trim();
      
      // Robust admin flag check (handles boolean, string "true", and number 1)
      const admVal = u.is_admin ?? u.Is_Admin ?? u.IS_ADMIN;
      const isAdminFlag = admVal === true || String(admVal).toLowerCase() === 'true' || Number(admVal) === 1;
      
      // Check against global admin list (populated by loadJamAbsen from admin_list table)
      const isInAdminList = (nip && ADMIN_NIPS.includes(nip)) || (tid && ADMIN_NIPS.includes(tid));
      
      return managementRoles.some(mr => roleStr.includes(mr)) || isAdminFlag || isInAdminList;
    });

    // Update global ADMIN_NIPS
    ADMIN_NIPS.length = 0;
    window._adminRoleMap = {};
    admins.forEach(u => {
      const nip = String(u.nip || u.NIP || '').trim();
      const tid = String(u.id || u.ID || u.telegram_id || '').trim();
      const key = nip || tid;
      if (key) {
        if (nip) ADMIN_NIPS.push(nip);
        window._adminRoleMap[key] = String(u.role || u.Role || 'admin').toLowerCase().trim();
      }
    });

    if (!admins.length) {
      el.innerHTML = `<div class="empty-state" style="padding:12px"><div class="empty-icon">👥</div><div class="empty-text">Belum ada admin/pimpinan terdaftar</div></div>`;
      return;
    }

    // Sort hierarchy
    admins.sort((a, b) => {
      const getW = (u) => {
        const nip = String(u.nip || u.NIP || '').trim();
        const tid = String(u.id || u.ID || u.telegram_id || '').trim();
        const key = nip || tid;
        const r = (_adminRoleMap[key] || u.role || u.Role || 'user').toLowerCase().trim();
        
        if (r.includes('super')) return 10;
        if (r.includes('admin')) return 9;
        if (r.includes('kepala') || r.includes('inspektur')) return 8;
        if (r.includes('sekretaris')) return 7;
        if (r.includes('kabid') || r.includes('irban')) return 6;
        return 0;
      };
      
      return getW(b) - getW(a);
    });

    el.innerHTML = `
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:12px; overflow:hidden">
        ${admins.map((u, index) => {
          const id = String(u.id || u.ID || 0);
          const nama = u.nama || u.Nama || u.username || String(id);
          const nip = String(u.nip || u.NIP || '').trim();
          const myNip = String(userProfile?.nip || localStorage.getItem('MY_NIP') || '').trim();
          
          // NIP is the primary identity now
          const isMe = (myNip && nip && nip === myNip) || (id && id === String(MY_ID));
          
          const tid = String(u.id || u.ID || u.telegram_id || '').trim();
          const key = nip || tid;
          
          // Prioritize role from dynamic admin map (admin_list table)
          let role = (_adminRoleMap[key] || u.role || u.Role || 'admin').toLowerCase().trim();
          
          // Map roles to standard labels
          if (role.includes('kepala') || role.includes('inspektur')) role = 'pimpinan_1';
          else if (role.includes('sekretaris')) role = 'pimpinan_2';
          else if (role.includes('kabid') || role.includes('irban')) role = 'pimpinan_3';
          
          let roleLabel = 'ADMIN';
          let icon = '🛡️';
          let color = '#3b82f6';

          if (role.includes('super')) { roleLabel = 'SUPER ADMIN'; icon = '👑'; color = 'var(--gold)'; }
          else if (role === 'pimpinan_1') { 
            roleLabel = u.jabatan || u.Jabatan || 'KEPALA'; 
            icon = '🏛️'; color = '#ef4444'; 
          }
          else if (role === 'pimpinan_2') { roleLabel = 'SEKRETARIS'; icon = '📝'; color = '#10b981'; }
          else if (role === 'pimpinan_3') { 
            roleLabel = (u.role || u.Role || 'KABID').toUpperCase(); 
            icon = '👔'; color = '#f59e0b'; 
          }
          else if (role === 'irban') { roleLabel = 'IRBAN'; icon = '🔍'; color = '#8b5cf6'; }

          return `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; ${index !== admins.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.05)' : ''}; background:${isMe ? 'rgba(201,168,76,0.05)' : 'transparent'}">
              <div style="width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; font-size:16px; border:1px solid rgba(255,255,255,0.05)">${icon}</div>
              <div style="flex:1; min-width:0">
                <div style="font-size:12px; font-weight:800; color:${isMe ? 'var(--gold)' : 'var(--white)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">
                  ${nama} ${isMe ? '<span style="font-size:8px; background:var(--gold); color:#000; padding:1px 4px; border-radius:4px; margin-left:4px">SAYA</span>' : ''}
                </div>
                <div style="font-size:9px; color:var(--muted); display:flex; gap:8px">
                  <span>NIP: ${nip}</span>
                  <span style="color:${color}; font-weight:700">${roleLabel}</span>
                </div>
              </div>
              ${!isMe ? `
                <button onclick="hapusAdmin('${escapeHtml(id)}','${escapeHtml(nama)}', '${escapeHtml(nip)}')" 
                        style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#f87171; font-size:10px; padding:5px 8px; border-radius:8px; cursor:pointer; font-weight:700">
                  Cabut
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="padding:12px"><div class="empty-icon">🔌</div><div class="empty-text">Gagal memuat daftar manajemen: ${escapeHtml(e.message)}</div></div>`;
  }
}

function toggleAdminForm() {
  const f = $('adminAddForm');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function tambahAdmin() {
  if (!requireAdmin()) return;
  const idInput = $('inputAdminTgId');
  const nipInput = $('inputAdminNip');
  const namaInput = $('inputAdminNama');
  const roleInput = $('inputAdminRole');
  const tgId = (idInput?.value || '').trim();
  const nip = (nipInput?.value || '').trim().replace(/\s/g, '');
  const nama = (namaInput?.value || '').trim();
  const role = roleInput?.value || 'admin';

  if (!tgId && !nip) {
    _showAdminMgmtResult('warning', '⚠️', 'Data Kurang', 'Masukkan Telegram ID atau NIP pegawai.');
    return;
  }

  try {
    // Update role di user_list via user-edit
    // (Aman karena n8n sekarang menggunakan COALESCE untuk menjaga data lain)
    const { ok, data } = await apiPost(P.userEdit, {
      id: tgId,
      nip: nip,
      role: role.toUpperCase(),
      instansi_id: getScopedInstansiId()
    });

    if (!ok || data?.ok === false) {
      _showAdminMgmtResult('warning', '⚠️', 'Gagal', (data && data.message) || 'Gagal mengubah hak akses.');
      return;
    }

    if (idInput) idInput.value = '';
    if (nipInput) nipInput.value = '';
    if (namaInput) namaInput.value = '';
    
    // Auto-update local role if it's the current user
    if (String(tgId) === String(MY_ID) || (nip && String(nip) === String(userProfile?.nip))) {
       if (userProfile) userProfile.role = role.toUpperCase();
       localStorage.setItem('MY_ROLE', role.toUpperCase());
       if (typeof checkTugasLemburAccess === 'function') checkTugasLemburAccess();
    }

    _showAdminMgmtResult('success', '✅', 'Berhasil', `Hak akses ${role.toUpperCase()} telah diberikan.`);
    loadAdminMgmt();
  } catch (e) {
    _showAdminMgmtResult('fail', '🔌', 'Gagal', 'Server tidak merespons.');
  }
}

async function hapusAdmin(tgId, nama, nip) {
  if (!requireAdmin()) return;
  if (tgId == MY_ID) {
    _showAdminMgmtResult('warning', '⚠️', 'Tidak Bisa', 'Anda tidak bisa mencabut hak akses Anda sendiri.');
    return;
  }
  if (!confirm(`Cabut hak akses manajemen dari ${nama}?`)) return;
  try {
    // Kembalikan role ke USER via user-edit
    const { ok, data } = await apiPost(P.userEdit, {
      id: tgId,
      nip: nip,
      role: 'USER',
      instansi_id: getScopedInstansiId()
    });

    if (!ok || data?.ok === false) {
      _showAdminMgmtResult('warning', '⚠️', 'Gagal', data?.message || 'Gagal mencabut hak akses.');
      return;
    }

    // Auto-update local role if it's the current user
    if (String(tgId) === String(MY_ID) || (nip && String(nip) === String(userProfile?.nip))) {
       if (userProfile) userProfile.role = 'USER';
       localStorage.setItem('MY_ROLE', 'USER');
       if (typeof checkTugasLemburAccess === 'function') checkTugasLemburAccess();
    }

    _showAdminMgmtResult('success', '✅', 'Berhasil', `Hak akses ${nama} telah dicabut.`);
    loadAdminMgmt();
  } catch (e) {
    _showAdminMgmtResult('fail', '🔌', 'Gagal', 'Server tidak merespons.');
  }
}

function _showAdminMgmtResult(type, icon, title, msg) {
  const el = $('adminMgmtResult');
  if (!el) return;
  el.style.display = 'block';
  showResult('adminMgmtResult', 'adminMgmtRIcon', 'adminMgmtRTitle', 'adminMgmtRMsg', type, icon, title, msg);
}

/* ── Cache bersama endpoint jamAbsen — P.jamAbsen hanya dipanggil 1× ──
   Baik loadJamAbsen() maupun loadAdminMgmt() memakai _getJamAbsen()
   sehingga tidak ada double-request ke server Google Sheets.           */
let _jamAbsenCache = null;   // objek hasil JSON
let _jamAbsenPromise = null;   // Promise aktif yang sedang berjalan

async function _getJamAbsen() {
  if (_jamAbsenCache) return _jamAbsenCache;
  if (_jamAbsenPromise) return _jamAbsenPromise;
  const configSelect = $('configInstansiSelect');
  const instId = (configSelect && configSelect.value) || getScopedInstansiId();
  const params = instId ? { instansi_id: instId } : {};
  _jamAbsenPromise = apiGet(P.jamAbsen, params)
    .then(res => {
      if (!res.ok) return Promise.reject(new Error('HTTP error'));
      const raw = res.data;
      _jamAbsenCache = (Array.isArray(raw) ? raw[0] : raw?.data || raw) || {};
      // Sinkronisasi role ke map global dari admin_list (bukan user_list)
      if (_jamAbsenCache.admin_roles) {
        Object.entries(_jamAbsenCache.admin_roles).forEach(([key, role]) => {
          window._adminRoleMap[key] = role;
        });
        // Re-apply admin UI jika role saya berubah (misal baru login)
        if (typeof _applyAdminUIExtended === 'function') _applyAdminUIExtended();
      }
      return _jamAbsenCache;
    })
    .catch(e => { _jamAbsenPromise = null; return Promise.reject(e); });
  return _jamAbsenPromise;
}
function _resetJamAbsenCache() {
  _jamAbsenCache = null;
  _jamAbsenPromise = null;
}

async function loadJamAbsen() {
  const uid = await waitForMyId();
  try {
    const jam = await _getJamAbsen();
    if (jam.masuk) { const m = toMenitStr(jam.masuk); if (m !== null) JAM_MASUK_MENIT = m; }
    if (jam.pulang) { const m = toMenitStr(jam.pulang); if (m !== null) JAM_PULANG_MENIT = m; }

    // ── Muat daftar admin dari server (dinamis, tanpa hardcode) ──
    if (Array.isArray(jam.admin_nips) && jam.admin_nips.length) {
      ADMIN_NIPS.length = 0;
      jam.admin_nips.forEach(nip => ADMIN_NIPS.push(String(nip)));
    } else if (Array.isArray(jam.admin_ids) && jam.admin_ids.length) {
      // Fallback legacy ID (hanya jika admin_nips kosong)
      ADMIN_NIPS.length = 0;
      jam.admin_ids.forEach(id => ADMIN_NIPS.push(String(id)));
    }

    // Update global IS_ADMIN
    const myNip = String(userProfile?.nip || localStorage.getItem('MY_NIP') || '').trim();
    const myRole = (userProfile?.role || localStorage.getItem('MY_ROLE') || '').toUpperCase();
    window.IS_ADMIN = ADMIN_NIPS.includes(myNip) || 
                      myRole === 'SUPERADMIN' || 
                      myRole === 'ADMIN' ||
                      myRole.includes('SUPER') ||
                      myRole.includes('ADMIN');

    _applyAdminUI();
    if (typeof _applyAdminUIExtended === 'function') _applyAdminUIExtended();

    try { localStorage.setItem('jam_absen_bapperida', JSON.stringify({ masuk: menitToStr(JAM_MASUK_MENIT), pulang: menitToStr(JAM_PULANG_MENIT) })); } catch (_) { }
    updateClock();
    initJamAdminUI();
    if (typeof initSuperadminConfigScoping === 'function') initSuperadminConfigScoping();

    // FIX: Jika sedang di tab admin saat data jam/admin dimuat, refresh UI admin
    const activeTab = document.querySelector('.tab.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (activeTab === 'admin' && IS_ADMIN) {
      _applyAdminUIExtended();
      // Trigger loading data admin jika baru pertama kali terbuka
      if (typeof loadKonfirmasiAdmin === 'function') loadKonfirmasiAdmin();
    }
  } catch (e) {
    initJamAdminUI();
  }
}

function _applyAdminUI() {
  if (typeof applyAdminVisibility === 'function') {
    applyAdminVisibility();
    return;
  }
  const panelAdmin = $('panel-admin');
  if (!panelAdmin) return;

  // Update visibility of manual log button in Rekap tab
  const btnLog = $('btnTambahLog');
  if (btnLog) btnLog.style.display = IS_ADMIN ? 'inline-block' : 'none';

  // Update More Menu items
  const btnAdmin = $('more-admin');
  const sep = $('adminMoreSeparator');
  
  if (!IS_ADMIN) {
    panelAdmin.style.display = 'none';
    if (btnAdmin) btnAdmin.style.display = 'none';
    if (sep) sep.style.display = 'none';
    
    // Jika sedang di tab admin (yang sekarang terlarang), kembali ke absen
    if (localStorage.getItem('absen_last_tab') === 'admin') switchTab('absen');
  } else {
    panelAdmin.style.display = '';
    if (btnAdmin) btnAdmin.style.display = 'flex';
    if (sep) sep.style.display = 'block';
  }

  // Force refresh visibility for Tasks & Overtime
  if (typeof checkTugasLemburAccess === 'function') {
    checkTugasLemburAccess();
  }
}


/**
 * Simpan konfigurasi jam masuk/pulang global ke server.
 * @returns {Promise<void>}
 */
async function simpanJamAbsen() {
  const inM = $('inputJamMasuk'), inP = $('inputJamPulang');
  if (!inM || !inP) return;
  const mMasuk = toMenitStr(inM.value);
  const mPulang = toMenitStr(inP.value);
  if (mMasuk === null || mPulang === null) {
    showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'warning', '⚠️', 'Input Tidak Valid', 'Pastikan format jam benar (HH:MM).');
    return;
  }
  if (mMasuk >= mPulang) {
    showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'warning', '⚠️', 'Jam Tidak Logis', 'Jam masuk harus lebih kecil dari jam pulang.');
    return;
  }
  const btn = $('btnSimpanJam');
  if (btn) { btn.disabled = true; dom.setText('btnJamText', '💾 Menyimpan...'); }
  try {
    const configSelect = $('configInstansiSelect');
    const instId = (configSelect && configSelect.value) || getScopedInstansiId() || 'bapperida';
    await apiPost(P.jamAbsen, {
      masuk: inM.value,
      pulang: inP.value,
      instansi_id: instId,
      diubah_oleh: MY_ID,
      nip: localStorage.getItem('MY_NIP') || '',
      timestamp: Math.floor(Date.now() / 1000)
    });
    // Invalidasi cache agar loadAdminMgmt() membaca data terbaru
    _jamAbsenCache = null; _jamAbsenPromise = null;
    JAM_MASUK_MENIT = mMasuk;
    JAM_PULANG_MENIT = mPulang;
    try { localStorage.setItem('jam_absen_bapperida', JSON.stringify({ masuk: inM.value, pulang: inP.value })); } catch (_) { }
    updateClock();
    updateJamPreview();
    showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'success', '✅', 'Jam Tersimpan!',
      `Masuk ≤ ${inM.value} · Pulang ≥ ${inP.value}\nBerlaku langsung untuk semua pengguna.`);
  } catch {
    showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'warning', '⚠️', 'Gagal Menyimpan',
      'Simpan lokal berhasil, tapi gagal ke server. Pastikan webhook jam-absen aktif di n8n.');
    JAM_MASUK_MENIT = mMasuk;
    JAM_PULANG_MENIT = mPulang;
    try { localStorage.setItem('jam_absen_bapperida', JSON.stringify({ masuk: inM.value, pulang: inP.value })); } catch (_) { }
    updateClock(); updateJamPreview();
  } finally {
    if (btn) { setTimeout(() => { btn.disabled = false; dom.setText('btnJamText', 'Simpan Pengaturan Jam'); }, 2500); }
  }
}

/* ════ ADMIN JAM ════ */
/* ════ PENGATURAN JAM ABSEN (ADMIN) ════ */
function updateJamPreview() {
  const jmStr = menitToStr(JAM_MASUK_MENIT);
  const jpStr = menitToStr(JAM_PULANG_MENIT);
  setT('prevMasuk', jmStr);
  setT('prevMasuk1', menitToStr(JAM_MASUK_MENIT + 1));  // Terlambat mulai dari JamMasuk+1
  setT('prevTengah', '11:59');                           // Terlambat s/d sebelum tengah hari
  setT('prevTengah2', '12:00');
  setT('prevPulang1', menitToStr(JAM_PULANG_MENIT - 1)); // Belum waktunya s/d JamPulang-1
  setT('prevPulang', jpStr);
}

function initJamAdminUI() {
  const inM = $('inputJamMasuk'), inP = $('inputJamPulang');
  if (!inM || !inP) return;
  inM.value = menitToStr(JAM_MASUK_MENIT);
  inP.value = menitToStr(JAM_PULANG_MENIT);
  updateJamPreview();
  inM.addEventListener('input', () => {
    const m = toMenitStr(inM.value);
    if (m !== null) { JAM_MASUK_MENIT = m; updateJamPreview(); updateClock(); }
  });
  inP.addEventListener('input', () => {
    const m = toMenitStr(inP.value);
    if (m !== null) { JAM_PULANG_MENIT = m; updateJamPreview(); updateClock(); }
  });
}

function initSuperadminConfigScoping() {
  const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
  const sec = $('configInstansiSection');
  if (!sec) return;

  if (isSA) {
    sec.style.display = 'block';
    const el = $('configInstansiSelect');
    if (el) {
      if (el.options.length <= 1) {
        try {
          const cached = localStorage.getItem('absen_instansi_map');
          if (cached) {
            const map = JSON.parse(cached);
            const keys = Object.keys(map);
            el.innerHTML = '<option value="">— Pilih Instansi —</option>' +
              keys.map(k => {
                const inst = map[k];
                const id = inst.id || inst.ID || k;
                const name = inst.nama_instansi || inst.header || inst.nama || id.toUpperCase();
                return `<option value="${id}">${name}</option>`;
              }).join('');
          }
        } catch (e) {
          console.error('[Config Superadmin] populate error:', e);
        }
      }
      const scoped = getScopedInstansiId();
      if (scoped) {
        el.value = scoped;
      }
    }
  } else {
    sec.style.display = 'none';
  }
}

async function onConfigInstansiChange() {
  const el = $('configInstansiSelect');
  if (!el) return;
  const instId = el.value;
  if (!instId) return;

  _resetJamAbsenCache();
  try {
    const res = await apiGet(P.jamAbsen, { instansi_id: instId });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = res.data;
    const jam = data?.data || data || {};
    
    const inM = $('inputJamMasuk'), inP = $('inputJamPulang');
    if (inM && jam.masuk) inM.value = jam.masuk;
    if (inP && jam.pulang) inP.value = jam.pulang;
    
    if (jam.masuk) { const m = toMenitStr(jam.masuk); if (m !== null) JAM_MASUK_MENIT = m; }
    if (jam.pulang) { const m = toMenitStr(jam.pulang); if (m !== null) JAM_PULANG_MENIT = m; }
    
    updateClock();
    updateJamPreview();
    
    // Sync other dropdowns
    const mainSelect = $('adminInstansiSelect');
    if (mainSelect) {
      mainSelect.value = instId;
      // Set local storage and trigger update
      localStorage.setItem('MY_INSTANSI', instId);
      if (window.userProfile) window.userProfile.instansi_id = instId;
    }
  } catch (e) {
    console.error('[Config Scoping] Failed to load jam for instansi:', instId, e);
  }
}

window.initSuperadminConfigScoping = initSuperadminConfigScoping;
window.onConfigInstansiChange = onConfigInstansiChange;


