/**
 * Stitch Responsive Sidebar & Mobile Bottom Nav Injector
 * Membuat halaman desktop bersidebar (admin.html, rekap.html, layanan.html, aset-kir.html, arsip.html, desktop.html)
 * nyaman dibuka di layar kecil (<1024px): menyembunyikan sidebar w-72, menghapus pl-72/left-72,
 * dan menyuntikkan floating bottom navigation bergaya absensi-STICH.
 */
(function () {
  'use strict';

  function mountResponsiveNav() {
    const style = document.createElement('style');
    style.id = 'stitch-responsive-nav-style';
    style.textContent = `
      @media (max-width: 1023px) {
        aside.w-72 { transform: translateX(-100%); transition: transform .25s cubic-bezier(.22,1,.36,1); }
        aside.w-72.stitch-drawer-open { transform: translateX(0); }
        div.pl-72 { padding-left: 0 !important; }
        header.left-72 { left: 0 !important; padding-left: 1rem !important; padding-right: 1rem !important; }
        main { padding-left: 1rem !important; padding-right: 1rem !important; padding-bottom: 6.5rem !important; }
      }
      @media (min-width: 1024px) {
        #stitchStandaloneBottomNav { display: none !important; }
      }
    `;
    document.head.appendChild(style);

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

    // Suntikkan tombol Keluar (Logout) di bagian bawah sidebar desktop jika belum ada
    const sidebarNav = document.querySelector('aside.w-72 nav');
    if (sidebarNav && !document.getElementById('stitchSidebarLogoutBtn')) {
      const btn = document.createElement('button');
      btn.id = 'stitchSidebarLogoutBtn';
      btn.type = 'button';
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

    const nav = document.createElement('nav');
    nav.id = 'stitchStandaloneBottomNav';
    nav.setAttribute('aria-label', 'Navigasi Bawah');
    nav.className = 'fixed bottom-3 inset-x-3 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.18)] px-2 py-1.5 flex items-center justify-around';
    nav.innerHTML = tabs.map(t => {
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
