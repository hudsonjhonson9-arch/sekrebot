/* ==== AUTO-ABSEN MASUK SAAT LOGIN BERVERIFIKASI WAJAH ==== */
(function (root, factory) {
  const api = factory();
  if (typeof window !== 'undefined') {
    window.AutoAbsenLogin = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.AutoAbsenLogin = api;
  }
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NOTICE_STORAGE_KEY = 'stitch_auto_absen_notice';

  function normalizeDateStr(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return Number.isNaN(val.getTime()) ? '' : val.toISOString().slice(0, 10);
    }
    return String(val).trim().slice(0, 10);
  }

  function getWitaDateInfo(nowMs = Date.now()) {
    const nowWita = new Date(nowMs + 8 * 3600000);
    return {
      todayWita: nowWita.toISOString().slice(0, 10),
      witaDayOfWeek: nowWita.getUTCDay()
    };
  }

  function shouldAttemptAutoAbsen({ todayStatus, witaDayOfWeek, todayWita, holidays, autoEnabled } = {}) {
    if (autoEnabled === false) {
      return { ok: false, reason: 'disabled' };
    }
    if (witaDayOfWeek === 0 || witaDayOfWeek === 6) {
      return { ok: false, reason: 'weekend' };
    }
    const targetDate = normalizeDateStr(todayWita);
    if (targetDate && Array.isArray(holidays)) {
      const isHoliday = holidays.some((h) => {
        const raw = (h && typeof h === 'object') ? (h.tanggal || h.date || '') : h;
        return normalizeDateStr(raw) === targetDate;
      });
      if (isHoliday) {
        return { ok: false, reason: 'holiday' };
      }
    }
    if (todayStatus !== 'BELUM_ABSEN') {
      return { ok: false, reason: 'already_recorded' };
    }
    return { ok: true };
  }

  function saveNotice(payload) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (_) {}
  }

  function getCurrentCoordinates() {
    return new Promise((resolve) => {
      try {
        if (
          typeof navigator === 'undefined' ||
          !navigator.geolocation ||
          typeof navigator.geolocation.getCurrentPosition !== 'function'
        ) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos && pos.coords && pos.coords.latitude);
            const lng = Number(pos && pos.coords && pos.coords.longitude);
            const accuracy = Number(pos && pos.coords && pos.coords.accuracy);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              resolve(null);
              return;
            }
            resolve({
              lat,
              lng,
              accuracy: Number.isFinite(accuracy) ? accuracy : 0
            });
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
        );
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function tryAutoAbsenAfterFaceLogin({ nip, token, autoEnabled = true } = {}) {
    try {
      if (autoEnabled === false) {
        return { attempted: false, reason: 'disabled' };
      }
      const cleanNip = String(nip || '').trim();
      const cleanToken = String(token || '').trim();
      if (!cleanNip || !cleanToken) {
        return { attempted: false, reason: 'missing_credentials' };
      }

      const { todayWita, witaDayOfWeek } = getWitaDateInfo();
      const headers = { Authorization: 'Bearer ' + cleanToken };

      const [userRes, bootRes] = await Promise.all([
        fetch('/api/stitch/user-data?nip=' + encodeURIComponent(cleanNip), { headers }),
        fetch('/api/stitch/bootstrap', { headers })
      ]);

      if (!userRes || !userRes.ok) {
        return { attempted: false, reason: 'user_data_unavailable' };
      }
      if (!bootRes || !bootRes.ok) {
        return { attempted: false, reason: 'bootstrap_unavailable' };
      }

      const [userJson, bootJson] = await Promise.all([
        userRes.json().catch(() => null),
        bootRes.json().catch(() => null)
      ]);

      if (!userJson || !userJson.ok) {
        return { attempted: false, reason: 'user_data_unavailable' };
      }
      if (!bootJson || !bootJson.ok) {
        return { attempted: false, reason: 'bootstrap_unavailable' };
      }

      const decision = shouldAttemptAutoAbsen({
        todayStatus: userJson.today && userJson.today.status ? userJson.today.status : '',
        witaDayOfWeek,
        todayWita,
        holidays: Array.isArray(bootJson.holidays) ? bootJson.holidays : [],
        autoEnabled
      });

      if (!decision.ok) {
        return { attempted: false, reason: decision.reason };
      }

      const coords = await getCurrentCoordinates();
      if (!coords) {
        saveNotice({
          status: 'skipped_gps',
          message: 'Login berhasil. Aktifkan GPS untuk mencatat presensi masuk.'
        });
        return { attempted: false, reason: 'gps_unavailable' };
      }

      const absenRes = await fetch('/api/stitch/absen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cleanToken
        },
        body: JSON.stringify({
          nip: cleanNip,
          jenis: 'MASUK',
          koordinat: `${coords.lat},${coords.lng}`,
          akurasi: Math.round(coords.accuracy || 0),
          ket: 'Auto-presensi saat verifikasi wajah login'
        })
      });

      const absenJson = await absenRes.json().catch(() => ({}));

      if (absenRes.ok) {
        saveNotice({
          status: 'success',
          witaTime: absenJson.witaTime || '',
          lokasi: (absenJson.record && absenJson.record.Lokasi) || ''
        });
        return { attempted: true, ok: true, witaTime: absenJson.witaTime || '' };
      }

      if (absenRes.status === 409) {
        return { attempted: true, ok: false, status: 409, reason: 'already_recorded' };
      }

      if (absenRes.status === 403 || absenRes.status === 400) {
        saveNotice({
          status: 'skipped_policy',
          message: absenJson.message || 'Di luar radius lokasi presensi.'
        });
        return { attempted: true, ok: false, status: absenRes.status };
      }

      return { attempted: true, ok: false, status: absenRes.status };
    } catch (_) {
      return { attempted: false, reason: 'unexpected_error' };
    }
  }

  function consumeAutoAbsenNotice() {
    try {
      if (typeof sessionStorage === 'undefined') return false;
      const raw = sessionStorage.getItem(NOTICE_STORAGE_KEY);
      if (!raw) return false;
      sessionStorage.removeItem(NOTICE_STORAGE_KEY);

      let notice = null;
      try {
        notice = JSON.parse(raw);
      } catch (_) {
        return false;
      }
      if (!notice || !notice.status) return false;

      let type = 'info';
      let title = '';
      let message = '';

      if (notice.status === 'success') {
        type = 'success';
        title = notice.witaTime
          ? `Login & Presensi Masuk Berhasil (${notice.witaTime})`
          : 'Login & Presensi Masuk Berhasil';
        message = notice.lokasi ? `Lokasi: ${notice.lokasi}` : 'Presensi masuk tercatat otomatis.';
      } else if (notice.status === 'skipped_gps') {
        type = 'info';
        title = 'Info Presensi Masuk';
        message = notice.message || 'Login berhasil. Aktifkan GPS untuk mencatat presensi masuk.';
      } else if (notice.status === 'skipped_policy') {
        type = 'warning';
        title = 'Presensi Otomatis Dilewati';
        message = notice.message || 'Di luar radius lokasi presensi.';
      } else {
        return false;
      }

      if (typeof window !== 'undefined') {
        if (typeof window.showDynamicIsland === 'function') {
          window.showDynamicIsland({ type, title, message, duration: 5000 });
        } else if (window.Swal && typeof window.Swal.fire === 'function') {
          window.Swal.fire({
            toast: true,
            position: 'top',
            icon: type,
            title,
            text: message,
            showConfirmButton: false,
            timer: 5000
          });
        } else if (window.DynamicIsland && typeof window.DynamicIsland.show === 'function') {
          window.DynamicIsland.show({ type, title, message, duration: 5000 });
        }
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    tryAutoAbsenAfterFaceLogin,
    consumeAutoAbsenNotice,
    shouldAttemptAutoAbsen
  };
});
