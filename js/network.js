/* ════ NETWORK & PERMISSION HANDLING ════ */
    /* ════ DETEKSI JARINGAN / WIFI ════
       Fetch IP publik → kirim ke n8n → n8n validasi via CIDR di sheet lokasiabsen.
       Frontend hanya menampilkan status, tidak memblokir sendiri.
       ════════════════════════════════ */
    /* ═══════════════════════════════════════════════════════════════
       PERMISSIONS API + localStorage CACHE MODULE  v1.0
       ─────────────────────────────────────────────────────────────
       • _queryPermission(name)   → query Permissions API + watch
       • initPermissions()        → pre-check geo & camera on startup
       • IP cache  (TTL 5 menit)  → _IP_CACHE_KEY
       • GPS cache (TTL 2 menit)  → _GPS_CACHE_KEY (badge only)
       ═══════════════════════════════════════════════════════════════ */
    const _PERM_STORE_KEY = 'bapperida_perm_v1';
    const _IP_CACHE_KEY = 'bapperida_ip_v1';
    const _GPS_CACHE_KEY = 'bapperida_gps_v1';
    const _IP_TTL_MS = 5 * 60 * 1000;   // 5 menit
    const _GPS_TTL_MS = 2 * 60 * 1000;   // 2 menit

    /* ── localStorage helpers ── */
    function _lsGet(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }
    function _lsSet(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
    }

    /* ── Baca/tulis permission state ke localStorage ── */
    function _readPermStore() { return _lsGet(_PERM_STORE_KEY) || {}; }
    function _writePermStore(patch) { _lsSet(_PERM_STORE_KEY, { ..._readPermStore(), ...patch, _ts: Date.now() }); }

    /* ── Query Permissions API dengan watch perubahan ── */
    async function _queryPermission(name) {
      try {
        if (!navigator.permissions) return 'unknown';
        const status = await navigator.permissions.query({ name });
        _writePermStore({ [name]: status.state });
        status.onchange = () => {
          _writePermStore({ [name]: status.state });
          if (name === 'geolocation') _onGeoPerm(status.state);
          if (name === 'camera') _onCamPerm(status.state);
        };
        return status.state; // 'granted' | 'denied' | 'prompt'
      } catch { return 'unknown'; }
    }

    /* ── Reaksi perubahan izin geolocation ── */
    function _onGeoPerm(state) {
      if (state === 'denied') {
        _locPermDenied = true;
        const clb = $('clockLocBadge');
        if (clb) { clb.textContent = '📍 Izin lokasi ditolak'; clb.className = 'clock-loc-badge unknown'; }
      } else if (state === 'granted') {
        _locPermDenied = false;
        _updateLocBadgeGPS();
      }
    }

    /* ── Reaksi perubahan izin kamera ── */
    function _onCamPerm(state) { /* state sudah tersimpan, cukup untuk guard di openCamOverlay */ }

    /* ── IP cache helpers ── */
    function _getCachedIP() {
      const c = _lsGet(_IP_CACHE_KEY);
      if (c && c.ip && (Date.now() - c.ts) < _IP_TTL_MS) return c.ip;
      return null;
    }
    function _setCachedIP(ip) { _lsSet(_IP_CACHE_KEY, { ip, ts: Date.now() }); }

    /* ── GPS cache helpers (hanya untuk badge, bukan absen) ── */
    function _getCachedGPS() {
      const c = _lsGet(_GPS_CACHE_KEY);
      if (c && (Date.now() - c.ts) < _GPS_TTL_MS) return c;
      return null;
    }
    function _setCachedGPS(lat, lon) { _lsSet(_GPS_CACHE_KEY, { lat, lon, ts: Date.now() }); }

    /* ── Init Permissions — panggil 1x saat startup ── */
    let _permInitDone = false;
    async function initPermissions() {
      if (_permInitDone) return;
      _permInitDone = true;
      const [geoState, camState] = await Promise.all([
        _queryPermission('geolocation'),
        _queryPermission('camera')
      ]);
      if (geoState === 'denied') {
        _locPermDenied = true;
        const clb = $('clockLocBadge');
        if (clb) { clb.textContent = '📍 Izin lokasi ditolak'; clb.className = 'clock-loc-badge unknown'; }
      }
      return { geolocation: geoState, camera: camState };
    }

    let networkInfo = {
      ip_public: null,
      is_kantor: null,    // null = belum tahu (n8n yang menentukan)
      network_type: null,
      checked: false,
      error: null
    };

    async function cekJaringan() {
      const bar = $('wifiBar');
      const icon = $('wifiIcon');
      const status = $('wifiStatus');
      const detail = $('wifiDetail');

      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const netType = conn?.type || conn?.effectiveType || 'unknown';
      networkInfo.network_type = netType;

      if (!WIFI_CHECK_ENABLED) {
        networkInfo.checked = true;
        networkInfo.is_kantor = null;
        bar.className = 'wifi-bar unknown';
        icon.textContent = '📶';
        status.textContent = 'Cek Jaringan Dinonaktifkan';
        detail.textContent = 'Semua jaringan diizinkan';
        return networkInfo;
      }

      bar.className = 'wifi-bar checking';
      icon.textContent = '🔄';
      status.textContent = 'Memeriksa jaringan...';
      detail.textContent = 'Mengambil IP publik...';

      try {
        // ── Coba pakai IP yang sudah di-cache (TTL 5 menit) ──
        let ip = _getCachedIP();
        if (!ip) {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 5000);
          const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
          clearTimeout(tid);
          const data = await res.json();
          ip = data.ip || '';
          if (ip) _setCachedIP(ip); // simpan ke cache
        }

        networkInfo.ip_public = ip;
        networkInfo.checked = true;
        // is_kantor tidak bisa ditentukan frontend (butuh CIDR check di server)
        // Tampilkan IP saja — server yang akan menolak jika tidak sesuai ip_range
        networkInfo.is_kantor = null;

        const connLabel = netType.includes('wifi') ? '📶 WiFi'
          : netType.includes('cellular') || ['2g', '3g', '4g', '5g'].includes(netType) ? '📱 Data Seluler'
            : '🔌 Jaringan';
        bar.className = 'wifi-bar kantor'; // tampil hijau, validasi di server
        icon.textContent = '📡';
        status.textContent = 'IP Publik Terdeteksi';
        detail.textContent = `${connLabel} · IP: ${ip}`;
        if ($('gpsNet')) $('gpsNet').textContent = `${ip}`;

      } catch (e) {
        networkInfo.checked = true;
        networkInfo.error = e.message;
        bar.className = 'wifi-bar unknown';
        icon.textContent = '❓';
        status.textContent = 'Jaringan Tidak Terdeteksi';
        detail.textContent = 'Tidak dapat memeriksa IP — lanjutkan absen';
      }
      return networkInfo;
    }

