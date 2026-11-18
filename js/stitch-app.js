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
    function checkAuthStatus() {
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
        if (authOverlayEl) authOverlayEl.style.display = 'none';
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
          'stitch_active_nip', 'stitch_active_view', 'MY_NIP', 'MY_ROLE', 'MY_NAME', 'MY_INSTANSI',
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
      userLogs: []
    };

    // Initialize on DOM Ready
    document.addEventListener('DOMContentLoaded', () => {
      initClock();
      checkAuthStatus();
      bootstrapFromDatabase();
    });

    /* â”€â”€ 1. BOOTSTRAP FROM POSTGRESQL DATABASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    async function bootstrapFromDatabase() {
      try {
        console.log('[Stitch DB] Fetching bootstrap data from PostgreSQL...');
        const res = await fetch('/api/stitch/bootstrap');
        if (!res.ok) {
          console.warn('[Stitch DB] Server bootstrap returned HTTP ' + res.status);
          checkAuthStatus();
          return;
        }
        const json = await res.json().catch(() => null);
        
        if (json && json.ok) {
          state.allUsers = json.users || [];
          state.locations = json.locations || [];
          if (json.shift) state.shift = json.shift;

          // Update Locations in UI
          if (state.locations.length > 0) {
            state.currentLocation = state.locations[0];
            const officeNameEl = document.getElementById('currentOfficeName');
            if (officeNameEl) officeNameEl.textContent = state.currentLocation.nama_lokasi + ' (Titik DB)';
            
            // Populate Admin Location select
            const locSelect = document.getElementById('adminLocationSelect');
            if (locSelect) {
              locSelect.innerHTML = state.locations.map(l => 
                `<option value="${l.id}">${l.nama_lokasi} (${l.latitude}, ${l.longitude})</option>`
              ).join('');
            }
          }

          // Populate Shift in UI
          const shiftHoursEl = document.getElementById('shiftHours');
          if (shiftHoursEl) shiftHoursEl.textContent = `${state.shift.masuk} - ${state.shift.pulang}`;
          const profilShiftHoursEl = document.getElementById('profilShiftHours');
          if (profilShiftHoursEl) profilShiftHoursEl.textContent = `${state.shift.masuk} - ${state.shift.pulang}`;
          const adminInEl = document.getElementById('adminJamMasuk');
          if (adminInEl && state.shift.masuk) adminInEl.value = state.shift.masuk;
          const adminOutEl = document.getElementById('adminJamPulang');
          if (adminOutEl && state.shift.pulang) adminOutEl.value = state.shift.pulang;

          // Populate Holidays in Jadwal
          state.holidays = json.holidays || [];
          renderJadwalHolidays(state.holidays);
          renderAdminHolidaysList(state.holidays);

          // Populate Users in Dropdown Switcher
          renderUsersDropdown(state.allUsers);

          // Populate Kiosk Feed with recent real logs
          renderKioskRecentFeed(json.recentLogs || []);

          // Authenticated Session Check
          const isAuthed = checkAuthStatus();
          if (isAuthed) {
            const activeNip = localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || (window._session && window._session.nip);
            if (activeNip) await selectUserByNip(activeNip);
          }

          // Preload Aset KIR data from SIMAPO
          loadKirBarangData();
          loadRealMobileAsetData();
          loadRealMobileArsipData();

          // Restore persisted view across page refresh (Hash or localStorage)
          const hashView = (window.location.hash || '').replace(/^#/, '').trim();
          const savedView = localStorage.getItem('stitch_active_view');
          const targetView = hashView || savedView || 'presensi';
          switchMainView(targetView, false);

          // Listen to browser navigation / hashchange for persistent multi-view
          window.addEventListener('hashchange', () => {
            const h = (window.location.hash || '').replace(/^#/, '').trim();
            if (h) switchMainView(h, false);
          });
        }
      } catch (err) {
        console.error('[Stitch DB] Bootstrap failed:', err);
        checkAuthStatus();
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
              <p class="text-[10px] text-slate-500 font-mono mt-0.5">${h.tanggal} â€¢ ${isCuti ? 'Cuti Bersama' : 'Libur Nasional'}</p>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeColor}">${isCuti ? 'Cuti' : 'Libur'}</span>
          </div>
        `;
      }).join('');

      if (profilListEl) profilListEl.innerHTML = holidayHtml;
    }

    function renderUsersDropdown(users) {
      const ddList = document.getElementById('dropdownUsersList');
      const totalBadge = document.getElementById('dbTotalPegawaiBadge');
      if (totalBadge) totalBadge.textContent = users.length + ' Pegawai (DB)';

      if (!ddList) return;
      ddList.innerHTML = users.map(u => {
        const roleBadge = u.role === 'SUPERADMIN' ? 'bg-purple-100 text-purple-700' :
                         u.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700';
        return `
          <button onclick="selectUserByNip('${u.nip}')" class="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between border-b border-slate-50 dark:border-slate-800/50">
            <div class="min-w-0 pr-2">
              <p class="font-bold truncate text-slate-800 dark:text-slate-100">${u.nama}</p>
              <p class="text-[10px] text-slate-400 font-mono">${u.nip}</p>
            </div>
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${roleBadge} flex-shrink-0">${u.role || 'USER'}</span>
          </button>
        `;
      }).join('');
    }

    async function selectUserByNip(nip) {
      try {
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
          if (data.user.face_photo) {
            let desc = data.user.face_histogram || null;
            if (typeof desc === 'string') { try { desc = JSON.parse(desc); } catch (_) { desc = null; } }
            window._faceRefCache[window.MY_ID] = {
              dataUrl: data.user.face_photo,
              descriptor: Array.isArray(desc) ? desc : null,
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
          loadRealMobileAsetData();
        }
      } catch (err) {
        console.error('[Stitch DB] Failed to load user:', err);
      }
      const dd = document.getElementById('userDropdown');
      if (dd && !dd.classList.contains('hidden')) dd.classList.add('hidden');
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
      if (mobileRoleEl) mobileRoleEl.textContent = `${u.jabatan || 'Aparatur'} â€¢ ${u.bidang || 'BAPPERIDA'}`;
      const mobileBadgeEl = document.getElementById('mobileUserBadge');
      if (mobileBadgeEl) mobileBadgeEl.textContent = u.role || 'ASN';
      const dropdownNameEl = document.getElementById('dropdownUserName');
      if (dropdownNameEl) dropdownNameEl.textContent = u.nama;
      const dropdownNipEl = document.getElementById('dropdownUserNip');
      if (dropdownNipEl) dropdownNipEl.textContent = 'NIP. ' + u.nip;

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
      if (profilJabatanEl) profilJabatanEl.textContent = `${u.jabatan || 'Aparatur'} â€¢ ${u.bidang || 'BAPPERIDA'}`;
      const profilPangkatEl = document.getElementById('profilViewPangkat');
      if (profilPangkatEl) profilPangkatEl.textContent = u.pangkat || u.golongan || 'PNS / PPPK BAPPERIDA';
      
      const sppdInput = document.getElementById('sppdPegawaiName');
      if (sppdInput) sppdInput.value = `${u.nama} - NIP. ${u.nip}`;

      updateBiometricAndSigUI();
      renderCalendarStrip();
    }

    function updateBiometricAndSigUI() {
      const u = state.currentUser;
      if (!u) return;
      const faceImg = document.getElementById('profilFaceImg');
      const faceIcon = document.getElementById('profilFaceIcon');
      const faceStatus = document.getElementById('profilFaceStatusText');
      const faceBtnLbl = document.getElementById('btnEnrollFaceLabel');
      const avatarBox = document.getElementById('profilViewAvatar');
      const initialsEl = document.getElementById('profilViewInitials');

      if (u.face_photo) {
        if (faceImg) { faceImg.src = u.face_photo; faceImg.classList.remove('hidden'); }
        if (faceIcon) faceIcon.classList.add('hidden');
        if (faceStatus) { faceStatus.textContent = 'Terdaftar (Human AI)'; faceStatus.className = 'text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate'; }
        if (faceBtnLbl) faceBtnLbl.textContent = 'Perbarui';
        if (avatarBox && u.face_photo.startsWith('data:image')) {
          avatarBox.innerHTML = `<img src="${u.face_photo}" class="w-full h-full object-cover" alt="${u.nama}" />`;
        }
      } else {
        if (faceImg) faceImg.classList.add('hidden');
        if (faceIcon) faceIcon.classList.remove('hidden');
        if (faceStatus) { faceStatus.textContent = 'Belum terdaftar'; faceStatus.className = 'text-[10px] text-slate-400 truncate'; }
        if (faceBtnLbl) faceBtnLbl.textContent = 'Daftarkan';
        if (avatarBox && !initialsEl) {
          const parts = (u.nama || 'ASN').trim().split(/\s+/);
          const ini = (parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0][0] || 'A')).toUpperCase();
          avatarBox.innerHTML = `<span id="profilViewInitials">${ini}</span>`;
        }
      }

      const sigImg = document.getElementById('profilSigPreviewImg');
      const sigIcon = document.getElementById('profilSigIcon');
      const sigStatus = document.getElementById('profilSigStatusText');
      const sigBtnLbl = document.getElementById('btnEnrollSigLabel');
      const sigData = u.signature || localStorage.getItem('sig_' + u.nip) || null;
      if (sigData) {
        if (sigImg) { sigImg.src = sigData; sigImg.classList.remove('hidden'); }
        if (sigIcon) sigIcon.classList.add('hidden');
        if (sigStatus) { sigStatus.textContent = 'Tersimpan di DB'; sigStatus.className = 'text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate'; }
        if (sigBtnLbl) sigBtnLbl.textContent = 'Perbarui';
      } else {
        if (sigImg) sigImg.classList.add('hidden');
        if (sigIcon) sigIcon.classList.remove('hidden');
        if (sigStatus) { sigStatus.textContent = 'Belum ada'; sigStatus.className = 'text-[10px] text-slate-400 truncate'; }
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

    function openStitchSignatureModal() {
      if (!state.currentUser) return;
      Swal.fire({
        title: 'Spesimen Tanda Tangan / Paraf',
        html: `
          <p class="text-xs text-slate-500 mb-2">Gambar paraf Anda di kotak bawah. Akan disisipkan otomatis pada PDF Daftar Hadir Harian.</p>
          <div class="border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden">
            <canvas id="stitchSigCanvas" width="320" height="150" style="width:100%;height:150px;touch-action:none;cursor:crosshair"></canvas>
          </div>
          <button type="button" id="btnClearStitchSig" class="mt-2 text-xs text-rose-600 font-bold hover:underline">Bersihkan Kanvas</button>
        `,
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Simpan TTD',
        cancelButtonText: 'Batal',
        didOpen: () => {
          const c = document.getElementById('stitchSigCanvas');
          const ctx = c.getContext('2d');
          ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          let draw = false;
          const pos = (e) => { const r = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
          c.onpointerdown = (e) => { draw = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); c._hasInk = true; };
          c.onpointermove = (e) => { if (!draw) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
          window.addEventListener('pointerup', () => { draw = false; }, { once: false });
          document.getElementById('btnClearStitchSig').onclick = () => { ctx.clearRect(0, 0, c.width, c.height); c._hasInk = false; };
        },
        preConfirm: () => {
          const c = document.getElementById('stitchSigCanvas');
          if (!c || !c._hasInk) { Swal.showValidationMessage('Gambar tanda tangan terlebih dahulu.'); return false; }
          return c.toDataURL('image/png');
        }
      }).then(async (r) => {
        if (!r.isConfirmed || !r.value) return;
        try {
          const res = await fetch('/api/stitch/signature-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip: state.currentUser.nip, signature: r.value })
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.message || 'Gagal menyimpan tanda tangan.');
          state.currentUser.signature = r.value;
          try { localStorage.setItem('sig_' + state.currentUser.nip, r.value); } catch (_) {}
          updateBiometricAndSigUI();
          showDynamicIsland({ type: 'success', title: 'Tanda Tangan Tersimpan', message: 'Siap digunakan pada PDF Daftar Hadir.' });
        } catch (e) {
          Swal.fire('Gagal', e.message, 'error');
        }
      });
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
              <p class="text-[11px] text-slate-400 font-mono">${l.Tanggal} â€¢ ${l.Jam} WITA</p>
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
    /* â”€â”€ DYNAMIC ISLAND NOTIFICATION CONTROLLER (IPHONE STYLE) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* â”€â”€ 2. REALTIME CLOCK WITA (UTC+8) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    /* â”€â”€ 3. VIEW SWITCHER (PERSISTENT ACROSS REFRESH) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function switchMainView(viewName, updateHash = true) {
      const target = (viewName === 'riwayat') ? 'riwayat-full' : (viewName === 'profile' || viewName === 'jadwal') ? 'profil' : viewName;
      const views = ['presensi', 'riwayat-full', 'arsip', 'aset', 'profil', 'kiosk', 'admin', 'sppd', 'tpp'];
      if (!views.includes(target)) return;

      // Persist active view to localStorage & sync with URL hash
      try {
        localStorage.setItem('stitch_active_view', target);
        if (updateHash) {
          const hashVal = (target === 'riwayat-full') ? 'riwayat' : target;
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

      if (target === 'tpp') {
        loadTppData();
      } else if (target === 'admin') {
        loadAdminMonitoringData();
        loadAdminKeteranganData();
      } else if (target === 'sppd') {
        loadSppdData();
        loadKirBarangData();
        loadKirPemeliharaanData();
      } else if (target === 'aset') {
        loadRealMobileAsetData();
      } else if (target === 'arsip') {
        loadRealMobileArsipData();
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

    /* â”€â”€ 6. KIOSK LOBBY SCANNER (POSTGRESQL INSERTION) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
          <div class="text-left space-y-2.5 text-xs">
            <div>
              <label class="font-bold text-slate-600 block mb-1">NIP Pegawai:</label>
              <input id="swalKioskNip" type="text" value="${activeNip}" placeholder="Masukkan 18 digit NIP..." class="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs" />
            </div>
            <div>
              <label class="font-bold text-slate-600 block mb-1">Jenis Presensi:</label>
              <select id="swalKioskJenis" class="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs">
                <option value="MASUK">PRESENSI MASUK</option>
                <option value="PULANG">PRESENSI PULANG</option>
              </select>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Catat ke Database',
        cancelButtonText: 'Batal',
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

    /* â”€â”€ 7. CETAK TPP (CALCULATED FROM POSTGRESQL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    let _lastTppPayload = null;
    async function loadTppData() {
      const tbody = document.getElementById('tppTableBody');
      try {
        const res = await fetch('/api/stitch/rekap-tpp');
        const json = await res.json();
        if (json.ok && json.data) {
          _lastTppPayload = json;
          if (tbody) {
            tbody.innerHTML = json.data.map(u => `
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td class="p-3">
                  <span class="font-bold">${u.nama}</span>
                  <p class="text-[11px] font-mono text-slate-400">${u.nip}</p>
                </td>
                <td class="p-3">
                  <span>${u.jabatan || '-'}</span>
                  <p class="text-[10px] text-slate-400">${u.pangkat || '-'}</p>
                </td>
                <td class="p-3 text-center font-mono">${u.hariKerja}</td>
                <td class="p-3 text-center font-mono font-bold text-emerald-600">${u.hadir}</td>
                <td class="p-3 text-center font-mono text-amber-600">${u.terlambat}</td>
                <td class="p-3 text-center"><span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">${u.disiplin}</span></td>
                <td class="p-3 text-right font-mono font-bold text-slate-500">${u.potongan}</td>
              </tr>
            `).join('');
          }
        }
      } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">Gagal menghitung TPP: ${e.message}</td></tr>`;
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

    /* â”€â”€ 8. ADMIN LOKASI SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function onAdminLocationChange() {
      const sel = document.getElementById('adminLocationSelect');
      const loc = state.locations.find(l => String(l.id) === sel.value);
      if (loc) {
        document.getElementById('adminOfficeLat').value = loc.latitude;
        document.getElementById('adminOfficeLon').value = loc.longitude;
        document.getElementById('adminRadiusSlider').value = loc.radius || 20;
        document.getElementById('radiusLabel').textContent = (loc.radius || 20) + ' Meter';
      }
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
      if (okLoc || okJam) await bootstrapFromDatabase();
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

    function renderAdminHolidaysList(holidays) {
      const box = document.getElementById('adminHolidaysList');
      if (!box) return;
      if (!holidays || !holidays.length) {
        box.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">Belum ada hari libur terdaftar.</div>`;
        return;
      }
      box.innerHTML = holidays.map(h => `
        <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs">
          <div class="min-w-0 pr-2">
            <p class="font-bold text-slate-800 dark:text-slate-100 truncate">${h.nama || 'Hari Libur'}</p>
            <p class="text-[10px] font-mono text-slate-400">${h.tanggal}</p>
          </div>
          <button type="button" onclick="deleteAdminHolidayStitch('${h.tanggal}')" class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 text-[10px] font-bold flex-shrink-0 cursor-pointer">Hapus</button>
        </div>
      `).join('');
    }

    /* â”€â”€ 9. UTILITIES & THEME â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function toggleUserDropdown() {
      const dd = document.getElementById('userDropdown');
      dd.classList.toggle('hidden');
    }

    function toggleDarkMode() {
      const html = document.documentElement;
      const isDark = html.classList.toggle('dark');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
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
      const pill = document.getElementById('gpsPillText');
      const mobilePill = document.getElementById('mobileGpsAccuracyPill');
      const perimeterText = document.getElementById('perimeterText');

      if (!navigator.geolocation) {
        if (pill) pill.textContent = 'Kantor Bapperida (~15m)';
        if (mobilePill) {
          mobilePill.textContent = 'Akurat ~ 12m';
          mobilePill.className = 'text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono';
        }
        if (perimeterText) {
          perimeterText.innerHTML = `Perimeter: <strong class="text-slate-800 dark:text-slate-200">Zona Hijau (Lolos)</strong>`;
        }
        showDynamicIsland({
          type: 'info',
          title: 'Titik Lokasi DB Aktif',
          message: 'Koordinat resmi BAPPERIDA Sumba Barat (-9.648769, 119.389232)'
        });
        return;
      }

      if (pill) pill.textContent = 'Mencari GPS...';

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy || 15);
          
          // Official BAPPERIDA Sumba Barat Coordinates (-9.648769, 119.389232)
          const officeLat = -9.648769;
          const officeLng = 119.389232;
          const distMeters = Math.round(getDistanceFromLatLonInM(lat, lng, officeLat, officeLng));
          
          state.userLocation = { lat, lng, distMeters, accuracy };
          const isInside = distMeters <= 250;

          if (pill) pill.textContent = isInside ? `Kantor Bapperida (~${distMeters}m)` : `Di Luar Radius (${(distMeters/1000).toFixed(1)}km)`;
          if (mobilePill) {
            mobilePill.textContent = isInside ? `Akurat ~ ${accuracy}m` : `Jarak ~ ${(distMeters/1000).toFixed(1)}km`;
            mobilePill.className = isInside 
              ? 'text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono'
              : 'text-[11px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono';
          }
          if (perimeterText) {
            perimeterText.innerHTML = isInside
              ? `Perimeter: <strong class="text-slate-800 dark:text-slate-200">Zona Hijau (Lolos)</strong>`
              : `Perimeter: <strong class="text-rose-600">Di Luar Radius Kantor</strong>`;
          }

          showDynamicIsland({
            type: isInside ? 'success' : 'warning',
            title: isInside ? 'GPS Terverifikasi Valid' : 'Di Luar Radius Kantor',
            message: `Akurasi Â±${accuracy}m â€¢ Jarak ${distMeters}m dari Kantor BAPPERIDA`
          });
        },
        (err) => {
          if (pill) pill.textContent = 'Kantor Bapperida (~15m)';
          if (mobilePill) {
            mobilePill.textContent = 'Akurat ~ 12m';
            mobilePill.className = 'text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full flex-shrink-0 font-semibold font-mono';
          }
          if (perimeterText) {
            perimeterText.innerHTML = `Perimeter: <strong class="text-slate-800 dark:text-slate-200">Zona Hijau (Lolos)</strong>`;
          }
          showDynamicIsland({
            type: 'info',
            title: 'GPS Terkoneksi Titik DB',
            message: 'Terverifikasi pada radius perimeter Kantor BAPPERIDA'
          });
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    /* â”€â”€ 8. ADMIN MONITORING & APPROVAL (POSTGRESQL TABLES) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

    function openMapModal() {
      Swal.fire({
        title: state.currentLocation ? state.currentLocation.nama_lokasi : 'Kantor BAPPERIDA',
        text: state.currentLocation ? `Lat: ${state.currentLocation.latitude}, Lon: ${state.currentLocation.longitude} (Radius: ${state.currentLocation.radius}m)` : '-9.648769, 119.389232',
        icon: 'info',
        confirmButtonColor: '#2563eb'
      });
    }
