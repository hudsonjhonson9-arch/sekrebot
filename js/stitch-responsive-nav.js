/**
 * Stitch Responsive Sidebar & Mobile Bottom Nav Injector
 * - Layar kecil (<1024px): menyembunyikan sidebar w-72, menghapus pl-72/left-72,
 *   dan menyuntikkan floating bottom navigation bergaya absensi-STICH.
 * - Layar desktop (>=1024px): mengubah sidebar statis aside.w-72 menjadi rail 72px
 *   yang hover-expandable, bisa di-pin, dan resizable via drag di tepi kanan
 *   (lebar & status pin tersimpan di localStorage).
 */
(function () {
  'use strict';

  const STORAGE_WIDTH = 'stitch_sidebar_width';
  const STORAGE_PINNED = 'stitch_sidebar_pinned';
  const COLLAPSED_WIDTH = 72;
  const MIN_WIDTH = 220;
  const MAX_WIDTH = 380;
  const DEFAULT_WIDTH = 264;

  function clampWidth(val) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  }

  function readWidth() {
    try { return clampWidth(localStorage.getItem(STORAGE_WIDTH)); } catch (_) { return DEFAULT_WIDTH; }
  }

  function readPinned() {
    try { return localStorage.getItem(STORAGE_PINNED) === '1'; } catch (_) { return false; }
  }

  function saveWidth(wPx) {
    try { localStorage.setItem(STORAGE_WIDTH, String(wPx)); } catch (_) {}
  }

  function savePinned(flag) {
    try { localStorage.setItem(STORAGE_PINNED, flag ? '1' : '0'); } catch (_) {}
  }

  function upgradeDesktopSidebar(aside) {
    if (!aside || aside.dataset.stitchDesktopUpgraded === '1') return;
    aside.dataset.stitchDesktopUpgraded = '1';

    let width = readWidth();
    let pinned = readPinned();

    document.documentElement.style.setProperty('--stitch-rail-w', `${COLLAPSED_WIDTH}px`);
    document.documentElement.style.setProperty('--stitch-sidebar-w', `${width}px`);
    document.body.classList.add('stitch-standalone-shell');
    document.body.classList.toggle('stitch-sb-pinned', pinned);

    aside.querySelectorAll('nav a').forEach((link) => {
      if (!link.getAttribute('title')) {
        const label = link.querySelector('span:not(.material-symbols-outlined)')?.textContent?.trim();
        if (label) link.setAttribute('title', label);
      }
    });

    const headerBar = aside.querySelector(':scope > div > div:first-child');
    let pinBtn = null;
    let pinIcon = null;
    if (headerBar && !document.getElementById('stitchStandalonePinBtn')) {
      headerBar.classList.add('justify-between');
      pinBtn = document.createElement('button');
      pinBtn.id = 'stitchStandalonePinBtn';
      pinBtn.type = 'button';
      pinBtn.setAttribute('aria-label', 'Sematkan sidebar');
      pinBtn.className = 'w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0';
      pinBtn.innerHTML = '<span id="stitchStandalonePinIcon" class="material-symbols-outlined text-[18px] transition-transform duration-200">push_pin</span>';
      headerBar.appendChild(pinBtn);
      pinIcon = pinBtn.querySelector('#stitchStandalonePinIcon');
    }

    function syncPinUI() {
      document.body.classList.toggle('stitch-sb-pinned', pinned);
      if (pinBtn && pinIcon) {
        pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        pinBtn.title = pinned ? 'Lepas sematan sidebar' : 'Sematkan lebar sidebar';
        pinBtn.classList.toggle('bg-blue-600/20', pinned);
        pinBtn.classList.toggle('text-blue-400', pinned);
        pinIcon.style.transform = pinned ? 'rotate(0deg)' : 'rotate(45deg)';
      }
    }

    if (pinBtn) {
      pinBtn.addEventListener('click', () => {
        pinned = !pinned;
        savePinned(pinned);
        syncPinUI();
      });
    }
    syncPinUI();

    if (!document.getElementById('stitchStandaloneResizeHandle')) {
      const handle = document.createElement('div');
      handle.id = 'stitchStandaloneResizeHandle';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', 'Ubah lebar sidebar');
      handle.innerHTML = '<div class="stitch-handle-bar"></div>';
      aside.appendChild(handle);

      let dragging = false;
      let startX = 0;
      let startWidth = width;

      function onMove(e) {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        width = clampWidth(startWidth + (clientX - startX));
        document.documentElement.style.setProperty('--stitch-sidebar-w', `${width}px`);
      }

      function onEnd() {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('stitch-sb-resizing');
        saveWidth(width);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
      }

      function onStart(e) {
        e.preventDefault();
        dragging = true;
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startWidth = aside.getBoundingClientRect().width || width;
        if (startWidth < MIN_WIDTH) startWidth = width;
        document.body.classList.add('stitch-sb-resizing');
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
      }

      handle.addEventListener('mousedown', onStart);
      handle.addEventListener('touchstart', onStart, { passive: false });
    }
  }

  function mountResponsiveNav() {
    if (!document.getElementById('stitch-responsive-nav-style')) {
      const style = document.createElement('style');
      style.id = 'stitch-responsive-nav-style';
      style.textContent = `
        @media (max-width: 1023px) {
          aside.w-72 { transform: translateX(-100%); transition: transform .25s cubic-bezier(.22,1,.36,1); }
          aside.w-72.stitch-drawer-open { transform: translateX(0); }
          div.pl-72 { padding-left: 0 !important; }
          header.left-72 { left: 0 !important; padding-left: 1rem !important; padding-right: 1rem !important; }
          main { padding-left: 1rem !important; padding-right: 1rem !important; padding-bottom: 6.5rem !important; }
          #stitchStandaloneResizeHandle, #stitchStandalonePinBtn { display: none !important; }
        }
        @media (min-width: 1024px) {
          #stitchStandaloneBottomNav { display: none !important; }
          body.stitch-standalone-shell aside.w-72 {
            width: var(--stitch-rail-w, 72px) !important;
            overflow: hidden;
            transition: width 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms ease;
          }
          body.stitch-standalone-shell aside.w-72:hover,
          body.stitch-standalone-shell.stitch-sb-pinned aside.w-72,
          body.stitch-standalone-shell.stitch-sb-resizing aside.w-72 {
            width: var(--stitch-sidebar-w, 264px) !important;
          }
          body.stitch-standalone-shell div.pl-72 {
            padding-left: var(--stitch-rail-w, 72px) !important;
            transition: padding-left 220ms cubic-bezier(.22,1,.36,1);
          }
          body.stitch-standalone-shell.stitch-sb-pinned div.pl-72 {
            padding-left: var(--stitch-sidebar-w, 264px) !important;
          }
          body.stitch-standalone-shell header.left-72 {
            left: var(--stitch-rail-w, 72px) !important;
            transition: left 220ms cubic-bezier(.22,1,.36,1);
          }
          body.stitch-standalone-shell.stitch-sb-pinned header.left-72 {
            left: var(--stitch-sidebar-w, 264px) !important;
          }
          body.stitch-standalone-shell.stitch-sb-resizing aside.w-72,
          body.stitch-standalone-shell.stitch-sb-resizing div.pl-72,
          body.stitch-standalone-shell.stitch-sb-resizing header.left-72 {
            transition: none !important;
          }
          body.stitch-standalone-shell aside.w-72 nav a,
          body.stitch-standalone-shell aside.w-72 nav button {
            white-space: nowrap;
          }
          body.stitch-standalone-shell aside.w-72 nav a .material-symbols-outlined,
          body.stitch-standalone-shell aside.w-72 nav button .material-symbols-outlined {
            flex-shrink: 0;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div > div:first-child {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div > div:nth-child(2) {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) nav a,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) nav button {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          body.stitch-standalone-shell aside.w-72 > div > div:first-child > div.min-w-0,
          body.stitch-standalone-shell aside.w-72 > div > div:nth-child(2) > div:first-child,
          body.stitch-standalone-shell aside.w-72 nav a > span:not(.material-symbols-outlined),
          body.stitch-standalone-shell aside.w-72 nav button > span:not(.material-symbols-outlined),
          body.stitch-standalone-shell aside.w-72 > div:last-child,
          body.stitch-standalone-shell #stitchStandalonePinBtn {
            transition: opacity 140ms ease, max-width 200ms cubic-bezier(.22,1,.36,1);
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div > div:first-child > div.min-w-0,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div > div:nth-child(2) > div:first-child,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) nav a > span:not(.material-symbols-outlined),
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) nav button > span:not(.material-symbols-outlined),
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchStandaloneAdminSubmenu,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div:last-child,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchStandalonePinBtn {
            opacity: 0;
            max-width: 0;
            max-height: 0;
            overflow: hidden;
            pointer-events: none;
            white-space: nowrap;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div:last-child {
            padding: 0 !important;
            border-top-color: transparent !important;
          }
          #stitchStandaloneResizeHandle {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 6px;
            cursor: col-resize;
            z-index: 60;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          #stitchStandaloneResizeHandle .stitch-handle-bar {
            width: 2px;
            height: 40px;
            border-radius: 9999px;
            background: rgba(148, 163, 184, 0.5);
            opacity: 0;
            transition: opacity 150ms ease, background-color 150ms ease;
          }
          #stitchStandaloneResizeHandle:hover .stitch-handle-bar,
          body.stitch-sb-resizing #stitchStandaloneResizeHandle .stitch-handle-bar {
            opacity: 1;
            background: #2563eb;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchStandaloneResizeHandle {
            pointer-events: none;
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const sidebarAside = document.querySelector('aside.w-72');
    const sidebarNav = sidebarAside ? sidebarAside.querySelector('nav') : null;

    // 1. Suntikkan Submenu Panel Admin di Sidebar Desktop (hover/klik untuk buka)
    if (sidebarNav && !document.getElementById('stitchStandaloneAdminSubmenu')) {
      const adminLink = sidebarNav.querySelector('a[href="admin.html"]');
      if (adminLink) {
        const subWrap = document.createElement('div');
        subWrap.id = 'stitchStandaloneAdminSubmenu';
        subWrap.className = 'mt-0.5 ml-3 pl-3 border-l border-slate-700/80 flex flex-col gap-0.5 overflow-hidden transition-all';
        const adminSubs = [
          { href: 'index.html#admin:adminSectionMonitoring', icon: 'monitoring', label: 'Monitoring Hari Ini' },
          { href: 'index.html#admin:adminSectionIzin', icon: 'rule', label: 'Konfirmasi Izin' },
          { href: 'index.html#admin:adminSectionRekap', icon: 'analytics', label: 'Rekap Semua Pegawai' },
          { href: 'index.html#admin:adminSectionPegawai', icon: 'face', label: 'Master Pegawai & AI' },
          { href: 'index.html#admin:adminSectionRoles', icon: 'manage_accounts', label: 'Kelola Role & Hak' },
          { href: 'index.html#admin:adminSectionGeofence', icon: 'share_location', label: 'Geofencing Lokasi' },
          { href: 'index.html#admin:adminSectionJamLibur', icon: 'schedule', label: 'Jam Kerja & Libur' },
          { href: 'cetak-tpp.html', icon: 'receipt_long', label: 'Cetak Rekap TPP' }
        ];
        subWrap.innerHTML = adminSubs.map((s) => `
          <a href="${s.href}" title="${s.label}" class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium">
            <span class="material-symbols-outlined text-[16px] text-slate-500">${s.icon}</span>
            <span>${s.label}</span>
          </a>
        `).join('');
        adminLink.insertAdjacentElement('afterend', subWrap);
      }
    }

    // 2. Sinkronisasi profil user login asli pada top header halaman desktop (ganti placeholder statis)
    try {
      const uObj = JSON.parse(localStorage.getItem('tg_user_obj_v5') || 'null') || {};
      const realNama = uObj.username || uObj.nama || localStorage.getItem('MY_NAME') || '';
      const realNip = uObj.NIP || uObj.nip || localStorage.getItem('MY_NIP') || '';
      const realJab = uObj.Jabatan || uObj.jabatan || localStorage.getItem('MY_ROLE') || 'Pegawai';
      if (realNama) {
        const parts = realNama.trim().split(/\s+/).filter((p) => !p.includes('.'));
        const ini = (parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0]?.[0] || 'P')).toUpperCase();
        document.querySelectorAll('header span').forEach((sp) => {
          const txt = (sp.textContent || '').trim();
          if (txt === 'Charles Hermana Weru, S.Sos') sp.textContent = realNama;
          else if (txt.includes('197211022001121001')) sp.textContent = `NIP ${realNip || '-'} • ${realJab}`;
        });
        document.querySelectorAll('header div').forEach((dv) => {
          if ((dv.textContent || '').trim() === 'CW' && dv.children.length === 0) dv.textContent = ini;
        });
      }
    } catch (_) {}

    // 3. Auto-enhance native <select> & <input type="date"> di portal desktop bila StitchPicker belum dimuat
    if (document.querySelector('select:not(.hidden), input[type="date"]')) {
      const enhanceDesktopControls = () => {
        if (!window.StitchPicker) return;
        document.querySelectorAll('select:not(.hidden)').forEach((sel, idx) => {
          if (!sel.id) sel.id = 'stitchDesktopSel_' + idx;
          window.StitchPicker.enhanceSelect(sel.id, { searchable: sel.options.length > 6 });
        });
        document.querySelectorAll('input[type="date"]').forEach((inp, idx) => {
          if (!inp.id) inp.id = 'stitchDesktopDate_' + idx;
          window.StitchPicker.enhanceDate(inp.id);
        });
      };
      if (window.StitchPicker) {
        enhanceDesktopControls();
      } else if (!document.querySelector('script[src*="stitch-pickers.js"]')) {
        const sc = document.createElement('script');
        sc.src = 'js/stitch-pickers.js';
        sc.onload = enhanceDesktopControls;
        document.body.appendChild(sc);
      }
    }

    if (sidebarNav && !document.getElementById('stitchSidebarLogoutBtn')) {
      const btn = document.createElement('button');
      btn.id = 'stitchSidebarLogoutBtn';
      btn.type = 'button';
      btn.title = 'Keluar Akun';
      btn.className = 'w-full mt-2 flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-rose-400 hover:bg-rose-950/60 hover:text-rose-300 transition-all font-semibold text-sm cursor-pointer';
      btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">logout</span><span>Keluar Akun</span>';
      btn.addEventListener('click', () => {
        if (window.StitchSession && typeof window.StitchSession.logout === 'function') {
          window.StitchSession.logout();
        } else if (typeof window.logoutUser === 'function') {
          window.logoutUser();
        }
      });
      sidebarNav.appendChild(btn);
    }

    if (sidebarAside) {
      upgradeDesktopSidebar(sidebarAside);
    }

    if (document.getElementById('stitchStandaloneBottomNav')) return;
    const path = (location.pathname.split('/').pop() || '').toLowerCase();
    const tabs = [
      { href: 'index.html#presensi', icon: 'fingerprint', label: 'Presensi', match: 'index.html' },
      { href: 'rekap.html', icon: 'bar_chart', label: 'Rekap', match: 'rekap.html' },
      { href: 'admin.html', icon: 'admin_panel_settings', label: 'Admin', match: 'admin.html' },
      { href: 'layanan.html', icon: 'work_outline', label: 'Layanan', match: 'layanan.html' },
      { href: 'aset-kir.html', icon: 'inventory_2', label: 'Aset', match: 'aset-kir.html' },
      { href: 'arsip.html', icon: 'folder_open', label: 'Arsip', match: 'arsip.html' }
    ];

    const nav = document.createElement('nav');
    nav.id = 'stitchStandaloneBottomNav';
    nav.setAttribute('aria-label', 'Navigasi Bawah');
    nav.className = 'fixed bottom-3 inset-x-3 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.18)] px-2 py-1.5 flex items-center justify-around';
    nav.innerHTML = tabs.map((t) => {
      const active = path === t.match;
      return `
        <a href="${t.href}" class="flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-transform active:scale-90 ${active ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'}">
          <span class="material-symbols-outlined text-[20px]">${t.icon}</span>
          <span class="text-[10px] mt-0.5">${t.label}</span>
        </a>
      `;
    }).join('');
    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountResponsiveNav);
  } else {
    mountResponsiveNav();
  }
})();
