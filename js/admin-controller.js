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

  const ESC_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ESC_HTML[ch]);
  }

  function getSessionNip() {
    try {
      const uObj = JSON.parse(localStorage.getItem('tg_user_obj_v5') || 'null') || {};
      return String(
        localStorage.getItem('MY_NIP')
        || localStorage.getItem('stitch_active_nip')
        || localStorage.getItem('_sess_nip')
        || uObj.NIP
        || uObj.nip
        || window._session?.nip
        || ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function formatDateTimeWita(iso) {
    if (!iso) return 'Belum pernah digunakan';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Makassar'
    }) + ' WITA';
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
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

    if (btnOpenKiosk && btnOpenKiosk.tagName !== 'A') {
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

    // Peta Leaflet interaktif (Jalan OSM & Satelit Esri) di admin.html
    const mapBox = $('adminDesktopGeofenceMap');
    if (mapBox && typeof window.L !== 'undefined') {
      const initLat = parseFloat(lat?.value) || -9.648769;
      const initLon = parseFloat(lon?.value) || 119.389232;
      const initRad = parseFloat(rad?.value) || 50;
      const map = window.L.map(mapBox, { zoomControl: true }).setView([initLat, initLon], 17);
      const streetLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
      const satLayer = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri World Imagery' });
      streetLayer.addTo(map);
      const stitchPinIcon = window.L.divIcon({
        className: 'stitch-geo-pin',
        html: '<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 6px rgba(15,23,42,0.35));"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#2563eb" stroke="#ffffff" stroke-width="1.8"/><circle cx="12" cy="9" r="2.8" fill="#ffffff"/></svg></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 30]
      });
      const marker = window.L.marker([initLat, initLon], { draggable: true, icon: stitchPinIcon }).addTo(map);
      const circle = window.L.circle([initLat, initLon], { radius: initRad, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 }).addTo(map);

      const syncFromInputs = () => {
        const la = parseFloat(lat?.value);
        const lo = parseFloat(lon?.value);
        const ra = parseFloat(rad?.value) || 50;
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          marker.setLatLng([la, lo]);
          circle.setLatLng([la, lo]);
          map.panTo([la, lo]);
        }
        circle.setRadius(ra);
      };

      marker.on('dragend', () => {
        const p = marker.getLatLng();
        if (lat) lat.value = p.lat.toFixed(6);
        if (lon) lon.value = p.lng.toFixed(6);
        circle.setLatLng(p);
      });
      map.on('click', (ev) => {
        if (lat) lat.value = ev.latlng.lat.toFixed(6);
        if (lon) lon.value = ev.latlng.lng.toFixed(6);
        marker.setLatLng(ev.latlng);
        circle.setLatLng(ev.latlng);
      });
      if (lat) lat.addEventListener('change', syncFromInputs);
      if (lon) lon.addEventListener('change', syncFromInputs);
      if (rad) rad.addEventListener('input', syncFromInputs);

      const btnStreet = $('btnDesktopMapStreet');
      const btnSat = $('btnDesktopMapSat');
      const setLayer = (mode) => {
        const isSat = mode === 'satellite';
        if (isSat) {
          if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
          if (!map.hasLayer(satLayer)) satLayer.addTo(map);
        } else {
          if (map.hasLayer(satLayer)) map.removeLayer(satLayer);
          if (!map.hasLayer(streetLayer)) streetLayer.addTo(map);
        }
        if (btnStreet) btnStreet.className = isSat ? 'px-2.5 py-1 rounded-lg text-[11px] font-semibold text-on-surface-variant cursor-pointer' : 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary text-on-primary shadow-xs cursor-pointer';
        if (btnSat) btnSat.className = isSat ? 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary text-on-primary shadow-xs cursor-pointer' : 'px-2.5 py-1 rounded-lg text-[11px] font-semibold text-on-surface-variant cursor-pointer';
      };
      if (btnStreet) btnStreet.addEventListener('click', () => setLayer('street'));
      if (btnSat) btnSat.addEventListener('click', () => setLayer('satellite'));
      setTimeout(() => map.invalidateSize(), 150);
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

    // Developer & Diagnostik: hubungkan tombol uji, filter log, & auto-run saat DOMContentLoaded
    const btnRunDiag = $('btnRunDiagnostics');
    if (btnRunDiag) {
      btnRunDiag.addEventListener('click', function () {
        if (typeof window.runDevDiagnostics === 'function') {
          window.runDevDiagnostics();
        }
      });
    }
    const devLogFilter = $('devLogLevelFilter');
    if (devLogFilter) {
      devLogFilter.addEventListener('change', function () {
        if (typeof window.renderDevLogTable === 'function') window.renderDevLogTable();
      });
    }
    const devLogSearch = $('devLogSearchInput');
    if (devLogSearch) {
      devLogSearch.addEventListener('input', function () {
        if (typeof window.renderDevLogTable === 'function') window.renderDevLogTable();
      });
    }
    if (typeof window.runDevDiagnostics === 'function') {
      window.runDevDiagnostics();
    }
    if (typeof window.renderDevLogTable === 'function') {
      window.renderDevLogTable();
    }

    // ── Terminal Meja Absen & Pairing Perangkat (/api/auth/devices) ──────────
    const deviceNameInput = $('adminDeviceNameInput');
    const btnIssueDevice = $('btnIssueDeviceToken');
    const deviceListEl = $('adminDeviceList');
    const deviceControlsEl = $('adminDevicePairingControls');
    const devicePermNoteEl = $('adminDevicePermissionNote');

    function getDeviceStatusBadge(row) {
      const revoked = row.revoked_at || row.is_active === false;
      if (revoked) {
        return { label: 'Dicabut', cls: 'bg-rose-100 text-rose-700', active: false };
      }
      const expMs = row.expires_at ? Date.parse(row.expires_at) : NaN;
      if (Number.isFinite(expMs) && expMs <= Date.now()) {
        return { label: 'Kedaluwarsa', cls: 'bg-amber-100 text-amber-800', active: false };
      }
      return { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-700', active: true };
    }

    async function loadDeviceList() {
      if (!deviceListEl) return;
      try {
        const res = await fetch('/api/auth/devices');
        if (res.status === 403) {
          if (deviceControlsEl) deviceControlsEl.classList.add('hidden');
          if (devicePermNoteEl) devicePermNoteEl.classList.remove('hidden');
          deviceListEl.innerHTML = '';
          return;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) {
          throw new Error((json && json.message) || `HTTP ${res.status}`);
        }
        const rows = Array.isArray(json.data) ? json.data : [];
        if (!rows.length) {
          deviceListEl.innerHTML = '<div class="py-5 px-4 rounded-xl bg-surface-container-low text-center text-xs font-medium text-on-surface-variant">Belum ada perangkat terminal meja yang terdaftar.</div>';
          return;
        }
        deviceListEl.innerHTML = rows.map((row) => {
          const st = getDeviceStatusBadge(row);
          const label = row.device_label || 'Perangkat Kiosk Tanpa Nama';
          const lastSeen = row.last_used_at ? formatDateTimeWita(row.last_used_at) : 'Belum pernah digunakan';
          const expTxt = row.expires_at ? formatDateTimeWita(row.expires_at) : '-';
          const revokeBtn = st.active
            ? `<button type="button" data-revoke-device-id="${escapeHtml(row.id)}" data-device-label="${escapeHtml(label)}" class="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"><span class="material-symbols-outlined text-[16px]">link_off</span><span>Cabut</span></button>`
            : '';
          return `
            <div class="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0">
                <div class="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[18px]">tablet_mac</span>
                </div>
                <div class="flex flex-col min-w-0 gap-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-title-md text-title-md text-on-surface font-semibold truncate">${escapeHtml(label)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${st.cls}">${st.label}</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-on-surface-variant">
                    <span>NIP: ${escapeHtml(row.nip || '-')}</span>
                    <span>Terakhir aktif: ${escapeHtml(lastSeen)}</span>
                    <span>Berlaku s/d: ${escapeHtml(expTxt)}</span>
                  </div>
                </div>
              </div>
              ${revokeBtn}
            </div>
          `;
        }).join('');
      } catch (err) {
        deviceListEl.innerHTML = `<div class="py-3 px-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">Gagal memuat daftar perangkat: ${escapeHtml(err.message)}</div>`;
      }
    }

    async function showIssuedTokenModal(deviceLabel, deviceToken, expiresAt) {
      if (window.Swal && typeof window.Swal.fire === 'function') {
        await window.Swal.fire({
          title: 'Token Pairing Perangkat Terbit',
          icon: 'success',
          html: `
            <div class="flex flex-col gap-3 text-left mt-2">
              <p class="text-xs text-slate-600">Salin token untuk <strong>${escapeHtml(deviceLabel)}</strong> sekarang. Demi keamanan, token asli tidak dapat ditampilkan ulang setelah dialog ini ditutup.</p>
              <div class="flex items-center gap-2">
                <input id="swalIssuedDeviceToken" type="text" readonly value="${escapeHtml(deviceToken)}" class="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-300 font-mono text-xs text-slate-900 select-all outline-none" />
                <button id="btnCopyIssuedToken" type="button" class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 cursor-pointer">Salin</button>
              </div>
              <p class="text-[11px] font-mono text-slate-500">Berlaku hingga: ${escapeHtml(formatDateTimeWita(expiresAt))}</p>
            </div>
          `,
          confirmButtonText: 'Selesai',
          didOpen: () => {
            const copyBtn = document.getElementById('btnCopyIssuedToken');
            const tokInput = document.getElementById('swalIssuedDeviceToken');
            if (tokInput) tokInput.focus();
            if (copyBtn) {
              copyBtn.addEventListener('click', async () => {
                const ok = await copyTextToClipboard(deviceToken);
                copyBtn.textContent = ok ? 'Tersalin' : 'Gagal';
                if (ok) {
                  copyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                  copyBtn.classList.add('bg-emerald-600');
                }
              });
            }
          }
        });
      } else {
        await copyTextToClipboard(deviceToken);
        notifyToast('success', 'Token Pairing Terbit', deviceToken);
      }
    }

    if (deviceListEl) {
      await loadDeviceList();
      deviceListEl.addEventListener('click', async function (ev) {
        const revokeBtn = ev.target.closest('[data-revoke-device-id]');
        if (!revokeBtn) return;
        const devId = revokeBtn.getAttribute('data-revoke-device-id');
        const devLabel = revokeBtn.getAttribute('data-device-label') || 'perangkat ini';
        let confirmed = true;
        if (window.Swal && typeof window.Swal.fire === 'function') {
          const r = await window.Swal.fire({
            title: 'Cabut Akses Perangkat?',
            text: `Token untuk "${devLabel}" akan dinonaktifkan permanen dan kiosk terkait harus pairing ulang.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, Cabut Token',
            cancelButtonText: 'Batal'
          });
          confirmed = !!r.isConfirmed;
        }
        if (!confirmed) return;

        revokeBtn.disabled = true;
        try {
          const res = await fetch(`/api/auth/devices/${encodeURIComponent(devId)}`, { method: 'DELETE' });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          notifyToast('success', 'Token Dicabut', `Akses untuk "${devLabel}" telah dinonaktifkan.`);
          await loadDeviceList();
        } catch (err) {
          notifyToast('error', 'Gagal Mencabut Token', err.message);
          revokeBtn.disabled = false;
        }
      });
    }

    if (btnIssueDevice && deviceNameInput) {
      btnIssueDevice.addEventListener('click', async function () {
        const deviceLabel = deviceNameInput.value.trim();
        if (!deviceLabel) {
          deviceNameInput.focus();
          notifyToast('warning', 'Nama Perangkat Wajib', 'Masukkan nama perangkat kiosk terlebih dahulu.');
          return;
        }
        let nip = getSessionNip();
        if (!nip && window.Swal && typeof window.Swal.fire === 'function') {
          const promptRes = await window.Swal.fire({
            title: 'NIP Penanggung Jawab',
            text: 'Masukkan NIP pegawai/superadmin yang terhubung dengan token perangkat ini.',
            input: 'text',
            inputPlaceholder: 'Contoh: 197211022001121001',
            showCancelButton: true,
            confirmButtonText: 'Lanjutkan',
            cancelButtonText: 'Batal'
          });
          if (!promptRes.isConfirmed) return;
          nip = String(promptRes.value || '').trim();
        }
        if (!nip) {
          notifyToast('error', 'NIP Tidak Ditemukan', 'NIP sesi tidak tersedia untuk menerbitkan token perangkat.');
          return;
        }

        btnIssueDevice.disabled = true;
        try {
          const res = await fetch('/api/auth/devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip, device_label: deviceLabel })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false || !json.device_token) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          deviceNameInput.value = '';
          await loadDeviceList();
          await showIssuedTokenModal(deviceLabel, json.device_token, json.expires_at);
        } catch (err) {
          notifyToast('error', 'Gagal Menerbitkan Token', err.message);
        } finally {
          btnIssueDevice.disabled = false;
        }
      });
    }

    // ── Keamanan Login & Identitas Instansi ──────────────────────────────────
    const pwdToggle = $('adminRequirePasswordToggle');
    const pwdStatus = $('adminRequirePasswordStatus');
    const instansiWrap = $('adminInstansiIdentitasWrap');
    const instansiBadge = $('adminInstansiCodeBadge');
    const instansiNamaEl = $('adminInstansiNama');
    const instansiHeaderEl = $('adminInstansiHeader');
    const instansiAlamatEl = $('adminInstansiAlamat');
    const btnSaveInstansi = $('btnSaveInstansi');
    let activeInstansiId = instId;

    const updatePwdBadge = (enabled, restricted = false) => {
      if (!pwdStatus) return;
      if (restricted) {
        pwdStatus.textContent = 'Terbatas';
        pwdStatus.className = 'px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold font-mono';
        return;
      }
      pwdStatus.textContent = enabled ? 'Aktif' : 'Nonaktif';
      pwdStatus.className = enabled
        ? 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold font-mono'
        : 'px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold font-mono';
    };

    if (pwdToggle) {
      try {
        const res = await fetch(`/api/password-toggle?instansi_id=${encodeURIComponent(instId)}`);
        if (res.status === 403) {
          pwdToggle.disabled = true;
          updatePwdBadge(false, true);
        } else {
          const json = await res.json().catch(() => null);
          if (res.ok && json && json.ok !== false) {
            pwdToggle.checked = !!json.enabled;
            updatePwdBadge(!!json.enabled);
          } else {
            updatePwdBadge(false);
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat password-toggle:', err.message);
        updatePwdBadge(false);
      }

      pwdToggle.addEventListener('change', async function () {
        const nextVal = !!pwdToggle.checked;
        pwdToggle.disabled = true;
        try {
          const res = await fetch('/api/password-toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instansi_id: activeInstansiId || instId, enabled: nextVal })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          const saved = !!json.enabled;
          pwdToggle.checked = saved;
          updatePwdBadge(saved);
          notifyToast(
            'success',
            'Keamanan Login Diperbarui',
            saved ? 'Verifikasi kata sandi saat login diaktifkan.' : 'Verifikasi kata sandi saat login dinonaktifkan.'
          );
        } catch (err) {
          pwdToggle.checked = !nextVal;
          updatePwdBadge(!nextVal);
          notifyToast('error', 'Gagal Menyimpan Kebijakan Sandi', err.message);
        } finally {
          pwdToggle.disabled = false;
        }
      });
    }

    if (instansiWrap) {
      try {
        const res = await fetch('/api/instansi-list');
        if (res.status === 403) {
          instansiWrap.classList.add('hidden');
        } else {
          const json = await res.json().catch(() => null);
          if (res.ok && json && json.ok !== false) {
            const list = Array.isArray(json.data) ? json.data : (Array.isArray(json.rows) ? json.rows : []);
            const current = list.find((r) => String(r.id || '').toLowerCase() === instId.toLowerCase()) || list[0];
            if (current) {
              activeInstansiId = String(current.id || instId);
              if (instansiBadge) instansiBadge.textContent = activeInstansiId.toUpperCase();
              if (instansiNamaEl) instansiNamaEl.value = current.nama_instansi || '';
              if (instansiHeaderEl) instansiHeaderEl.value = current.header || '';
              if (instansiAlamatEl) instansiAlamatEl.value = current.alamat || '';
            }
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat instansi-list:', err.message);
      }
    }

    if (btnSaveInstansi && instansiNamaEl && instansiHeaderEl && instansiAlamatEl) {
      btnSaveInstansi.addEventListener('click', async function () {
        const namaInstansi = instansiNamaEl.value.trim();
        const header = instansiHeaderEl.value.trim();
        const alamat = instansiAlamatEl.value.trim();
        if (!namaInstansi) {
          instansiNamaEl.focus();
          notifyToast('warning', 'Nama Instansi Wajib', 'Isi nama instansi terlebih dahulu.');
          return;
        }
        btnSaveInstansi.disabled = true;
        try {
          const res = await fetch('/api/instansi-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: activeInstansiId || instId,
              nama_instansi: namaInstansi,
              alamat,
              header
            })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          notifyToast('success', 'Identitas Instansi Tersimpan', json.message || 'Identitas instansi dan kop surat berhasil diperbarui.');
        } catch (err) {
          notifyToast('error', 'Gagal Menyimpan Identitas', err.message);
        } finally {
          btnSaveInstansi.disabled = false;
        }
      });
    }

    // ── Kontrol Absen (Jam Jaga) ─────────────────────────────────────────────
    const kontrolEnabledEl = $('adminKontrolEnabled');
    const kontrolToleransiEl = $('adminKontrolToleransi');
    const kontrolTimesListEl = $('adminKontrolTimesList');
    const kontrolNewTimeEl = $('adminKontrolNewTime');
    const btnAddKontrolTime = $('btnAddKontrolTime');
    const btnSaveKontrolAbsen = $('btnSaveKontrolAbsen');

    if (kontrolNewTimeEl && window.StitchPicker && typeof window.StitchPicker.enhanceTime === 'function') {
      window.StitchPicker.enhanceTime(kontrolNewTimeEl, {
        minHour: 6,
        maxHour: 20,
        stepMin: 15,
        placeholder: 'HH:MM'
      });
    }

    let kontrolTimes = [{ jam: '10:00', aktif: true }];

    function normalizeJamHm(raw) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || '').trim());
      if (!m) return '';
      const hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    function renderKontrolTimes() {
      if (!kontrolTimesListEl) return;
      if (!kontrolTimes.length) {
        kontrolTimesListEl.innerHTML = '<span class="text-xs text-on-surface-variant">Belum ada jam jaga. Tambahkan jam di atas lalu simpan.</span>';
        return;
      }
      kontrolTimesListEl.innerHTML = kontrolTimes.map((t, idx) => {
        const isActive = t.aktif !== false;
        const chipCls = isActive
          ? 'bg-primary-fixed text-on-primary-fixed border-primary/30'
          : 'bg-surface-container text-on-surface-variant border-outline-variant/40 opacity-75';
        return `
          <div class="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full border text-xs font-mono font-bold tabular-nums ${chipCls}">
            <button type="button" data-toggle-kontrol-idx="${idx}" title="${isActive ? 'Nonaktifkan jam ini' : 'Aktifkan jam ini'}" class="inline-flex items-center gap-1.5 cursor-pointer">
              <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-outline'}"></span>
              <span>${escapeHtml(t.jam)}</span>
            </button>
            <button type="button" data-remove-kontrol-idx="${idx}" aria-label="Hapus jam ${escapeHtml(t.jam)}" class="w-5 h-5 rounded-full hover:bg-error/15 hover:text-error inline-flex items-center justify-center transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        `;
      }).join('');
    }

    if (kontrolTimesListEl) {
      kontrolTimesListEl.addEventListener('click', function (ev) {
        const removeBtn = ev.target.closest('[data-remove-kontrol-idx]');
        if (removeBtn) {
          const idx = parseInt(removeBtn.getAttribute('data-remove-kontrol-idx'), 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < kontrolTimes.length) {
            kontrolTimes.splice(idx, 1);
            renderKontrolTimes();
          }
          return;
        }
        const toggleBtn = ev.target.closest('[data-toggle-kontrol-idx]');
        if (toggleBtn) {
          const idx = parseInt(toggleBtn.getAttribute('data-toggle-kontrol-idx'), 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < kontrolTimes.length) {
            kontrolTimes[idx].aktif = kontrolTimes[idx].aktif === false;
            renderKontrolTimes();
          }
        }
      });
    }

    if (btnAddKontrolTime && kontrolNewTimeEl) {
      btnAddKontrolTime.addEventListener('click', function () {
        const jam = normalizeJamHm(kontrolNewTimeEl.value);
        if (!jam) {
          notifyToast('warning', 'Format Jam Tidak Valid', 'Gunakan format HH:MM (contoh: 10:00).');
          return;
        }
        const existing = kontrolTimes.find((t) => t.jam === jam);
        if (existing) {
          existing.aktif = true;
          renderKontrolTimes();
          notifyToast('info', 'Jam Sudah Terdaftar', `Jam jaga ${jam} diaktifkan kembali.`);
          return;
        }
        kontrolTimes.push({ jam, aktif: true });
        kontrolTimes.sort((a, b) => a.jam.localeCompare(b.jam));
        renderKontrolTimes();
      });
    }

    if (kontrolEnabledEl || kontrolTimesListEl) {
      try {
        const res = await fetch(`/api/kontrol-absen?instansi_id=${encodeURIComponent(activeInstansiId || instId)}`);
        const json = await res.json().catch(() => null);
        if (res.ok && json && json.ok !== false) {
          const cfg = json.data?.config || json.config || {};
          if (kontrolEnabledEl) kontrolEnabledEl.checked = !!cfg.enabled;
          if (kontrolToleransiEl) kontrolToleransiEl.value = parseInt(cfg.toleransi, 10) || 30;
          if (Array.isArray(cfg.times)) {
            kontrolTimes = cfg.times
              .map((t) => ({ jam: normalizeJamHm(t.jam), aktif: t.aktif !== false }))
              .filter((t) => t.jam);
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat kontrol-absen:', err.message);
      }
      renderKontrolTimes();
    }

    if (btnSaveKontrolAbsen) {
      btnSaveKontrolAbsen.addEventListener('click', async function () {
        const tolParsed = parseInt(kontrolToleransiEl?.value, 10);
        const toleransi = Number.isFinite(tolParsed) && tolParsed > 0 ? tolParsed : 30;
        if (kontrolToleransiEl) kontrolToleransiEl.value = toleransi;
        const enabled = !!kontrolEnabledEl?.checked;
        const times = kontrolTimes
          .map((t) => ({ jam: normalizeJamHm(t.jam), aktif: t.aktif !== false }))
          .filter((t) => t.jam);

        btnSaveKontrolAbsen.disabled = true;
        try {
          const res = await fetch('/api/kontrol-absen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instansi_id: activeInstansiId || instId,
              enabled,
              toleransi,
              times
            })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          notifyToast(
            'success',
            'Kontrol Absen Tersimpan',
            `Jam Jaga ${enabled ? 'aktif' : 'nonaktif'} (${times.length} jadwal, toleransi ${toleransi} menit).`
          );
        } catch (err) {
          notifyToast('error', 'Gagal Menyimpan Kontrol Absen', err.message);
        } finally {
          btnSaveKontrolAbsen.disabled = false;
        }
      });
    }

    // ── Peringatan Akumulasi Keterlambatan ───────────────────────────────────
    const akumulasiEnabledEl = $('adminAkumulasiEnabled');
    const akumulasiAmbangEl = $('adminAkumulasiAmbang');
    const akumulasiAmbangLabelEl = $('adminAkumulasiAmbangLabel');
    const btnSaveAkumulasi = $('btnSaveAkumulasi');

    function updateAkumulasiAmbangLabel() {
      if (!akumulasiAmbangEl || !akumulasiAmbangLabelEl) return;
      const raw = parseInt(akumulasiAmbangEl.value, 10);
      const mins = Math.min(Math.max(Number.isFinite(raw) ? raw : 435, 30), 1440);
      const jam = Math.floor(mins / 60);
      const sisa = mins % 60;
      akumulasiAmbangLabelEl.textContent = `${jam}j ${sisa}m (${mins} menit)`;
    }

    if (akumulasiAmbangEl) {
      akumulasiAmbangEl.addEventListener('input', updateAkumulasiAmbangLabel);
    }

    if (akumulasiEnabledEl || akumulasiAmbangEl) {
      try {
        const res = await fetch(`/api/peringatan-akumulasi?instansi_id=${encodeURIComponent(activeInstansiId || instId)}`);
        const json = await res.json().catch(() => null);
        if (res.ok && json && json.ok !== false) {
          const cfg = json.data?.config || json.config || {};
          if (akumulasiEnabledEl) akumulasiEnabledEl.checked = !!cfg.enabled;
          if (akumulasiAmbangEl) {
            const val = parseInt(cfg.ambang_menit, 10) || 435;
            akumulasiAmbangEl.value = Math.min(Math.max(val, 30), 1440);
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat peringatan-akumulasi:', err.message);
      }
      updateAkumulasiAmbangLabel();
    }

    if (btnSaveAkumulasi) {
      btnSaveAkumulasi.addEventListener('click', async function () {
        const raw = parseInt(akumulasiAmbangEl?.value, 10);
        const ambang_menit = Math.min(Math.max(Number.isFinite(raw) ? raw : 435, 30), 1440);
        if (akumulasiAmbangEl) akumulasiAmbangEl.value = ambang_menit;
        updateAkumulasiAmbangLabel();
        const enabled = !!akumulasiEnabledEl?.checked;

        btnSaveAkumulasi.disabled = true;
        try {
          const res = await fetch('/api/peringatan-akumulasi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instansi_id: activeInstansiId || instId,
              enabled,
              ambang_menit
            })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          const jam = Math.floor(ambang_menit / 60);
          const sisa = ambang_menit % 60;
          notifyToast(
            'success',
            'Peringatan Akumulasi Tersimpan',
            `Notifikasi ${enabled ? 'aktif' : 'nonaktif'} pada ambang ${jam}j ${sisa}m (${ambang_menit} menit).`
          );
        } catch (err) {
          notifyToast('error', 'Gagal Menyimpan Peringatan Akumulasi', err.message);
        } finally {
          btnSaveAkumulasi.disabled = false;
        }
      });
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
