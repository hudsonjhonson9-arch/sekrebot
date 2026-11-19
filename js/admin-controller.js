/**
 * Admin desktop controller — pengaturan lokasi/geofence, jam kerja, Face AI, dan metrik
 * yang tersambung ke database melalui AdminCore (js/admin-core.js) dan /api/media/face-settings.
 */
(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function getAuthToken() {
    if (typeof window.getStitchToken === 'function') return window.getStitchToken();
    try {
      return localStorage.getItem('_native_token')
        || localStorage.getItem('native_token')
        || localStorage.getItem('_sess_token')
        || '';
    } catch (_) {
      return '';
    }
  }

  function getInstansiId() {
    try {
      return (localStorage.getItem('_sess_inst')
        || localStorage.getItem('MY_INSTANSI')
        || document.getElementById('agencySelect')?.value
        || 'bapperida').trim() || 'bapperida';
    } catch (_) {
      return 'bapperida';
    }
  }

  function notifyToast(type, title, message) {
    if (typeof window.showDynamicIsland === 'function') {
      window.showDynamicIsland({ type, title, message });
    } else if (window.Swal) {
      window.Swal.fire(title, message, type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
    } else {
      console.info(`[admin] ${type}: ${title} - ${message}`);
    }
  }

  function computeCutoffTime(jamMasuk, toleranceMins) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(jamMasuk || '').trim());
    if (!m) return '';
    const base = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (parseInt(toleranceMins, 10) || 0);
    const total = ((base % 1440) + 1440) % 1440;
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  onReady(async function () {
    const core = window.AdminCore;
    const $ = (id) => document.getElementById(id);
    const lat = $('adminOfficeLat');
    const lon = $('adminOfficeLon');
    const rad = $('adminRadiusSlider');
    const label = $('radiusLabel');
    const radiusBadge = $('adminRadiusActiveBadge');
    const btn = $('btnSaveLokasi');
    const jamMasukEl = $('inputJamMasuk') || $('adminJamMasuk');
    const jamPulangEl = $('inputJamPulang') || $('adminJamPulang');
    const toleransiSlider = $('adminToleransiSlider');
    const toleransiLabel = $('adminToleransiLabel');
    const livenessToggle = $('adminLivenessToggle');
    const thresholdSlider = $('adminThresholdSlider');
    const thresholdLabel = $('adminThresholdLabel');
    const emergencyPwdToggle = $('adminEmergencyPwdToggle');
    const btnOpenKiosk = $('btnOpenKiosk');
    const userCountEl = $('adminUserCount');

    if (btnOpenKiosk) {
      btnOpenKiosk.addEventListener('click', function () {
        window.location.href = 'kiosk.html';
      });
    }

    const showRadius = () => {
      if (!rad) return;
      if (label) label.textContent = `${rad.value} Meter`;
      if (radiusBadge) radiusBadge.textContent = `RADIUS AKTIF ${rad.value}M`;
    };

    const showToleransi = () => {
      if (!toleransiSlider || !toleransiLabel) return;
      const mins = parseInt(toleransiSlider.value, 10) || 0;
      const cutoff = computeCutoffTime(jamMasukEl?.value, mins);
      toleransiLabel.textContent = cutoff ? `${mins} Menit (s/d ${cutoff})` : `${mins} Menit`;
    };

    if (toleransiSlider) {
      showToleransi();
      toleransiSlider.addEventListener('input', showToleransi);
    }
    if (jamMasukEl) {
      jamMasukEl.addEventListener('input', showToleransi);
    }

    if (emergencyPwdToggle) {
      try {
        const savedEmergency = localStorage.getItem('stitch_emergency_pwd_enabled');
        if (savedEmergency !== null) {
          emergencyPwdToggle.checked = savedEmergency === '1';
        }
      } catch (_) {}
      emergencyPwdToggle.addEventListener('change', function () {
        try {
          localStorage.setItem('stitch_emergency_pwd_enabled', emergencyPwdToggle.checked ? '1' : '0');
        } catch (_) {}
        notifyToast(
          'info',
          'Password Darurat',
          emergencyPwdToggle.checked ? 'Mode bypass darurat diaktifkan.' : 'Mode bypass darurat dinonaktifkan.'
        );
      });
    }

    // Load lokasi & shift via AdminCore + jumlah pegawai via /api/stitch/bootstrap
    let locId = '1';
    if (core && typeof core.loadLokasi === 'function') {
      try {
        const { locations, shift } = await core.loadLokasi();
        const loc = locations[0];
        if (loc) {
          locId = String(loc.id);
          if (lat) lat.value = loc.latitude;
          if (lon) lon.value = loc.longitude;
          if (rad) rad.value = loc.radius || rad.value;
        }
        if (shift) {
          if (jamMasukEl && shift.masuk) jamMasukEl.value = shift.masuk;
          if (jamPulangEl && shift.pulang) jamPulangEl.value = shift.pulang;
          showToleransi();
        }
      } catch (err) {
        console.warn('[admin] gagal memuat lokasi/shift dari database:', err.message);
      }
    }

    if (rad) {
      showRadius();
      rad.addEventListener('input', showRadius);
    }

    // Muat jumlah pegawai aktif dari /api/stitch/bootstrap
    if (userCountEl) {
      try {
        const bsRes = await fetch('/api/stitch/bootstrap');
        if (bsRes.ok) {
          const bsJson = await bsRes.json();
          if (bsJson && bsJson.ok && Array.isArray(bsJson.users)) {
            const total = bsJson.users.length;
            const aktif = bsJson.users.filter((u) => u.status_aktif !== false).length;
            userCountEl.textContent = `${total} Pegawai (${aktif} Aktif)`;
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat jumlah pegawai:', err.message);
      }
    }

    // Muat & simpan pengaturan Face AI (/api/media/face-settings)
    const token = getAuthToken();
    const instId = getInstansiId();
    const mediaHeaders = (extra = {}) => {
      const h = Object.assign({}, extra);
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    };

    const showThreshold = () => {
      if (thresholdSlider && thresholdLabel) {
        thresholdLabel.textContent = Number(thresholdSlider.value).toFixed(2);
      }
    };

    if (livenessToggle || thresholdSlider) {
      try {
        const fsRes = await fetch(`/api/media/face-settings?instansi_id=${encodeURIComponent(instId)}`, {
          headers: mediaHeaders()
        });
        if (fsRes.ok) {
          const fsJson = await fsRes.json();
          const settings = fsJson?.settings || fsJson?.data?.settings || {};
          if (livenessToggle && settings.liveness_enabled !== undefined) {
            livenessToggle.checked = settings.liveness_enabled !== false
              && settings.liveness_enabled !== '0'
              && settings.liveness_enabled !== 0;
          }
          if (thresholdSlider && settings.face_threshold !== undefined) {
            const val = parseFloat(settings.face_threshold);
            if (Number.isFinite(val)) {
              thresholdSlider.value = val.toFixed(2);
            }
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat face-settings:', err.message);
      }
      showThreshold();
    }

    if (thresholdSlider) {
      thresholdSlider.addEventListener('input', showThreshold);
    }

    let savingFaceSettings = false;
    const saveFaceSettings = async () => {
      if (savingFaceSettings) return;
      savingFaceSettings = true;
      try {
        const payload = {
          instansi_id: instId,
          settings: {}
        };
        if (livenessToggle) payload.settings.liveness_enabled = !!livenessToggle.checked;
        if (thresholdSlider) payload.settings.face_threshold = parseFloat(thresholdSlider.value);

        const res = await fetch('/api/media/face-settings', {
          method: 'POST',
          headers: mediaHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) {
          throw new Error((json && json.message) || `HTTP ${res.status}`);
        }
        const liveTxt = livenessToggle ? (livenessToggle.checked ? 'Aktif' : 'Nonaktif') : '-';
        const thrTxt = thresholdSlider ? Number(thresholdSlider.value).toFixed(2) : '-';
        notifyToast('success', 'Pengaturan Face AI Tersimpan', `Liveness: ${liveTxt} • Threshold: ${thrTxt}`);
      } catch (err) {
        notifyToast('error', 'Gagal Menyimpan Face AI', err.message);
      } finally {
        savingFaceSettings = false;
      }
    };

    if (livenessToggle) {
      livenessToggle.addEventListener('change', saveFaceSettings);
    }
    if (thresholdSlider) {
      thresholdSlider.addEventListener('change', saveFaceSettings);
    }

    if (!core) return;

    if (btn && lat && lon && rad) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        try {
          await core.saveLokasi({ id: locId, lat: lat.value, lon: lon.value, radius: rad.value });
        } finally {
          btn.disabled = false;
        }
      });
    }

    // Bind tombol "Simpan Kebijakan Jam Kerja" di admin.html
    const btnJam = $('btnSaveJamKerja') || Array.from(document.querySelectorAll('button')).find((b) => /Simpan Kebijakan Jam Kerja/i.test(b.textContent || ''));
    if (btnJam && jamMasukEl && jamPulangEl && typeof core.saveJamAbsen === 'function') {
      btnJam.addEventListener('click', async function () {
        btnJam.disabled = true;
        try {
          await core.saveJamAbsen({ masuk: jamMasukEl.value, pulang: jamPulangEl.value });
        } finally {
          btnJam.disabled = false;
        }
      });
    }
  });
})();
