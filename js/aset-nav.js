/* Navigasi Aset: gate role, grid, routing, eager load.
   Semua data layar datang dari window.ASET_SCREENS (js/aset-screens.js). */
(function () {
  function screens() {
    return Array.isArray(window.ASET_SCREENS) ? window.ASET_SCREENS : [];
  }

  function isAdmin() {
    if (window.IS_ADMIN) return true;
    if (typeof window._isSuperAdmin === 'function' && window._isSuperAdmin()) return true;
    const role = String(localStorage.getItem('MY_ROLE') || '').toLowerCase();
    if (role.includes('admin')) return true;
    return String((window.userProfile || {}).role || '').toLowerCase().includes('admin');
  }

  function visibleScreens(list) {
    const all = list || screens();
    const admin = isAdmin();
    return all.filter(s => s.role === 'user' || admin);
  }

  /* Konvensi force: pada entri `load`, argumen TERAKHIR adalah flag force
     (mis. ['loadSimapoKategori', true, false] → flag-nya `false`). Jadi force
     cukup mengubah argumen terakhir menjadi true; entri tanpa argumen
     mendapat satu argumen true. Argumen lain (mis. flag isAdmin) tidak
     pernah disentuh — inilah alasan konvensi ini dipilih, bukan menyuntik
     argumen boolean pertama yang bisa merusak loadSimapoKategori(isAdmin, force). */
  function loaderCalls(screen, force) {
    return (screen.load || []).map(function (call) {
      const name = call[0];
      const args = call.slice(1).slice();
      if (force) {
        if (args.length) args[args.length - 1] = true;
        else args.push(true);
      }
      return function () {
        if (typeof window[name] === 'function') return window[name].apply(window, args);
        return undefined; // loader belum ada di halaman ini — dilewati
      };
    });
  }

  // Menutup throw sinkron: loader yang melempar sebelum mengembalikan Promise harus
  // jadi rejected value, bukan exception yang lolos keluar dari map().
  function safe(fn) {
    try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
  }

  function eagerLoad() {
    if (window._asetEagerDone) return Promise.resolve([]);
    const jobs = visibleScreens().map(function (screen) {
      return Promise.allSettled(loaderCalls(screen).map(safe)).then(function (out) {
        const bad = out.filter(r => r.status === 'rejected');
        window._asetFailed = window._asetFailed || {};
        window._asetFailed[screen.key] = bad.length ? String(bad[0].reason) : '';
        return { key: screen.key, ok: bad.length === 0, error: bad.length ? String(bad[0].reason) : null };
      });
    });
    return Promise.all(jobs).then(function (results) {
      window._asetEagerDone = true;
      return results;
    });
  }

  /* ---------- bagian DOM (dibutuhkan browser, diuji manual di Task 5) ---------- */

  function gridEl() { return document.getElementById('aset-grid'); }
  function screenEl(key) { return document.getElementById('aset-sect-' + key); }

  function renderGrid() {
    const grid = gridEl();
    if (!grid) return;
    grid.innerHTML = '';
    visibleScreens().forEach(function (s) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'aset-card';
      card.setAttribute('data-key', s.key);
      const icon = document.createElement('i');
      icon.className = 'fas ' + s.icon;
      const label = document.createElement('span');
      label.className = 'aset-card-label';
      label.textContent = s.label;
      card.appendChild(icon);
      card.appendChild(label);
      const failed = (window._asetFailed || {})[s.key];
      if (failed) {
        // ponytail: pesan error lewat .title (properti DOM), bukan innerHTML —
        // tanpa perlu escape dan tidak pernah jadi markup.
        const warn = document.createElement('i');
        warn.className = 'fas fa-exclamation-triangle aset-card-warn';
        warn.title = 'Gagal dimuat: ' + failed;
        card.appendChild(warn);
      }
      card.addEventListener('click', function () { open(s.key, true); });
      grid.appendChild(card);
    });
  }

  function showGrid() {
    screens().forEach(function (s) {
      const el = screenEl(s.key);
      if (el) el.style.display = 'none';
    });
    const grid = gridEl();
    if (grid) grid.style.display = '';
    const head = document.getElementById('aset-screen-head');
    if (head) head.style.display = 'none';
    renderGrid();
  }

  function open(key, force) {
    const screen = screens().find(function (s) { return s.key === key; });
    if (!screen) return;
    if (screen.role === 'admin' && !isAdmin()) { showGrid(); return; }
    const grid = gridEl();
    if (grid) grid.style.display = 'none';
    screens().forEach(function (s) {
      const el = screenEl(s.key);
      if (el) el.style.display = s.key === key ? 'block' : 'none';
    });
    const head = document.getElementById('aset-screen-head');
    if (head) {
      head.style.display = 'flex';
      const title = document.getElementById('aset-screen-title');
      if (title) title.textContent = screen.label;
    }
    // Navigasi tidak boleh gagal total: loader yang melempar hanya boleh
    // tercatat di _asetFailed, layar tetap terbuka.
    loaderCalls(screen, force).forEach(function (fn) { safe(fn); });
  }

  window.ASET_NAV = {
    isAdmin: isAdmin,
    visibleScreens: visibleScreens,
    loaderCalls: loaderCalls,
    eagerLoad: eagerLoad,
    renderGrid: renderGrid,
    showGrid: showGrid,
    open: open,
  };
})();