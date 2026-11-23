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

    // Load daftar lokasi & shift (multi-lokasi geofence CRUD)
    let locId = '1';
    let lokasiListCache = [];
    let mapSyncHelper = null;
    const lokasiListEl = $('adminLokasiList');
    const lokasiCountBadge = $('adminLokasiCountBadge');
    const lokasiNamaEl = $('adminLokasiNama');
    const lokasiEditorModeEl = $('adminLokasiEditorMode');
    const lokasiHariWrap = $('adminLokasiHariWrap');
    const btnNewLokasi = $('btnNewLokasi');
    const btnDeleteLokasi = $('btnDeleteLokasi');
    const btnSaveLokasiText = $('btnSaveLokasiText');

    const formatHariLabel = (rawHari) => {
      const parts = String(rawHari || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!parts.length || parts.length >= 7) return 'Setiap Hari';
      const kerja = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
      if (parts.length === 5 && kerja.every((d) => parts.includes(d))) return 'Senin – Jumat';
      return parts.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
    };

    const setHariCheckboxes = (rawHari) => {
      if (!lokasiHariWrap) return;
      const parts = String(rawHari || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      lokasiHariWrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = parts.length ? parts.includes(cb.value.toLowerCase()) : ['senin', 'selasa', 'rabu', 'kamis', 'jumat'].includes(cb.value.toLowerCase());
      });
    };

    const readHariCheckboxes = () => {
      if (!lokasiHariWrap) return 'senin,selasa,rabu,kamis,jumat';
      return Array.from(lokasiHariWrap.querySelectorAll('input[type="checkbox"]:checked'))
        .map((cb) => cb.value.toLowerCase())
        .join(',');
    };

    const selectLokasiForEdit = (loc) => {
      if (!loc) return;
      locId = String(loc.id);
      if (lokasiNamaEl) lokasiNamaEl.value = loc.nama_lokasi || loc.Nama_Lokasi || '';
      if (lat) lat.value = loc.latitude ?? '';
      if (lon) lon.value = loc.longitude ?? '';
      if (rad) rad.value = parseInt(loc.radius, 10) || 50;
      setHariCheckboxes(loc.hari);
      showRadius();
      if (lokasiEditorModeEl) lokasiEditorModeEl.textContent = `Edit Lokasi #${locId}`;
      if (btnSaveLokasiText) btnSaveLokasiText.textContent = 'Simpan Perubahan Lokasi';
      if (btnDeleteLokasi) {
        btnDeleteLokasi.classList.remove('hidden');
        btnDeleteLokasi.classList.add('inline-flex');
      }
      if (typeof mapSyncHelper === 'function') mapSyncHelper();
      renderLokasiList();
    };

    const startNewLokasiMode = () => {
      locId = '';
      if (lokasiNamaEl) {
        lokasiNamaEl.value = '';
        lokasiNamaEl.focus();
      }
      if (rad) rad.value = 100;
      setHariCheckboxes('senin,selasa,rabu,kamis,jumat');
      showRadius();
      if (lokasiEditorModeEl) lokasiEditorModeEl.textContent = 'Tambah Lokasi Baru (klik peta untuk pilih titik)';
      if (btnSaveLokasiText) btnSaveLokasiText.textContent = 'Simpan Lokasi Baru';
      if (btnDeleteLokasi) {
        btnDeleteLokasi.classList.add('hidden');
        btnDeleteLokasi.classList.remove('inline-flex');
      }
      renderLokasiList();
    };

    const renderLokasiList = () => {
      if (!lokasiListEl) return;
      const prevScroll = lokasiListEl.scrollTop;
      if (lokasiCountBadge) lokasiCountBadge.textContent = `${lokasiListCache.length} Lokasi`;
      if (!lokasiListCache.length) {
        lokasiListEl.innerHTML = '<div class="p-5 text-center text-xs text-on-surface-variant bg-surface-container-low rounded-xl">Belum ada titik lokasi di database. Klik "Tambah Lokasi" untuk menambahkan.</div>';
        return;
      }
      lokasiListEl.innerHTML = lokasiListCache.map((loc) => {
        const idStr = String(loc.id);
        const isSel = locId && idStr === String(locId);
        const nama = String(loc.nama_lokasi || loc.Nama_Lokasi || `Lokasi #${idStr}`);
        const radiusVal = parseInt(loc.radius, 10) || 50;
        const hariTxt = formatHariLabel(loc.hari);
        const coordsTxt = `${Number(loc.latitude || 0).toFixed(5)}, ${Number(loc.longitude || 0).toFixed(5)}`;
        return `
          <button type="button" data-lokasi-pick="${idStr.replace(/"/g, '&quot;')}" class="w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2.5 ${isSel ? 'bg-primary/5 border-primary shadow-xs' : 'bg-surface-container-low border-outline-variant/30 hover:border-primary/50'}">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${isSel ? 'bg-primary' : 'bg-secondary'} shrink-0"></span>
                <p class="text-xs font-bold text-on-surface truncate">${nama.replace(/</g, '&lt;')}</p>
              </div>
              <p class="text-[11px] font-mono text-on-surface-variant mt-1 tabular-nums">${coordsTxt}</p>
              <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span class="px-2 py-0.5 rounded-md bg-surface-container-lowest border border-outline-variant/40 text-[10px] font-semibold text-on-surface-variant">${hariTxt}</span>
                <span class="px-2 py-0.5 rounded-md bg-secondary-container/70 text-on-secondary-container text-[10px] font-mono font-bold tabular-nums">${radiusVal}m</span>
              </div>
            </div>
            <span class="material-symbols-outlined text-[18px] ${isSel ? 'text-primary' : 'text-on-surface-variant'} shrink-0 mt-0.5">chevron_right</span>
          </button>`;
      }).join('');
      lokasiListEl.scrollTop = prevScroll;
    };

    const refreshLokasiList = async (preferredId = null) => {
      try {
        const inst = getInstansiId();
        const tok = getAuthToken();
        const hdrs = tok ? { Authorization: `Bearer ${tok}` } : {};
        const res = await fetch(`/api/lokasi-list?instansi_id=${encodeURIComponent(inst)}`, { headers: hdrs });
        const json = await res.json().catch(() => null);
        if (res.ok && json && Array.isArray(json.rows || json.data)) {
          lokasiListCache = json.rows || json.data;
        }
      } catch (_) {}
      if (!lokasiListCache.length && core && typeof core.loadLokasi === 'function') {
        try {
          const loaded = await core.loadLokasi();
          lokasiListCache = loaded.locations || [];
          if (loaded.shift) {
            if (jamMasukEl && loaded.shift.masuk) jamMasukEl.value = loaded.shift.masuk;
            if (jamPulangEl && loaded.shift.pulang) jamPulangEl.value = loaded.shift.pulang;
            showToleransi();
          }
        } catch (err) {
          console.warn('[admin] gagal memuat lokasi/shift dari database:', err.message);
        }
      } else if (core && typeof core.loadLokasi === 'function') {
        try {
          const loaded = await core.loadLokasi();
          if (loaded.shift) {
            if (jamMasukEl && loaded.shift.masuk) jamMasukEl.value = loaded.shift.masuk;
            if (jamPulangEl && loaded.shift.pulang) jamPulangEl.value = loaded.shift.pulang;
            showToleransi();
          }
        } catch (_) {}
      }
      const target = preferredId
        ? lokasiListCache.find((x) => String(x.id) === String(preferredId))
        : (lokasiListCache.find((x) => String(x.id) === String(locId)) || lokasiListCache[0]);
      if (target) {
        selectLokasiForEdit(target);
      } else {
        renderLokasiList();
      }
    };

    if (lokasiListEl) {
      lokasiListEl.addEventListener('click', (ev) => {
        const card = ev.target.closest && ev.target.closest('[data-lokasi-pick]');
        if (!card) return;
        const pickId = card.getAttribute('data-lokasi-pick');
        const found = lokasiListCache.find((x) => String(x.id) === String(pickId));
        if (found) selectLokasiForEdit(found);
      });
    }
    if (btnNewLokasi) {
      btnNewLokasi.addEventListener('click', startNewLokasiMode);
    }

    await refreshLokasiList();

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
      mapSyncHelper = syncFromInputs;

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
      window.addEventListener('resize', () => {
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
      });
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

    const mandatoryFaceSelect = $('adminMandatoryFaceSelect');
    const btnAddMandatoryFace = $('btnAddAdminMandatoryFace');
    const mandatoryFaceChips = $('adminMandatoryFaceChips');
    let mandatoryNipsList = [];
    let mandatoryUsersMap = {};

    const renderMandatoryFaceChips = () => {
      if (!mandatoryFaceChips) return;
      if (!mandatoryNipsList.length) {
        mandatoryFaceChips.innerHTML = '<span class="text-xs text-on-surface-variant">Belum ada pegawai wajib scan wajah.</span>';
        return;
      }
      mandatoryFaceChips.innerHTML = mandatoryNipsList.map((nip) => {
        const label = mandatoryUsersMap[nip] ? `${mandatoryUsersMap[nip]} (${nip})` : nip;
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
          <span>${label.replace(/</g, '&lt;')}</span>
          <button type="button" data-rm-mandatory-nip="${nip.replace(/"/g, '&quot;')}" class="hover:text-error font-bold cursor-pointer" aria-label="Hapus">&times;</button>
        </span>`;
      }).join('');
    };

    const populateMandatoryFaceUsers = async () => {
      if (!mandatoryFaceSelect) return;
      try {
        const res = await fetch('/api/stitch/bootstrap', { headers: mediaHeaders() });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const users = Array.isArray(json?.users) ? json.users : [];
        mandatoryUsersMap = {};
        const opts = ['<option value="">-- Pilih pegawai untuk ditambahkan --</option>'];
        users.forEach((u) => {
          const nip = String(u.nip || '').trim();
          const nama = String(u.nama || u.username || nip).trim();
          if (nip) {
            mandatoryUsersMap[nip] = nama;
            opts.push(`<option value="${nip.replace(/"/g, '&quot;')}">${nama.replace(/</g, '&lt;')} — ${nip}</option>`);
          }
        });
        mandatoryFaceSelect.innerHTML = opts.join('');
        renderMandatoryFaceChips();
      } catch (_) {}
    };

    if (livenessToggle || thresholdSlider || mandatoryFaceChips) {
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
          if (Array.isArray(settings.mandatory_nips)) {
            mandatoryNipsList = settings.mandatory_nips.map((s) => String(s || '').trim()).filter(Boolean);
          }
        }
      } catch (err) {
        console.warn('[admin] gagal memuat face-settings:', err.message);
      }
      showThreshold();
      renderMandatoryFaceChips();
      populateMandatoryFaceUsers();
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
        if (mandatoryFaceChips) payload.settings.mandatory_nips = mandatoryNipsList;

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
        notifyToast('success', 'Pengaturan Face AI Tersimpan', `Liveness: ${liveTxt} • Threshold: ${thrTxt} • Wajib Wajah: ${mandatoryNipsList.length} pegawai`);
      } catch (err) {
        notifyToast('error', 'Gagal Menyimpan Face AI', err.message);
      } finally {
        savingFaceSettings = false;
      }
    };

    if (btnAddMandatoryFace && mandatoryFaceSelect) {
      btnAddMandatoryFace.addEventListener('click', () => {
        const nip = String(mandatoryFaceSelect.value || '').trim();
        if (!nip) return;
        if (!mandatoryNipsList.includes(nip)) {
          mandatoryNipsList.push(nip);
          renderMandatoryFaceChips();
          saveFaceSettings();
        }
        mandatoryFaceSelect.value = '';
      });
    }
    if (mandatoryFaceChips) {
      mandatoryFaceChips.addEventListener('click', (ev) => {
        const rmBtn = ev.target.closest && ev.target.closest('[data-rm-mandatory-nip]');
        if (!rmBtn) return;
        const nip = rmBtn.getAttribute('data-rm-mandatory-nip');
        mandatoryNipsList = mandatoryNipsList.filter((x) => x !== nip);
        renderMandatoryFaceChips();
        saveFaceSettings();
      });
    }

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

    const pwdMandSelect = $('adminMandatoryPwdSelect');
    const btnAddPwdMand = $('btnAddMandatoryPwdNip');
    const pwdMandChips = $('adminMandatoryPwdChips');
    let desktopMandatoryPwdNips = [];

    const renderDesktopPwdChips = () => {
      if (!pwdMandChips) return;
      if (!desktopMandatoryPwdNips.length) {
        pwdMandChips.innerHTML = '<span class="text-xs text-on-surface-variant">Belum ada pegawai wajib kata sandi.</span>';
        return;
      }
      pwdMandChips.innerHTML = desktopMandatoryPwdNips.map((nip) => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <span>${escapeHtml(nip)}</span>
          <button type="button" data-rm-pwd-nip="${escapeHtml(nip)}" class="hover:text-rose-600 font-bold cursor-pointer" aria-label="Hapus">&times;</button>
        </span>
      `).join('');
    };

    const persistDesktopPwdNips = async () => {
      try {
        const res = await fetch('/api/password-toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instansi_id: activeInstansiId || instId, mandatory_nips: desktopMandatoryPwdNips })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
        notifyToast('success', 'Wajib Sandi Disimpan', `${desktopMandatoryPwdNips.length} NIP wajib kata sandi.`);
      } catch (err) {
        notifyToast('error', 'Gagal Menyimpan Wajib Sandi', err.message);
      }
    };

    if (pwdMandSelect) {
      fetch('/api/user-list?format=compact').then((r) => r.json()).then((j) => {
        const rows = j?.rows || j?.data || [];
        pwdMandSelect.innerHTML = '<option value="">-- Pilih pegawai untuk ditambahkan --</option>' +
          rows.filter((u) => u.nip).map((u) => `<option value="${escapeHtml(u.nip)}">${escapeHtml(u.nama || u.username || u.nip)} — ${escapeHtml(u.nip)}</option>`).join('');
      }).catch(() => {});
    }

    if (btnAddPwdMand && pwdMandSelect) {
      btnAddPwdMand.addEventListener('click', () => {
        const nip = String(pwdMandSelect.value || '').trim();
        if (!nip) return;
        if (!desktopMandatoryPwdNips.includes(nip)) {
          desktopMandatoryPwdNips.push(nip);
          renderDesktopPwdChips();
          persistDesktopPwdNips();
        }
        pwdMandSelect.value = '';
      });
    }

    if (pwdMandChips) {
      pwdMandChips.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-rm-pwd-nip]');
        if (!btn) return;
        const nip = btn.getAttribute('data-rm-pwd-nip');
        desktopMandatoryPwdNips = desktopMandatoryPwdNips.filter((x) => x !== nip);
        renderDesktopPwdChips();
        persistDesktopPwdNips();
      });
    }

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
            desktopMandatoryPwdNips = Array.isArray(json.mandatory_nips) ? json.mandatory_nips : [];
            renderDesktopPwdChips();
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
        const nama = String(lokasiNamaEl?.value || '').trim();
        const latNum = parseFloat(lat.value);
        const lonNum = parseFloat(lon.value);
        const radNum = parseInt(rad.value, 10) || 50;
        const hariStr = readHariCheckboxes();
        if (!nama) {
          notifyToast('warning', 'Nama Lokasi Wajib', 'Masukkan nama lokasi presensi terlebih dahulu.');
          if (lokasiNamaEl) lokasiNamaEl.focus();
          return;
        }
        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
          notifyToast('warning', 'Koordinat Tidak Valid', 'Masukkan angka latitude dan longitude yang valid.');
          return;
        }

        btn.disabled = true;
        try {
          if (!locId) {
            const res = await fetch('/api/lokasi-add', {
              method: 'POST',
              headers: mediaHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                nama_lokasi: nama,
                latitude: latNum,
                longitude: lonNum,
                radius: radNum,
                hari: hariStr,
                instansi_id: getInstansiId()
              })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) {
              throw new Error((json && json.message) || `HTTP ${res.status}`);
            }
            notifyToast('success', 'Lokasi Ditambahkan', `${nama} (${radNum}m) berhasil ditambahkan.`);
            await refreshLokasiList(json.data?.id || null);
          } else {
            const res = await fetch('/api/lokasi-update', {
              method: 'POST',
              headers: mediaHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                id: locId,
                nama_lokasi: nama,
                latitude: latNum,
                longitude: lonNum,
                radius: radNum,
                hari: hariStr
              })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) {
              throw new Error((json && json.message) || `HTTP ${res.status}`);
            }
            notifyToast('success', 'Lokasi Diperbarui', `${nama} (${radNum}m) berhasil disimpan.`);
            await refreshLokasiList(locId);
          }
        } catch (err) {
          notifyToast('error', 'Gagal Menyimpan Lokasi', err.message);
        } finally {
          btn.disabled = false;
        }
      });
    }

    if (btnDeleteLokasi) {
      btnDeleteLokasi.addEventListener('click', async function () {
        if (!locId) return;
        const nama = String(lokasiNamaEl?.value || `Lokasi #${locId}`).trim();
        let confirmed = false;
        if (window.Swal) {
          const r = await window.Swal.fire({
            title: `Hapus ${nama}?`,
            text: 'Titik lokasi presensi ini akan dihapus permanen dari database.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ba1a1a',
            confirmButtonText: 'Ya, Hapus',
            cancelButtonText: 'Batal'
          });
          confirmed = Boolean(r && r.isConfirmed);
        } else {
          confirmed = confirm(`Hapus lokasi ${nama}?`);
        }
        if (!confirmed) return;

        btnDeleteLokasi.disabled = true;
        try {
          const res = await fetch(`/api/lokasi-delete?id=${encodeURIComponent(locId)}`, {
            method: 'DELETE',
            headers: mediaHeaders()
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) {
            throw new Error((json && json.message) || `HTTP ${res.status}`);
          }
          locId = '';
          notifyToast('success', 'Lokasi Dihapus', `${nama} berhasil dihapus.`);
          await refreshLokasiList();
        } catch (err) {
          notifyToast('error', 'Gagal Menghapus Lokasi', err.message);
        } finally {
          btnDeleteLokasi.disabled = false;
        }
      });
    }

    // ── Master OPD (Instansi) & Struktur Bidang CRUD ────────────────────────
    const opdListEl = $('adminOpdList');
    const opdCountEl = $('adminOpdCountBadge');
    const opdFormModeEl = $('adminOpdFormMode');
    const opdIdInput = $('adminOpdIdInput');
    const opdNamaInput = $('adminOpdNamaInput');
    const opdHeaderInput = $('adminOpdHeaderInput');
    const opdAlamatInput = $('adminOpdAlamatInput');
    const btnNewOpd = $('btnNewOpd');
    const btnSaveOpd = $('btnSaveOpd');
    const btnSaveOpdText = $('btnSaveOpdText');
    const btnDeleteOpd = $('btnDeleteOpd');
    const bidangListEl = $('adminBidangList');
    const bidangOpdBadge = $('adminBidangOpdBadge');
    const newBidangInput = $('adminNewBidangInput');
    const btnAddBidang = $('btnAddBidang');

    if (opdListEl && bidangListEl) {
      let opdCache = [];
      let selectedOpdId = instId || 'bapperida';
      let isNewOpdMode = false;
      const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

      const loadBidangForOpd = async (targetOpdId) => {
        if (bidangOpdBadge) bidangOpdBadge.textContent = String(targetOpdId || '-').toUpperCase();
        if (!targetOpdId) {
          bidangListEl.innerHTML = '<div class="p-4 text-center text-xs text-on-surface-variant bg-surface-container-low rounded-xl">Simpan OPD baru terlebih dahulu untuk menambah bidang.</div>';
          return;
        }
        bidangListEl.innerHTML = '<div class="p-4 text-center text-xs text-on-surface-variant bg-surface-container-low rounded-xl">Memuat daftar bidang...</div>';
        try {
          const res = await fetch(`/api/bidang-list?instansi_id=${encodeURIComponent(targetOpdId)}`, { headers: mediaHeaders() });
          const json = await res.json().catch(() => null);
          const rows = (res.ok && json && Array.isArray(json.rows || json.data)) ? (json.rows || json.data) : [];
          if (!rows.length) {
            bidangListEl.innerHTML = '<div class="p-4 text-center text-xs text-on-surface-variant bg-surface-container-low rounded-xl">Belum ada bidang terdaftar di OPD ini.</div>';
            return;
          }
          bidangListEl.innerHTML = rows.map((b) => {
            const bid = String(b.id);
            const bnama = String(b.nama_bidang || b.nama || '-');
            return `
              <div class="p-2.5 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-on-surface truncate">${escH(bnama)}</span>
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" data-bidang-edit="${escH(bid)}" data-bidang-nama="${escH(bnama)}" class="px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[11px] font-semibold text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer">Edit</button>
                  <button type="button" data-bidang-del="${escH(bid)}" data-bidang-nama="${escH(bnama)}" class="px-2 py-1 rounded-lg bg-error/10 text-error hover:bg-error hover:text-white text-[11px] font-semibold transition-colors cursor-pointer">Hapus</button>
                </div>
              </div>`;
          }).join('');
        } catch (err) {
          bidangListEl.innerHTML = `<div class="p-4 text-center text-xs text-error">${escH(err.message)}</div>`;
        }
      };

      const renderOpdList = () => {
        if (opdCountEl) opdCountEl.textContent = `${opdCache.length} OPD`;
        if (!opdCache.length) {
          opdListEl.innerHTML = '<div class="p-4 text-center text-xs text-on-surface-variant bg-surface-container-low rounded-xl">Belum ada OPD terdaftar.</div>';
          return;
        }
        opdListEl.innerHTML = opdCache.map((o) => {
          const oid = String(o.id);
          const isSel = !isNewOpdMode && oid === selectedOpdId;
          return `
            <button type="button" data-opd-pick="${escH(oid)}" class="w-full text-left p-2.5 px-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${isSel ? 'bg-primary/5 border-primary shadow-xs' : 'bg-surface-container-low border-outline-variant/30 hover:border-primary/50'}">
              <div class="min-w-0">
                <p class="text-xs font-bold text-on-surface truncate">${escH(o.nama_instansi || oid)}</p>
                <p class="text-[11px] font-mono text-on-surface-variant truncate">${escH(oid)}</p>
              </div>
              <span class="material-symbols-outlined text-[18px] ${isSel ? 'text-primary' : 'text-on-surface-variant'} shrink-0">chevron_right</span>
            </button>`;
        }).join('');
      };

      const selectOpd = (o) => {
        if (!o) return;
        isNewOpdMode = false;
        selectedOpdId = String(o.id);
        if (opdFormModeEl) opdFormModeEl.textContent = `Edit OPD: ${o.nama_instansi || o.id}`;
        if (opdIdInput) { opdIdInput.value = selectedOpdId; opdIdInput.disabled = true; }
        if (opdNamaInput) opdNamaInput.value = o.nama_instansi || '';
        if (opdHeaderInput) opdHeaderInput.value = o.header || '';
        if (opdAlamatInput) opdAlamatInput.value = o.alamat || '';
        if (btnSaveOpdText) btnSaveOpdText.textContent = 'Simpan Perubahan OPD';
        if (btnDeleteOpd) {
          const canDel = selectedOpdId !== 'bapperida';
          btnDeleteOpd.classList.toggle('hidden', !canDel);
          btnDeleteOpd.classList.toggle('inline-flex', canDel);
        }
        renderOpdList();
        loadBidangForOpd(selectedOpdId);
      };

      const refreshOpdList = async (pickId = null) => {
        try {
          const res = await fetch('/api/instansi-list', { headers: mediaHeaders() });
          const json = await res.json().catch(() => null);
          if (res.ok && json && Array.isArray(json.rows || json.data)) {
            opdCache = json.rows || json.data;
          }
        } catch (_) {}
        const target = pickId
          ? opdCache.find((x) => String(x.id) === String(pickId))
          : (opdCache.find((x) => String(x.id) === String(selectedOpdId)) || opdCache[0]);
        if (target) selectOpd(target);
        else renderOpdList();
      };

      opdListEl.addEventListener('click', (ev) => {
        const b = ev.target.closest && ev.target.closest('[data-opd-pick]');
        if (!b) return;
        const found = opdCache.find((x) => String(x.id) === b.getAttribute('data-opd-pick'));
        if (found) selectOpd(found);
      });

      if (btnNewOpd) {
        btnNewOpd.addEventListener('click', () => {
          isNewOpdMode = true;
          if (opdFormModeEl) opdFormModeEl.textContent = 'Tambah OPD Baru';
          if (opdIdInput) { opdIdInput.value = ''; opdIdInput.disabled = false; opdIdInput.focus(); }
          if (opdNamaInput) opdNamaInput.value = '';
          if (opdHeaderInput) opdHeaderInput.value = '';
          if (opdAlamatInput) opdAlamatInput.value = '';
          if (btnSaveOpdText) btnSaveOpdText.textContent = 'Simpan OPD Baru';
          if (btnDeleteOpd) { btnDeleteOpd.classList.add('hidden'); btnDeleteOpd.classList.remove('inline-flex'); }
          renderOpdList();
          loadBidangForOpd('');
        });
      }

      if (btnSaveOpd) {
        btnSaveOpd.addEventListener('click', async () => {
          const idVal = String(opdIdInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
          const namaVal = String(opdNamaInput?.value || '').trim();
          const headerVal = String(opdHeaderInput?.value || '').trim();
          const alamatVal = String(opdAlamatInput?.value || '').trim();
          if (!idVal || !namaVal) {
            notifyToast('warning', 'Data Belum Lengkap', 'Kode OPD dan Nama OPD wajib diisi.');
            return;
          }
          btnSaveOpd.disabled = true;
          try {
            const url = isNewOpdMode ? '/api/instansi-add' : '/api/instansi-update';
            const res = await fetch(url, {
              method: 'POST',
              headers: mediaHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ id: idVal, nama_instansi: namaVal, header: headerVal, alamat: alamatVal })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
            notifyToast('success', isNewOpdMode ? 'OPD Ditambahkan' : 'OPD Diperbarui', `${namaVal} (${idVal}) berhasil disimpan.`);
            await refreshOpdList(idVal);
          } catch (err) {
            notifyToast('error', 'Gagal Menyimpan OPD', err.message);
          } finally {
            btnSaveOpd.disabled = false;
          }
        });
      }

      if (btnDeleteOpd) {
        btnDeleteOpd.addEventListener('click', async () => {
          if (!selectedOpdId || selectedOpdId === 'bapperida') return;
          let confirmed = false;
          if (window.Swal) {
            const r = await window.Swal.fire({
              title: `Hapus OPD ${selectedOpdId}?`,
              text: 'Data OPD ini akan dihapus permanen.',
              icon: 'warning',
              showCancelButton: true,
              confirmButtonColor: '#ba1a1a',
              confirmButtonText: 'Ya, Hapus',
              cancelButtonText: 'Batal'
            });
            confirmed = Boolean(r && r.isConfirmed);
          } else confirmed = confirm(`Hapus OPD ${selectedOpdId}?`);
          if (!confirmed) return;
          btnDeleteOpd.disabled = true;
          try {
            const res = await fetch(`/api/instansi-delete?id=${encodeURIComponent(selectedOpdId)}`, {
              method: 'DELETE',
              headers: mediaHeaders()
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
            notifyToast('success', 'OPD Dihapus', `OPD ${selectedOpdId} berhasil dihapus.`);
            selectedOpdId = 'bapperida';
            window._refreshAdminOpdList = refreshOpdList;
      await refreshOpdList();
          } catch (err) {
            notifyToast('error', 'Gagal Menghapus OPD', err.message);
          } finally {
            btnDeleteOpd.disabled = false;
          }
        });
      }

      if (btnAddBidang && newBidangInput) {
        btnAddBidang.addEventListener('click', async () => {
          const nama = String(newBidangInput.value || '').trim();
          if (!selectedOpdId || isNewOpdMode) {
            notifyToast('warning', 'Pilih OPD', 'Pilih atau simpan OPD terlebih dahulu sebelum menambah bidang.');
            return;
          }
          if (!nama) return;
          btnAddBidang.disabled = true;
          try {
            const res = await fetch('/api/bidang-add', {
              method: 'POST',
              headers: mediaHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ instansi_id: selectedOpdId, nama_bidang: nama })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
            newBidangInput.value = '';
            notifyToast('success', 'Bidang Ditambahkan', `${nama} ditambahkan ke ${selectedOpdId}.`);
            await loadBidangForOpd(selectedOpdId);
          } catch (err) {
            notifyToast('error', 'Gagal Menambah Bidang', err.message);
          } finally {
            btnAddBidang.disabled = false;
          }
        });
      }

      bidangListEl.addEventListener('click', async (ev) => {
        const editBtn = ev.target.closest && ev.target.closest('[data-bidang-edit]');
        if (editBtn) {
          const bid = editBtn.getAttribute('data-bidang-edit');
          const curNama = editBtn.getAttribute('data-bidang-nama') || '';
          let nextNama = '';
          if (window.Swal) {
            const r = await window.Swal.fire({
              title: 'Ubah Nama Bidang',
              input: 'text',
              inputValue: curNama,
              showCancelButton: true,
              confirmButtonText: 'Simpan',
              cancelButtonText: 'Batal'
            });
            if (!r || !r.isConfirmed) return;
            nextNama = String(r.value || '').trim();
          } else {
            nextNama = String(prompt('Ubah nama bidang:', curNama) || '').trim();
          }
          if (!nextNama || nextNama === curNama) return;
          try {
            const res = await fetch('/api/bidang-update', {
              method: 'POST',
              headers: mediaHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ id: bid, nama_bidang: nextNama })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
            notifyToast('success', 'Bidang Diperbarui', `Nama bidang diubah menjadi ${nextNama}.`);
            await loadBidangForOpd(selectedOpdId);
          } catch (err) {
            notifyToast('error', 'Gagal Mengubah Bidang', err.message);
          }
          return;
        }

        const delBtn = ev.target.closest && ev.target.closest('[data-bidang-del]');
        if (delBtn) {
          const bid = delBtn.getAttribute('data-bidang-del');
          const bnama = delBtn.getAttribute('data-bidang-nama') || '';
          let confirmed = false;
          if (window.Swal) {
            const r = await window.Swal.fire({
              title: `Hapus bidang "${bnama}"?`,
              icon: 'warning',
              showCancelButton: true,
              confirmButtonColor: '#ba1a1a',
              confirmButtonText: 'Ya, Hapus',
              cancelButtonText: 'Batal'
            });
            confirmed = Boolean(r && r.isConfirmed);
          } else confirmed = confirm(`Hapus bidang ${bnama}?`);
          if (!confirmed) return;
          try {
            const res = await fetch(`/api/bidang-delete?id=${encodeURIComponent(bid)}`, {
              method: 'DELETE',
              headers: mediaHeaders()
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
            notifyToast('success', 'Bidang Dihapus', `${bnama} berhasil dihapus.`);
            await loadBidangForOpd(selectedOpdId);
          } catch (err) {
            notifyToast('error', 'Gagal Menghapus Bidang', err.message);
          }
        }
      });

      window._refreshAdminOpdList = refreshOpdList;
      await refreshOpdList();
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
    // ── Desktop Native Tabs: Master Pegawai & Kelola Role ──────────────────
    let desktopPegawaiCache = [];
    let desktopRolesCache = [];
    let desktopPermCatalog = [];

    const renderDesktopPegawaiList = () => {
      const listEl = $('desktopPegawaiList');
      if (!listEl) return;
      const q = String($('desktopPegawaiSearch')?.value || '').trim().toLowerCase();
      const filtered = desktopPegawaiCache.filter((u) => {
        if (!q) return true;
        return [u.nama, u.username, u.nip, u.bidang, u.jabatan, u.role].join(' ').toLowerCase().includes(q);
      });
      if (!filtered.length) {
        listEl.innerHTML = '<div class="col-span-full py-6 text-center text-on-surface-variant">Tidak ada pegawai cocok dengan pencarian.</div>';
        return;
      }
      const roleOpts = desktopRolesCache.length
        ? desktopRolesCache.map((r) => String(r.id || '').toUpperCase())
        : ['USER', 'ADMIN', 'SUPERADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN', 'BENDAHARA_BARANG'];

      listEl.innerHTML = filtered.map((u) => {
        const curRole = String(u.role || 'USER').trim().toUpperCase().replace(/\s+/g, '_');
        const opts = [...new Set([curRole, ...roleOpts])].map((r) => `<option value="${escapeHtml(r)}"${r === curRole ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('');
        return `<div class="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-on-surface truncate">${escapeHtml(u.nama || u.username || '-')}</p>
              <p class="text-[11px] font-mono text-on-surface-variant">${escapeHtml(u.nip || '-')}</p>
              <p class="text-[11px] text-on-surface-variant truncate">${escapeHtml(u.jabatan || u.bidang || '-')}</p>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">${escapeHtml(curRole)}</span>
          </div>
          <div class="flex items-center gap-1.5 pt-1 border-t border-outline-variant/20">
            <select data-desk-role-uid="${escapeHtml(u.id)}" data-desk-role-nip="${escapeHtml(u.nip || '')}" class="flex-1 min-h-[34px] px-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[11px] text-on-surface">${opts}</select>
            <button type="button" data-desk-reset-pwd="${escapeHtml(u.id)}" data-desk-nama="${escapeHtml(u.nama || u.username || '')}" class="min-h-[34px] px-2.5 rounded-lg bg-amber-500/15 text-amber-700 font-bold text-[11px] cursor-pointer" title="Reset Password">Sandi</button>
            <button type="button" data-desk-reset-face="${escapeHtml(u.nip || '')}" data-desk-nama="${escapeHtml(u.nama || u.username || '')}" class="min-h-[34px] px-2.5 rounded-lg bg-rose-500/15 text-rose-700 font-bold text-[11px] cursor-pointer" title="Reset Wajah AI">Wajah</button>
          </div>
        </div>`;
      }).join('');
    };

    window.loadDesktopPegawaiTab = async function () {
      const listEl = $('desktopPegawaiList');
      if (!listEl) return;
      try {
        const [uRes, rRes] = await Promise.all([
          fetch('/api/user-list?format=compact'),
          fetch('/api/admin/roles')
        ]);
        const uJson = await uRes.json().catch(() => ({}));
        const rJson = await rRes.json().catch(() => ({}));
        desktopPegawaiCache = uJson.rows || uJson.data || [];
        desktopRolesCache = rJson.rows || rJson.data || [];
        renderDesktopPegawaiList();
      } catch (err) {
        listEl.innerHTML = `<div class="col-span-full py-6 text-center text-rose-600">${escapeHtml(err.message)}</div>`;
      }
    };

    $('desktopPegawaiSearch')?.addEventListener('input', renderDesktopPegawaiList);
    $('btnReloadDesktopPegawai')?.addEventListener('click', () => window.loadDesktopPegawaiTab());
    $('desktopPegawaiList')?.addEventListener('change', async (ev) => {
      const sel = ev.target.closest('[data-desk-role-uid]');
      if (!sel) return;
      const userId = sel.getAttribute('data-desk-role-uid');
      const nip = sel.getAttribute('data-desk-role-nip');
      const roleId = sel.value;
      try {
        const res = await fetch('/api/admin/roles/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, nip, roleId })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
        notifyToast('success', 'Role Diperbarui', `Role diubah menjadi ${roleId}.`);
        await window.loadDesktopPegawaiTab();
      } catch (err) {
        notifyToast('error', 'Gagal Ubah Role', err.message);
      }
    });
    $('desktopPegawaiList')?.addEventListener('click', async (ev) => {
      const pwdBtn = ev.target.closest('[data-desk-reset-pwd]');
      if (pwdBtn) {
        const id = pwdBtn.getAttribute('data-desk-reset-pwd');
        const nama = pwdBtn.getAttribute('data-desk-nama') || 'pegawai';
        if (!confirm(`Reset password ${nama} ke default (BapperidaSB2026)?`)) return;
        const res = await fetch('/api/user-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        const json = await res.json().catch(() => null);
        notifyToast(res.ok ? 'success' : 'error', res.ok ? 'Password Direset' : 'Gagal', (json && json.message) || `HTTP ${res.status}`);
        return;
      }
      const faceBtn = ev.target.closest('[data-desk-reset-face]');
      if (faceBtn) {
        const nip = faceBtn.getAttribute('data-desk-reset-face');
        const nama = faceBtn.getAttribute('data-desk-nama') || 'pegawai';
        if (!confirm(`Hapus data wajah AI milik ${nama}?`)) return;
        const res = await fetch('/api/stitch/admin/face-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nip }) });
        const json = await res.json().catch(() => null);
        notifyToast(res.ok ? 'success' : 'error', res.ok ? 'Wajah Direset' : 'Gagal', (json && json.message) || `HTTP ${res.status}`);
      }
    });

    window.loadDesktopRolesTab = async function () {
      const gridEl = $('desktopRolesGrid');
      if (!gridEl) return;
      try {
        const [rRes, pRes] = await Promise.all([
          fetch('/api/admin/roles'),
          fetch('/api/admin/roles/permissions-list')
        ]);
        const rJson = await rRes.json().catch(() => ({}));
        const pJson = await pRes.json().catch(() => ({}));
        desktopRolesCache = rJson.rows || rJson.data || [];
        desktopPermCatalog = pJson.data || [];
        if (!desktopRolesCache.length) {
          gridEl.innerHTML = '<div class="col-span-full py-6 text-center text-on-surface-variant">Belum ada role.</div>';
          return;
        }
        const allPermIds = desktopPermCatalog.flatMap((m) => (m.permissions || []).map((p) => p));
        gridEl.innerHTML = desktopRolesCache.map((role) => {
          const perms = Array.isArray(role.permissions) ? role.permissions : [];
          const isWild = perms.includes('*');
          const checks = allPermIds.map((p) => {
            const checked = isWild || perms.includes(p.id);
            return `<label class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-[11px] cursor-pointer">
              <input type="checkbox" data-desk-rperm="${escapeHtml(role.id)}" value="${escapeHtml(p.id)}" ${checked ? 'checked' : ''} ${isWild ? 'disabled' : ''} class="accent-primary" />
              <span>${escapeHtml(p.name || p.id)}</span>
            </label>`;
          }).join('');
          const delBtn = !role.is_system
            ? `<button type="button" data-desk-del-role="${escapeHtml(role.id)}" class="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 font-bold text-[11px] cursor-pointer">Hapus</button>`
            : '<span class="text-[10px] text-on-surface-variant font-mono">SYSTEM</span>';
          return `<div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h4 class="font-bold text-on-surface text-sm">${escapeHtml(role.nama || role.id)} <span class="text-[11px] font-mono text-primary">(${escapeHtml(role.id)})</span></h4>
                <p class="text-[11px] text-on-surface-variant">${escapeHtml(role.deskripsi || '')} • ${Number(role.user_count || 0)} pegawai</p>
              </div>
              <div class="flex items-center gap-1.5">
                ${!isWild ? `<button type="button" data-desk-save-role="${escapeHtml(role.id)}" class="px-2.5 py-1 rounded-lg bg-primary text-on-primary font-bold text-[11px] cursor-pointer">Simpan Izin</button>` : ''}
                ${delBtn}
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">${checks}</div>
          </div>`;
        }).join('');
      } catch (err) {
        gridEl.innerHTML = `<div class="col-span-full py-6 text-center text-rose-600">${escapeHtml(err.message)}</div>`;
      }
    };

    $('btnNewDesktopRole')?.addEventListener('click', async () => {
      const id = prompt('Kode Role baru (huruf besar, mis: OPERATOR_REKAP):');
      if (!id) return;
      const nama = prompt('Nama tampilan role:', id) || id;
      try {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id.trim().toUpperCase().replace(/\s+/g, '_'), nama: nama.trim(), permissions: ['presensi.self'] })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
        notifyToast('success', 'Role Dibuat', `${nama} berhasil ditambahkan.`);
        await window.loadDesktopRolesTab();
      } catch (err) {
        notifyToast('error', 'Gagal Membuat Role', err.message);
      }
    });

    $('desktopRolesGrid')?.addEventListener('click', async (ev) => {
      const saveBtn = ev.target.closest('[data-desk-save-role]');
      if (saveBtn) {
        const roleId = saveBtn.getAttribute('data-desk-save-role');
        const perms = Array.from(document.querySelectorAll(`input[data-desk-rperm="${CSS.escape(roleId)}"]:checked`)).map((c) => c.value);
        try {
          const res = await fetch(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: perms })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
          notifyToast('success', 'Izin Role Disimpan', `${roleId} (${perms.length} izin) diperbarui.`);
        } catch (err) {
          notifyToast('error', 'Gagal Menyimpan Role', err.message);
        }
        return;
      }
      const delBtn = ev.target.closest('[data-desk-del-role]');
      if (delBtn) {
        const roleId = delBtn.getAttribute('data-desk-del-role');
        if (!confirm(`Hapus custom role ${roleId}?`)) return;
        try {
          const res = await fetch(`/api/admin/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
          notifyToast('success', 'Role Dihapus', `${roleId} telah dihapus.`);
          await window.loadDesktopRolesTab();
        } catch (err) {
          notifyToast('error', 'Gagal Menghapus Role', err.message);
        }
      }
    });

    // ── CRUD Hari Libur & Cuti Bersama (Desktop + Filter Tahun Custom) ──
    let desktopHolidaysCache = [];

    function populateDesktopHolidayYearSelect(rows) {
      const sel = $('desktopLiburYearFilter');
      if (!sel) return String(new Date().getFullYear());
      const curYear = String(new Date().getFullYear());
      const prevVal = sel.value;
      const years = new Set([String(Number(curYear) - 1), curYear, String(Number(curYear) + 1)]);
      (rows || []).forEach((h) => {
        const y = String(h.tanggal || '').slice(0, 4);
        if (/^\d{4}$/.test(y)) years.add(y);
      });
      const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
      const targetVal = prevVal && (prevVal === 'ALL' || sorted.includes(prevVal)) ? prevVal : curYear;
      sel.innerHTML = sorted.map((y) => `<option value="${y}">Tahun ${y}</option>`).join('') + '<option value="ALL">Semua Tahun</option>';
      sel.value = targetVal;
      if (window.StitchPicker && typeof window.StitchPicker.refreshSelect === 'function') {
        window.StitchPicker.refreshSelect('desktopLiburYearFilter');
      } else if (window.StitchPicker && typeof window.StitchPicker.enhanceSelect === 'function') {
        window.StitchPicker.enhanceSelect(sel);
      }
      return targetVal;
    }

    function renderDesktopHolidays() {
      const listEl = $('desktopHolidaysList');
      const badgeEl = $('desktopLiburCountBadge');
      if (!listEl) return;
      const selectedYear = populateDesktopHolidayYearSelect(desktopHolidaysCache);
      const filtered = (selectedYear && selectedYear !== 'ALL')
        ? desktopHolidaysCache.filter((h) => String(h.tanggal || '').startsWith(selectedYear))
        : desktopHolidaysCache;
      if (badgeEl) badgeEl.textContent = `${filtered.length} Hari`;
      if (!filtered.length) {
        listEl.innerHTML = `<div class="col-span-full py-6 text-center text-xs text-on-surface-variant">Belum ada hari libur untuk tahun ${selectedYear === 'ALL' ? 'terpilih' : escapeHtml(selectedYear)}.</div>`;
        return;
      }
      listEl.innerHTML = filtered.map((h) => `
        <div class="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-on-surface truncate">${escapeHtml(h.nama || 'Hari Libur')}</p>
            <p class="text-[11px] font-mono tabular-nums text-on-surface-variant mt-0.5">${escapeHtml(String(h.tanggal || '').slice(0, 10))}</p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" data-desk-edit-libur="${escapeHtml(String(h.tanggal || '').slice(0, 10))}" data-desk-edit-nama="${escapeHtml(h.nama || '')}" class="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-bold text-[11px] cursor-pointer">Edit</button>
            <button type="button" data-desk-del-libur="${escapeHtml(String(h.tanggal || '').slice(0, 10))}" class="px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 font-bold text-[11px] cursor-pointer">Hapus</button>
          </div>
        </div>
      `).join('');
    }

    async function loadDesktopHolidays() {
      const listEl = $('desktopHolidaysList');
      if (!listEl) return;
      try {
        const res = await fetch('/api/libur-list');
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error('Gagal memuat daftar hari libur.');
        desktopHolidaysCache = Array.isArray(json.data) ? json.data : (Array.isArray(json.rows) ? json.rows : []);
        renderDesktopHolidays();
      } catch (err) {
        listEl.innerHTML = `<div class="col-span-full py-6 text-center text-xs text-rose-600">${escapeHtml(err.message)}</div>`;
      }
    }

    $('desktopLiburYearFilter')?.addEventListener('change', renderDesktopHolidays);

    $('btnCancelDesktopLibur')?.addEventListener('click', () => {
      if ($('desktopLiburDate')) $('desktopLiburDate').value = '';
      if ($('desktopLiburName')) $('desktopLiburName').value = '';
      $('btnCancelDesktopLibur')?.classList.add('hidden');
    });

    $('btnSaveDesktopLibur')?.addEventListener('click', async () => {
      const tanggal = ($('desktopLiburDate')?.value || '').trim();
      const nama = ($('desktopLiburName')?.value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !nama) {
        notifyToast('warning', 'Data Belum Lengkap', 'Isi tanggal dan nama hari libur terlebih dahulu.');
        return;
      }
      try {
        const res = await fetch('/api/libur-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tanggal, nama })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
        notifyToast('success', 'Hari Libur Disimpan', `${tanggal} — ${nama}`);
        if ($('desktopLiburName')) $('desktopLiburName').value = '';
        $('btnCancelDesktopLibur')?.classList.add('hidden');
        const yearOfSaved = tanggal.slice(0, 4);
        if ($('desktopLiburYearFilter')) $('desktopLiburYearFilter').value = yearOfSaved;
        await loadDesktopHolidays();
      } catch (err) {
        notifyToast('error', 'Gagal Menyimpan Libur', err.message);
      }
    });

    $('desktopHolidaysList')?.addEventListener('click', async (ev) => {
      const editBtn = ev.target.closest('[data-desk-edit-libur]');
      if (editBtn) {
        const tgl = editBtn.getAttribute('data-desk-edit-libur') || '';
        const nama = editBtn.getAttribute('data-desk-edit-nama') || '';
        if ($('desktopLiburDate')) $('desktopLiburDate').value = tgl;
        if ($('desktopLiburName')) {
          $('desktopLiburName').value = nama;
          $('desktopLiburName').focus();
        }
        $('btnCancelDesktopLibur')?.classList.remove('hidden');
        return;
      }
      const delBtn = ev.target.closest('[data-desk-del-libur]');
      if (delBtn) {
        const tgl = delBtn.getAttribute('data-desk-del-libur') || '';
        if (!tgl || !confirm(`Hapus hari libur tanggal ${tgl}?`)) return;
        try {
          const res = await fetch('/api/libur-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tanggal: tgl })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
          notifyToast('success', 'Hari Libur Dihapus', `Tanggal ${tgl} telah dihapus.`);
          await loadDesktopHolidays();
        } catch (err) {
          notifyToast('error', 'Gagal Menghapus Libur', err.message);
        }
      }
    });

    loadDesktopHolidays();

    // Seamless auto-sync saat ada perubahan dari tab lain atau kembali ke tab ini
    if (window.StitchSync && typeof window.StitchSync.on === 'function') {
      window.StitchSync.on(['lokasi', 'instansi', 'config', 'admin', 'presensi'], (ev) => {
        if (!ev || !ev.remote) return; // aksi lokal sudah refresh langsung tanpa dobel request
        if (ev.scope === 'lokasi' || ev.scope === 'visibility') refreshLokasiList(locId || null);
        if ((ev.scope === 'instansi' || ev.scope === 'visibility') && typeof window._refreshAdminOpdList === 'function') {
          window._refreshAdminOpdList();
        }
      }, 300);
    }
  });
})();
