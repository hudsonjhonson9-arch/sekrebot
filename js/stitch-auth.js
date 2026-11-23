/* ════ STITCH AUTH SHIM ════
 * Menambahkan header Authorization (token sesi native) ke semua fetch ke
 * /api/stitch/*. Dimuat paling awal di index.html, desktop.html, admin.html,
 * dan halaman portal desktop lain, supaya satu mekanisme dipakai bersama.
 * Bila tidak ada token, halaman desktop/admin diarahkan ke login.html.
 */
(function () {
  'use strict';
  if (window.__stitchAuthShim) return;
  window.__stitchAuthShim = true;

  function getToken() {
    try {
      return localStorage.getItem('_native_token')
        || localStorage.getItem('native_token')
        || localStorage.getItem('_sess_token')
        || '';
    } catch (_) { return ''; }
  }
  window.getStitchToken = getToken;

  /* ── Sesi: pembersihan terpusat + penanganan sesi kedaluwarsa (401) ── */
  const SESSION_KEYS = [
    '_native_token', 'native_token', '_sess_token', '_sess_nip', '_sess_role', '_sess_inst',
    'stitch_active_nip', 'stitch_active_view', 'MY_NIP', 'MY_ROLE', 'MY_NAME', 'MY_INSTANSI', 'MY_PERMS',
    'tg_user_id_v5', 'tg_user_obj_v5', 'tg_user_id_v4', 'tg_user_obj_v4'
  ];
  function clearAllClientCookies() {
    try {
      const cookies = (document.cookie || '').split(';');
      const host = location.hostname || '';
      const parts = host.split('.');
      const rootDom = parts.length >= 2 ? '.' + parts.slice(-2).join('.') : '';
      cookies.forEach(function (c) {
        const name = c.split('=')[0].trim();
        if (!name) return;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        if (host) document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + host;
        if (rootDom) document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + rootDom;
      });
    } catch (_) {}
  }
  function clearSession() {
    SESSION_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
    try { sessionStorage.clear(); } catch (_) {}
    clearAllClientCookies();
    try {
      if (typeof STORAGE_KEYS !== 'undefined') {
        if (STORAGE_KEYS.USER_ID) localStorage.removeItem(STORAGE_KEYS.USER_ID);
        if (STORAGE_KEYS.USER_OBJ) localStorage.removeItem(STORAGE_KEYS.USER_OBJ);
      }
    } catch (_) {}
    try { if (typeof setNativeToken === 'function') setNativeToken(null); } catch (_) {}
    try {
      if (window._session) {
        window._session.token = null;
        window._session.nip = null;
        window._session.isLoggedIn = false;
      }
    } catch (_) {}
    window.MY_ID = null;
    window.userProfile = null;
  }

  async function globalStitchLogout() {
    let ok = true;
    if (typeof window.Swal !== 'undefined') {
      const r = await window.Swal.fire({
        title: 'Konfirmasi Keluar',
        text: 'Apakah Anda yakin ingin keluar dari akun pegawai?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal'
      });
      ok = !!r.isConfirmed;
    } else {
      ok = confirm('Apakah Anda yakin ingin keluar dari akun pegawai?');
    }
    if (!ok) return;

    const tok = getToken();
    if (tok && /^[0-9a-f]{192}$/.test(tok)) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(function () { ctrl.abort(); }, 3500);
        await origFetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_token: tok }),
          signal: ctrl.signal
        });
        clearTimeout(t);
      } catch (_) {}
    }
    clearSession();
    try { localStorage.setItem('tg_logged_out', '1'); } catch (_) {}
    try { if (typeof window.clearNativeToken === 'function') window.clearNativeToken(); } catch (_) {}
    try { if (typeof window.clearSession === 'function') window.clearSession(); } catch (_) {}

    const ov = document.getElementById('authOverlay');
    if (ov) {
      ov.style.display = 'flex';
      location.replace('index.html');
    } else {
      location.replace('login.html?logout=1');
    }
  }
  window.StitchSession = { clear: clearSession, logout: globalStitchLogout };
  if (typeof window.logoutUser !== 'function') window.logoutUser = globalStitchLogout;

  let expiredHandled = false;
  function handleExpired() {
    if (expiredHandled) return;
    expiredHandled = true;
    clearSession();
    const ov = document.getElementById('authOverlay');
    if (ov) {                       // index.html: tampilkan modal login lagi
      ov.style.display = 'flex';
      try { if (typeof state !== 'undefined') state.isLoggedIn = false; } catch (_) {}
      try {
        if (typeof showDynamicIsland === 'function') {
          showDynamicIsland({ type: 'error', title: 'Sesi Berakhir', message: 'Silakan login kembali.' });
        }
      } catch (_) {}
      setTimeout(function () { expiredHandled = false; }, 3000);
    } else {                        // halaman portal: kembali ke login.html
      location.replace('login.html');
    }
  }

  const STITCH_RE = /^(https?:\/\/[^/]+)?\/api\/(stitch|simapo|media|dev|auth\/devices|auth\/arsip-cookie|gps-track|update-status|log|rekap-absen|arsip|instansi-list|instansi-add|instansi-update|instansi-delete|bidang-list|bidang-add|bidang-update|bidang-delete|password-toggle|kontrol-absen|peringatan-akumulasi|kirim-rekap|admin\/roles|absen-roles|lokasi-list|lokasi-add|lokasi-update|lokasi-delete|user-list|user-add|user-edit|user-delete|user-permissions|user-reset-password|jam-absen|jam-periode-list|jam-periode-add|jam-periode-delete|libur-list|libur-add|libur-delete|keterangan|dokumen|lembur|penugasan|absen|admin-list|admin-add|admin-delete)(\/|\?|$)/;
  const API_RE = /^(https?:\/\/[^/]+)?\/api\//;

  // ── Seamless Realtime Data Sync Bus (same-tab + cross-tab + visibilitychange) ──
  const SYNC_CHANNEL_NAME = 'stitch_data_sync';
  const SYNC_STORAGE_KEY = 'stitch_data_sync_ping';
  let syncChannel = null;
  try {
    if (typeof BroadcastChannel === 'function') syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch (_) {}

  function classifySyncScope(url) {
    const u = String(url || '').toLowerCase();
    if (/lokasi/.test(u)) return 'lokasi';
    if (/instansi|bidang/.test(u)) return 'instansi';
    if (/simapo|aset/.test(u)) return 'aset';
    if (/arsip|sppd|surat/.test(u)) return 'arsip';
    if (/jam-|libur|kontrol-absen|peringatan|face-settings|password-toggle/.test(u)) return 'config';
    if (/role|pegawai|user|admin/.test(u)) return 'admin';
    if (/absen|presensi|izin|cuti|rekap/.test(u)) return 'presensi';
    return 'all';
  }

  function emitSync(detail) {
    try {
      window.dispatchEvent(new CustomEvent('stitch:data-changed', { detail }));
    } catch (_) {}
  }

  function broadcastSync(scope, meta) {
    const detail = Object.assign({ scope: scope || 'all', ts: Date.now() }, meta || {});
    emitSync(detail);
    try { if (syncChannel) syncChannel.postMessage(detail); } catch (_) {}
    try { localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(detail)); } catch (_) {}
  }

  if (syncChannel) {
    syncChannel.onmessage = function (ev) {
      if (ev && ev.data && ev.data.scope) emitSync(Object.assign({ remote: true }, ev.data));
    };
  }
  window.addEventListener('storage', function (ev) {
    if (ev.key !== SYNC_STORAGE_KEY || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue);
      if (parsed && parsed.scope) emitSync(Object.assign({ remote: true }, parsed));
    } catch (_) {}
  });

  let lastHiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now();
    } else if (document.visibilityState === 'visible' && lastHiddenAt && (Date.now() - lastHiddenAt) > 2000) {
      emitSync({ scope: 'visibility', ts: Date.now(), remote: true });
    }
  });

  window.StitchSync = {
    emit: broadcastSync,
    on: function (scopes, fn, debounceMs) {
      if (typeof fn !== 'function') return function () {};
      const list = Array.isArray(scopes) ? scopes : [scopes];
      const wait = Number.isFinite(debounceMs) ? debounceMs : 220;
      let timer = null;
      const handler = function (ev) {
        const d = (ev && ev.detail) || {};
        const sc = d.scope || 'all';
        if (sc !== 'visibility' && sc !== 'all' && !list.includes('*') && !list.includes(sc)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          timer = null;
          try { fn(d); } catch (_) {}
        }, wait);
      };
      window.addEventListener('stitch:data-changed', handler);
      return function () { window.removeEventListener('stitch:data-changed', handler); };
    }
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url = '';
    let method = 'GET';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = String((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      if (API_RE.test(url)) {
        init = Object.assign({}, init);
        if (method === 'GET' && !init.cache) init.cache = 'no-store';
      }
      if (STITCH_RE.test(url)) {
        const token = getToken();
        if (token) {
          init = Object.assign({}, init);
          const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
          if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + token);
          init.headers = h;
        }
      }
    } catch (_) { /* jangan pernah memblokir fetch */ }
    let isStitch = false;
    try { isStitch = STITCH_RE.test(url); } catch (_) {}
    const hadToken = isStitch && !!getToken();
    const isMutation = API_RE.test(url) && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    return origFetch(input, init).then(function (res) {
      // 401 saat memegang token = sesi habis/dicabut server -> paksa login ulang.
      if (hadToken && res.status === 401) handleExpired();
      if (isMutation && res && res.ok) {
        broadcastSync(classifySyncScope(url), { url: url, method: method });
      }
      return res;
    });
  };

  /* ── ROUTING MODE DESKTOP VS MOBILE ── */
  const UI_MODE_KEY = 'stitch_ui_mode';
  (function syncUiModeFromQuery() {
    try {
      const params = new URLSearchParams(location.search || '');
      const mode = (params.get('mode') || '').toLowerCase();
      if (mode === 'mobile' || mode === 'desktop') {
        sessionStorage.setItem(UI_MODE_KEY, mode);
      }
    } catch (_) {}
  })();

  function isDesktopViewport() {
    return window.innerWidth >= 1024;
  }

  function getUiMode() {
    try { return sessionStorage.getItem(UI_MODE_KEY); } catch (_) { return null; }
  }

  function getAdminMode() {
    try { return localStorage.getItem('stitch_admin_mode'); } catch (_) { return null; }
  }

  function getLandingUrl() {
    if (isDesktopViewport() && getUiMode() !== 'mobile' && getAdminMode() !== 'mobile') {
      return 'desktop.html';
    }
    return 'index.html';
  }

  function shouldAutoRedirectToDesktop() {
    const current = (location.pathname.split('/').pop() || '').toLowerCase();
    if (current !== 'index.html' && current !== '') return false;
    if (!isDesktopViewport()) return false;
    if (!getToken()) return false;
    if (getUiMode() === 'mobile') return false;
    if (getAdminMode() === 'mobile') return false;
    try {
      const params = new URLSearchParams(location.search || '');
      if (params.get('view') === 'admin') return false;
    } catch (_) {}
    const h = (location.hash || '').toLowerCase();
    if (h.startsWith('#admin') || h.startsWith('#kiosk') || h.startsWith('#profil')) return false;
    return true;
  }

  window.StitchRoute = {
    isDesktopViewport: isDesktopViewport,
    getLandingUrl: getLandingUrl,
    shouldAutoRedirectToDesktop: shouldAutoRedirectToDesktop
  };

  if (window.StitchRoute.shouldAutoRedirectToDesktop()) {
    window.location.replace('desktop.html');
    return;
  }

  /* ── PENGALIHAN MODE (opt-in) ──
   * Tiap fitur tetap file sendiri, sehingga refresh tetap di halaman yang sama.
   * Pengalihan ke versi SPA index.html HANYA terjadi bila pengguna memilih
   * AdminCore.setMode('mobile'); bawaannya tidak mengalihkan apa pun.
   */
  const MODE_KEY = 'stitch_admin_mode';
  const getPref = () => { try { return localStorage.getItem(MODE_KEY); } catch (_) { return null; } };
  const pageName = (location.pathname.split('/').pop() || '').toLowerCase();
  const MOBILE_EQUIVALENT = {
    'desktop.html': 'index.html',
    'admin.html': 'index.html#admin',
    'aset-kir.html': 'index.html#aset',
    'arsip.html': 'index.html#arsip',
    'rekap.html': 'index.html#tpp',
    'cetak-tpp.html': 'index.html#tpp',
    'kiosk.html': 'index.html#kiosk',
    'profil.html': 'index.html#profil'
  };

  if (MOBILE_EQUIVALENT[pageName] && getPref() === 'mobile') {
    location.replace(MOBILE_EQUIVALENT[pageName]);
    return;
  }

  // Halaman portal desktop/admin tidak punya modal login: wajib punya sesi.
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const needsLogin = ['desktop.html', 'admin.html', 'rekap.html', 'layanan.html',
    'aset-kir.html', 'arsip.html', 'profil.html'].includes(page);
  if (needsLogin && !getToken()) {
    location.replace('login.html');
    return;
  }

  // Muat bottom-nav responsif untuk halaman desktop bersidebar di layar kecil (<1024px)
  if (needsLogin) {
    const s = document.createElement('script');
    s.src = 'js/stitch-responsive-nav.js?v=20261123b';
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  }
})();
