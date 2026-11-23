/* Stitch Unified Desktop Shell (Hover-Expandable & Resizable Sidebar) + Mobile Admin Drawer */
(function (w, d) {
  'use strict';

  const STORAGE_WIDTH = 'stitch_sidebar_width';
  const STORAGE_PINNED = 'stitch_sidebar_pinned';
  const COLLAPSED_WIDTH = 72;
  const MIN_WIDTH = 220;
  const MAX_WIDTH = 380;
  const DEFAULT_WIDTH = 264;

  const PRIMARY_NAV = [
    { key: 'presensi', label: 'Presensi', icon: 'fingerprint', action: () => callSwitch('presensi') },
    { key: 'riwayat-full', label: 'Riwayat', icon: 'history', action: () => callSwitch('riwayat') },
    { key: 'arsip', label: 'Arsip', icon: 'folder_shared', action: () => callSwitch('arsip') },
    { key: 'aset', label: 'Aset', icon: 'inventory_2', action: () => callSwitch('aset') },
    { key: 'profil', label: 'Profil', icon: 'person', action: () => callSwitch('profil') }
  ];

  const ADMIN_GROUPS = [
    {
      id: 'operasional',
      title: 'Operasional',
      items: [
        {
          key: 'admin:adminSectionMonitoring',
          perms: ['admin.monitoring', 'presensi.view_all'],
          label: 'Monitoring Hari Ini',
          hint: 'Pantau presensi realtime pegawai',
          icon: 'monitoring',
          tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
          action: () => callSwitch('admin', true, 'adminSectionMonitoring')
        },
        {
          key: 'admin:adminSectionIzin',
          perms: ['admin.izin', 'keterangan.approve'],
          label: 'Konfirmasi Izin',
          hint: 'Persetujuan cuti, izin & sakit',
          icon: 'rule',
          tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60',
          action: () => callSwitch('admin', true, 'adminSectionIzin')
        },
        {
          key: 'izin-drawer',
          perms: ['admin.izin', 'keterangan.approve', 'presensi.manual_entry'],
          label: 'Input Keterangan',
          hint: 'Catat izin/sakit/cuti pegawai',
          icon: 'assignment_add',
          tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60',
          action: () => callOpenIzinDrawer()
        }
      ]
    },
    {
      id: 'kepegawaian',
      title: 'Kepegawaian',
      items: [
        {
          key: 'admin:adminSectionPegawai',
          perms: ['admin.users'],
          label: 'Master Pegawai & AI',
          hint: 'Direktori pegawai & biometrik wajah',
          icon: 'face',
          tone: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60',
          action: () => callSwitch('admin', true, 'adminSectionPegawai')
        },
        {
          key: 'admin:adminSectionRoles',
          perms: ['admin.roles'],
          label: 'Kelola Role & Hak',
          hint: 'Matriks peran & wewenang akses',
          icon: 'manage_accounts',
          tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
          action: () => callSwitch('admin', true, 'adminSectionRoles')
        }
      ]
    },
    {
      id: 'konfigurasi',
      title: 'Konfigurasi',
      items: [
        {
          key: 'admin:adminSectionGeofence',
          perms: ['admin.geofence', 'admin.instansi'],
          label: 'Geofencing Lokasi',
          hint: 'Koordinat & radius kantor',
          icon: 'share_location',
          tone: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60',
          action: () => callSwitch('admin', true, 'adminSectionGeofence')
        },
        {
          key: 'admin:adminSectionJamLibur',
          perms: ['admin.jam_libur', 'admin.instansi'],
          label: 'Jam Kerja & Libur',
          hint: 'Jadwal shift, toleransi & libur',
          icon: 'schedule',
          tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
          action: () => callSwitch('admin', true, 'adminSectionJamLibur')
        },
        {
          key: 'admin:adminSectionOpdBidang',
          perms: ['admin.instansi', 'admin.devices'],
          label: 'OPD & Bidang',
          hint: 'Kelola master OPD dan daftar bidang',
          icon: 'domain',
          tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60',
          action: () => callSwitch('admin', true, 'adminSectionOpdBidang')
        }
      ]
    },
    {
      id: 'laporan',
      title: 'Laporan & Terminal',
      items: [
        {
          key: 'admin:adminSectionRekap',
          perms: ['admin.rekap', 'presensi.view_all'],
          label: 'Rekap Semua Pegawai',
          hint: 'Preview berkop, PDF (F4) & Excel',
          icon: 'analytics',
          tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
          action: () => callSwitch('admin', true, 'adminSectionRekap')
        },
        {
          key: 'aset:laporan-permen47',
          perms: ['aset.view', 'aset.manage', 'admin.rekap'],
          label: 'Laporan Aset Permen 47',
          hint: 'Pengadaan barang pakai habis & Excel',
          icon: 'description',
          tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
          action: () => { w.location.href = 'aset-kir.html#laporan-permen47'; }
        },
        {
          key: 'aset:kartu-pemeliharaan',
          perms: ['aset.view', 'aset.manage', 'admin.rekap'],
          label: 'Kartu Pemeliharaan Aset',
          hint: 'Riwayat servis BMD & cetak kartu',
          icon: 'build',
          tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60',
          action: () => { w.location.href = 'aset-kir.html#pemeliharaan'; }
        },
        {
          key: 'kiosk',
          perms: ['admin.kiosk', 'admin.devices'],
          label: 'Terminal Meja Absen',
          hint: 'Scanner wajah AI lobi kantor',
          icon: 'desktop_windows',
          tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
          action: () => callSwitch('kiosk')
        },
        {
          key: 'tpp',
          perms: ['admin.rekap', 'presensi.view_all'],
          label: 'Cetak Rekap TPP',
          hint: 'Rekap disiplin & laporan PDF',
          icon: 'receipt_long',
          tone: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60',
          action: () => callSwitch('tpp')
        }
      ]
    },
    {
      id: 'developer',
      title: 'Developer & OpenWA',
      items: [
        {
          key: 'admin:dev',
          panel: 'dev',
          perms: ['admin.dev'],
          label: 'Developer & OpenWA',
          hint: 'Kesehatan 8 subsistem, OpenWA & log error',
          icon: 'terminal',
          tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60',
          action: () => callSwitch('admin', true, 'dev')
        }
      ]
    }
  ];

  const ADMIN_ITEMS = ADMIN_GROUPS.flatMap((g) => g.items);

  let _width = readStoredWidth();
  let _pinned = readStoredPinned();
  let _adminOpen = false;
  let _adminPinnedOpen = false;
  let _activeView = 'presensi';
  let _activeSection = null;
  let _drawerTimer = null;

  function clampWidth(val) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  }

  function readStoredWidth() {
    try {
      return clampWidth(localStorage.getItem(STORAGE_WIDTH));
    } catch (_) {
      return DEFAULT_WIDTH;
    }
  }

  function readStoredPinned() {
    try {
      return localStorage.getItem(STORAGE_PINNED) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveWidth(wPx) {
    try { localStorage.setItem(STORAGE_WIDTH, String(wPx)); } catch (_) {}
  }

  function savePinned(flag) {
    try { localStorage.setItem(STORAGE_PINNED, flag ? '1' : '0'); } catch (_) {}
  }

  function callSwitch(viewName, updateHash = true, sectionId = null) {
    if (typeof w.switchMainView === 'function') {
      w.switchMainView(viewName, updateHash, sectionId);
    }
  }

  function callOpenIzinDrawer() {
    if (typeof w.openIzinDrawer === 'function') {
      w.openIzinDrawer({ adminMode: true });
    }
  }

  function getUserPerms() {
    const u = w.state && w.state.currentUser;
    if (u && Array.isArray(u.role_permissions) && u.role_permissions.length > 0) {
      return u.role_permissions;
    }
    return null;
  }

  function canAccessAdminItem(item) {
    const role = String((w.state && w.state.currentUser && w.state.currentUser.role) || localStorage.getItem('MY_ROLE') || localStorage.getItem('_sess_role') || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (role === 'SUPERADMIN') return true;
    const perms = getUserPerms();
    if (perms) {
      if (perms.includes('*')) return true;
      if (!Array.isArray(item.perms) || !item.perms.length) return true;
      return item.perms.some((p) => perms.includes(p));
    }
    return ['ADMIN', 'SUPERADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN'].includes(role);
  }

  function isAdmin() {
    if (ADMIN_ITEMS.some((item) => canAccessAdminItem(item))) return true;
    if (typeof w.isStitchAdminUser === 'function' && w.state && w.state.currentUser) {
      return Boolean(w.isStitchAdminUser(w.state.currentUser));
    }
    try {
      const r = String(localStorage.getItem('MY_ROLE') || localStorage.getItem('_sess_role') || '').toUpperCase();
      return ['ADMIN', 'SUPERADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN'].includes(r);
    } catch (_) {
      return false;
    }
  }

  function activeAdminKey(viewName, sectionId) {
    if (viewName === 'kiosk') return 'kiosk';
    if (viewName === 'tpp') return 'tpp';
    if (viewName === 'admin') {
      return 'admin:' + (sectionId || 'adminSectionMonitoring');
    }
    return '';
  }

  function injectStyles() {
    if (d.getElementById('stitch-desktop-shell-styles')) return;
    const style = d.createElement('style');
    style.id = 'stitch-desktop-shell-styles';
    style.textContent = `
      :root {
        --stitch-rail-w: ${COLLAPSED_WIDTH}px;
        --stitch-sidebar-w: ${_width}px;
      }
      @media (min-width: 1024px) {
        body.stitch-desktop-ready main,
        body.stitch-desktop-ready div[id^="drawer"].fixed.inset-0 {
          padding-left: var(--stitch-rail-w);
          transition: padding-left 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        body.stitch-desktop-ready.stitch-sidebar-pinned main,
        body.stitch-desktop-ready.stitch-sidebar-pinned div[id^="drawer"].fixed.inset-0 {
          padding-left: var(--stitch-sidebar-w);
        }
        body.stitch-desktop-ready.stitch-sidebar-resizing main,
        #stitchDesktopSidebar.is-resizing {
          transition: none !important;
        }
        #stitchDesktopSidebar {
          width: var(--stitch-rail-w);
          transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease;
          overflow: hidden;
        }
        #stitchDesktopSidebar:hover,
        #stitchDesktopSidebar.is-pinned,
        #stitchDesktopSidebar.is-resizing {
          width: var(--stitch-sidebar-w);
        }
        #stitchDesktopSidebar:hover:not(.is-pinned),
        #stitchDesktopSidebar.is-resizing:not(.is-pinned) {
          box-shadow: 12px 0 36px -12px rgba(15, 23, 42, 0.18);
        }
        #stitchDesktopSidebar .stitch-sb-label,
        #stitchDesktopSidebar .stitch-sb-expanded-only {
          opacity: 0;
          max-width: 0;
          overflow: hidden;
          white-space: nowrap;
          pointer-events: none;
          transition: opacity 140ms ease, max-width 200ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        #stitchDesktopSidebar:hover .stitch-sb-label,
        #stitchDesktopSidebar.is-pinned .stitch-sb-label,
        #stitchDesktopSidebar.is-resizing .stitch-sb-label,
        #stitchDesktopSidebar:hover .stitch-sb-expanded-only,
        #stitchDesktopSidebar.is-pinned .stitch-sb-expanded-only,
        #stitchDesktopSidebar.is-resizing .stitch-sb-expanded-only {
          opacity: 1;
          max-width: 260px;
          pointer-events: auto;
        }
        #stitchDesktopSidebar .stitch-sb-submenu {
          display: none;
        }
        #stitchDesktopSidebar:hover .stitch-sb-submenu.is-open,
        #stitchDesktopSidebar.is-pinned .stitch-sb-submenu.is-open,
        #stitchDesktopSidebar.is-resizing .stitch-sb-submenu.is-open {
          display: flex;
        }
        #stitchDesktopSidebar:not(:hover):not(.is-pinned):not(.is-resizing) #stitchSidebarResizeHandle {
          pointer-events: none;
          opacity: 0;
        }
        #globalMobileBottomNav {
          display: none !important;
        }
      }
    `;
    d.head.appendChild(style);
  }

  function applyWidthAndPinState() {
    d.documentElement.style.setProperty('--stitch-sidebar-w', `${_width}px`);
    const aside = d.getElementById('stitchDesktopSidebar');
    if (aside) {
      aside.classList.toggle('is-pinned', _pinned);
    }
    d.body.classList.toggle('stitch-sidebar-pinned', _pinned);

    const pinBtn = d.getElementById('stitchSidebarPinBtn');
    const pinIcon = d.getElementById('stitchSidebarPinIcon');
    if (pinBtn && pinIcon) {
      pinBtn.setAttribute('aria-pressed', _pinned ? 'true' : 'false');
      pinBtn.title = _pinned ? 'Lepas sematan sidebar' : 'Sematkan lebar sidebar';
      pinBtn.classList.toggle('bg-blue-50', _pinned);
      pinBtn.classList.toggle('text-blue-600', _pinned);
      pinBtn.classList.toggle('dark:bg-blue-950/70', _pinned);
      pinBtn.classList.toggle('dark:text-blue-400', _pinned);
      pinIcon.style.transform = _pinned ? 'rotate(0deg)' : 'rotate(45deg)';
    }
  }

  function setAdminSubmenuOpen(open, sticky = false) {
    _adminOpen = Boolean(open);
    if (sticky) _adminPinnedOpen = _adminOpen;
    const sub = d.getElementById('stitchSidebarAdminSubmenu');
    const chev = d.getElementById('stitchSidebarAdminChevron');
    const toggle = d.getElementById('stitchSidebarAdminToggle');
    if (sub) sub.classList.toggle('is-open', _adminOpen);
    if (chev) chev.style.transform = _adminOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (toggle) toggle.setAttribute('aria-expanded', _adminOpen ? 'true' : 'false');
  }

  function buildSidebarMarkup() {
    const primaryHtml = PRIMARY_NAV.map((item) => `
      <button type="button" data-stitch-nav="${item.key}" title="${item.label}"
        class="stitch-sb-nav-item w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white transition-colors font-semibold text-[13px] cursor-pointer text-left">
        <span class="material-symbols-outlined text-[20px] shrink-0">${item.icon}</span>
        <span class="stitch-sb-label truncate">${item.label}</span>
      </button>
    `).join('');

    const adminSubHtml = ADMIN_ITEMS.map((item) => `
      <button type="button" data-stitch-admin="${item.key}" title="${item.label}"
        class="w-full min-h-[40px] flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-blue-50/80 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium text-xs cursor-pointer text-left">
        <span class="material-symbols-outlined text-[18px] shrink-0">${item.icon}</span>
        <span class="stitch-sb-label truncate">${item.label}</span>
      </button>
    `).join('');

    const aside = d.createElement('aside');
    aside.id = 'stitchDesktopSidebar';
    aside.setAttribute('aria-label', 'Navigasi Utama Desktop');
    aside.className = 'hidden lg:flex fixed top-0 bottom-0 left-0 z-40 flex-col justify-between bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-800 shadow-sm select-none';

    aside.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0">
        <!-- Brand Header -->
        <div class="h-16 px-4 flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 p-1 flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs">
              <img src="Lambang_Kabupaten_Sumba_Barat.png" alt="Lambang Kabupaten Sumba Barat" class="w-full h-full object-contain" />
            </div>
            <div class="stitch-sb-label flex flex-col min-w-0">
              <span class="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight leading-none truncate">HADIR</span>
              <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 leading-none truncate">BAPPERIDA Sumba Barat</span>
            </div>
          </div>
          <button type="button" id="stitchSidebarPinBtn" aria-label="Sematkan sidebar" aria-pressed="false" title="Sematkan lebar sidebar"
            class="stitch-sb-expanded-only w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0">
            <span id="stitchSidebarPinIcon" class="material-symbols-outlined text-[18px] transition-transform duration-200">push_pin</span>
          </button>
        </div>

        <!-- Scrollable Nav -->
        <nav class="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-1">
          ${primaryHtml}

          <!-- Admin Panel Group -->
          <div id="stitchSidebarAdminGroup" class="hidden pt-2 mt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1">
            <button type="button" id="stitchSidebarAdminToggle" aria-expanded="false" title="Panel Admin"
              class="w-full min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors font-bold text-[13px] cursor-pointer text-left">
              <span class="flex items-center gap-3 min-w-0">
                <span class="material-symbols-outlined text-[20px] shrink-0 text-blue-600 dark:text-blue-400">admin_panel_settings</span>
                <span class="stitch-sb-label truncate">Panel Admin</span>
              </span>
              <span id="stitchSidebarAdminChevron" class="stitch-sb-expanded-only material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0">expand_more</span>
            </button>
            <div id="stitchSidebarAdminSubmenu" class="stitch-sb-submenu flex-col gap-0.5 pl-3 ml-3 border-l border-slate-200 dark:border-slate-800">
              ${adminSubHtml}
            </div>
          </div>
        </nav>
      </div>

      <!-- Footer Actions -->
      <div class="px-3 py-3 border-t border-slate-200/80 dark:border-slate-800 space-y-1 shrink-0 bg-slate-50/70 dark:bg-slate-900/50">
        <button type="button" id="stitchSidebarThemeBtn" title="Ganti Tema Tampilan"
          class="w-full min-h-[42px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors font-semibold text-xs cursor-pointer text-left">
          <span id="stitchSidebarThemeIcon" class="material-symbols-outlined text-[20px] shrink-0">dark_mode</span>
          <span id="stitchSidebarThemeLabel" class="stitch-sb-label truncate">Mode Gelap</span>
        </button>
        <button type="button" id="stitchSidebarLogoutBtn" title="Keluar Akun"
          class="w-full min-h-[42px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors font-semibold text-xs cursor-pointer text-left">
          <span class="material-symbols-outlined text-[20px] shrink-0">logout</span>
          <span class="stitch-sb-label truncate">Keluar Akun</span>
        </button>
      </div>

      <!-- Right-Edge Resize Handle -->
      <div id="stitchSidebarResizeHandle" role="separator" aria-orientation="vertical" aria-label="Ubah lebar sidebar"
        class="group absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-50 flex items-center justify-center">
        <div class="w-0.5 h-10 rounded-full bg-slate-300 dark:bg-slate-700 opacity-0 group-hover:opacity-100 group-hover:bg-blue-600 transition-all"></div>
      </div>
    `;

    // Event wiring
    aside.querySelectorAll('[data-stitch-nav]').forEach((btn) => {
      const item = PRIMARY_NAV.find((n) => n.key === btn.dataset.stitchNav);
      if (item) {
        btn.addEventListener('click', () => {
          btn.blur();
          item.action();
        });
      }
    });

    aside.querySelectorAll('[data-stitch-admin]').forEach((btn) => {
      const item = ADMIN_ITEMS.find((n) => n.key === btn.dataset.stitchAdmin);
      if (item) {
        btn.addEventListener('click', () => {
          btn.blur();
          item.action();
        });
      }
    });

    const pinBtn = aside.querySelector('#stitchSidebarPinBtn');
    if (pinBtn) {
      pinBtn.addEventListener('click', () => {
        _pinned = !_pinned;
        savePinned(_pinned);
        applyWidthAndPinState();
      });
    }

    const adminGroup = aside.querySelector('#stitchSidebarAdminGroup');
    const adminToggle = aside.querySelector('#stitchSidebarAdminToggle');
    if (adminGroup && adminToggle) {
      adminGroup.addEventListener('mouseenter', () => {
        if (!_adminOpen) setAdminSubmenuOpen(true, false);
      });
      adminGroup.addEventListener('mouseleave', () => {
        const isInAdmin = _activeView === 'admin' || _activeView === 'kiosk' || _activeView === 'tpp';
        if (!_adminPinnedOpen && !isInAdmin) {
          setAdminSubmenuOpen(false, false);
        }
      });
      adminToggle.addEventListener('click', () => {
        setAdminSubmenuOpen(!_adminOpen, true);
      });
    }

    aside.addEventListener('mouseleave', () => {
      if (_pinned) return;
      const isInAdmin = _activeView === 'admin' || _activeView === 'kiosk' || _activeView === 'tpp';
      if (!_adminPinnedOpen && !isInAdmin) {
        setAdminSubmenuOpen(false, false);
      }
    });

    const themeBtn = aside.querySelector('#stitchSidebarThemeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        if (typeof w.toggleDarkMode === 'function') w.toggleDarkMode();
        syncTheme();
      });
    }

    const logoutBtn = aside.querySelector('#stitchSidebarLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (typeof w.logoutUser === 'function') w.logoutUser();
      });
    }

    bindResizeHandle(aside, aside.querySelector('#stitchSidebarResizeHandle'));
    return aside;
  }

  function bindResizeHandle(aside, handle) {
    if (!aside || !handle) return;
    let dragging = false;
    let startX = 0;
    let startWidth = _width;

    function onMove(e) {
      if (!dragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const next = clampWidth(startWidth + (clientX - startX));
      _width = next;
      d.documentElement.style.setProperty('--stitch-sidebar-w', `${next}px`);
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      aside.classList.remove('is-resizing');
      d.body.classList.remove('stitch-sidebar-resizing');
      saveWidth(_width);
      w.removeEventListener('mousemove', onMove);
      w.removeEventListener('mouseup', onEnd);
      w.removeEventListener('touchmove', onMove);
      w.removeEventListener('touchend', onEnd);
    }

    function onStart(e) {
      e.preventDefault();
      dragging = true;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startWidth = aside.getBoundingClientRect().width || _width;
      if (startWidth < MIN_WIDTH) startWidth = _width;
      aside.classList.add('is-resizing');
      d.body.classList.add('stitch-sidebar-resizing');
      w.addEventListener('mousemove', onMove);
      w.addEventListener('mouseup', onEnd);
      w.addEventListener('touchmove', onMove, { passive: true });
      w.addEventListener('touchend', onEnd);
    }

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
  }

  function buildMobileAdminDrawer() {
    if (d.getElementById('mobileAdminMenuDrawer')) return;

    const groupsHtml = ADMIN_GROUPS.map((grp) => `
      <div data-mobile-admin-group="${grp.id}" class="space-y-1.5">
        <p class="px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">${grp.title}</p>
        <div class="space-y-1.5">
          ${grp.items.map((item) => `
            <button type="button" data-mobile-admin="${item.key}"
              class="w-full min-h-[44px] px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-left transition-colors active:scale-[0.99] cursor-pointer">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-xl ${item.tone} flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[19px]">${item.icon}</span>
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${item.label}</p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${item.hint}</p>
                </div>
              </div>
              <span class="material-symbols-outlined text-[18px] text-slate-400 shrink-0">chevron_right</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    const drawer = d.createElement('div');
    drawer.id = 'mobileAdminMenuDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'mobileAdminDrawerTitle');
    drawer.className = 'hidden fixed inset-0 z-50 flex items-end justify-center lg:hidden';
    drawer.innerHTML = `
      <div id="mobileAdminDrawerBackdrop" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 opacity-0"></div>
      <div id="mobileAdminDrawerPanel" class="relative w-full sm:max-w-[460px] bg-white dark:bg-slate-900 rounded-t-[28px] shadow-[0_-10px_40px_rgba(0,0,0,0.25)] border-t border-slate-200 dark:border-slate-800 flex flex-col max-h-[86vh] z-10 transform translate-y-full transition-transform duration-[220ms] ease-out">
        <div id="mobileAdminDrawerHandle" class="pt-3 pb-1 flex justify-center cursor-pointer">
          <div class="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></div>
        </div>
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <span class="material-symbols-outlined text-[20px]">admin_panel_settings</span>
            </div>
            <div class="min-w-0">
              <h3 id="mobileAdminDrawerTitle" class="text-sm font-extrabold text-slate-900 dark:text-white truncate">Menu Administrator</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">Navigasi modul kendali &amp; layanan</p>
            </div>
          </div>
          <button type="button" id="mobileAdminDrawerCloseBtn" aria-label="Tutup Menu Admin"
            class="w-11 h-11 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4 overscroll-contain flex-1">
          ${groupsHtml}
        </div>
      </div>
    `;

    d.body.appendChild(drawer);

    drawer.querySelector('#mobileAdminDrawerBackdrop').addEventListener('click', closeMobileAdminDrawer);
    drawer.querySelector('#mobileAdminDrawerHandle').addEventListener('click', closeMobileAdminDrawer);
    drawer.querySelector('#mobileAdminDrawerCloseBtn').addEventListener('click', closeMobileAdminDrawer);

    drawer.querySelectorAll('[data-mobile-admin]').forEach((btn) => {
      const item = ADMIN_ITEMS.find((n) => n.key === btn.dataset.mobileAdmin);
      if (item) {
        btn.addEventListener('click', () => {
          closeMobileAdminDrawer();
          item.action();
        });
      }
    });

    d.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.classList.contains('hidden')) {
        closeMobileAdminDrawer();
      }
    });
  }

  function openMobileAdminDrawer() {
    if (!isAdmin()) {
      if (typeof w.showDynamicIsland === 'function') {
        w.showDynamicIsland({ type: 'warning', title: 'Akses Terbatas', message: 'Menu ini hanya untuk Administrator / Pimpinan.' });
      }
      return;
    }
    buildMobileAdminDrawer();
    syncRole();
    syncActive(_activeView, _activeSection);

    const drawer = d.getElementById('mobileAdminMenuDrawer');
    const backdrop = d.getElementById('mobileAdminDrawerBackdrop');
    const panel = d.getElementById('mobileAdminDrawerPanel');
    if (!drawer || !backdrop || !panel) return;

    if (_drawerTimer) {
      clearTimeout(_drawerTimer);
      _drawerTimer = null;
    }

    drawer.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.remove('opacity-0');
      backdrop.classList.add('opacity-100');
      panel.classList.remove('translate-y-full');
      panel.classList.add('translate-y-0');
    });
  }

  function closeMobileAdminDrawer() {
    const drawer = d.getElementById('mobileAdminMenuDrawer');
    const backdrop = d.getElementById('mobileAdminDrawerBackdrop');
    const panel = d.getElementById('mobileAdminDrawerPanel');
    if (!drawer || drawer.classList.contains('hidden')) return;

    if (backdrop) {
      backdrop.classList.remove('opacity-100');
      backdrop.classList.add('opacity-0');
    }
    if (panel) {
      panel.classList.remove('translate-y-0');
      panel.classList.add('translate-y-full');
    }

    _drawerTimer = setTimeout(() => {
      drawer.classList.add('hidden');
      _drawerTimer = null;
    }, 220);
  }

  function syncRole() {
    const admin = isAdmin();
    const group = d.getElementById('stitchSidebarAdminGroup');
    if (group) {
      group.classList.toggle('hidden', !admin);
      group.querySelectorAll('[data-stitch-admin]').forEach((btn) => {
        const item = ADMIN_ITEMS.find((n) => n.key === btn.dataset.stitchAdmin);
        const allowed = item ? canAccessAdminItem(item) : admin;
        btn.classList.toggle('hidden', !allowed);
      });
    }
    const mobileDrawer = d.getElementById('mobileAdminMenuDrawer');
    if (mobileDrawer) {
      ADMIN_GROUPS.forEach((grp) => {
        let visibleInGroup = 0;
        grp.items.forEach((item) => {
          const btn = mobileDrawer.querySelector(`[data-mobile-admin="${item.key}"]`);
          const allowed = canAccessAdminItem(item);
          if (btn) btn.classList.toggle('hidden', !allowed);
          if (allowed) visibleInGroup++;
        });
        const grpEl = mobileDrawer.querySelector(`[data-mobile-admin-group="${grp.id}"]`);
        if (grpEl) grpEl.classList.toggle('hidden', visibleInGroup === 0);
      });
    }
  }

  function syncTheme() {
    const isDark = d.documentElement.classList.contains('dark');
    const icon = d.getElementById('stitchSidebarThemeIcon');
    const label = d.getElementById('stitchSidebarThemeLabel');
    if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    if (label) label.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
  }

  function syncActive(viewName, sectionId = null) {
    const normalized = viewName === 'riwayat' ? 'riwayat-full' : (viewName === 'profile' || viewName === 'jadwal') ? 'profil' : (viewName || 'presensi');
    _activeView = normalized;
    _activeSection = sectionId || null;

    const isInAdmin = normalized === 'admin' || normalized === 'kiosk' || normalized === 'tpp';
    const adminKey = activeAdminKey(normalized, sectionId);

    const aside = d.getElementById('stitchDesktopSidebar');
    if (aside) {
      aside.querySelectorAll('[data-stitch-nav]').forEach((btn) => {
        const active = btn.dataset.stitchNav === normalized;
        btn.classList.toggle('bg-blue-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('hover:bg-blue-700', active);
        btn.classList.toggle('text-slate-600', !active);
        btn.classList.toggle('dark:text-slate-300', !active);
        btn.classList.toggle('hover:bg-slate-100', !active);
        btn.classList.toggle('dark:hover:bg-slate-800/80', !active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
      });

      const parentBtn = d.getElementById('stitchSidebarAdminToggle');
      if (parentBtn) {
        parentBtn.classList.toggle('bg-blue-50', isInAdmin);
        parentBtn.classList.toggle('text-blue-600', isInAdmin);
        parentBtn.classList.toggle('dark:bg-blue-950/60', isInAdmin);
        parentBtn.classList.toggle('dark:text-blue-400', isInAdmin);
      }

      if (isInAdmin) {
        setAdminSubmenuOpen(true, false);
      }

      aside.querySelectorAll('[data-stitch-admin]').forEach((btn) => {
        const active = Boolean(adminKey) && btn.dataset.stitchAdmin === adminKey;
        btn.classList.toggle('bg-blue-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('font-bold', active);
        btn.classList.toggle('text-slate-600', !active);
        btn.classList.toggle('dark:text-slate-300', !active);
      });
    }

    const drawer = d.getElementById('mobileAdminMenuDrawer');
    if (drawer) {
      drawer.querySelectorAll('[data-mobile-admin]').forEach((btn) => {
        const active = Boolean(adminKey) && btn.dataset.mobileAdmin === adminKey;
        btn.classList.toggle('ring-2', active);
        btn.classList.toggle('ring-blue-600', active);
        btn.classList.toggle('bg-blue-50/70', active);
        btn.classList.toggle('dark:bg-blue-950/40', active);
      });
    }
  }

  function mount() {
    if (!d.getElementById('view-presensi')) return;
    injectStyles();
    if (!d.getElementById('stitchDesktopSidebar')) {
      const aside = buildSidebarMarkup();
      d.body.insertBefore(aside, d.body.firstChild);
    }
    d.body.classList.add('stitch-desktop-ready');
    applyWidthAndPinState();
    buildMobileAdminDrawer();
    syncRole();
    syncTheme();
    syncActive(_activeView, _activeSection);
  }

  w.StitchShell = {
    syncActive,
    syncRole,
    syncTheme,
    openMobileAdminDrawer,
    closeMobileAdminDrawer
  };
  w.openMobileAdminDrawer = openMobileAdminDrawer;
  w.closeMobileAdminDrawer = closeMobileAdminDrawer;

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window, document);
