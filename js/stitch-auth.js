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

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/^(https?:\/\/[^/]+)?\/api\/stitch(\/|\?|$)/.test(url)) {
        const token = getToken();
        if (token) {
          init = Object.assign({}, init);
          const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
          if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + token);
          init.headers = h;
        }
      }
    } catch (_) { /* jangan pernah memblokir fetch */ }
    return origFetch(input, init);
  };

  // Halaman portal desktop/admin tidak punya modal login: wajib punya sesi.
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const needsLogin = ['desktop.html', 'admin.html', 'rekap.html', 'layanan.html',
    'aset-kir.html', 'arsip.html'].includes(page);
  if (needsLogin && !getToken()) {
    location.replace('login.html');
  }
})();
