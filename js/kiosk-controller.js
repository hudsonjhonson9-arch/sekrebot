/**
 * Absensi v2 - Mode Kiosk Lobi / Terminal Meja Absen Controller (Live PostgreSQL)
 * Memuat data kehadiran nyata dari /api/stitch/bootstrap (dan /api/stitch/admin/monitoring-today
 * bila terotorisasi), telemetri sesi/jaringan/GPS nyata, serta pencatatan presensi ke /api/stitch/absen.
 */
(function () {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const AUDIO_STORAGE_KEY = 'kiosk_audio_muted';
  let officeCoords = '-9.648769,119.389232';
  let officeName = 'Kantor BAPPERIDA (Terminal Lobi)';
  let officeRadius = 250;
  let officeLat = null;
  let officeLon = null;
  let shiftMasuk = '07:30';
  let shiftPulang = '16:00';
  let gpsAccuracy = null;
  let gpsLat = null;
  let gpsLon = null;
  const sessionStartedAt = Date.now();

  try {
    window.__kioskAudioMuted = localStorage.getItem(AUDIO_STORAGE_KEY) === '1';
  } catch (_) {
    window.__kioskAudioMuted = false;
  }

  // Pastikan DynamicIsland.playHaptic juga menghormati status mute kiosk
  function hookDynamicIslandAudio() {
    const di = window.DynamicIsland;
    if (di && typeof di.playHaptic === 'function' && !di.__kioskAudioWrapped) {
      const origPlay = di.playHaptic.bind(di);
      di.playHaptic = function (type) {
        if (window.__kioskAudioMuted) return;
        return origPlay(type);
      };
      di.__kioskAudioWrapped = true;
    }
  }

  function playKioskBeep(type) {
    if (window.__kioskAudioMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(160, now + 0.08);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      }
      osc.onended = () => {
        try { ctx.close(); } catch (_) {}
      };
    } catch (_) {
      // Abaikan bila WebAudio diblokir browser
    }
  }

  function syncAudioButton() {
    const btn = document.getElementById('toggle-audio');
    const icon = document.getElementById('toggle-audio-icon') || btn?.querySelector('.material-symbols-outlined');
    const muted = Boolean(window.__kioskAudioMuted);
    if (icon) icon.textContent = muted ? 'volume_off' : 'volume_up';
    if (btn) {
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.setAttribute('title', muted ? 'Suara Pengingat Absensi: Nonaktif' : 'Suara Pengingat Absensi: Aktif');
    }
  }

  function showKioskToast(title, subtitle) {
    const toast = document.getElementById('toast-banner');
    const toastTitle = document.getElementById('toast-title');
    const toastDesc = document.getElementById('toast-desc');
    if (toast) {
      if (toastTitle) toastTitle.textContent = title;
      if (toastDesc) toastDesc.textContent = subtitle;
      toast.classList.remove('hidden');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.add('hidden'), 3800);
    } else if (typeof window.showDynamicIsland === 'function') {
      window.showDynamicIsland({ type: 'info', title, message: subtitle });
    }
  }

  function getTodayWitaStr() {
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  }

  function calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function formatDurationHMS(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  function updateNetworkTelemetry() {
    const online = navigator.onLine !== false;
    const badge = document.getElementById('kioskNetworkBadge');
    const telNet = document.getElementById('kioskTelNetwork');
    const footerHost = document.getElementById('kioskFooterHost');

    if (badge) {
      badge.textContent = online ? 'ONLINE' : 'OFFLINE';
      badge.className = online
        ? 'px-space-sm py-1 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-semibold'
        : 'px-space-sm py-1 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold';
    }
    if (telNet) {
      telNet.textContent = `${online ? 'ONLINE' : 'OFFLINE'} • Radius ${officeRadius}m`;
    }
    if (footerHost) {
      const host = window.location.host || 'Terminal Lokal';
      footerHost.textContent = `BAPPERIDA Kab. Sumba Barat • Host ${host} (${online ? 'Online' : 'Offline'})`;
    }
  }

  function updateGpsTelemetry() {
    const telGps = document.getElementById('kioskTelGps');
    const geoMeta = document.getElementById('kioskGeofenceMeta');
    const onlineLabel = navigator.onLine !== false ? 'Jaringan Terhubung' : 'Mode Offline';

    if (gpsAccuracy !== null) {
      const accRounded = Math.round(gpsAccuracy);
      if (telGps) telGps.textContent = `±${accRounded} meter`;
      if (geoMeta) {
        let distPart = '';
        if (gpsLat !== null && gpsLon !== null && officeLat !== null && officeLon !== null) {
          const dist = Math.round(calcDistanceMeters(gpsLat, gpsLon, officeLat, officeLon));
          distPart = ` • Jarak ${dist}m`;
        }
        geoMeta.textContent = `Presisi GPS ±${accRounded} meter${distPart} • ${onlineLabel}`;
      }
    } else {
      if (telGps) telGps.textContent = 'Titik Tetap Lobi';
      if (geoMeta) geoMeta.textContent = `Titik Terminal Lobi • ${onlineLabel}`;
    }
  }

  function initTelemetry() {
    const uptimeEl = document.getElementById('kioskSessionUptime');
    const tickUptime = () => {
      if (uptimeEl) {
        uptimeEl.textContent = `Uptime Sesi: ${formatDurationHMS(Date.now() - sessionStartedAt)}`;
      }
    };
    tickUptime();
    setInterval(tickUptime, 1000);

    updateNetworkTelemetry();
    window.addEventListener('online', () => {
      updateNetworkTelemetry();
      updateGpsTelemetry();
      loadKioskBootstrap();
    });
    window.addEventListener('offline', () => {
      updateNetworkTelemetry();
      updateGpsTelemetry();
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsAccuracy = pos.coords.accuracy;
          gpsLat = pos.coords.latitude;
          gpsLon = pos.coords.longitude;
          updateGpsTelemetry();
        },
        () => {
          gpsAccuracy = null;
          updateGpsTelemetry();
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
      );
    } else {
      updateGpsTelemetry();
    }
  }

  function renderFeedItem(log) {
    const nama = log.Nama || log.nama || 'Aparatur';
    const nip = log.NIP || log.nip || '-';
    const jam = log.Jam || log.jam || '--:--';
    const jenis = String(log['Jenis Absen'] || log.jenis || 'MASUK').toUpperCase();
    const isMasuk = jenis.includes('MASUK') || jenis === 'TERLAMBAT';
    const ini = nama.split(/\s+/).filter(p => !p.includes('.')).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'A';

    return `
      <div class="p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors flex items-center justify-between gap-space-sm">
        <div class="flex items-center gap-space-sm min-w-0">
          <div class="w-11 h-11 rounded-lg ${isMasuk ? 'bg-blue-600' : 'bg-emerald-600'} text-white font-bold flex items-center justify-center flex-shrink-0 text-sm">${esc(ini)}</div>
          <div class="flex flex-col min-w-0">
            <span class="font-title-md text-title-md font-bold text-on-surface truncate">${esc(nama)}</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant font-mono truncate">${esc(nip)}</span>
            <div class="flex items-center gap-1 text-secondary mt-0.5">
              <span class="material-symbols-outlined text-[14px]">verified</span>
              <span class="font-label-sm text-label-sm font-medium">${esc(log.Lokasi || 'Tercatat di PostgreSQL')}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col items-end flex-shrink-0">
          <span class="font-label-md text-label-md font-bold text-on-surface font-mono tabular-nums">${esc(jam)}</span>
          <span class="font-label-sm text-label-sm px-1.5 py-0.5 rounded ${isMasuk ? 'bg-secondary-container text-on-secondary-container' : 'bg-primary-fixed text-primary'} font-semibold">${isMasuk ? 'Masuk' : 'Pulang'}</span>
        </div>
      </div>
    `;
  }

  function renderEmptyFeed() {
    return `
      <div class="p-space-md rounded-xl bg-surface-container-low text-center flex flex-col items-center justify-center gap-1.5 text-on-surface-variant">
        <span class="material-symbols-outlined text-[24px] text-primary">event_available</span>
        <span class="font-body-sm text-body-sm">Belum ada presensi tercatat.</span>
      </div>
    `;
  }

  function updateStatElements(hadir, terlambat, sppd) {
    const elHadir = document.getElementById('kioskStatHadir');
    const elTerlambat = document.getElementById('kioskStatTerlambat');
    const elSppd = document.getElementById('kioskStatSppd');
    if (elHadir) elHadir.textContent = String(hadir);
    if (elTerlambat) elTerlambat.textContent = String(terlambat);
    if (elSppd) elSppd.textContent = String(sppd);
  }

  async function loadKioskBootstrap() {
    const t0 = performance.now();
    try {
      const res = await fetch('/api/stitch/bootstrap');
      const latencyMs = Math.round(performance.now() - t0);
      const latencyEl = document.getElementById('kioskLatencyBadge');
      if (latencyEl) latencyEl.textContent = `PING: ${latencyMs}ms`;

      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.ok) return;

      if (json.locations && json.locations[0]) {
        const l = json.locations[0];
        officeLat = Number(l.latitude);
        officeLon = Number(l.longitude);
        officeRadius = Number(l.radius) || 250;
        officeCoords = `${l.latitude},${l.longitude}`;
        officeName = `${l.nama_lokasi} (Terminal Lobi)`;

        const coordsEl = document.getElementById('kioskOfficeCoords');
        if (coordsEl && Number.isFinite(officeLat) && Number.isFinite(officeLon)) {
          coordsEl.innerHTML = `<span>LAT: ${esc(officeLat.toFixed(4))}</span><span>•</span><span>LON: ${esc(officeLon.toFixed(4))}</span>`;
        }
        const geoTitle = document.getElementById('kioskGeofenceTitle');
        if (geoTitle) geoTitle.textContent = `${l.nama_lokasi} (Radius ${officeRadius}m)`;

        const footerRadius = document.getElementById('kioskFooterRadius');
        if (footerRadius) footerRadius.textContent = `Radius Geofence: ${officeRadius} m`;

        updateNetworkTelemetry();
        updateGpsTelemetry();
      }

      if (json.shift) {
        shiftMasuk = String(json.shift.masuk || '07:30').slice(0, 5);
        shiftPulang = String(json.shift.pulang || '16:00').slice(0, 5);
        const shiftEl = document.getElementById('kioskShiftLabel');
        if (shiftEl) shiftEl.textContent = `SHIFT ${shiftMasuk} - ${shiftPulang}`;
      }

      const logs = json.recentLogs || [];
      const feedContainer = document.getElementById('kioskFeedList') || document.querySelector('.max-h-\\[460px\\]');
      if (feedContainer) {
        feedContainer.innerHTML = logs.length
          ? logs.slice(0, 12).map(renderFeedItem).join('')
          : renderEmptyFeed();
      }

      // Hitung metrik fallback dari feed hari ini (WITA)
      const todayWita = getTodayWitaStr();
      const todayLogs = logs.filter((l) => String(l.Tanggal || '').slice(0, 10) === todayWita);
      const hadirSet = new Set();
      const terlambatSet = new Set();
      const sppdSet = new Set();

      todayLogs.forEach((l) => {
        const key = String(l.NIP || l.nip || l.Nama || '').trim();
        const jenis = String(l['Jenis Absen'] || l.jenis || '').toUpperCase();
        const jam = String(l.Jam || l.jam || '').slice(0, 5);
        if (!key) return;
        if (jenis.includes('MASUK') || jenis === 'TERLAMBAT') {
          hadirSet.add(key);
          if (jenis === 'TERLAMBAT' || jenis === 'DI LUAR JAM MASUK' || (jam && jam > shiftMasuk)) {
            terlambatSet.add(key);
          }
        }
        if (/\b(SPPD|DL|DINAS)\b/i.test(jenis)) {
          sppdSet.add(key);
        }
      });

      let hadirCount = hadirSet.size;
      let terlambatCount = terlambatSet.size;
      let sppdCount = sppdSet.size;

      const syncEl = document.getElementById('kioskSyncStatus');
      if (syncEl) syncEl.textContent = `${todayLogs.length} catatan hari ini`;

      // Bila sesi memiliki token admin/pimpinan, sinkronkan angka monitoring lengkap
      const hasToken = typeof window.getStitchToken === 'function' && Boolean(window.getStitchToken());
      if (hasToken) {
        try {
          const monRes = await fetch('/api/stitch/admin/monitoring-today');
          if (monRes.ok) {
            const monJson = await monRes.json();
            if (monJson && monJson.ok) {
              const rows = Array.isArray(monJson.data) ? monJson.data : [];
              hadirCount = Number(monJson.summary?.hadir ?? hadirCount);
              const lateFromMon = rows.filter((r) => r.jamMasuk && r.jamMasuk !== '-' && String(r.jamMasuk).slice(0, 5) > shiftMasuk).length;
              const sppdFromMon = rows.filter((r) => /\b(SPPD|DL|DINAS)\b/i.test(String(r.statusText || ''))).length;
              terlambatCount = Math.max(terlambatCount, lateFromMon);
              sppdCount = Math.max(sppdCount, sppdFromMon);
            }
          }
        } catch (_) {
          // Non-admin atau offline: gunakan hitungan fallback dari feed
        }
      }

      updateStatElements(hadirCount, terlambatCount, sppdCount);
    } catch (e) {
      console.warn('[Kiosk] bootstrap gagal:', e.message);
      const syncEl = document.getElementById('kioskSyncStatus');
      if (syncEl) syncEl.textContent = 'Menunggu sinkronisasi';
    }
  }

  function openNipModal() {
    const modal = document.getElementById('nip-modal');
    const nipInput = document.getElementById('nip-input');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (nipInput) nipInput.focus();
    }
  }

  function closeNipModal() {
    const modal = document.getElementById('nip-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async function submitKioskAttendance(jenis, nipOverride) {
    const nipInput = document.getElementById('nip-input');
    const nip = String(nipOverride || nipInput?.value || localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || '').trim();
    if (!nip) {
      openNipModal();
      playKioskBeep('error');
      showKioskToast('Masukkan NIP Pegawai', 'Ketik 18 digit NIP Anda untuk mencatat presensi.');
      return;
    }

    try {
      const res = await fetch('/api/stitch/absen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nip,
          jenis,
          lokasi: officeName,
          koordinat: officeCoords,
          akurasi: gpsAccuracy !== null && gpsAccuracy <= 100 ? Math.round(gpsAccuracy) : 8,
          ket: 'Terminal Kiosk Lobi BAPPERIDA'
        })
      });
      const json = await res.json();
      if (!json.ok) {
        playKioskBeep('error');
        showKioskToast('Presensi Ditolak', json.message || 'Gagal mencatat presensi.');
        return;
      }

      closeNipModal();
      if (nipInput) nipInput.value = '';
      playKioskBeep('success');
      showKioskToast(`Presensi ${jenis} Tercatat`, `${json.record?.Nama || nip} • ${json.witaTime}`);
      await loadKioskBootstrap();
    } catch (err) {
      playKioskBeep('error');
      showKioskToast('Kesalahan Koneksi', err.message);
    }
  }

  function setupNavbarTabs() {
    const nav = document.querySelector('header nav');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('a[data-path]'));
    const activeClasses = (nav.dataset.activeClasses || 'bg-surface-container-highest text-primary font-semibold').split(/\s+/).filter(Boolean);
    const inactiveClasses = ['font-label-md', 'text-label-md', 'text-on-surface-variant', 'hover:text-on-surface', 'hover:bg-surface-container'];
    const sectionMap = {
      'kiosk-scanner': 'kiosk-scanner-section',
      'todays-roster': 'todays-roster-section',
      'terminal-diagnostics': 'terminal-diagnostics-section'
    };

    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const path = link.getAttribute('data-path') || '';

        links.forEach((other) => {
          other.removeAttribute('aria-current');
          other.classList.remove(...activeClasses);
          other.classList.add(...inactiveClasses);
        });
        link.setAttribute('aria-current', 'page');
        link.classList.remove(...inactiveClasses);
        link.classList.add(...activeClasses);

        if (path === 'manual-attendance') {
          openNipModal();
          return;
        }

        const targetId = sectionMap[path];
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('ring-2', 'ring-primary/40');
          setTimeout(() => target.classList.remove('ring-2', 'ring-primary/40'), 1400);
        }
      });
    });
  }

  function syncFullscreenButton() {
    const icon = document.getElementById('admin-pin-icon');
    const label = document.getElementById('admin-pin-label');
    const isFs = Boolean(document.fullscreenElement);
    if (icon) icon.textContent = isFs ? 'fullscreen_exit' : 'lock';
    if (label) label.textContent = isFs ? 'Keluar Layar Penuh' : 'Kunci Kiosk';
  }

  async function confirmDialog(opts) {
    if (typeof window.Swal !== 'undefined' && typeof window.Swal.fire === 'function') {
      return window.Swal.fire(opts);
    }
    if (window.DynamicIsland && typeof window.DynamicIsland.confirm === 'function') {
      return window.DynamicIsland.confirm(opts.title, opts.text, opts);
    }
    return { isConfirmed: window.confirm(`${opts.title}\n\n${opts.text}`) };
  }

  async function handleAdminPinLock() {
    const isFs = Boolean(document.fullscreenElement);
    if (!isFs) {
      const res = await confirmDialog({
        title: 'Aktifkan Mode Kunci Kiosk?',
        text: 'Terminal akan masuk ke mode layar penuh (Fullscreen) agar fokus untuk layanan presensi lobi.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Masuk Layar Penuh',
        cancelButtonText: 'Batal'
      });
      if (!res?.isConfirmed) return;
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        playKioskBeep('info');
        showKioskToast('Mode Kiosk Aktif', 'Tekan Esc atau tombol Keluar Layar Penuh untuk membuka.');
      } catch (err) {
        showKioskToast('Layar Penuh Ditolak', err.message || 'Browser memblokir mode layar penuh.');
      }
      return;
    }

    const res = await confirmDialog({
      title: 'Keluar dari Mode Kunci Kiosk?',
      text: 'Terminal akan keluar dari mode layar penuh.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Keluar Layar Penuh',
      cancelButtonText: 'Tetap Terkunci'
    });
    if (!res?.isConfirmed) return;
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      playKioskBeep('info');
    } catch (err) {
      showKioskToast('Gagal Keluar Layar Penuh', err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    hookDynamicIslandAudio();
    syncAudioButton();
    syncFullscreenButton();
    document.addEventListener('fullscreenchange', syncFullscreenButton);

    const camStatus = document.getElementById('kioskCameraStatus');
    const camRes = document.getElementById('kioskCameraRes');
    const video = document.getElementById('cameraVideo') || document.getElementById('kioskCamera') || document.querySelector('video');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && video) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then((stream) => {
          video.srcObject = stream;
          video.play().catch(() => {});
          const track = stream.getVideoTracks()[0];
          const s = track && typeof track.getSettings === 'function' ? track.getSettings() : {};
          if (camStatus) camStatus.textContent = 'Kamera Aktif';
          if (camRes) {
            const dims = s.width && s.height ? `${s.width}x${s.height}` : 'Stream Aktif';
            const fps = s.frameRate ? ` ${Math.round(s.frameRate)}fps` : '';
            camRes.textContent = `${dims}${fps}`;
          }
        })
        .catch(() => {
          if (camStatus) camStatus.textContent = 'Kamera Tidak Tersedia';
          if (camRes) camRes.textContent = 'Gunakan Input NIP';
          console.warn('[Kiosk] Kamera tidak tersedia.');
        });
    } else {
      if (camStatus) camStatus.textContent = 'Kamera Tidak Didukung';
      if (camRes) camRes.textContent = 'Mode NIP Manual';
    }

    initTelemetry();
    loadKioskBootstrap();
    setInterval(loadKioskBootstrap, 30000);

    setupNavbarTabs();

    const toggleAudioBtn = document.getElementById('toggle-audio');
    if (toggleAudioBtn) {
      toggleAudioBtn.addEventListener('click', () => {
        window.__kioskAudioMuted = !window.__kioskAudioMuted;
        try {
          localStorage.setItem(AUDIO_STORAGE_KEY, window.__kioskAudioMuted ? '1' : '0');
        } catch (_) {}
        syncAudioButton();
        if (!window.__kioskAudioMuted) {
          playKioskBeep('info');
        }
        showKioskToast(
          window.__kioskAudioMuted ? 'Suara Terminal Dibisukan' : 'Suara Terminal Aktif',
          window.__kioskAudioMuted ? 'Efek audio umpan balik dinonaktifkan' : 'Efek audio umpan balik diaktifkan'
        );
      });
    }

    const adminPinBtn = document.getElementById('admin-pin-btn');
    if (adminPinBtn) {
      adminPinBtn.addEventListener('click', handleAdminPinLock);
    }

    const bind = (id, jenis) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => submitKioskAttendance(jenis));
    };

    bind('btn-clockin', 'MASUK');
    bind('btn-clockout', 'PULANG');
    bind('modal-submit-in', 'MASUK');
    bind('modal-submit-out', 'PULANG');

    const keypadOkBtn = document.getElementById('keypad-ok') || Array.from(document.querySelectorAll('.keypad-btn')).find((b) => b.textContent.trim() === 'OK');
    const nipInput = document.getElementById('nip-input');
    const triggerKeypadSubmit = () => {
      const val = String(nipInput?.value || '').trim();
      if (!val) {
        playKioskBeep('error');
        showKioskToast('NIP Masih Kosong', 'Masukkan 18 digit NIP pegawai terlebih dahulu.');
        if (nipInput) nipInput.focus();
        return;
      }
      const modalIn = document.getElementById('modal-submit-in');
      if (modalIn) {
        modalIn.click();
      } else {
        submitKioskAttendance('MASUK', val);
      }
    };

    if (keypadOkBtn) {
      keypadOkBtn.addEventListener('click', triggerKeypadSubmit);
    }
    if (nipInput) {
      nipInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerKeypadSubmit();
        }
      });
    }
  });
})();
