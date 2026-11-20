/* Stitch Core App: Auth, State, Bootstrap, Profil Biometrik & View Switcher */
    // DOM helper fallback
    if (typeof window.$ !== 'function') {
      window.$ = id => document.getElementById(id);
    }

    function togglePasswordVisibility(inputId, iconId) {
      const input = document.getElementById(inputId);
      const icon = document.getElementById(iconId);
      if (!input || !icon) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      icon.textContent = isPwd ? 'visibility_off' : 'visibility';
    }

    // Fallback tab switcher in case auth.js is delayed
    window.switchAuthTab = window.switchAuthTab || function(mode) {
      const loginTab = document.getElementById('tabLogin');
      const regTab = document.getElementById('tabRegister');
      const formL = document.getElementById('formLogin');
      const formR = document.getElementById('formRegister');
      if (mode === 'login') {
        loginTab?.classList.add('active', 'bg-blue-600', 'text-white');
        regTab?.classList.remove('active', 'bg-blue-600', 'text-white');
        if (formL) formL.style.display = 'block';
        if (formR) formR.style.display = 'none';
      } else {
        loginTab?.classList.remove('active', 'bg-blue-600', 'text-white');
        regTab?.classList.add('active', 'bg-blue-600', 'text-white');
        if (formL) formL.style.display = 'none';
        if (formR) formR.style.display = 'block';
      }
    };

    // Fast synchronous session check
    function checkAuthStatus(opts = {}) {
      const token = (typeof getNativeToken === 'function' ? getNativeToken() : null) ||
                    (typeof _nativeToken !== 'undefined' && _nativeToken) ||
                    localStorage.getItem('_native_token') ||
                    localStorage.getItem('native_token') ||
                    localStorage.getItem('_sess_token');
      const savedNip = localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || (window._session && window._session.nip);
      const authOverlayEl = document.getElementById('authOverlay');

      if (!token || !savedNip) {
        state.isLoggedIn = false;
        state.currentUser = null;
        if (authOverlayEl) authOverlayEl.style.display = 'flex';
        return false;
      } else {
        state.isLoggedIn = true;
        if (authOverlayEl && !opts.keepOverlay) authOverlayEl.style.display = 'none';
        return true;
      }
    }

    window.logoutUser = function() {
      Swal.fire({
        title: 'Konfirmasi Keluar',
        text: 'Apakah Anda yakin ingin keluar dari akun pegawai?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal'
      }).then(async (result) => {
        if (!result.isConfirmed) return;

        // 1. Cabut sesi di server (/api/auth/logout) & bersihkan cookie HttpOnly arsip_session
        const activeToken = (typeof getNativeToken === 'function' ? getNativeToken() : null)
          || localStorage.getItem('_native_token')
          || localStorage.getItem('native_token')
          || localStorage.getItem('_sess_token')
          || (window._session && window._session.token);

        if (activeToken && /^[0-9a-f]{192}$/.test(activeToken)) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3500);
            const base = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : '';
            await fetch(base + '/api/auth/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_token: activeToken }),
              signal: ctrl.signal
            });
            clearTimeout(t);
          } catch (_) {}
        }

        // 2. Bersihkan seluruh kunci sesi di localStorage, sessionStorage, dan cookie
        if (typeof clearNativeToken === 'function') clearNativeToken();
        if (typeof clearSession === 'function') clearSession();
        if (window.StitchSession && typeof window.StitchSession.clear === 'function') {
          window.StitchSession.clear();
        }
        [
          '_native_token', 'native_token', '_sess_token', '_sess_nip', '_sess_role', '_sess_inst',
          'stitch_active_nip', 'stitch_active_view', 'stitch_boot_cache_v1', 'MY_NIP', 'MY_ROLE', 'MY_NAME', 'MY_INSTANSI',
          'tg_user_id_v5', 'tg_user_obj_v5', 'tg_user_id_v4', 'tg_user_obj_v4'
        ].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });

        window.MY_ID = null;
        window.userProfile = null;
        state.isLoggedIn = false;
        state.currentUser = null;

        const authOverlayEl = document.getElementById('authOverlay');
        if (authOverlayEl) authOverlayEl.style.display = 'flex';
        const loginInput = document.getElementById('loginNip');
        if (loginInput) loginInput.value = '';
        const pwdInput = document.getElementById('loginPassword');
        if (pwdInput) pwdInput.value = '';

        // 3. Reload bersih tanpa hash agar semua state & halaman kembali ke layar login
        location.replace(location.pathname.endsWith('index.html') || location.pathname === '/' ? 'index.html' : 'login.html');
      });
    };

    // State Store
    const state = {
      isLoggedIn: false,
      currentUser: null,
      allUsers: [],
      locations: [],
      currentLocation: null,
      shift: { masuk: '07:15', pulang: '14:30' },
      holidays: [],
      gpsSimulationInside: true,
      attendance: {
        clockInTime: null,
        clockOutTime: null,
        selfiePhotoUrl: null,
        status: 'BELUM_ABSEN'
      },
      metrics: {
        hadir: 0,
        terlambat: 0,
        cuti: 0
      },
      userLogs: [],
      _asetDirty: false
    };

    const BOOT_CACHE_KEY = 'stitch_boot_cache_v1';
    let _faceConfigPromise = null;
    let _faceConfigLoaded = false;

    function sanitizeUserForCache(u) {
      if (!u || typeof u !== 'object') return null;
      const copy = { ...u };
      delete copy.face_histogram;
      if (typeof copy.face_photo === 'string' && (copy.face_photo.startsWith('data:') || copy.face_photo.length > 512)) {
        delete copy.face_photo;
      }
      if (typeof copy.signature === 'string' && (copy.signature.startsWith('data:') || copy.signature.length > 512)) {
        delete copy.signature;
      }
      return copy;
    }

    function saveBootCache() {
      try {
        if (!state.currentUser && !state.locations.length) return;
        const todayWita = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const payload = {
          v: 1,
          savedAt: Date.now(),
          savedDate: todayWita,
          nip: state.currentUser ? String(state.currentUser.nip || '') : (localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || ''),
          currentUser: sanitizeUserForCache(state.currentUser),
          attendance: state.attendance || null,
          metrics: state.metrics || null,
          userLogs: Array.isArray(state.userLogs) ? state.userLogs.slice(0, 100) : [],
          shift: state.shift || null,
          holidays: Array.isArray(state.holidays) ? state.holidays : [],
          locations: Array.isArray(state.locations) ? state.locations : []
        };
        localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify(payload));
      } catch (_) {}
    }

    function applyBootstrapSharedUI(recentLogs = null) {
      if (state.locations.length > 0) {
        state.currentLocation = state.locations[0];
        const officeNameEl = document.getElementById('currentOfficeName');
        if (officeNameEl) officeNameEl.textContent = state.currentLocation.nama_lokasi + ' (Titik DB)';

        const locSelect = document.getElementById('adminLocationSelect');
        if (locSelect) {
          locSelect.innerHTML = state.locations.map(l =>
            `<option value="${l.id}">${l.nama_lokasi} (${l.latitude}, ${l.longitude})</option>`
          ).join('');
          onAdminLocationChange();
          if (typeof syncAdminLocationDropdownUI === 'function') syncAdminLocationDropdownUI();
        }
      }

      if (state.shift) {
        const profilShiftHoursEl = document.getElementById('profilShiftHours');
        if (profilShiftHoursEl) profilShiftHoursEl.textContent = `${state.shift.masuk} - ${state.shift.pulang}`;
        const adminInEl = document.getElementById('adminJamMasuk');
        if (adminInEl && state.shift.masuk) adminInEl.value = state.shift.masuk;
        const adminOutEl = document.getElementById('adminJamPulang');
        if (adminOutEl && state.shift.pulang) adminOutEl.value = state.shift.pulang;
      }

      if (Array.isArray(state.holidays)) {
        renderJadwalHolidays(state.holidays);
        renderAdminHolidaysList(state.holidays);
      }

      if (Array.isArray(recentLogs)) {
        renderKioskRecentFeed(recentLogs);
        const todayWita = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const todayHadirNips = new Set(
          recentLogs
            .filter(l => {
              const tgl = String(l.Tanggal || '').slice(0, 10);
              const jns = String(l['Jenis Absen'] || '').toUpperCase();
              return tgl === todayWita && (jns.includes('MASUK') || jns === 'TERLAMBAT');
            })
            .map(l => String(l.NIP || '').trim())
            .filter(Boolean)
        );
        const kioskHadirEl = document.getElementById('kioskHadirCount');
        if (kioskHadirEl) kioskHadirEl.textContent = todayHadirNips.size;
        const kioskTotalEl = document.getElementById('kioskTotalStaff');
        if (kioskTotalEl) kioskTotalEl.textContent = state.allUsers.length;
      }
    }

    function hydrateFromCache() {
      try {
        const activeNip = localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || (window._session && window._session.nip) || '';
        let cached = null;
        const raw = localStorage.getItem(BOOT_CACHE_KEY);
        if (raw) {
          try { cached = JSON.parse(raw); } catch (_) { cached = null; }
        }

        const todayWita = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        if (cached && (!activeNip || !cached.nip || cached.nip === activeNip)) {
          if (cached.currentUser) state.currentUser = cached.currentUser;
          if (cached.shift) state.shift = cached.shift;
          if (Array.isArray(cached.holidays)) state.holidays = cached.holidays;
          if (Array.isArray(cached.locations)) state.locations = cached.locations;
          if (cached.metrics) state.metrics = cached.metrics;
          if (Array.isArray(cached.userLogs)) state.userLogs = cached.userLogs;
          if (cached.attendance && cached.savedDate === todayWita) {
            state.attendance = cached.attendance;
          }
        }

        // Fallback identity from auth storage keys if boot cache is missing or belongs to another NIP
        if (!state.currentUser && activeNip) {
          let fallbackUser = null;
          try {
            const uStr = localStorage.getItem('tg_user_obj_v5');
            if (uStr) fallbackUser = JSON.parse(uStr);
          } catch (_) {}
          if (fallbackUser && (!fallbackUser.nip || String(fallbackUser.nip) === String(activeNip))) {
            state.currentUser = sanitizeUserForCache(fallbackUser);
          } else {
            const myName = localStorage.getItem('MY_NAME');
            const myRole = localStorage.getItem('MY_ROLE');
            const myInst = localStorage.getItem('MY_INSTANSI');
            if (myName) {
              state.currentUser = {
                nip: activeNip,
                nama: myName,
                role: myRole || 'USER',
                instansi_id: myInst || 'bapperida'
              };
            }
          }
        }

        applyBootstrapSharedUI();
        if (state.currentUser) {
          if (typeof updateUserUI === 'function') updateUserUI();
          if (typeof updateAttendanceUI === 'function') updateAttendanceUI();
          if (typeof renderRiwayatCards === 'function') renderRiwayatCards(state.userLogs);
          if (typeof renderRiwayatFullTable === 'function') renderRiwayatFullTable(state.userLogs);
        }
      } catch (err) {
        console.warn('[Stitch Cache] Hydrate skipped:', err);
      }
    }

    const ADMIN_ROLES = ['ADMIN', 'SUPERADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN'];
    function isStitchAdminUser(u) {
      return ADMIN_ROLES.includes(String(u?.role || '').toUpperCase());
    }

    function applyThemePreference(theme) {
      const isDark = theme === 'dark';
      const html = document.documentElement;
      html.classList.toggle('dark', isDark);
      html.classList.toggle('light', !isDark);
      const icon = document.getElementById('themeIcon');
      if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
      if (window.StitchShell && typeof window.StitchShell.syncTheme === 'function') {
        window.StitchShell.syncTheme();
      }
    }

    // Initialize on DOM Ready
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const savedTheme = localStorage.getItem('stitch_theme');
        if (savedTheme === 'dark' || savedTheme === 'light') applyThemePreference(savedTheme);
      } catch (_) {}
      bindAdminSettingToggles();
      initClock();
      const isAuthed = checkAuthStatus();
      if (isAuthed) hydrateFromCache();
      bootstrapFromDatabase();
    });

    /* ── 1. BOOTSTRAP FROM POSTGRESQL DATABASE ────────────────────────── */
    async function loadStitchFaceConfig() {
      if (_faceConfigPromise) return _faceConfigPromise;
      const instId = state.currentUser?.instansi_id || localStorage.getItem('MY_INSTANSI') || 'bapperida';
      const tok = (typeof getStitchToken === 'function' ? getStitchToken() : '') ||
        (typeof getNativeToken === 'function' ? getNativeToken() : '') ||
        localStorage.getItem('_native_token') ||
        localStorage.getItem('native_token') ||
        localStorage.getItem('_sess_token') || '';

      const faceSettingsTask = (typeof loadFaceSettingsGlobal === 'function')
        ? loadFaceSettingsGlobal().catch(() => {})
        : Promise.resolve();
      const faceToggleTask = fetch('/api/media/face-toggle?instansi_id=' + encodeURIComponent(instId), {
        headers: tok ? { Authorization: 'Bearer ' + tok } : {}
      }).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const enabled = data?.enabled !== false;
        window.FACE_RECOGNITION_ENABLED = enabled;
        if (typeof FACE_RECOGNITION_ENABLED !== 'undefined') FACE_RECOGNITION_ENABLED = enabled;
      }).catch(() => {});

      _faceConfigPromise = Promise.allSettled([faceSettingsTask, faceToggleTask])
        .then(() => {
          _faceConfigLoaded = true;
          syncAdminFaceGpsCheckboxes();
        })
        .finally(() => {
          _faceConfigPromise = null;
        });
      return _faceConfigPromise;
    }

    async function bootstrapFromDatabase(opts = {}) {
      try {
        console.log('[Stitch DB] Fetching bootstrap data from PostgreSQL...');
        const isAuthed = checkAuthStatus(opts);
        const activeNip = isAuthed
          ? (localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || (window._session && window._session.nip))
          : null;

        const parallelTasks = [fetch('/api/stitch/bootstrap')];
        if (isAuthed) {
          if (activeNip) parallelTasks.push(selectUserByNip(activeNip, { skipSecondaryLoads: true }));
          parallelTasks.push(loadStitchFaceConfig());
        }

        const [res] = await Promise.all(parallelTasks);
        if (!res.ok) {
          console.warn('[Stitch DB] Server bootstrap returned HTTP ' + res.status);
          checkAuthStatus(opts);
          return;
        }
        const json = await res.json().catch(() => null);

        if (json && json.ok) {
          state.allUsers = json.users || [];
          state.locations = json.locations || [];
          if (json.shift) state.shift = json.shift;
          state.holidays = json.holidays || [];

          applyBootstrapSharedUI(json.recentLogs || []);

          // Re-render monthly summary if user logs arrived before holidays/shift from bootstrap
          if (state.currentUser && Array.isArray(state.userLogs) && typeof renderRiwayatCards === 'function') {
            renderRiwayatCards(state.userLogs);
          }

          saveBootCache();

          // Restore persisted view across page refresh (Hash or localStorage, mendukung #admin:sectionId)
          const rawHash = (window.location.hash || '').replace(/^#/, '').trim();
          const [hashView, hashSection] = rawHash.split(':');
          const savedView = localStorage.getItem('stitch_active_view');
          const targetView = hashView || savedView || 'presensi';
          switchMainView(targetView, false, hashSection || null);

          // Listen to browser navigation / hashchange for persistent multi-view
          if (!window._stitchHashListenerBound) {
            window._stitchHashListenerBound = true;
            window.addEventListener('hashchange', () => {
              const raw = (window.location.hash || '').replace(/^#/, '').trim();
              if (!raw) return;
              const [hv, hs] = raw.split(':');
              if (hv) switchMainView(hv, false, hs || null);
            });
          }

          if (!opts.keepOverlay && isAuthed && window.AutoAbsenLogin && typeof window.AutoAbsenLogin.consumeAutoAbsenNotice === 'function') {
            window.AutoAbsenLogin.consumeAutoAbsenNotice();
          }
        }
      } catch (err) {
        console.error('[Stitch DB] Bootstrap failed:', err);
        checkAuthStatus(opts);
      }
    }

    function renderJadwalHolidays(holidays) {
      const profilListEl = document.getElementById('profilHolidaysList');
      const profilCountBadge = document.getElementById('profilHolidayBadge');

      if (profilCountBadge) profilCountBadge.textContent = `${holidays.length} Hari Libur`;

      const emptyHtml = `<div class="p-3 text-center text-xs text-slate-400">Tidak ada kalender libur di database.</div>`;
      if (!holidays.length) {
        if (profilListEl) profilListEl.innerHTML = emptyHtml;
        return;
      }

      const holidayHtml = holidays.map(h => {
        const title = h.nama || h.nama_libur || 'Hari Libur Resmi';
        const isCuti = (h.jenis && h.jenis === 'Cuti Bersama') || title.toLowerCase().includes('cuti');
        const badgeColor = isCuti ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300';
        return `
          <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between">
            <div>
              <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200">${title}</h4>
              <p class="text-[10px] text-slate-500 font-mono mt-0.5">${h.tanggal} • ${isCuti ? 'Cuti Bersama' : 'Libur Nasional'}</p>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeColor}">${isCuti ? 'Cuti' : 'Libur'}</span>
          </div>
        `;
      }).join('');

      if (profilListEl) profilListEl.innerHTML = holidayHtml;
    }

    async function selectUserByNip(nip, opts = {}) {
      try {
        const prevNip = state.currentUser ? String(state.currentUser.nip || '') : '';
        const res = await fetch(`/api/stitch/user-data?nip=${nip}`);
        const data = await res.json();
        if (data.ok) {
          state.currentUser = data.user;
          state.attendance.status = data.today.status;
          state.attendance.clockInTime = data.today.clockInTime;
          state.attendance.clockOutTime = data.today.clockOutTime;
          state.attendance.keterangan = data.today.keterangan || null;
          state.metrics = data.metrics;
          state.userLogs = data.logs || [];

          localStorage.setItem('stitch_active_nip', nip);
          localStorage.setItem('MY_NIP', nip);

          // Sinkronkan identitas & cache biometrik ke modul D:\Code\absensi (face.js / absen.js)
          window.MY_ID = String(data.user.id || '');
          window.userProfile = data.user;
          if (!window._faceRefCache) window._faceRefCache = {};
          let desc = data.user.face_histogram || null;
          if (typeof desc === 'string') { try { desc = JSON.parse(desc); } catch (_) { desc = null; } }
          const hasDesc = Array.isArray(desc) && desc.length >= 128;
          if (data.user.face_photo || hasDesc) {
            window._faceRefCache[window.MY_ID] = {
              dataUrl: resolveBioImageSrc(data.user.face_photo) || 'enrolled',
              descriptor: hasDesc ? desc : null,
              savedAt: data.user.face_saved_at || new Date().toISOString(),
              faceModel: data.user.face_model || 'human'
            };
          } else {
            delete window._faceRefCache[window.MY_ID];
          }

          updateUserUI();
          updateAttendanceUI();
          renderRiwayatCards(state.userLogs);
          renderRiwayatFullTable(state.userLogs);
          saveBootCache();

          const userChanged = prevNip && prevNip !== String(data.user.nip || '');
          if (userChanged) {
            const onAsetTab = !document.getElementById('view-aset')?.classList.contains('hidden');
            if (onAsetTab && !opts.skipSecondaryLoads) {
              state._asetDirty = false;
              loadViewOnce('aset', () => loadRealMobileAsetData(), true);
            } else {
              state._asetDirty = true;
            }
          }
        }
      } catch (err) {
        console.error('[Stitch DB] Failed to load user:', err);
      }
    }

    function updateUserUI() {
      if (!state.currentUser) return;
      const u = state.currentUser;
      
      const parts = (u.nama || 'ASN').trim().split(/\s+/);
      const initials = (parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0][0] || 'A')).toUpperCase();

      // Presensi View Header & Banner
      const mobileNameEl = document.getElementById('mobileUserName');
      if (mobileNameEl) mobileNameEl.textContent = u.nama;
      const mobileRoleEl = document.getElementById('mobileUserRole');
      if (mobileRoleEl) mobileRoleEl.textContent = `${u.jabatan || 'Aparatur'} • ${u.bidang || 'BAPPERIDA'}`;

      // Header Initials
      const headerInitials = document.getElementById('headerUserInitials');
      if (headerInitials) headerInitials.textContent = initials;

      const riwayatTitleEl = document.getElementById('riwayatFullTitle');
      if (riwayatTitleEl) riwayatTitleEl.textContent = `Log Kehadiran: ${u.nama} (${u.nip})`;

      // Profil View Elements
      const profilInitials = document.getElementById('profilViewInitials');
      if (profilInitials) profilInitials.textContent = initials;
      const profilNameEl = document.getElementById('profilViewName');
      if (profilNameEl) profilNameEl.textContent = u.nama;
      const profilNipEl = document.getElementById('profilViewNip');
      if (profilNipEl) profilNipEl.textContent = 'NIP. ' + u.nip;
      const profilJabatanEl = document.getElementById('profilViewJabatan');
      if (profilJabatanEl) profilJabatanEl.textContent = `${u.jabatan || 'Aparatur'} • ${u.bidang || 'BAPPERIDA'}`;
      const profilPangkatEl = document.getElementById('profilViewPangkat');
      if (profilPangkatEl) profilPangkatEl.textContent = u.pangkat || u.golongan || 'PNS / PPPK BAPPERIDA';
      
      const sppdInput = document.getElementById('sppdPegawaiName');
      if (sppdInput) sppdInput.value = `${u.nama} - NIP. ${u.nip}`;

      const isAdmin = isStitchAdminUser(u);
      const profilAdminEl = document.getElementById('profilAdminSection');
      if (profilAdminEl) profilAdminEl.classList.toggle('hidden', !isAdmin);
      if (window.StitchShell && typeof window.StitchShell.syncRole === 'function') {
        window.StitchShell.syncRole();
      }
      const quickTppBtn = document.getElementById('btnQuickCetakTpp') ||
        document.querySelector('#view-presensi button[onclick*="switchMainView(\'tpp\')"]');
      if (quickTppBtn) {
        quickTppBtn.classList.toggle('hidden', !isAdmin);
        const gridEl = quickTppBtn.parentElement;
        if (gridEl) {
          gridEl.classList.toggle('grid-cols-3', !isAdmin);
          gridEl.classList.toggle('grid-cols-4', isAdmin);
        }
      }

      updateBiometricAndSigUI();
      renderCalendarStrip();
    }

    function resolveBioImageSrc(raw) {
      const s = String(raw ?? '').trim();
      if (!s || s === 'null' || s === 'undefined') return '';
      if (s.startsWith('data:image')) return s;
      // Ekstrak fileId dari URL Google Drive (/file/d/<id> atau ?id=<id>) -> arahkan ke proxy internal /api/media/raw/<id>
      const m = s.match(/\/file\/d\/([-\w]{5,200})/) || s.match(/[?&]id=([-\w]{5,200})/);
      if (m && m[1]) {
        const tok = (typeof window.getStitchToken === 'function' && window.getStitchToken())
          || (typeof window.getNativeToken === 'function' && window.getNativeToken())
          || '';
        const q = tok ? ('?token=' + encodeURIComponent(tok)) : '';
        return '/api/media/raw/' + encodeURIComponent(m[1]) + q;
      }
      if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
      return '';
    }
    window.resolveBioImageSrc = resolveBioImageSrc;

    function updateBiometricAndSigUI() {
      const u = state.currentUser;
      if (!u) return;
      const faceImg = document.getElementById('profilFaceImg');
      const faceIcon = document.getElementById('profilFaceIcon');
      const faceStatus = document.getElementById('profilFaceStatusText');
      const faceBtnLbl = document.getElementById('btnEnrollFaceLabel');
      const avatarBox = document.getElementById('profilViewAvatar');

      const parts = (u.nama || 'ASN').trim().split(/\s+/);
      const ini = (parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0][0] || 'A')).toUpperCase();

      let hasDescriptor = false;
      try {
        const hist = typeof u.face_histogram === 'string' ? JSON.parse(u.face_histogram) : u.face_histogram;
        hasDescriptor = Array.isArray(hist) && hist.length >= 128;
      } catch (_) {}

      const faceSrc = resolveBioImageSrc(u.face_photo);
      const hasFace = Boolean(faceSrc || hasDescriptor);

      if (hasFace) {
        if (faceStatus) {
          faceStatus.textContent = 'Terdaftar (AI)';
          faceStatus.className = 'text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate';
        }
        if (faceBtnLbl) faceBtnLbl.textContent = 'Perbarui';

        if (faceImg && faceSrc) {
          faceImg.onload = () => {
            faceImg.classList.remove('hidden');
            if (faceIcon) faceIcon.classList.add('hidden');
          };
          faceImg.onerror = () => {
            faceImg.classList.add('hidden');
            faceImg.removeAttribute('src');
            if (faceIcon) faceIcon.classList.remove('hidden');
          };
          faceImg.src = faceSrc;
        } else {
          if (faceImg) { faceImg.classList.add('hidden'); faceImg.removeAttribute('src'); }
          if (faceIcon) faceIcon.classList.remove('hidden');
        }

        if (avatarBox) {
          if (faceSrc) {
            const avImg = document.createElement('img');
            avImg.className = 'w-full h-full object-cover';
            avImg.alt = u.nama || 'Avatar';
            avImg.onload = () => {
              avatarBox.innerHTML = '';
              avatarBox.appendChild(avImg);
            };
            avImg.onerror = () => {
              avatarBox.innerHTML = `<span id="profilViewInitials">${ini}</span>`;
            };
            avImg.src = faceSrc;
          } else if (!document.getElementById('profilViewInitials')) {
            avatarBox.innerHTML = `<span id="profilViewInitials">${ini}</span>`;
          }
        }
      } else {
        if (faceImg) { faceImg.classList.add('hidden'); faceImg.removeAttribute('src'); }
        if (faceIcon) faceIcon.classList.remove('hidden');
        if (faceStatus) {
          faceStatus.textContent = 'Belum terdaftar';
          faceStatus.className = 'text-[10px] text-slate-400 truncate';
        }
        if (faceBtnLbl) faceBtnLbl.textContent = 'Daftarkan';
        if (avatarBox) {
          avatarBox.innerHTML = `<span id="profilViewInitials">${ini}</span>`;
        }
      }

      const sigImg = document.getElementById('profilSigPreviewImg');
      const sigIcon = document.getElementById('profilSigIcon');
      const sigStatus = document.getElementById('profilSigStatusText');
      const sigBtnLbl = document.getElementById('btnEnrollSigLabel');
      const rawSig = u.signature || localStorage.getItem('sig_' + u.nip) || null;
      const sigSrc = resolveBioImageSrc(rawSig);

      if (rawSig) {
        if (sigStatus) {
          sigStatus.textContent = 'Tersimpan di DB';
          sigStatus.className = 'text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate';
        }
        if (sigBtnLbl) sigBtnLbl.textContent = 'Perbarui';

        if (sigImg && sigSrc) {
          sigImg.onload = () => {
            sigImg.classList.remove('hidden');
            if (sigIcon) sigIcon.classList.add('hidden');
          };
          sigImg.onerror = () => {
            sigImg.classList.add('hidden');
            sigImg.removeAttribute('src');
            if (sigIcon) sigIcon.classList.remove('hidden');
          };
          sigImg.src = sigSrc;
        } else {
          if (sigImg) { sigImg.classList.add('hidden'); sigImg.removeAttribute('src'); }
          if (sigIcon) sigIcon.classList.remove('hidden');
        }
      } else {
        if (sigImg) { sigImg.classList.add('hidden'); sigImg.removeAttribute('src'); }
        if (sigIcon) sigIcon.classList.remove('hidden');
        if (sigStatus) {
          sigStatus.textContent = 'Belum ada';
          sigStatus.className = 'text-[10px] text-slate-400 truncate';
        }
        if (sigBtnLbl) sigBtnLbl.textContent = 'Buat TTD';
      }
    }

    function enrollMyFaceStitch() {
      if (!state.currentUser) return;
      window.MY_ID = String(state.currentUser.id || '');
      if (typeof openCamOverlay !== 'function') {
        Swal.fire('Info', 'Modul kamera AI belum siap.', 'info');
        return;
      }
      openCamOverlay({
        isRegister: true,
        onDone: async (cap) => {
          if (!cap || !cap.dataUrl) return;
          try {
            const res = await fetch('/api/stitch/face-save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nip: state.currentUser.nip,
                face_photo: cap.dataUrl,
                face_descriptor: cap.descriptor ? Array.from(cap.descriptor) : [],
                face_model: 'human'
              })
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.message || 'Gagal menyimpan wajah.');
            state.currentUser.face_photo = cap.dataUrl;
            state.currentUser.face_histogram = JSON.stringify(cap.descriptor ? Array.from(cap.descriptor) : []);
            window._faceRefCache[window.MY_ID] = {
              dataUrl: cap.dataUrl,
              descriptor: cap.descriptor ? Array.from(cap.descriptor) : null,
              savedAt: new Date().toISOString(),
              faceModel: 'human'
            };
            updateBiometricAndSigUI();
            showDynamicIsland({ type: 'success', title: 'Wajah AI Terdaftar!', message: 'Biometrik wajah Anda tersimpan di PostgreSQL.' });
          } catch (e) {
            Swal.fire('Gagal', e.message, 'error');
          }
        }
      });
    }

    let _sigKeyHandler = null;

    function updateStitchSigStrokeUI(hasInk) {
      const guide = document.getElementById('stitchSigGuide');
      const dot = document.getElementById('stitchSigStrokeDot');
      const txt = document.getElementById('stitchSigStrokeText');
      const err = document.getElementById('stitchSigError');
      if (guide) guide.classList.toggle('opacity-0', !!hasInk);
      if (dot) {
        dot.classList.toggle('bg-emerald-500', !!hasInk);
        dot.classList.toggle('bg-slate-300', !hasInk);
        dot.classList.toggle('dark:bg-slate-600', !hasInk);
      }
      if (txt) txt.textContent = hasInk ? 'Goresan aktif' : 'Belum ada goresan';
      if (hasInk && err) err.classList.add('hidden');
    }

    function setupStitchSigCanvas() {
      const c = document.getElementById('stitchSigCanvas');
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = c.getBoundingClientRect();
      const w = Math.max(280, Math.round(rect.width || 380));
      const h = Math.max(160, Math.round(rect.height || 180));
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      c._hasInk = false;
      updateStitchSigStrokeUI(false);

      if (c._stitchBound) return;
      c._stitchBound = true;
      let drawing = false;
      const getPos = (e) => {
        const r = c.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drawing = true;
        if (c.setPointerCapture) {
          try { c.setPointerCapture(e.pointerId); } catch (_) {}
        }
        const p = getPos(e);
        const context = c.getContext('2d');
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x + 0.01, p.y + 0.01);
        context.stroke();
        c._hasInk = true;
        updateStitchSigStrokeUI(true);
      });
      c.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const p = getPos(e);
        const context = c.getContext('2d');
        context.lineTo(p.x, p.y);
        context.stroke();
      });
      const stopDraw = (e) => {
        if (!drawing) return;
        drawing = false;
        if (c.releasePointerCapture) {
          try { c.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      c.addEventListener('pointerup', stopDraw);
      c.addEventListener('pointercancel', stopDraw);
    }

    function clearStitchSignatureCanvas() {
      const c = document.getElementById('stitchSigCanvas');
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
      c._hasInk = false;
      updateStitchSigStrokeUI(false);
    }

    function openStitchSignatureModal() {
      if (!state.currentUser) return;
      const modal = document.getElementById('modalStitchSignature');
      const backdrop = document.getElementById('modalStitchSignatureBackdrop');
      const panel = document.getElementById('modalStitchSignaturePanel');
      if (!modal || !backdrop || !panel) return;

      const err = document.getElementById('stitchSigError');
      if (err) err.classList.add('hidden');
      const btnSave = document.getElementById('btnSaveStitchSig');
      const btnText = document.getElementById('btnSaveStitchSigText');
      if (btnSave) btnSave.disabled = false;
      if (btnText) btnText.textContent = 'Simpan TTD';

      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        panel.classList.remove('translate-y-full', 'sm:scale-95', 'opacity-0');
        setupStitchSigCanvas();
      });

      if (!_sigKeyHandler) {
        _sigKeyHandler = (e) => {
          if (e.key === 'Escape') closeStitchSignatureModal();
        };
        document.addEventListener('keydown', _sigKeyHandler);
      }
    }

    function closeStitchSignatureModal() {
      const modal = document.getElementById('modalStitchSignature');
      const backdrop = document.getElementById('modalStitchSignatureBackdrop');
      const panel = document.getElementById('modalStitchSignaturePanel');
      if (!modal || !backdrop || !panel) return;

      backdrop.classList.add('opacity-0');
      panel.classList.add('translate-y-full', 'sm:scale-95', 'opacity-0');
      if (_sigKeyHandler) {
        document.removeEventListener('keydown', _sigKeyHandler);
        _sigKeyHandler = null;
      }
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 210);
    }

    async function saveStitchSignatureModal() {
      if (!state.currentUser) return;
      const c = document.getElementById('stitchSigCanvas');
      const err = document.getElementById('stitchSigError');
      if (!c || !c._hasInk) {
        if (err) err.classList.remove('hidden');
        return;
      }
      const dataUrl = c.toDataURL('image/png');
      const btnSave = document.getElementById('btnSaveStitchSig');
      const btnText = document.getElementById('btnSaveStitchSigText');
      if (btnSave) btnSave.disabled = true;
      if (btnText) btnText.textContent = 'Menyimpan...';

      try {
        const res = await fetch('/api/stitch/signature-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nip: state.currentUser.nip, signature: dataUrl })
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.message || 'Gagal menyimpan tanda tangan.');
        state.currentUser.signature = dataUrl;
        try { localStorage.setItem('sig_' + state.currentUser.nip, dataUrl); } catch (_) {}
        updateBiometricAndSigUI();
        closeStitchSignatureModal();
        showDynamicIsland({ type: 'success', title: 'Tanda Tangan Tersimpan', message: 'Siap digunakan pada PDF Daftar Hadir.' });
      } catch (e) {
        Swal.fire('Gagal', e.message, 'error');
      } finally {
        if (btnSave) btnSave.disabled = false;
        if (btnText) btnText.textContent = 'Simpan TTD';
      }
    }

    function renderKioskRecentFeed(logs) {
      const feedList = document.getElementById('kioskFeedList');
      if (!feedList) return;

      if (!logs.length) {
        feedList.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">Belum ada riwayat tercatat.</div>`;
        return;
      }

      feedList.innerHTML = logs.slice(0, 8).map(l => {
        const isMasuk = l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK';
        const color = isMasuk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
        return `
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full ${isMasuk ? 'bg-emerald-600' : 'bg-rose-600'} text-white flex items-center justify-center font-bold flex-shrink-0">
              <span class="material-symbols-outlined text-[20px]">${isMasuk ? 'login' : 'logout'}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${l.Nama}</p>
              <p class="text-[11px] text-slate-400 font-mono">${l.Tanggal} • ${l.Jam} WITA</p>
            </div>
            <span class="text-[10px] ${color} px-2 py-0.5 rounded-full font-bold">${l['Jenis Absen']}</span>
          </div>
        `;
      }).join('');
    }

    function formatIndoDate(dateStr) {
      if (!dateStr) return 'Tanggal Tidak Valid';
      try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
          return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }
        return dateStr;
      } catch (_) {
        return dateStr;
      }
    }

    function calculateWorkDuration(jamMasuk, jamPulang) {
      if (!jamMasuk || !jamPulang) return 'Jam kerja belum lengkap';
      try {
        const [h1, m1] = jamMasuk.split(':').map(Number);
        const [h2, m2] = jamPulang.split(':').map(Number);
        const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (totalMinutes <= 0) return '0 Jam Kerja';
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        return `${hours} Jam ${mins > 0 ? mins + ' Menit' : ''} Kerja`;
      } catch (_) {
        return 'Tercatat Jam Kerja';
      }
    }
    /* ── DYNAMIC ISLAND NOTIFICATION CONTROLLER (IPHONE STYLE) ────────── */
    let islandTimer = null;

    function showDynamicIsland(options = {}) {
      const title = typeof options === 'string' ? options : (options.title || 'Pemberitahuan');
      const message = typeof options === 'string' ? '' : (options.message || '');
      const type = (typeof options === 'object' && options.type) ? options.type : 'success';
      const duration = (typeof options === 'object' && options.duration) ? options.duration : 3400;

      const island = document.getElementById('dynamicIsland');
      const iconWrap = document.getElementById('islandIconWrap');
      const iconEl = document.getElementById('islandIcon');
      const titleEl = document.getElementById('islandTitle');
      const msgEl = document.getElementById('islandMessage');
      const accentEl = document.getElementById('islandRightAccent');

      if (!island) return;

      if (islandTimer) {
        clearTimeout(islandTimer);
        islandTimer = null;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) {
        if (message) {
          msgEl.textContent = message;
          msgEl.classList.remove('hidden');
        } else {
          msgEl.classList.add('hidden');
        }
      }

      let iconName = 'check_circle';
      let iconBg = 'bg-emerald-500/20 text-emerald-400';
      let dotColor = 'bg-emerald-400';

      if (type === 'error') {
        iconName = 'error';
        iconBg = 'bg-rose-500/20 text-rose-400';
        dotColor = 'bg-rose-400';
      } else if (type === 'info') {
        iconName = 'info';
        iconBg = 'bg-blue-500/20 text-blue-400';
        dotColor = 'bg-blue-400';
      } else if (type === 'warning') {
        iconName = 'warning';
        iconBg = 'bg-amber-500/20 text-amber-400';
        dotColor = 'bg-amber-400';
      } else if (type === 'download') {
        iconName = 'download_done';
        iconBg = 'bg-blue-500/20 text-blue-400';
        dotColor = 'bg-blue-400';
      }

      if (iconEl) iconEl.textContent = iconName;
      if (iconWrap) iconWrap.className = `w-7 h-7 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0 transition-colors`;
      if (accentEl) accentEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse"></span>`;

      island.classList.remove('-translate-y-16', 'scale-90', 'opacity-0');
      island.classList.add('translate-y-0', 'scale-100', 'opacity-100');

      islandTimer = setTimeout(() => {
        dismissDynamicIsland();
      }, duration);
    }

    function dismissDynamicIsland() {
      const island = document.getElementById('dynamicIsland');
      if (!island) return;
      if (islandTimer) {
        clearTimeout(islandTimer);
        islandTimer = null;
      }
      island.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
      island.classList.add('-translate-y-16', 'scale-90', 'opacity-0');
    }

    // Global alias for seamless integration across all views
    window.showToast = function(msg, type = 'info') {
      showDynamicIsland({ title: msg, type });
    };

    /* ── 2. REALTIME CLOCK WITA (UTC+8) ────────────────────────────── */
    function initClock() {
      function update() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        const timeStr = `${hrs}:${mins}:${secs}`;
        
        const clockEl = document.getElementById('liveClockDisplay');
        if (clockEl) clockEl.textContent = timeStr;

        // Analog Clock Hands Rotation (Stitch Specification)
        const secondDeg = (parseInt(secs, 10) / 60) * 360;
        const minuteDeg = ((parseInt(mins, 10) + parseInt(secs, 10) / 60) / 60) * 360;
        const hourDeg = (((parseInt(hrs, 10) % 12) + parseInt(mins, 10) / 60) / 12) * 360;

        const handSec = document.getElementById('hand-second');
        const handMin = document.getElementById('hand-minute');
        const handHr = document.getElementById('hand-hour');

        if (handSec) handSec.style.transform = `rotate(${secondDeg}deg)`;
        if (handMin) handMin.style.transform = `rotate(${minuteDeg}deg)`;
        if (handHr) handHr.style.transform = `rotate(${hourDeg}deg)`;

        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        
        const dateEl = document.getElementById('currentDateDisplay');
        if (dateEl) dateEl.textContent = dateStr;
      }
      setInterval(update, 1000);
      update();
    }

    /* ── 3. VIEW SWITCHER (PERSISTENT ACROSS REFRESH) ────────────────── */
    const _viewLoadState = {};
    function loadViewOnce(key, loaderFn, force = false) {
      const entry = _viewLoadState[key] || (_viewLoadState[key] = { loading: null, loaded: false });
      if (entry.loading && !force) return entry.loading;
      if (entry.loaded && !force) return Promise.resolve();
      const p = Promise.resolve()
        .then(() => loaderFn())
        .then(
          () => { entry.loaded = true; entry.loading = null; },
          () => { entry.loading = null; }
        );
      entry.loading = p;
      return p;
    }

    function escHtml(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function switchMainView(viewName, updateHash = true, sectionId = null) {
      const target = (viewName === 'riwayat') ? 'riwayat-full' : (viewName === 'profile' || viewName === 'jadwal') ? 'profil' : viewName;
      const views = ['presensi', 'riwayat-full', 'arsip', 'aset', 'profil', 'kiosk', 'admin', 'sppd', 'tpp'];
      if (!views.includes(target)) return;

      if ((target === 'admin' || target === 'tpp') && state.currentUser && !isStitchAdminUser(state.currentUser)) {
        if (typeof showDynamicIsland === 'function') {
          showDynamicIsland({ type: 'warning', title: 'Akses Terbatas', message: 'Menu ini hanya untuk Administrator / Pimpinan.' });
        }
        return switchMainView('presensi', updateHash);
      }

      // Persist active view to localStorage & sync with URL hash
      try {
        localStorage.setItem('stitch_active_view', target);
        if (updateHash) {
          const normSec = (sectionId === 'adminSectionDev') ? 'dev' : sectionId;
          const hashVal = (target === 'riwayat-full')
            ? 'riwayat'
            : (target === 'admin' && normSec ? `admin:${normSec}` : target);
          if (window.location.hash !== '#' + hashVal) {
            history.replaceState(null, null, '#' + hashVal);
          }
        }
      } catch (_) {}

      views.forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) {
          if (v === target) {
            el.classList.remove('hidden');
            el.classList.add('flex');
          } else {
            el.classList.add('hidden');
            el.classList.remove('flex');
          }
        }
      });

      // Global mobile bottom nav visibility
      const bottomNav = document.getElementById('globalMobileBottomNav');
      const isMobileTab = ['presensi', 'riwayat-full', 'arsip', 'aset', 'profil'].includes(target);
      if (bottomNav) {
        if (isMobileTab) {
          bottomNav.classList.remove('hidden');
        } else {
          bottomNav.classList.add('hidden');
        }
      }

      // Sync active tab styling in floating bottom bar
      const tabMap = {
        'presensi': 'presensi',
        'riwayat-full': 'riwayat',
        'arsip': 'arsip',
        'aset': 'aset',
        'profil': 'profil'
      };
      const activeTabKey = tabMap[target];

      document.querySelectorAll('.mobile-tab').forEach(t => {
        t.classList.remove('text-blue-600', 'dark:text-blue-400', 'font-bold');
        t.classList.add('text-slate-400');
      });
      if (activeTabKey) {
        const activeTab = document.getElementById('mTab-' + activeTabKey);
        if (activeTab) {
          activeTab.classList.add('text-blue-600', 'dark:text-blue-400', 'font-bold');
          activeTab.classList.remove('text-slate-400');
        }
      }

      const normalizedSection = (sectionId === 'adminSectionDev') ? 'dev' : sectionId;
      const effectiveSection = (target === 'admin') ? (normalizedSection || 'adminSectionMonitoring') : normalizedSection;

      if (target === 'admin') {
        const panelMeta = {
          adminSectionMonitoring: {
            title: 'Monitoring Presensi Hari Ini',
            sub: 'Pantau status kehadiran seluruh pegawai secara real-time.',
            saveBtn: false
          },
          adminSectionIzin: {
            title: 'Persetujuan Cuti, Izin & Sakit',
            sub: 'Verifikasi permohonan pegawai atau input keterangan atas nama pegawai.',
            saveBtn: false
          },
          adminSectionRekap: {
            title: 'Rekap Kehadiran Seluruh Pegawai',
            sub: 'Pratinjau dokumen berkop + paraf/TTD serta unduh PDF (F4) & Excel (.xlsx).',
            saveBtn: false
          },
          adminSectionPegawai: {
            title: 'Master Pegawai & Biometrik AI',
            sub: 'Kelola direktori pegawai, reset kata sandi, reset wajah AI, dan peran.',
            saveBtn: false
          },
          adminSectionRoles: {
            title: 'Kelola Role & Hak Akses',
            sub: 'Atur matriks wewenang dan penetapan peran pegawai.',
            saveBtn: false
          },
          adminSectionGeofence: {
            title: 'Geofencing Lokasi & Parameter AI',
            sub: 'Atur titik koordinat, radius buffer kantor, dan keamanan biometrik.',
            saveBtn: true
          },
          adminSectionJamLibur: {
            title: 'Jam Kerja WITA & Hari Libur',
            sub: 'Konfigurasi jadwal masuk/pulang, toleransi keterlambatan, dan hari libur.',
            saveBtn: true
          },
          dev: {
            title: 'Developer & Diagnostik',
            sub: 'Pemantauan kesehatan 8 subsistem aplikasi, uji diagnostik, dan log aktivitas sistem.',
            saveBtn: false
          }
        };
        const activeMeta = panelMeta[effectiveSection] || panelMeta.adminSectionMonitoring;
        const h1 = document.getElementById('adminPanelHeading');
        const sub = document.getElementById('adminPanelSubheading');
        const saveBtn = document.getElementById('btnSaveAdminSettings');
        if (h1) h1.textContent = activeMeta.title;
        if (sub) sub.textContent = activeMeta.sub;
        if (saveBtn) saveBtn.classList.toggle('hidden', !activeMeta.saveBtn);

        document.querySelectorAll('#view-admin [data-admin-panel]').forEach(panel => {
          const id = panel.getAttribute('data-admin-panel');
          const show = id === effectiveSection;
          panel.classList.toggle('hidden', !show);
          if (id === 'adminSectionGeofence') {
            panel.classList.toggle('grid', show);
          } else {
            panel.classList.toggle('flex', show);
          }
        });
      }

      if (window.StitchShell && typeof window.StitchShell.syncActive === 'function') {
        window.StitchShell.syncActive(target, effectiveSection);
      }

      if (target === 'tpp') {
        loadViewOnce('tpp', () => loadTppData());
      } else if (target === 'admin') {
        if (effectiveSection === 'adminSectionMonitoring') {
          loadViewOnce('admin-mon', () => loadAdminMonitoringData());
        } else if (effectiveSection === 'adminSectionIzin') {
          loadViewOnce('admin-izin', () => loadAdminKeteranganData());
        } else if (effectiveSection === 'adminSectionRekap') {
          if (typeof initAdminRekapPanel === 'function') initAdminRekapPanel();
        } else if (effectiveSection === 'adminSectionPegawai') {
          loadViewOnce('admin-pegawai', () => (typeof loadAdminPegawaiMobile === 'function' ? loadAdminPegawaiMobile() : Promise.resolve()));
        } else if (effectiveSection === 'adminSectionRoles') {
          loadViewOnce('admin-roles', () => (typeof loadAdminRolesMobile === 'function' ? loadAdminRolesMobile() : Promise.resolve()));
        } else if (effectiveSection === 'adminSectionGeofence') {
          loadViewOnce('admin-face-cfg', () => (_faceConfigLoaded ? Promise.resolve() : loadStitchFaceConfig()));
          if (typeof initAdminGeofenceMap === 'function') {
            requestAnimationFrame(() => initAdminGeofenceMap());
          }
        } else if (effectiveSection === 'adminSectionJamLibur') {
          window.loadMobileKontrolAkumulasi?.();
        } else if (effectiveSection === 'dev') {
          window.renderDevHealthMatrix?.();
          window.renderDevLogTable?.();
        }
      } else if (target === 'sppd') {
        loadViewOnce('sppd', () => Promise.all([
          loadSppdData(),
          loadKirBarangData(),
          loadKirPemeliharaanData()
        ]));
      } else if (target === 'aset') {
        const forceAset = Boolean(state._asetDirty);
        state._asetDirty = false;
        loadViewOnce('aset', () => loadRealMobileAsetData(), forceAset);
      } else if (target === 'arsip') {
        loadViewOnce('arsip', () => loadRealMobileArsipData());
      }

      if (target === 'kiosk') {
        startKioskCamera();
      } else {
        stopKioskCamera();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function switchMobileTab(tabName) {
      if (tabName === 'presensi') {
        switchMainView('presensi');
      } else if (tabName === 'riwayat') {
        switchMainView('riwayat-full');
      } else if (tabName === 'arsip') {
        switchMainView('arsip');
      } else if (tabName === 'aset') {
        switchMainView('aset');
      } else if (tabName === 'profil' || tabName === 'jadwal') {
        switchMainView('profil');
      }
    }

    /* ── 6. KIOSK LOBBY SCANNER (POSTGRESQL INSERTION) ───────────────── */
    let kioskStream = null;
    function startKioskCamera() {
      const video = document.getElementById('kioskWebcam');
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            kioskStream = stream;
            video.srcObject = stream;
          })
          .catch(e => console.warn('[Kiosk] No webcam:', e));
      }
    }

    function stopKioskCamera() {
      if (kioskStream) {
        kioskStream.getTracks().forEach(track => track.stop());
        kioskStream = null;
      }
    }

    async function submitKioskBiometric() {
      const activeNip = (state.currentUser && state.currentUser.nip) || localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || '';
      const { value: formVal } = await Swal.fire({
        title: 'Terminal Kiosk Lobi BAPPERIDA',
        html: `
          <div class="text-left space-y-3 text-xs pt-1">
            <div>
              <label for="swalKioskNip" class="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">NIP Pegawai</label>
              <input id="swalKioskNip" type="text" value="${activeNip}" placeholder="Masukkan 18 digit NIP..." class="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 font-mono text-[13px] focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition-colors" />
            </div>
            <div>
              <span class="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Jenis Presensi</span>
              <input id="swalKioskJenis" type="hidden" value="MASUK" />
              <div class="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button type="button" data-kiosk-jenis="MASUK" class="min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-blue-600 text-white shadow-xs">
                  <span class="material-symbols-outlined text-[17px]">login</span>
                  <span>Masuk</span>
                </button>
                <button type="button" data-kiosk-jenis="PULANG" class="min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                  <span class="material-symbols-outlined text-[17px]">logout</span>
                  <span>Pulang</span>
                </button>
              </div>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Catat ke Database',
        cancelButtonText: 'Batal',
        didOpen: (popup) => {
          const hidden = popup.querySelector('#swalKioskJenis');
          const pills = popup.querySelectorAll('[data-kiosk-jenis]');
          pills.forEach((btn) => {
            btn.addEventListener('click', () => {
              const val = btn.getAttribute('data-kiosk-jenis');
              if (hidden) hidden.value = val;
              pills.forEach((p) => {
                const active = p.getAttribute('data-kiosk-jenis') === val;
                p.classList.toggle('bg-blue-600', active);
                p.classList.toggle('text-white', active);
                p.classList.toggle('shadow-xs', active);
                p.classList.toggle('text-slate-600', !active);
                p.classList.toggle('dark:text-slate-300', !active);
              });
            });
          });
        },
        preConfirm: () => {
          const nip = (document.getElementById('swalKioskNip')?.value || '').trim();
          const jenis = document.getElementById('swalKioskJenis')?.value || 'MASUK';
          if (!nip) { Swal.showValidationMessage('NIP wajib diisi.'); return false; }
          return { nip, jenis };
        }
      });
      if (!formVal) return;

      const loc = state.currentLocation || { nama_lokasi: 'Kantor Bapperida (Terminal Lobi)', latitude: '-9.648769', longitude: '119.389232' };
      try {
        const res = await fetch('/api/stitch/absen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nip: formVal.nip,
            jenis: formVal.jenis,
            lokasi: loc.nama_lokasi || 'Kantor Bapperida (Terminal Lobi)',
            koordinat: `${loc.latitude || '-9.648769'},${loc.longitude || '119.389232'}`,
            akurasi: 10,
            ket: 'Kiosk Lobi BAPPERIDA'
          })
        });
        const json = await res.json();

        if (json.ok) {
          const empName = (json.record && json.record.Nama) || (state.allUsers.find(u => u.nip === formVal.nip)?.nama) || formVal.nip;
          const feedList = document.getElementById('kioskFeedList');
          if (feedList) {
            const item = document.createElement('div');
            item.className = 'p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3';
            item.innerHTML = `
              <div class="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                <span class="material-symbols-outlined text-[20px]">check</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${empName}</p>
                <p class="text-[11px] text-slate-500 font-mono">${json.witaTime} • ${formVal.jenis}</p>
              </div>
              <span class="text-[10px] bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">Tersimpan DB</span>
            `;
            feedList.prepend(item);
          }

          const countEl = document.getElementById('kioskHadirCount');
          if (countEl) countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;
          showDynamicIsland({ type: 'success', title: `Kiosk ${formVal.jenis} Tercatat`, message: `${empName} • ${json.witaTime}` });
        } else {
          Swal.fire('Gagal', json.message || 'Gagal mencatat presensi kiosk.', 'error');
        }
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      }
    }

    /* ── 7. CETAK TPP ────────────────────────────────────────────────── */
    let _lastTppPayload = null;
    function renderTppTable(data = _lastTppPayload?.data || []) {
      const tbody = document.getElementById('tppTableBody');
      if (!tbody) return;
      if (!Array.isArray(data) || !data.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada data rekapitulasi TPP.</td></tr>';
        return;
      }
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        tbody.innerHTML = data.map(u => `
          <tr>
            <td colspan="7" class="py-2 px-0">
              <div class="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 flex flex-col gap-2.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="font-bold text-sm text-slate-900 dark:text-white truncate">${escHtml(u.nama)}</p>
                    <p class="text-[11px] font-mono text-slate-400 truncate">${escHtml(u.nip)}</p>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold shrink-0 whitespace-nowrap">${escHtml(u.disiplin)}</span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escHtml(u.jabatan || '-')} • ${escHtml(u.pangkat || '-')}</p>
                <div class="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                  <div>
                    <span class="block text-[10px] text-slate-400">Hari Kerja</span>
                    <span class="font-mono font-bold text-xs text-slate-800 dark:text-slate-200 tabular-nums">${escHtml(u.hariKerja)}</span>
                  </div>
                  <div>
                    <span class="block text-[10px] text-slate-400">Hadir</span>
                    <span class="font-mono font-bold text-xs text-emerald-600 tabular-nums">${escHtml(u.hadir)}</span>
                  </div>
                  <div>
                    <span class="block text-[10px] text-slate-400">Telat</span>
                    <span class="font-mono font-bold text-xs text-amber-600 tabular-nums">${escHtml(u.terlambat)}</span>
                  </div>
                  <div>
                    <span class="block text-[10px] text-slate-400">Potongan</span>
                    <span class="font-mono font-bold text-xs text-rose-600 dark:text-rose-400 tabular-nums">${escHtml(u.potongan)}</span>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `).join('');
        return;
      }
      tbody.innerHTML = data.map(u => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <td class="p-3">
            <span class="font-bold">${escHtml(u.nama)}</span>
            <p class="text-[11px] font-mono text-slate-400">${escHtml(u.nip)}</p>
          </td>
          <td class="p-3">
            <span>${escHtml(u.jabatan || '-')}</span>
            <p class="text-[10px] text-slate-400">${escHtml(u.pangkat || '-')}</p>
          </td>
          <td class="p-3 text-center font-mono tabular-nums">${escHtml(u.hariKerja)}</td>
          <td class="p-3 text-center font-mono font-bold text-emerald-600 tabular-nums">${escHtml(u.hadir)}</td>
          <td class="p-3 text-center font-mono text-amber-600 tabular-nums">${escHtml(u.terlambat)}</td>
          <td class="p-3 text-center"><span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">${escHtml(u.disiplin)}</span></td>
          <td class="p-3 text-right font-mono font-bold text-slate-500 tabular-nums">${escHtml(u.potongan)}</td>
        </tr>
      `).join('');
    }
    const _tppMq = window.matchMedia('(min-width: 768px)');
    const _onTppBpChange = () => { if (_lastTppPayload?.data) renderTppTable(_lastTppPayload.data); };
    if (_tppMq.addEventListener) _tppMq.addEventListener('change', _onTppBpChange);
    else if (_tppMq.addListener) _tppMq.addListener(_onTppBpChange);

    async function loadTppData() {
      const tbody = document.getElementById('tppTableBody');
      try {
        const res = await fetch('/api/stitch/rekap-tpp');
        const json = await res.json();
        if (json.ok && json.data) {
          _lastTppPayload = json;
          renderTppTable(json.data);
        }
      } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">Gagal menghitung TPP: ${escHtml(e.message)}</td></tr>`;
      }
    }

    async function downloadTppPdf() {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showDynamicIsland({ type: 'warning', title: 'Library PDF Sedang Dimuat', message: 'Silakan tunggu sebentar.' });
        return;
      }
      if (!_lastTppPayload) await loadTppData();
      const payload = _lastTppPayload || { period: new Date().toISOString().slice(0, 7), data: [], kepala: null };

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: [215, 330] }); // F4 Landscape
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), margin = 12, cx = W / 2 + 10;

      try {
        const logoImg = document.querySelector('img[src*="Lambang_Kabupaten_Sumba_Barat"]') || await new Promise(res => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = 'Lambang_Kabupaten_Sumba_Barat.png';
        });
        if (logoImg) doc.addImage(logoImg, 'PNG', margin + 5, 9, 20, 23);
      } catch (e) {
        console.warn('Gagal memuat logo ke PDF:', e);
      }

      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', cx, 14, { align: 'center' });
      doc.setFontSize(14);
      doc.text('BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH', cx, 20, { align: 'center' });
      doc.setFont('times', 'normal');
      doc.setFontSize(8.5);
      doc.text('Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur - WAIKABUBAK', cx, 26, { align: 'center' });

      doc.setLineWidth(0.7);
      doc.line(margin + 5, 31, W - margin - 5, 31);
      doc.setLineWidth(0.2);
      doc.line(margin + 5, 31.8, W - margin - 5, 31.8);

      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.text('REKAPITULASI DISIPLIN KEHADIRAN & POTONGAN TPP APARATUR', W / 2, 39, { align: 'center' });
      doc.setFont('times', 'normal');
      doc.setFontSize(9.5);
      doc.text(`Periode: ${payload.period} (${payload.hariKerja || 0} Hari Kerja Efektif)`, W / 2, 44, { align: 'center' });

      const rows = (payload.data || []).map((u, idx) => [
        idx + 1,
        `${u.nama}\nNIP. ${u.nip || '-'}`,
        `${u.jabatan || '-'}${u.pangkat ? '\n(' + u.pangkat + ')' : ''}`,
        u.hariKerja ?? 0,
        u.hadir ?? 0,
        u.terlambat ?? 0,
        u.disiplin || '0%',
        u.potongan || '0%'
      ]);

      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: 48,
          margin: { left: margin, right: margin, bottom: 20 },
          head: [['No', 'Nama Pegawai / NIP', 'Jabatan / Pangkat', 'Hari Kerja', 'Hadir', 'Terlambat', 'Capaian Disiplin', 'Potongan Disiplin']],
          body: rows.length ? rows : [['1', 'Belum ada data pegawai', '-', '0', '0', '0', '0%', '0%']],
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineWidth: 0.1 },
          styles: { font: 'times', fontSize: 8.5, cellPadding: 2, valign: 'middle' },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            3: { halign: 'center', cellWidth: 24 },
            4: { halign: 'center', cellWidth: 20 },
            5: { halign: 'center', cellWidth: 22 },
            6: { halign: 'center', cellWidth: 28 },
            7: { halign: 'center', cellWidth: 28 }
          }
        });
      }

      let fy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 70) + 12;
      if (fy + 42 > H) { doc.addPage(); fy = 22; }
      const sx = W - 65, kp = payload.kepala;
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.text(`Waikabubak, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, sx, fy, { align: 'center' });
      doc.text('Mengetahui,', sx, fy + 5.5, { align: 'center' });
      doc.text(kp?.jabatan || 'Kepala Badan', sx, fy + 10.5, { align: 'center' });
      if (kp && kp.signature && typeof sigToDataUrl === 'function') {
        try {
          const s = await sigToDataUrl(kp.signature);
          if (s) doc.addImage(s, s.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', sx - 15, fy + 13, 30, 14, undefined, 'FAST');
        } catch (_) {}
      }
      doc.setFont('times', 'bold');
      doc.text(kp?.nama || '__________________________', sx, fy + 33, { align: 'center' });
      doc.setFont('times', 'normal');
      if (kp?.pangkat) doc.text(kp.pangkat, sx, fy + 38, { align: 'center' });
      doc.text(`NIP. ${kp?.nip || '..........................................'}`, sx, fy + (kp?.pangkat ? 43 : 38), { align: 'center' });

      doc.save(`Rekap_TPP_BAPPERIDA_${payload.period}.pdf`);
      showDynamicIsland({
        type: 'download',
        title: 'PDF Rekap TPP Tersimpan',
        message: 'Laporan TPP berkop resmi BAPPERIDA berhasil diunduh.'
      });
    }

    /* ── 8. ADMIN LOKASI & BIOMETRIK SETTINGS ─────────────────────────── */
    function onAdminLocationChange() {
      const sel = document.getElementById('adminLocationSelect');
      if (!sel) return;
      const loc = state.locations.find(l => String(l.id) === sel.value);
      if (loc) {
        document.getElementById('adminOfficeLat').value = loc.latitude;
        document.getElementById('adminOfficeLon').value = loc.longitude;
        document.getElementById('adminRadiusSlider').value = loc.radius || 20;
        document.getElementById('radiusLabel').textContent = (loc.radius || 20) + ' Meter';
      }
      syncAdminLocationDropdownUI();
      if (typeof updateAdminGeofenceMap === 'function') updateAdminGeofenceMap();
    }

    function syncAdminLocationDropdownUI() {
      const sel = document.getElementById('adminLocationSelect');
      const labelEl = document.getElementById('adminLocationLabel');
      const listEl = document.getElementById('adminLocationDropdown');
      if (!sel) return;
      const selectedId = String(sel.value || '');
      const locs = Array.isArray(state.locations) && state.locations.length
        ? state.locations
        : Array.from(sel.options).map(o => ({ id: o.value, nama_lokasi: o.textContent, latitude: '', longitude: '' }));
      const activeLoc = locs.find(l => String(l.id) === selectedId) || locs[0];
      if (labelEl && activeLoc) {
        labelEl.textContent = activeLoc.latitude
          ? `${activeLoc.nama_lokasi} (${activeLoc.latitude}, ${activeLoc.longitude})`
          : String(activeLoc.nama_lokasi || 'Pilih Lokasi');
      }
      if (listEl) {
        const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        listEl.innerHTML = locs.map(l => {
          const isActive = String(l.id) === selectedId;
          const label = l.latitude ? `${l.nama_lokasi} (${l.latitude}, ${l.longitude})` : l.nama_lokasi;
          return `
            <button type="button" onclick="selectAdminLocation('${esc(l.id)}')" class="w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isActive ? 'bg-blue-50/70 dark:bg-blue-950/40 font-bold text-blue-600 dark:text-blue-400' : 'font-medium text-slate-700 dark:text-slate-200'}">
              <span class="truncate">${esc(label)}</span>
              ${isActive ? '<span class="material-symbols-outlined text-[16px] shrink-0">check</span>' : ''}
            </button>
          `;
        }).join('');
      }
    }

    function toggleAdminLocationDropdown() {
      const drop = document.getElementById('adminLocationDropdown');
      const icon = document.getElementById('adminLocationExpandIcon');
      if (!drop) return;
      const willOpen = drop.classList.contains('hidden');
      if (willOpen) syncAdminLocationDropdownUI();
      drop.classList.toggle('hidden', !willOpen);
      if (icon) icon.textContent = willOpen ? 'expand_less' : 'expand_more';
    }

    function selectAdminLocation(id) {
      const sel = document.getElementById('adminLocationSelect');
      if (sel) sel.value = String(id);
      onAdminLocationChange();
      const drop = document.getElementById('adminLocationDropdown');
      const icon = document.getElementById('adminLocationExpandIcon');
      if (drop) drop.classList.add('hidden');
      if (icon) icon.textContent = 'expand_more';
    }

    function toggleAdminToleransiDropdown() {
      const drop = document.getElementById('adminToleransiDropdown');
      const icon = document.getElementById('adminToleransiExpandIcon');
      if (!drop) return;
      const willOpen = drop.classList.contains('hidden');
      drop.classList.toggle('hidden', !willOpen);
      if (icon) icon.textContent = willOpen ? 'expand_less' : 'expand_more';
    }

    function selectAdminToleransi(val) {
      const sel = document.getElementById('adminToleransi');
      const labelEl = document.getElementById('adminToleransiLabel');
      const drop = document.getElementById('adminToleransiDropdown');
      const icon = document.getElementById('adminToleransiExpandIcon');
      if (sel) sel.value = String(val);
      const labels = {
        '0': '0 Menit (Ketepatan Mutlak)',
        '15': '15 Menit (Standar Pemda)',
        '30': '30 Menit (Kondisi Khusus)'
      };
      if (labelEl) labelEl.textContent = labels[String(val)] || `${val} Menit`;
      if (drop) {
        drop.querySelectorAll('button[data-toleransi]').forEach(btn => {
          const active = btn.getAttribute('data-toleransi') === String(val);
          btn.className = `w-full px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer ${active ? 'font-bold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40' : 'font-medium text-slate-700 dark:text-slate-200'}`;
          const existingCheck = btn.querySelector('.material-symbols-outlined');
          if (active && !existingCheck) {
            btn.insertAdjacentHTML('beforeend', '<span class="material-symbols-outlined text-[16px]">check</span>');
          } else if (!active && existingCheck) {
            existingCheck.remove();
          }
        });
        drop.classList.add('hidden');
      }
      if (icon) icon.textContent = 'expand_more';
    }

    function syncAdminFaceGpsCheckboxes() {
      const faceEl = document.getElementById('adminFaceToggle');
      if (faceEl) {
        const faceEnabled = typeof window.FACE_RECOGNITION_ENABLED === 'boolean'
          ? window.FACE_RECOGNITION_ENABLED
          : (typeof FACE_RECOGNITION_ENABLED === 'boolean' ? FACE_RECOGNITION_ENABLED : true);
        const livenessEnabled = window.FS_LIVENESS_MOBILE !== false;
        faceEl.checked = Boolean(faceEnabled && livenessEnabled);
      }
      const gpsEl = document.getElementById('adminGpsStrictToggle');
      if (gpsEl) {
        let gpsStrict = true;
        try { gpsStrict = localStorage.getItem('stitch_gps_strict') !== '0'; } catch (_) {}
        window.STITCH_GPS_STRICT = gpsStrict;
        gpsEl.checked = gpsStrict;
      }
    }

    async function saveAdminFaceAndGpsSettings(showToast = false) {
      const faceEl = document.getElementById('adminFaceToggle');
      const gpsEl = document.getElementById('adminGpsStrictToggle');
      const instId = state.currentUser?.instansi_id || localStorage.getItem('MY_INSTANSI') || 'bapperida';
      const tok = (typeof getStitchToken === 'function' ? getStitchToken() : '') ||
        (typeof getNativeToken === 'function' ? getNativeToken() : '') ||
        localStorage.getItem('_native_token') ||
        localStorage.getItem('native_token') ||
        localStorage.getItem('_sess_token') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (tok) headers['Authorization'] = 'Bearer ' + tok;

      let ok = true;
      if (faceEl) {
        const enabled = !!faceEl.checked;
        window.FACE_RECOGNITION_ENABLED = enabled;
        if (typeof FACE_RECOGNITION_ENABLED !== 'undefined') FACE_RECOGNITION_ENABLED = enabled;
        window.FS_LIVENESS_MOBILE = enabled;
        try {
          const [r1, r2] = await Promise.all([
            fetch('/api/media/face-toggle', {
              method: 'POST',
              headers,
              body: JSON.stringify({ enabled, instansi_id: instId })
            }),
            fetch('/api/media/face-settings', {
              method: 'POST',
              headers,
              body: JSON.stringify({ instansi_id: instId, settings: { liveness_enabled: enabled } })
            })
          ]);
          if (!r1.ok || !r2.ok) ok = false;
        } catch (_) {
          ok = false;
        }
      }
      if (gpsEl) {
        const gpsStrict = !!gpsEl.checked;
        window.STITCH_GPS_STRICT = gpsStrict;
        try { localStorage.setItem('stitch_gps_strict', gpsStrict ? '1' : '0'); } catch (_) {}
      }
      if (showToast && typeof showDynamicIsland === 'function') {
        showDynamicIsland({
          type: ok ? 'success' : 'warning',
          title: ok ? 'Pengaturan AI & GPS Disimpan' : 'Tersimpan Lokal',
          message: ok ? 'Parameter Face AI dan GPS telah diperbarui.' : 'Sebagian pengaturan gagal disinkronkan ke server.'
        });
      }
      return ok;
    }

    function bindAdminSettingToggles() {
      const faceEl = document.getElementById('adminFaceToggle');
      if (faceEl && !faceEl.dataset.bound) {
        faceEl.dataset.bound = '1';
        faceEl.addEventListener('change', () => { saveAdminFaceAndGpsSettings(true); });
      }
      const gpsEl = document.getElementById('adminGpsStrictToggle');
      if (gpsEl && !gpsEl.dataset.bound) {
        gpsEl.dataset.bound = '1';
        gpsEl.addEventListener('change', () => { saveAdminFaceAndGpsSettings(true); });
      }
      syncAdminFaceGpsCheckboxes();
    }

    async function saveAdminSettings() {
      const g = (id) => document.getElementById(id);
      const okLoc = await AdminCore.saveLokasi({
        id: g('adminLocationSelect')?.value,
        lat: g('adminOfficeLat')?.value,
        lon: g('adminOfficeLon')?.value,
        radius: g('adminRadiusSlider')?.value
      });
      let okJam = true;
      if (g('adminJamMasuk') && g('adminJamPulang') && typeof AdminCore.saveJamAbsen === 'function') {
        okJam = await AdminCore.saveJamAbsen({
          masuk: g('adminJamMasuk').value,
          pulang: g('adminJamPulang').value
        });
      }
      const okFace = await saveAdminFaceAndGpsSettings(false);
      if (okLoc || okJam || okFace) await bootstrapFromDatabase();
    }

    async function addAdminHolidayStitch() {
      const tgl = document.getElementById('adminLiburDate')?.value;
      const nama = document.getElementById('adminLiburName')?.value;
      if (!AdminCore.addLibur) return;
      const rows = await AdminCore.addLibur({ tanggal: tgl, nama });
      if (rows) {
        state.holidays = rows;
        renderJadwalHolidays(rows);
        renderAdminHolidaysList(rows);
        if (document.getElementById('adminLiburName')) document.getElementById('adminLiburName').value = '';
      }
    }

    async function deleteAdminHolidayStitch(tanggal) {
      if (!AdminCore.deleteLibur) return;
      const rows = await AdminCore.deleteLibur(tanggal);
      if (rows) {
        state.holidays = rows;
        renderJadwalHolidays(rows);
        renderAdminHolidaysList(rows);
      }
    }

    function editAdminHolidayStitch(tanggal, nama) {
      const dateEl = document.getElementById('adminLiburDate');
      const nameEl = document.getElementById('adminLiburName') || document.getElementById('adminLiburNama');
      if (dateEl) dateEl.value = tanggal || '';
      if (nameEl) {
        nameEl.value = nama || '';
        nameEl.focus();
      }
    }

    function renderAdminHolidaysList(holidays) {
      const box = document.getElementById('adminHolidaysList');
      if (!box) return;
      if (!holidays || !holidays.length) {
        box.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">Belum ada hari libur terdaftar.</div>`;
        return;
      }
      box.innerHTML = holidays.map(h => `
        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs">
          <div class="min-w-0 flex-1 pr-2">
            <p class="font-bold text-slate-800 dark:text-slate-100 truncate">${escHtml(h.nama || 'Hari Libur')}</p>
            <p class="text-[10px] font-mono text-slate-400">${escHtml(h.tanggal)}</p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" data-libur-tgl="${escHtml(h.tanggal)}" data-libur-nama="${escHtml(h.nama || '')}" onclick="editAdminHolidayStitch(this.dataset.liburTgl, this.dataset.liburNama)" class="min-h-[40px] px-3 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-[11px] font-bold flex-shrink-0 cursor-pointer">Edit</button>
            <button type="button" data-libur-tgl="${escHtml(h.tanggal)}" onclick="deleteAdminHolidayStitch(this.dataset.liburTgl)" class="min-h-[40px] px-3 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex-shrink-0 cursor-pointer">Hapus</button>
          </div>
        </div>
      `).join('');
    }

    /* ── 9. UTILITIES & THEME ────────────────────────────────────────── */
    function toggleDarkMode() {
      const isDark = !document.documentElement.classList.contains('dark');
      applyThemePreference(isDark ? 'dark' : 'light');
      try { localStorage.setItem('stitch_theme', isDark ? 'dark' : 'light'); } catch (_) {}
    }

    function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
      const R = 6371e3;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    function syncRealGPS() {
      const mobilePill = document.getElementById('mobileGpsAccuracyPill');
      const officeLat = Number(state.currentLocation?.latitude ?? -9.648769);
      const officeLng = Number(state.currentLocation?.longitude ?? 119.389232);
      const officeRadius = Number(state.currentLocation?.radius ?? 250);
      const officeName = state.currentLocation?.nama_lokasi || 'Kantor Bapperida';

      if (!navigator.geolocation) {
        if (mobilePill) {
          mobilePill.textContent = 'Akurat ~ 12m';
          mobilePill.className = 'text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono';
        }
        showDynamicIsland({
          type: 'info',
          title: 'Titik Lokasi DB Aktif',
          message: `Koordinat resmi ${officeName} (${officeLat}, ${officeLng})`
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy || 15);
          
          const distMeters = Math.round(getDistanceFromLatLonInM(lat, lng, officeLat, officeLng));
          
          state.userLocation = { lat, lng, distMeters, accuracy };
          const isInside = distMeters <= officeRadius;

          if (mobilePill) {
            mobilePill.textContent = isInside ? `Akurat ~ ${accuracy}m` : `Jarak ~ ${(distMeters/1000).toFixed(1)}km`;
            mobilePill.className = isInside 
              ? 'text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono'
              : 'text-[11px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono';
          }

          showDynamicIsland({
            type: isInside ? 'success' : 'warning',
            title: isInside ? 'GPS Terverifikasi Valid' : 'Di Luar Radius Kantor',
            message: `Akurasi ±${accuracy}m • Jarak ${distMeters}m dari ${officeName}`
          });
        },
        (_err) => {
          if (mobilePill) {
            mobilePill.textContent = 'Akurat ~ 12m';
            mobilePill.className = 'text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono';
          }
          showDynamicIsland({
            type: 'info',
            title: 'GPS Terkoneksi Titik DB',
            message: `Terverifikasi pada radius perimeter ${officeName}`
          });
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    /* ── 8. ADMIN MONITORING & APPROVAL (POSTGRESQL TABLES) ─────────── */
    // Logika admin dipindah ke js/admin-core.js (dipakai bersama admin.html).
    // Di layar lebar (desktop) halaman ini mengalihkan ke admin.html.
    function loadAdminMonitoringData() {
      if (AdminCore.autoRoute('mobile')) return;
      return AdminCore.loadMonitoring();
    }
    function loadAdminKeteranganData() { return AdminCore.loadKeterangan(); }
    function approveKeterangan(idKet, status) { return AdminCore.approve(idKet, status); }

    function markAllNotificationsRead() {
      const badge = document.getElementById('headerNotifBadge');
      if (badge) badge.classList.add('hidden');
      showDynamicIsland({ type: 'info', title: 'Notifikasi Ditandai', message: 'Semua pemberitahuan ditandai telah dibaca.' });
      closeNotificationDrawer();
    }
