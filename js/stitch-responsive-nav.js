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
  const STORAGE_THEME = 'stitch_theme';
  const COLLAPSED_WIDTH = 72;
  const MIN_WIDTH = 220;
  const MAX_WIDTH = 380;
  const DEFAULT_WIDTH = 264;

  // Terapkan tema tersimpan segera agar tidak terjadi flash putih saat dark mode aktif
  try {
    const savedTheme = localStorage.getItem(STORAGE_THEME);
    if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    else if (savedTheme === 'light') document.documentElement.classList.remove('dark');
  } catch (_) {}

  function resolvePortalAvatarSrc(raw) {
    const s = String(raw || '').trim();
    if (!s || s === 'null' || s === 'undefined') return '';
    if (s.startsWith('data:image')) return s;
    const tok = (typeof window.getStitchToken === 'function' && window.getStitchToken())
      || localStorage.getItem('_native_token')
      || localStorage.getItem('native_token')
      || localStorage.getItem('_sess_token')
      || '';
    const q = tok ? ('?token=' + encodeURIComponent(tok)) : '';
    const rawM = s.match(/^\/api\/media\/raw\/([^/?#]+)/);
    if (rawM && rawM[1]) return '/api/media/raw/' + encodeURIComponent(decodeURIComponent(rawM[1])) + q;
    const driveM = s.match(/\/file\/d\/([-\w]{5,200})/) || s.match(/\/d\/([-\w]{5,200})/) || s.match(/[?&]id=([-\w]{5,200})/);
    if (driveM && driveM[1]) return '/api/media/raw/' + encodeURIComponent(driveM[1]) + q;
    if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
    return '';
  }

  function isExplicitNonAdmin() {
    try {
      const uObj = JSON.parse(localStorage.getItem('tg_user_obj_v5') || 'null') || {};
      if (uObj.is_admin === true) return false;
      const role = String(uObj.role || uObj.Role || localStorage.getItem('MY_ROLE') || '').trim().toUpperCase();
      if (!role) return false; // Jangan sembunyikan link bila cache role belum terisi
      return ['USER', 'PEGAWAI', 'BENDAHARA BARANG', 'INSPEKTUR'].includes(role);
    } catch (_) {
      return false;
    }
  }

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
          body.stitch-standalone-shell aside.w-72 > div,
          body.stitch-standalone-shell aside.w-72 nav {
            overflow-x: hidden !important;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) nav a,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) nav button {
            padding-left: 0 !important;
            padding-right: 0 !important;
            gap: 0 !important;
            justify-content: center !important;
          }
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchAdminSubToggle,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchArsipSubToggle,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchAsetSubToggle {
            display: none !important;
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
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchStandaloneArsipSubmenu,
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) #stitchStandaloneAsetSubmenu,
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
          body.stitch-standalone-shell:not(.stitch-sb-pinned):not(.stitch-sb-resizing) aside.w-72:not(:hover) > div.border-t {
            display: none !important;
          }
          /* Portal Desktop Polish: header 68px, container terpusat max-w-1440px, padding seragam & tabular-nums */
          body.stitch-standalone-shell header {
            height: 68px !important;
            padding-left: 28px !important;
            padding-right: 28px !important;
            border-bottom: 1px solid rgba(226, 232, 240, 0.85);
          }
          body.stitch-standalone-shell main {
            padding: 88px 28px 48px !important;
            min-height: 100vh;
          }
          body.stitch-standalone-shell main > div:first-child {
            max-width: 1440px;
            margin-left: auto;
            margin-right: auto;
          }
          body.stitch-standalone-shell table td,
          body.stitch-standalone-shell table th {
            font-variant-numeric: tabular-nums;
          }
          body.stitch-standalone-shell aside.w-72 nav {
            overflow-y: auto;
            max-height: calc(100vh - 180px);
          }
        }
        /* Dark Mode Surface & Text Bridge untuk seluruh halaman Portal Desktop */
        html.dark body {
          background-color: #0b1120 !important;
          color: #f1f5f9 !important;
        }
        html.dark .bg-surface,
        html.dark .bg-surface-bright {
          background-color: #0b1120 !important;
        }
        html.dark [class*="bg-surface-container-lowest"],
        html.dark [class*="bg-white/"] {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .bg-white:not(aside .bg-white) {
          background-color: #0f172a !important;
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark .bg-surface-container-low,
        html.dark .bg-surface-container,
        html.dark .bg-slate-50,
        html.dark .bg-slate-100 {
          background-color: #1e293b !important;
        }
        html.dark .bg-surface-container-high,
        html.dark .bg-surface-container-highest,
        html.dark .bg-slate-200 {
          background-color: #334155 !important;
        }
        html.dark .text-on-surface,
        html.dark .text-on-background,
        html.dark .text-slate-900,
        html.dark .text-slate-800 {
          color: #f1f5f9 !important;
        }
        html.dark .text-on-surface-variant,
        html.dark .text-slate-700,
        html.dark .text-slate-600 {
          color: #94a3b8 !important;
        }
        html.dark .border-slate-100,
        html.dark .border-slate-200,
        html.dark [class*="border-outline-variant"],
        html.dark .divide-slate-100 > :not([hidden]) ~ :not([hidden]),
        html.dark .divide-slate-200 > :not([hidden]) ~ :not([hidden]) {
          border-color: rgba(51, 65, 85, 0.7) !important;
        }
        html.dark header {
          background-color: rgba(15, 23, 42, 0.92) !important;
          border-bottom-color: rgba(51, 65, 85, 0.75) !important;
        }
        html.dark table thead tr {
          background-color: #1e293b !important;
          color: #cbd5e1 !important;
        }
        html.dark table tbody tr:hover {
          background-color: rgba(30, 41, 59, 0.65) !important;
        }
        html.dark input:not([type="checkbox"]):not([type="radio"]),
        html.dark textarea,
        html.dark select {
          color: #f1f5f9;
        }
        html.dark select option {
          background-color: #0f172a;
          color: #f1f5f9;
        }
      `;
      document.head.appendChild(style);
    }

    const sidebarAside = document.querySelector('aside.w-72');
    const sidebarNav = sidebarAside ? sidebarAside.querySelector('nav') : null;

    // 0. Upgrade tombol "Mode HP (Mobile)" di header ke index.html?mode=mobile
    document.querySelectorAll('header a[href="index.html"]').forEach((link) => {
      link.setAttribute('href', 'index.html?mode=mobile');
      if (!link.dataset.stitchMobileBound) {
        link.dataset.stitchMobileBound = '1';
        link.addEventListener('click', () => {
          try { sessionStorage.setItem('stitch_ui_mode', 'mobile'); } catch (_) {}
        });
      }
    });

    // 0b. Suntikkan tombol Dark/Light Mode Toggle di header portal desktop
    const headerRight = document.querySelector('header > div:last-child');
    if (headerRight && !document.getElementById('stitchDesktopThemeBtn')) {
      const themeBtn = document.createElement('button');
      themeBtn.id = 'stitchDesktopThemeBtn';
      themeBtn.type = 'button';
      themeBtn.setAttribute('aria-label', 'Ganti tema gelap atau terang');
      themeBtn.className = 'w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-amber-300 flex items-center justify-center transition-colors cursor-pointer shrink-0';
      const syncThemeBtn = () => {
        const isDark = document.documentElement.classList.contains('dark');
        themeBtn.title = isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap';
        themeBtn.innerHTML = `<span class="material-symbols-outlined text-[19px]">${isDark ? 'light_mode' : 'dark_mode'}</span>`;
      };
      themeBtn.addEventListener('click', () => {
        const nextDark = !document.documentElement.classList.contains('dark');
        document.documentElement.classList.toggle('dark', nextDark);
        try { localStorage.setItem(STORAGE_THEME, nextDark ? 'dark' : 'light'); } catch (_) {}
        syncThemeBtn();
      });
      syncThemeBtn();
      const modeHpLink = headerRight.querySelector('a[href*="index.html"]');
      if (modeHpLink) modeHpLink.insertAdjacentElement('afterend', themeBtn);
      else headerRight.prepend(themeBtn);
    }

    // 0c. Hubungkan tombol lonceng Pemberitahuan di header ke /api/stitch/notifications
    const bellBtn = document.querySelector('header button[aria-label="Pemberitahuan"]');
    if (bellBtn && !bellBtn.dataset.stitchBellBound) {
      bellBtn.dataset.stitchBellBound = '1';
      const bellDot = bellBtn.querySelector('span.bg-error, span.bg-rose-500');
      const activeNip = (localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || '').trim();
      let cachedNotifs = [];
      if (activeNip) {
        fetch('/api/stitch/notifications?nip=' + encodeURIComponent(activeNip))
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            cachedNotifs = Array.isArray(json?.data) ? json.data : [];
            if (bellDot) bellDot.style.display = cachedNotifs.length > 0 ? '' : 'none';
          })
          .catch(() => {
            if (bellDot) bellDot.style.display = 'none';
          });
      } else if (bellDot) {
        bellDot.style.display = 'none';
      }
      bellBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const existing = document.getElementById('stitchHeaderNotifPopover');
        if (existing) { existing.remove(); return; }
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const pop = document.createElement('div');
        pop.id = 'stitchHeaderNotifPopover';
        pop.className = 'fixed z-[98] w-[340px] max-w-[calc(100vw-24px)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden flex flex-col';
        pop.innerHTML = `
          <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center">
                <span class="material-symbols-outlined text-[16px]">notifications</span>
              </span>
              <span class="text-xs font-extrabold text-slate-900 dark:text-white">Pemberitahuan</span>
              ${cachedNotifs.length ? `<span class="px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] text-[10px] font-mono font-bold">${cachedNotifs.length}</span>` : ''}
            </div>
            <button type="button" data-close-notif class="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 flex items-center justify-center cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          <div class="p-3 flex flex-col gap-2 max-h-80 overflow-y-auto">
            ${cachedNotifs.length
              ? cachedNotifs.slice(0, 15).map((n) => `
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70">
                    <div class="text-xs font-bold text-slate-900 dark:text-white">${esc(n.title || n.judul || 'Notifikasi')}</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">${esc(n.message || n.pesan || '-')}</div>
                  </div>`).join('')
              : '<div class="py-8 text-center text-xs text-slate-400">Belum ada pemberitahuan baru saat ini.</div>'}
          </div>
        `;
        document.body.appendChild(pop);
        const rect = bellBtn.getBoundingClientRect();
        const popW = pop.getBoundingClientRect().width || 340;
        let left = rect.right - popW;
        if (left < 12) left = 12;
        pop.style.left = `${left}px`;
        pop.style.top = `${rect.bottom + 8}px`;

        const closePop = (e) => {
          if (!e || e.target?.closest?.('[data-close-notif]') || (!pop.contains(e.target) && !bellBtn.contains(e.target))) {
            pop.remove();
            document.removeEventListener('click', closePop);
          }
        };
        pop.querySelector('[data-close-notif]')?.addEventListener('click', () => closePop(null));
        setTimeout(() => document.addEventListener('click', closePop), 0);
      });
    }

    // 1b. Submenu Manajemen Aset di Sidebar Desktop (Inventaris, Pemeliharaan, Tiket & Pinjam, Pengaturan)
    if (sidebarNav && !document.getElementById('stitchStandaloneAsetSubmenu')) {
      const asetLink = sidebarNav.querySelector('a[href="aset-kir.html"]');
      if (asetLink) {
        const isOnAset = (location.pathname.split('/').pop() || '').toLowerCase() === 'aset-kir.html';
        let asetSubOpen = isOnAset;

        const asetChevron = document.createElement('button');
        asetChevron.id = 'stitchAsetSubToggle';
        asetChevron.type = 'button';
        asetChevron.title = 'Tampilkan/sembunyikan submenu manajemen aset';
        asetChevron.className = 'ml-auto w-6 h-6 rounded-md flex items-center justify-center text-slate-300/80 hover:text-white hover:bg-white/15 transition-transform cursor-pointer';
        asetChevron.innerHTML = '<span class="material-symbols-outlined text-[16px]">expand_more</span>';
        asetLink.appendChild(asetChevron);

        const asetSubWrap = document.createElement('div');
        asetSubWrap.id = 'stitchStandaloneAsetSubmenu';
        asetSubWrap.className = 'mt-0.5 ml-3 pl-3 border-l border-slate-700/80 flex flex-col gap-0.5 overflow-hidden transition-all';
        const asetSubs = [
          { hash: '#inventaris', href: 'aset-kir.html#inventaris', icon: 'inventory_2', label: 'Inventaris & KIR', perms: ['aset.view', 'aset.manage'] },
          { hash: '#pemeliharaan', href: 'aset-kir.html#pemeliharaan', icon: 'build', label: 'Kartu Pemeliharaan', perms: ['aset.pemeliharaan'] },
          { hash: '#tiket-pinjam', href: 'aset-kir.html#tiket-pinjam', icon: 'assignment_turned_in', label: 'Tiket & Peminjaman', perms: ['aset.tiket'] },
          { hash: '#laporan-permen47', href: 'aset-kir.html#laporan-permen47', icon: 'description', label: 'Laporan Barang Permen 47', perms: ['aset.laporan'] },
          { hash: '#pengaturan', href: 'aset-kir.html#pengaturan', icon: 'tune', label: 'Pengaturan Aset', perms: ['aset.pengaturan'] }
        ];
        asetSubWrap.innerHTML = asetSubs.map((s) => `
          <a href="${s.href}" data-aset-sub="${s.hash}" data-req-perms="${(s.perms || []).join(',')}" title="${s.label}" class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium">
            <span class="material-symbols-outlined text-[16px] text-slate-500">${s.icon}</span>
            <span>${s.label}</span>
          </a>
        `).join('');
        asetLink.insertAdjacentElement('afterend', asetSubWrap);

        const syncAsetActive = () => {
          if (!isOnAset) return;
          const cur = (location.hash || '#inventaris').toLowerCase();
          asetSubWrap.querySelectorAll('a[data-aset-sub]').forEach((a) => {
            const act = a.dataset.asetSub === cur || (cur === '' && a.dataset.asetSub === '#inventaris');
            a.className = act
              ? 'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs bg-blue-600/20 text-blue-300 font-bold transition-colors'
              : 'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium';
            const ic = a.querySelector('.material-symbols-outlined');
            if (ic) ic.className = act ? 'material-symbols-outlined text-[16px] text-blue-400' : 'material-symbols-outlined text-[16px] text-slate-500';
          });
        };

        const syncAsetSub = () => {
          asetSubWrap.style.display = asetSubOpen ? 'flex' : 'none';
          asetChevron.style.transform = asetSubOpen ? 'rotate(180deg)' : 'rotate(0deg)';
          syncAsetActive();
        };

        asetChevron.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          asetSubOpen = !asetSubOpen;
          syncAsetSub();
        });
        window.addEventListener('hashchange', syncAsetActive);
        syncAsetSub();
      }
    }

    // 1a. Submenu Arsip Digital di Sidebar Desktop (Dokumen, Agenda Surat, Agenda SPPD)
    if (sidebarNav && !document.getElementById('stitchStandaloneArsipSubmenu')) {
      const arsipLink = sidebarNav.querySelector('a[href="arsip.html"]');
      if (arsipLink) {
        const isOnArsip = (location.pathname.split('/').pop() || '').toLowerCase() === 'arsip.html';
        let arsipSubOpen = isOnArsip;

        const arsipChevron = document.createElement('button');
        arsipChevron.id = 'stitchArsipSubToggle';
        arsipChevron.type = 'button';
        arsipChevron.title = 'Tampilkan/sembunyikan submenu arsip digital';
        arsipChevron.className = 'ml-auto w-6 h-6 rounded-md flex items-center justify-center text-slate-300/80 hover:text-white hover:bg-white/15 transition-transform cursor-pointer';
        arsipChevron.innerHTML = '<span class="material-symbols-outlined text-[16px]">expand_more</span>';
        arsipLink.appendChild(arsipChevron);

        const arsipSubWrap = document.createElement('div');
        arsipSubWrap.id = 'stitchStandaloneArsipSubmenu';
        arsipSubWrap.className = 'mt-0.5 ml-3 pl-3 border-l border-slate-700/80 flex flex-col gap-0.5 overflow-hidden transition-all';
        const arsipSubs = [
          { hash: '#dokumen', href: 'arsip.html#dokumen', icon: 'description', label: 'Dokumen' },
          { hash: '#agenda-surat', href: 'arsip.html#agenda-surat', icon: 'mail', label: 'Agenda Surat' },
          { hash: '#agenda-sppd', href: 'arsip.html#agenda-sppd', icon: 'flight_takeoff', label: 'Agenda SPPD' }
        ];
        arsipSubWrap.innerHTML = arsipSubs.map((s) => `
          <a href="${s.href}" data-arsip-sub="${s.hash}" title="${s.label}" class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium">
            <span class="material-symbols-outlined text-[16px] text-slate-500">${s.icon}</span>
            <span>${s.label}</span>
          </a>
        `).join('');
        arsipLink.insertAdjacentElement('afterend', arsipSubWrap);

        const syncArsipActive = () => {
          if (!isOnArsip) return;
          const cur = (location.hash || '#dokumen').toLowerCase();
          arsipSubWrap.querySelectorAll('a[data-arsip-sub]').forEach((a) => {
            const act = a.dataset.arsipSub === cur || (cur === '' && a.dataset.arsipSub === '#dokumen');
            a.className = act
              ? 'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs bg-blue-600/20 text-blue-300 font-bold transition-colors'
              : 'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium';
            const ic = a.querySelector('.material-symbols-outlined');
            if (ic) ic.className = act ? 'material-symbols-outlined text-[16px] text-blue-400' : 'material-symbols-outlined text-[16px] text-slate-500';
          });
        };

        const syncArsipSub = () => {
          arsipSubWrap.style.display = arsipSubOpen ? 'flex' : 'none';
          arsipChevron.style.transform = arsipSubOpen ? 'rotate(180deg)' : 'rotate(0deg)';
          syncArsipActive();
        };

        arsipChevron.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          arsipSubOpen = !arsipSubOpen;
          syncArsipSub();
        });
        window.addEventListener('hashchange', syncArsipActive);
        syncArsipSub();
      }
    }

    // 1. Submenu Panel Admin di Sidebar Desktop (collapsible + sembunyikan untuk non-admin)
    if (sidebarNav && !document.getElementById('stitchStandaloneAdminSubmenu')) {
      const adminLink = sidebarNav.querySelector('a[href="admin.html"]');
      if (adminLink) {
        if (isExplicitNonAdmin()) {
          adminLink.style.display = 'none';
        } else {
          const isOnAdmin = (location.pathname.split('/').pop() || '').toLowerCase() === 'admin.html';
          let subOpen = isOnAdmin;

          const chevron = document.createElement('button');
          chevron.id = 'stitchAdminSubToggle';
          chevron.type = 'button';
          chevron.title = 'Tampilkan/sembunyikan submenu admin';
          chevron.className = 'ml-auto w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/70 transition-transform';
          chevron.innerHTML = '<span class="material-symbols-outlined text-[16px]">expand_more</span>';
          adminLink.appendChild(chevron);

          const subWrap = document.createElement('div');
          subWrap.id = 'stitchStandaloneAdminSubmenu';
          subWrap.className = 'mt-0.5 ml-3 pl-3 border-l border-slate-700/80 flex flex-col gap-0.5 overflow-hidden transition-all';
          const adminSubs = [
            { hash: '#tab-ops', href: 'admin.html#tab-ops', icon: 'how_to_reg', label: 'Operasional & Izin', perms: ['admin.monitoring', 'admin.izin', 'keterangan.approve'] },
            { hash: '#tab-pepegawaian', href: 'admin.html#tab-pepegawaian', icon: 'domain', label: 'OPD, Bidang & Perangkat', perms: ['admin.instansi', 'admin.devices'] },
            { hash: '#tab-config', href: 'admin.html#tab-config', icon: 'tune', label: 'Geofence, Jam & Biometrik', perms: ['admin.geofence', 'admin.jam_libur'] },
            { hash: '#tab-pegawai', href: 'admin.html#tab-pegawai', icon: 'face', label: 'Master Pegawai & AI', perms: ['admin.users'] },
            { hash: '#tab-roles', href: 'admin.html#tab-roles', icon: 'manage_accounts', label: 'Kelola Role & Hak', perms: ['admin.roles'] },
            { hash: '#tab-diagnostics', href: 'admin.html#tab-diagnostics', icon: 'terminal', label: 'Developer & OpenWA', perms: ['admin.dev'] },
            { hash: '', href: 'cetak-tpp.html', icon: 'receipt_long', label: 'Cetak Rekap TPP', perms: ['admin.rekap', 'presensi.view_all'] }
          ];
          subWrap.innerHTML = adminSubs.map((s) => `
            <a href="${s.href}" data-admin-sub="${s.hash}" data-req-perms="${(s.perms || []).join(',')}" title="${s.label}" class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium">
              <span class="material-symbols-outlined text-[16px] text-slate-500">${s.icon}</span>
              <span>${s.label}</span>
            </a>
          `).join('');
          adminLink.insertAdjacentElement('afterend', subWrap);

          const syncAdminActive = () => {
            if (!isOnAdmin) return;
            const cur = (location.hash || '#tab-ops').toLowerCase();
            subWrap.querySelectorAll('a[data-admin-sub]').forEach((a) => {
              const target = a.dataset.adminSub || '';
              const act = target && (target === cur || (cur === '' && target === '#tab-ops'));
              a.className = act
                ? 'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs bg-blue-600/20 text-blue-300 font-bold transition-colors'
                : 'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors font-medium';
              const ic = a.querySelector('.material-symbols-outlined');
              if (ic) ic.className = act ? 'material-symbols-outlined text-[16px] text-blue-400' : 'material-symbols-outlined text-[16px] text-slate-500';
            });
          };

          const syncSub = () => {
            subWrap.style.display = subOpen ? 'flex' : 'none';
            chevron.style.transform = subOpen ? 'rotate(180deg)' : 'rotate(0deg)';
            syncAdminActive();
          };
          window.addEventListener('hashchange', syncAdminActive);
          chevron.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            subOpen = !subOpen;
            syncSub();
          });
          syncSub();
        }
      }
    }

    // 1b. Tambahkan tautan E-Slip Kehadiran & Profil di sidebar desktop jika belum ada
    if (sidebarNav && !sidebarNav.querySelector('a[href="e-slip.html"]')) {
      const rekapLink = sidebarNav.querySelector('a[href="rekap.html"]');
      if (rekapLink) {
        const eslipA = document.createElement('a');
        eslipA.href = 'e-slip.html';
        eslipA.className = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors font-medium text-sm';
        eslipA.innerHTML = '<span class="material-symbols-outlined text-[20px]">receipt</span><span>E-Slip Kehadiran</span>';
        rekapLink.insertAdjacentElement('afterend', eslipA);
      }
    }
    if (sidebarNav && !sidebarNav.querySelector('a[href="profil.html"]')) {
      const profilA = document.createElement('a');
      profilA.href = 'profil.html';
      profilA.className = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors font-medium text-sm';
      profilA.innerHTML = '<span class="material-symbols-outlined text-[20px]">account_circle</span><span>Profil &amp; Biometrik</span>';
      sidebarNav.appendChild(profilA);
    }

    // 1c. Sembunyikan menu sidebar desktop (Arsip, Aset, Kiosk, Admin) bila role tidak memiliki hak akses
    if (sidebarNav) {
      const applyDesktopNavPerms = (perms) => {
        if (!Array.isArray(perms)) return;
        const role = String(localStorage.getItem('MY_ROLE') || localStorage.getItem('_sess_role') || '').trim().toUpperCase().replace(/\s+/g, '_');
        if (role === 'SUPERADMIN' || perms.includes('*')) return;
        const hasAny = (list) => list.some((p) => perms.includes(p));
        const toggleLink = (href, submenuId, allowed) => {
          const a = sidebarNav.querySelector(`a[href="${href}"]`);
          if (a) a.style.display = allowed ? '' : 'none';
          if (submenuId) {
            const sub = document.getElementById(submenuId);
            if (sub && !allowed) sub.style.display = 'none';
          }
        };
        toggleLink('arsip.html', 'stitchStandaloneArsipSubmenu', hasAny(['arsip.view', 'arsip.upload', 'arsip.agenda_surat']));
        toggleLink('aset-kir.html', 'stitchStandaloneAsetSubmenu', hasAny(['aset.view', 'aset.pinjam', 'aset.laporan', 'aset.tiket', 'aset.pemeliharaan', 'aset.pengaturan', 'aset.manage', 'aset.approve']));
        toggleLink('kiosk.html', null, hasAny(['admin.kiosk', 'admin.devices']));
        toggleLink('admin.html', 'stitchStandaloneAdminSubmenu', perms.some((p) => String(p || '').startsWith('admin.')));
        toggleLink('e-slip.html', null, hasAny(['presensi.eslip', 'presensi.view_own', 'presensi.view_all', 'admin.rekap']));
        // Filter tab Aset di halaman aset-kir.html sesuai izin granular
        const asetTabPermMap = {
          'pemeliharaan': ['aset.pemeliharaan'],
          'tiket-pinjam': ['aset.tiket'],
          'laporan-permen47': ['aset.laporan'],
          'pengaturan': ['aset.pengaturan']
        };
        document.querySelectorAll('[data-aset-tab-btn]').forEach((btn) => {
          const req = asetTabPermMap[btn.getAttribute('data-aset-tab-btn')];
          if (req) btn.style.display = hasAny(req) ? '' : 'none';
        });
        document.querySelectorAll('[data-arsip-tab-btn][data-req-perms]').forEach((btn) => {
          const req = String(btn.getAttribute('data-req-perms') || '').split(',').map((s) => s.trim()).filter(Boolean);
          if (req.length) btn.style.display = hasAny(req) ? '' : 'none';
        });
        // Filter setiap submenu & kartu/tombol granular bertanda data-req-perms di seluruh halaman desktop
        document.querySelectorAll('[data-req-perms]').forEach((el) => {
          const req = String(el.getAttribute('data-req-perms') || '').split(',').map((s) => s.trim()).filter(Boolean);
          if (req.length) el.style.display = hasAny(req) ? '' : 'none';
        });
        const suratSub = sidebarNav.querySelector('a[href="arsip.html#agenda-surat"]');
        if (suratSub) {
          suratSub.style.display = hasAny(['arsip.agenda_surat', 'arsip.upload']) ? '' : 'none';
        }
        const sppdSub = sidebarNav.querySelector('a[href="arsip.html#agenda-sppd"]');
        if (sppdSub) {
          sppdSub.style.display = hasAny(['perjadin.view', 'perjadin.create', 'perjadin.approve']) ? '' : 'none';
        }
      };
      try {
        const rawP = localStorage.getItem('MY_PERMS');
        if (rawP) applyDesktopNavPerms(JSON.parse(rawP));
        const nip = (localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || '').trim();
        const tok = localStorage.getItem('_native_token') || localStorage.getItem('native_token') || localStorage.getItem('_sess_token') || '';
        if (nip && tok) {
          fetch(`/api/stitch/user-data?nip=${encodeURIComponent(nip)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((j) => {
              const p = j?.user?.role_permissions;
              if (Array.isArray(p)) {
                try { localStorage.setItem('MY_PERMS', JSON.stringify(p)); } catch (_) {}
                applyDesktopNavPerms(p);
              }
            })
            .catch(() => {});
        }
      } catch (_) {}
    }

    // 2. Sinkronisasi profil & foto avatar user login asli pada top header halaman desktop
    try {
      const uObj = JSON.parse(localStorage.getItem('tg_user_obj_v5') || 'null') || {};
      const realNama = uObj.username || uObj.nama || localStorage.getItem('MY_NAME') || '';
      const realNip = uObj.NIP || uObj.nip || localStorage.getItem('MY_NIP') || '';
      const realJab = uObj.Jabatan || uObj.jabatan || localStorage.getItem('MY_ROLE') || 'Pegawai';
      const avatarSrc = resolvePortalAvatarSrc(uObj.face_photo || uObj.foto_wajah || '');
      if (realNama) {
        const parts = realNama.trim().split(/\s+/).filter((p) => !p.includes('.'));
        const ini = (parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0]?.[0] || 'P')).toUpperCase();
        document.querySelectorAll('header [data-portal-user-name]').forEach((sp) => { sp.textContent = realNama; });
        document.querySelectorAll('header [data-portal-user-meta]').forEach((sp) => { sp.textContent = `NIP ${realNip || '-'} • ${realJab}`; });
        document.querySelectorAll('header [data-portal-user-avatar]').forEach((dv) => {
          if (avatarSrc) {
            dv.classList.add('overflow-hidden', 'relative');
            dv.innerHTML = `<img src="${avatarSrc}" alt="${ini}" class="w-full h-full object-cover" onerror="const p=this.parentElement;this.remove();if(p)p.textContent='${ini}';">`;
          } else {
            dv.textContent = ini;
          }
        });
        document.querySelectorAll('header span').forEach((sp) => {
          const txt = (sp.textContent || '').trim();
          if (txt === 'Charles Hermana Weru, S.Sos') sp.textContent = realNama;
          else if (txt.includes('197211022001121001')) sp.textContent = `NIP ${realNip || '-'} • ${realJab}`;
        });
        document.querySelectorAll('header div').forEach((dv) => {
          const t = (dv.textContent || '').trim();
          if ((t === 'CW' || t === 'AA' || t === '--') && dv.children.length === 0) {
            if (avatarSrc) {
              dv.classList.add('overflow-hidden', 'relative');
              dv.innerHTML = `<img src="${avatarSrc}" alt="${ini}" class="w-full h-full object-cover" onerror="const p=this.parentElement;this.remove();if(p)p.textContent='${ini}';">`;
            } else {
              dv.textContent = ini;
            }
          }
        });
      }
    } catch (_) {}

    // 3. Auto-enhance native <select> & <input type="date"> di portal desktop bila StitchPicker belum dimuat
    if (document.querySelector('select:not(.hidden), input[type="date"]')) {
      const enhanceDesktopControls = () => {
        if (!window.StitchPicker) return;
        document.querySelectorAll('select:not(.hidden):not(.swal2-select)').forEach((sel, idx) => {
          if (sel.style.display === 'none') return;
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

    const _inTgMiniApp = Boolean((window.Telegram?.WebApp?.initData || window.tg?.initData) || (window.Telegram?.WebApp?.platform && window.Telegram.WebApp.platform !== 'unknown'));
    if (sidebarNav && !_inTgMiniApp && !document.getElementById('stitchSidebarLogoutBtn')) {
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
      { href: 'rekap.html', icon: 'bar_chart', label: 'Rekap', match: 'rekap.html' },
      { href: 'arsip.html', icon: 'folder_open', label: 'Arsip', match: 'arsip.html' },
      { href: 'index.html?mode=mobile#presensi', icon: 'fingerprint', label: 'Presensi', match: 'index.html' },
      { href: 'aset-kir.html', icon: 'inventory_2', label: 'Aset', match: 'aset-kir.html' },
      { href: 'admin.html', icon: 'admin_panel_settings', label: 'Admin', match: 'admin.html' }
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
