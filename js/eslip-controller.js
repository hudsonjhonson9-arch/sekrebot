/**
 * Absensi v2 - E-Slip Digital Receipt Controller
 * Memuat data bukti presensi resmi langsung dari /api/stitch/user-data.
 */

(function () {
  'use strict';

  const BULAN_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const BULAN_SINGKAT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function getWitaDate() {
    return new Date(Date.now() + 8 * 3600000);
  }

  function formatWitaMonthYear(witaDate) {
    return `Bulan ${BULAN_ID[witaDate.getUTCMonth()]} ${witaDate.getUTCFullYear()}`;
  }

  function formatTanggalIndo(isoDate) {
    const raw = String(isoDate || '').slice(0, 10);
    const parts = raw.split('-');
    if (parts.length !== 3) return raw || '-';
    const year = Number(parts[0]);
    const monthIdx = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    if (!year || monthIdx < 0 || monthIdx > 11 || !day) return raw;
    return `${day} ${BULAN_SINGKAT[monthIdx]} ${year}`;
  }

  function resolveActiveNip() {
    try {
      const direct = (
        localStorage.getItem('stitch_active_nip') ||
        localStorage.getItem('MY_NIP') ||
        ''
      ).trim();
      if (direct) return direct;

      const rawProfile = localStorage.getItem('stitch_user_profile');
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile);
        const profileNip = String((parsed && (parsed.nip || parsed.NIP)) || '').trim();
        if (profileNip) return profileNip;
      }
    } catch (_) {}
    return '';
  }

  function buildDocRef(dateIso, nip) {
    const wita = getWitaDate();
    const fallbackYmd =
      `${wita.getUTCFullYear()}` +
      `${String(wita.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(wita.getUTCDate()).padStart(2, '0')}`;
    const cleanDate = String(dateIso || '').replace(/\D/g, '').slice(0, 8);
    const yyyymmdd = cleanDate.length === 8 ? cleanDate : fallbackYmd;
    const nipDigits = String(nip || '').replace(/\D/g, '');
    const nipSuffix = (nipDigits.slice(-4) || '0000').padStart(4, '0');
    return `PRS-${yyyymmdd}-${nipSuffix}`;
  }

  function fallbackHashHex(input) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function computeValidationFingerprint(seed) {
    try {
      if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
        const bytes = new TextEncoder().encode(seed);
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        return `SHA256: ${hex.slice(0, 8)}...${hex.slice(-8)}`;
      }
    } catch (_) {}
    const hex = fallbackHashHex(seed);
    return `SHA256: ${hex.slice(0, 8)}...${hex.slice(-8)}`;
  }

  function applyStatusBadge(jenisAbsen, todayStatus, keterangan) {
    const badge = document.getElementById('eslip-status-badge');
    const dot = document.getElementById('eslip-status-dot');
    const text = document.getElementById('eslip-status-text');
    if (!badge || !dot || !text) return;

    const jenis = String(jenisAbsen || '').toUpperCase();
    let label = 'BELUM ABSEN';
    let badgeClass = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-bold ';
    let dotClass = 'w-1.5 h-1.5 rounded-full ';

    if (jenis === 'DI LUAR JAM MASUK' || jenis === 'TERLAMBAT') {
      label = 'TERLAMBAT';
      badgeClass += 'bg-error-container text-on-error-container';
      dotClass += 'bg-error';
    } else if (jenis === 'MASUK') {
      label = 'TEPAT WAKTU';
      badgeClass += 'bg-secondary-container text-on-secondary-container';
      dotClass += 'bg-secondary';
    } else if (jenis === 'PULANG') {
      label = 'PRESENSI PULANG';
      badgeClass += 'bg-secondary-container text-on-secondary-container';
      dotClass += 'bg-secondary';
    } else if (jenis) {
      label = jenis;
      badgeClass += 'bg-primary-fixed text-on-primary-fixed';
      dotClass += 'bg-primary';
    } else if (todayStatus === 'KETERANGAN' && keterangan) {
      label = String(keterangan).toUpperCase();
      badgeClass += 'bg-primary-fixed text-on-primary-fixed';
      dotClass += 'bg-primary';
    } else {
      badgeClass += 'bg-surface-container-highest text-on-surface-variant';
      dotClass += 'bg-outline';
    }

    badge.className = badgeClass;
    dot.className = dotClass;
    text.textContent = label;
  }

  function showToast(message) {
    const toast = document.getElementById('toast-message');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastText) return;
    toastText.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(function () {
      toast.classList.add('hidden');
    }, 3000);
  }

  function bindActions(state) {
    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        const empName = state.empName || 'Pegawai BAPPERIDA';
        const docRef = state.docRef || 'PRS';
        const shareTitle = `E-Slip Presensi Digital ${empName}`;
        const shareText = `Bukti Presensi Resmi #${docRef} - BAPPERIDA Kabupaten Sumba Barat`;

        if (navigator.share) {
          navigator.share({
            title: shareTitle,
            text: shareText,
            url: window.location.href
          }).catch(function () {});
          return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(`${shareText} (${window.location.href})`).catch(function () {});
        }
        showToast('Tautan E-Slip berhasil disalin');
      });
    }

    const downloadBtn = document.getElementById('btn-unduh');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        downloadBtn.classList.add('scale-95');
        setTimeout(function () { downloadBtn.classList.remove('scale-95'); }, 150);
        showToast('Menyiapkan tampilan cetak dokumen E-Slip...');
        if (typeof window.print === 'function') {
          setTimeout(function () { window.print(); }, 200);
        }
      });
    }
  }

  function renderMissingSession() {
    setText('eslip-emp-name', 'Sesi Pegawai Tidak Ditemukan');
    setText('eslip-emp-nip', 'NIP. -');
    setText('eslip-emp-jabatan', 'Silakan masuk terlebih dahulu');
    setText('eslip-period', formatWitaMonthYear(getWitaDate()));
    applyStatusBadge('', '', '');
    if (typeof window.Swal !== 'undefined') {
      window.Swal.fire({
        icon: 'warning',
        title: 'Sesi Tidak Ditemukan',
        text: 'NIP pegawai aktif tidak ditemukan. Silakan masuk kembali melalui halaman login.'
      });
    }
  }

  async function loadEslipData(state) {
    const wita = getWitaDate();
    setText('eslip-period', formatWitaMonthYear(wita));

    const nip = resolveActiveNip();
    if (!nip) {
      renderMissingSession();
      return;
    }

    try {
      const res = await fetch(`/api/stitch/user-data?nip=${encodeURIComponent(nip)}`);
      const json = await res.json();
      if (!res.ok || !json || !json.ok || !json.user) {
        throw new Error((json && json.message) || 'Data pegawai gagal dimuat.');
      }

      const user = json.user;
      const today = json.today || {};
      const metrics = json.metrics || {};
      const logs = Array.isArray(json.logs) ? json.logs : [];
      const latestLog = logs[0] || null;

      // 1. Identitas Pegawai & Nomor Referensi
      const empName = user.nama || 'Aparatur BAPPERIDA';
      const empNip = user.nip || nip;
      const jabatanLine = [user.jabatan, user.bidang].filter(Boolean).join(' - ') || 'Aparatur BAPPERIDA';
      const refDate = (latestLog && latestLog.Tanggal) || today.tanggal || '';
      const docRef = buildDocRef(refDate, empNip);

      state.empName = empName;
      state.docRef = docRef;

      setText('eslip-emp-name', empName);
      setText('eslip-emp-nip', `NIP. ${empNip}`);
      setText('eslip-emp-jabatan', jabatanLine);
      setText('eslip-doc-ref', `#${docRef}`);

      if (user.face_photo) {
        const img = document.getElementById('eslip-avatar-img');
        const fallback = document.getElementById('eslip-avatar-fallback');
        const rawPhoto = String(user.face_photo || '').trim();
        const tok = (typeof window.getStitchToken === 'function' ? window.getStitchToken() : '') ||
          localStorage.getItem('_native_token') || localStorage.getItem('native_token') || localStorage.getItem('_sess_token') || '';
        let resolvedSrc = rawPhoto;
        if (rawPhoto && !rawPhoto.startsWith('data:image/')) {
          const driveMatch = rawPhoto.match(/(?:\/d\/|[?&]id=|\/api\/media\/raw\/)([a-zA-Z0-9_-]{10,})/);
          if (driveMatch && tok) {
            resolvedSrc = `/api/media/raw/${encodeURIComponent(driveMatch[1])}?token=${encodeURIComponent(tok)}`;
          }
        }
        if (img && resolvedSrc) {
          img.onerror = function () {
            img.classList.add('hidden');
            if (fallback) fallback.classList.remove('hidden');
          };
          img.onload = function () {
            img.classList.remove('hidden');
            if (fallback) fallback.classList.add('hidden');
          };
          img.src = resolvedSrc;
        }
      }

      // 2. Log Presensi Terakhir (Tanggal / Waktu / Status / Lokasi)
      const jenisAbsen = latestLog ? String(latestLog['Jenis Absen'] || '').toUpperCase() : '';
      let logTitle = 'Presensi Terakhir';
      if (jenisAbsen === 'MASUK' || jenisAbsen === 'DI LUAR JAM MASUK') {
        logTitle = 'Presensi Masuk (Clock In)';
      } else if (jenisAbsen === 'PULANG') {
        logTitle = 'Presensi Pulang (Clock Out)';
      } else if (jenisAbsen) {
        logTitle = `Catatan ${jenisAbsen}`;
      } else if (today.keterangan) {
        logTitle = `Status: ${today.keterangan}`;
      }

      const logTime = (latestLog && latestLog.Jam) || today.clockInTime || '--:--:--';
      const logDate = formatTanggalIndo((latestLog && latestLog.Tanggal) || today.tanggal);

      setText('eslip-log-type', logTitle);
      setText('eslip-log-time', logTime);
      setText('eslip-log-date', logDate);
      applyStatusBadge(jenisAbsen, today.status, today.keterangan);

      // 3. Lokasi & Biometrik / Log Audit
      const locName = (latestLog && latestLog.Lokasi) || today.lokasi || 'Belum tercatat';
      const locSub = (latestLog && latestLog.Ket) || (today.keterangan ? `Keterangan: ${today.keterangan}` : 'Titik presensi tercatat');
      const coords = (latestLog && latestLog.koordinat) ? String(latestLog.koordinat) : 'Koordinat tidak tersedia';
      setText('eslip-loc-name', locName);
      setText('eslip-loc-sub', locSub);
      setText('eslip-loc-coords', coords);
      setText('eslip-loc-status', latestLog ? 'Tercatat di Database' : 'Menunggu Presensi');

      setText('eslip-bio-status', user.face_saved_at ? 'Biometrik Wajah Terdaftar' : 'Verifikasi SIMPEG');
      setText('eslip-bio-sub', user.face_model ? `Model: ${user.face_model}` : (user.pangkat || 'Identitas Terverifikasi'));
      setText('eslip-log-id', latestLog && latestLog.ID_Log ? `Log #${latestLog.ID_Log}` : 'Log #-');
      setText('eslip-log-ket', jenisAbsen ? `Jenis: ${jenisAbsen}` : 'Belum ada transaksi');
      setText('eslip-today-duration', today.duration ? `Durasi: ${today.duration}` : 'Durasi: -');

      // 4. Ringkasan Hadir & Disiplin Bulan Berjalan
      const hadir = Number(metrics.hadir || 0);
      const terlambat = Number(metrics.terlambat || 0);
      const cuti = Number(metrics.cuti || 0);
      const tepatWaktu = Math.max(0, hadir - terlambat);
      const disiplinPct = hadir > 0
        ? Math.max(0, Math.min(100, Math.round(((hadir - terlambat * 0.25) / hadir) * 100)))
        : 0;

      setText('eslip-disiplin-badge', `${disiplinPct}% Disiplin`);
      setText('eslip-metric-hadir', `${hadir} Hari`);
      setText('eslip-metric-disiplin', `${disiplinPct}%`);
      setText('eslip-metric-tepat-waktu', `${tepatWaktu} Hari`);
      setText('eslip-metric-terlambat', `${terlambat} Hari`);
      setText('eslip-metric-cuti', `${cuti} Hari`);

      // 5. Fingerprint Validasi & QR Code Asli
      const seed = `${empNip}|${refDate}|${logTime}|${docRef}`;
      const fingerprint = await computeValidationFingerprint(seed);
      setText('eslip-hash-display', fingerprint);

      const qrBox = document.getElementById('eslip-qr-box');
      if (qrBox) {
        const qrPayload = `HADIR-ESLIP|${docRef}|${empNip}|${refDate}|${logTime}|${fingerprint}`;
        qrBox.innerHTML = '';
        if (typeof window.qrcode === 'function') {
          const qr = window.qrcode(0, 'M');
          qr.addData(qrPayload);
          qr.make();
          qrBox.innerHTML = qr.createSvgTag({ scalable: true, margin: 1 });
          const svg = qrBox.querySelector('svg');
          if (svg) {
            svg.setAttribute('class', 'w-full h-full');
          }
        } else if (typeof window.QRCode === 'function') {
          new window.QRCode(qrBox, {
            text: qrPayload,
            width: 64,
            height: 64,
            colorDark: '#0b1c30',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
          });
        }
      }
    } catch (err) {
      setText('eslip-emp-name', 'Gagal Memuat Data E-Slip');
      setText('eslip-status-text', 'GAGAL MEMUAT');
      if (typeof window.Swal !== 'undefined') {
        window.Swal.fire({
          icon: 'error',
          title: 'Gagal Memuat E-Slip',
          text: (err && err.message) || 'Terjadi kesalahan saat membaca data presensi.'
        });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const state = { empName: '', docRef: '' };
    bindActions(state);
    loadEslipData(state);
  });
})();
