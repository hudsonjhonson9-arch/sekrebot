/**
 * Absensi v2 - Mode Kiosk Lobi / Terminal Meja Absen Controller (Live PostgreSQL)
 * Menggantikan simulasi interval palsu dengan data kehadiran nyata dari /api/stitch/bootstrap
 * dan pencatatan presensi nyata ke /api/stitch/absen.
 */
(function () {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  let officeCoords = '-9.648769,119.389232';
  let officeName = 'Kantor BAPPERIDA (Terminal Lobi)';

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

  async function loadKioskBootstrap() {
    try {
      const res = await fetch('/api/stitch/bootstrap');
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.ok) return;

      if (json.locations && json.locations[0]) {
        const l = json.locations[0];
        officeCoords = `${l.latitude},${l.longitude}`;
        officeName = `${l.nama_lokasi} (Terminal Lobi)`;
      }

      const logs = json.recentLogs || [];
      const feedContainer = document.querySelector('.max-h-\\[460px\\]');
      if (feedContainer && logs.length) {
        feedContainer.innerHTML = logs.slice(0, 12).map(renderFeedItem).join('');
      }
    } catch (e) {
      console.warn('[Kiosk] bootstrap gagal:', e.message);
    }
  }

  async function submitKioskAttendance(jenis, nipOverride) {
    const nipInput = document.getElementById('nip-input');
    const nip = String(nipOverride || nipInput?.value || localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || '').trim();
    if (!nip) {
      const modal = document.getElementById('nip-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        if (nipInput) nipInput.focus();
      }
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
          akurasi: 8,
          ket: 'Terminal Kiosk Lobi BAPPERIDA'
        })
      });
      const json = await res.json();
      if (!json.ok) {
        showKioskToast('Presensi Ditolak', json.message || 'Gagal mencatat presensi.');
        return;
      }

      const modal = document.getElementById('nip-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
      if (nipInput) nipInput.value = '';

      showKioskToast(`Presensi ${jenis} Tercatat`, `${json.record?.Nama || nip} • ${json.witaTime}`);
      await loadKioskBootstrap();
    } catch (err) {
      showKioskToast('Kesalahan Koneksi', err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const video = document.getElementById('cameraVideo') || document.getElementById('kioskCamera') || document.querySelector('video');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && video) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => { video.srcObject = stream; video.play().catch(() => {}); })
        .catch(() => console.warn('[Kiosk] Kamera tidak tersedia.'));
    }

    loadKioskBootstrap();

    const bind = (id, jenis) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      // Clone untuk menghapus listener mock lama di kiosk.html
      const clean = btn.cloneNode(true);
      btn.parentNode.replaceChild(clean, btn);
      clean.addEventListener('click', () => submitKioskAttendance(jenis));
    };

    bind('btn-clockin', 'MASUK');
    bind('btn-clockout', 'PULANG');
    bind('modal-submit-in', 'MASUK');
    bind('modal-submit-out', 'PULANG');
  });
})();
