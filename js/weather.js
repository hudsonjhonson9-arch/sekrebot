/* ════ CUACA ════ */
    /* ════ CUACA ════ */
    async function loadWeather() {
      const card = $('weatherCard');
      try {
        // Open-Meteo API — gratis, no key, koordinat Waikabubak Sumba Barat
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=-9.6333&longitude=119.3833' +
          '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
          '&timezone=Asia%2FMakassar&wind_speed_unit=kmh';
        let res;
        try {
          res = await fetch(url);
        } catch (e) {
          // Fallback to CORS proxy if direct fetch fails (common on file:// protocol)
          const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
          const proxyRes = await fetch(proxyUrl);
          if (!proxyRes.ok) throw 0;
          const proxyData = await proxyRes.json();
          res = { ok: true, json: () => Promise.resolve(JSON.parse(proxyData.contents)) };
        }

        if (!res.ok) throw 0;
        const d = await (typeof res.json === 'function' ? res.json() : res);
        const c = d.current;

        const code = c.weather_code;
        const icon = _wxIcon(code), cond = _wxCond(code);
        const temp = Math.round(c.temperature_2m);
        const feel = Math.round(c.apparent_temperature);
        const humid = Math.round(c.relative_humidity_2m);
        const wind = Math.round(c.wind_speed_10m);
        const now = new Date();
        const jam = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WITA`;
        if ($('weatherIcon')) $('weatherIcon').innerHTML = icon;
        if ($('weatherTemp')) $('weatherTemp').textContent = `${temp}°C`;
        if ($('weatherCond')) $('weatherCond').textContent = cond;
        if ($('weatherHumid')) $('weatherHumid').innerHTML = `<i class="fas fa-tint"></i> ${humid}%`;
        if ($('weatherWind')) $('weatherWind').innerHTML = `<i class="fas fa-wind"></i> ${wind} km/h`;
        if ($('weatherFeel')) $('weatherFeel').innerHTML = `<i class="fas fa-thermometer-half"></i> Terasa ${feel}°C`;
        if (card) card.style.opacity = '1';
      } catch (_) {
        // Jangan sembunyikan — tampilkan fallback agar layout tetap utuh
        if ($('weatherCond')) $('weatherCond').textContent = '—';
        if ($('weatherTemp')) $('weatherTemp').textContent = '—°C';
        if ($('weatherIcon')) $('weatherIcon').innerHTML = '<i class="fas fa-cloud-sun"></i>';
        if ($('weatherHumid')) $('weatherHumid').innerHTML = '<i class="fas fa-tint"></i> —%';
        if ($('weatherWind')) $('weatherWind').innerHTML = '<i class="fas fa-wind"></i> —';
        if ($('weatherFeel')) $('weatherFeel').innerHTML = '<i class="fas fa-thermometer-half"></i> —°C';
        const card = $('weatherCard');
        if (card) card.style.opacity = '1';
      }
    }
    function _wxIcon(c) {
      if (c === 0) return '<i class="fas fa-sun"></i>';
      if (c <= 2) return '<i class="fas fa-cloud-sun"></i>';
      if (c === 3) return '<i class="fas fa-cloud"></i>';
      if (c <= 48) return '<i class="fas fa-smog"></i>';
      if (c <= 57) return '<i class="fas fa-cloud-sun-rain"></i>';
      if (c <= 67) return '<i class="fas fa-cloud-rain"></i>';
      if (c <= 77) return '<i class="fas fa-snowflake"></i>';
      if (c <= 82) return '<i class="fas fa-cloud-rain"></i>';
      if (c === 95) return '<i class="fas fa-cloud-showers-heavy"></i>';
      if (c >= 96) return '<i class="fas fa-cloud-showers-heavy"></i>';
      return '<i class="fas fa-cloud-sun"></i>';
    }
    function _wxCond(c) {
      if (c === 0) return 'Cerah';
      if (c === 1) return 'Sebagian Cerah';
      if (c === 2) return 'Berawan Sebagian';
      if (c === 3) return 'Mendung';
      if (c <= 48) return 'Berkabut';
      if (c <= 55) return 'Gerimis';
      if (c <= 67) return 'Hujan';
      if (c <= 77) return 'Salju';
      if (c <= 82) return 'Hujan Lebat';
      if (c === 95) return 'Badai Petir';
      if (c >= 96) return 'Petir + Es';
      return '—';
    }

    /* ════════════════════════════════════════════════════
       ██████╗ ███████╗███████╗██╗  ██╗████████╗ ██████╗ ██████╗
       ██╔══██╗██╔════╝██╔════╝██║ ██╔╝╚══██╔══╝██╔═══██╗██╔══██╗
       ██║  ██║█████╗  ███████╗█████╔╝    ██║   ██║   ██║██████╔╝
       ██║  ██║██╔══╝  ╚════██║██╔═██╗    ██║   ██║   ██║██╔═══╝
       ██████╔╝███████╗███████║██║  ██╗   ██║   ╚██████╔╝██║
       ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝
       MODE — berlaku mulai init, hanya Super Admin
    ════════════════════════════════════════════════════════ */

    /* ── Desktop Mode ── */
    let _desktopModeOn = false;

    let _desktopModeInitialized = false;
    function initDesktopMode() {
      if (!_desktopModeInitialized) {
        try {
          const saved = localStorage.getItem('bapperida_desktop_mode');
          if (saved !== null) {
            _desktopModeOn = (saved === '1');
          } else {
            // Default AKTIF jika layar Desktop
            _desktopModeOn = isDesktop();
          }
        } catch (_) {
          _desktopModeOn = isDesktop();
        }
        _desktopModeInitialized = true;
      }
      _applyDesktopMode(_desktopModeOn || false);
    }

    function _applyDesktopMode(on) {
      _desktopModeOn = on;
      document.body.classList.toggle('desktop-mode', on);
      // Update toggle UI
      const sw = $('desktopModeSwitch');
      const knob = $('desktopModeKnob');
      const lbl = $('desktopModeLabel');
      const desc = $('desktopModeDesc');
      if (!sw) return;
      if (on) {
        sw.style.background = '#3b82f6';
        if (knob) knob.style.left = '27px';
        if (lbl) lbl.innerHTML = '<i class="fas fa-desktop"></i> Mode Desktop Aktif';
        if (desc) desc.textContent = 'Layout diperlebar untuk layar besar (maks 900px)';
      } else {
        sw.style.background = '#6b7280';
        if (knob) knob.style.left = '3px';
        if (lbl) lbl.innerHTML = '<i class="fas fa-mobile-alt"></i> Mode Mobile (Default)';
        if (desc) desc.textContent = 'Layout standar untuk smartphone (maks 420px)';
      }
    }

    function toggleDesktopMode() {
      if (!IS_ADMIN) return; // semua admin bisa toggle desktop mode
      const newVal = !_desktopModeOn;
      _applyDesktopMode(newVal);
      try { localStorage.setItem('bapperida_desktop_mode', newVal ? '1' : '0'); } catch (_) { }
    }

    function _isSuperAdmin() {
      // Prioritize persistent MY_ROLE storage first!
      const storedRole = String(localStorage.getItem('MY_ROLE') || '').toLowerCase();
      if (storedRole.includes('super')) return true;

      const myNip = localStorage.getItem('MY_NIP');
      const role = (window._adminRoleMap && myNip && window._adminRoleMap[myNip]) || userProfile?.role || null;
      if (role) {
        return role.toLowerCase().includes('super');
      }
      // Fallback legacy (admin pertama) jika map belum terisi
      return ADMIN_NIPS.length > 0 && String(ADMIN_NIPS[0]) === String(myNip);
    }

    function _applyAdminUIExtended() {
      // Tampilkan section super-admin jika sesuai
      const isSA = _isSuperAdmin();
      document.body.classList.toggle('is-superadmin', isSA);
      document.querySelectorAll('.superadmin-section').forEach(el => {
        if (el) el.style.display = isSA ? 'block' : 'none';
      });

      if (isSA) {
        if (typeof populateSuperadminInstansiSelect === 'function') {
          populateSuperadminInstansiSelect();
        }
        if (typeof initSuperadminAdminScoping === 'function') {
          initSuperadminAdminScoping();
        }
        if (typeof initSuperadminRekapScoping === 'function') {
          initSuperadminRekapScoping();
        }
        if (typeof initSuperadminTugasScoping === 'function') {
          initSuperadminTugasScoping();
        }
        if (typeof loadLokasiAdmin === 'function') {
          loadLokasiAdmin();
        }
        if (typeof initSuperadminLemburScoping === 'function') {
          initSuperadminLemburScoping();
        }
      }

      // Meja Absen & Desktop mode tersedia untuk semua admin (bukan hanya superadmin)
      if (IS_ADMIN) {
        const desktopCard = $('desktopModeCard');
        if (desktopCard) desktopCard.style.display = 'block';

        const mejaCard = $('mejaAbsenCard');
        if (mejaCard) mejaCard.style.display = 'block';

        initDesktopMode();
      }

      // Refresh visibilitas menu Tugas & Lembur
      if (typeof checkTugasLemburAccess === 'function') {
        checkTugasLemburAccess();
      }
    }
    window.loadWeather = loadWeather;
    window._isSuperAdmin = _isSuperAdmin;
