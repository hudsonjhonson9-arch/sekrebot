/**
 * Controller halaman Portal Desktop Profil & Biometrik (profil.html).
 * Memuat identitas pegawai, foto wajah AI (Human.js), spesimen TTD,
 * jadwal kerja, dan kalender hari libur langsung dari API PostgreSQL.
 */
(function () {
  'use strict';

  let currentUser = null;

  function getActiveNip() {
    try {
      return (localStorage.getItem('stitch_active_nip') || localStorage.getItem('MY_NIP') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getAuthToken() {
    if (typeof window.getStitchToken === 'function' && window.getStitchToken()) return window.getStitchToken();
    try {
      return localStorage.getItem('_native_token') || localStorage.getItem('native_token') || localStorage.getItem('_sess_token') || '';
    } catch (_) {
      return '';
    }
  }

  function resolveBioImageSrc(raw) {
    const s = String(raw ?? '').trim();
    if (!s || s === 'null' || s === 'undefined') return '';
    if (s.startsWith('data:image')) return s;
    const m = s.match(/\/file\/d\/([-\w]{5,200})/) || s.match(/[?&]id=([-\w]{5,200})/);
    if (m && m[1]) {
      const tok = getAuthToken();
      const q = tok ? ('?token=' + encodeURIComponent(tok)) : '';
      return '/api/media/raw/' + encodeURIComponent(m[1]) + q;
    }
    if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
    return '';
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function formatSavedDate(raw) {
    if (!raw) return 'Belum pernah didaftarkan';
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return 'Terakhir diperbarui: ' + d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return String(raw);
    }
  }

  function renderIdentityAndBiometrics() {
    const u = currentUser;
    if (!u) return;

    const parts = (u.nama || 'ASN').trim().split(/\s+/);
    const ini = (parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0][0] || 'A')).toUpperCase();

    setText('dpInitials', ini);
    setText('dpName', u.nama || 'Pegawai');
    setText('dpNip', 'NIP. ' + (u.nip || '-'));
    setText('dpJabatan', [u.jabatan || 'Aparatur', u.bidang || ''].filter(Boolean).join(' • '));
    setText('dpPangkat', u.pangkat || u.golongan || 'ASN / PPPK');
    setText('dpRole', String(u.role || 'USER').replace(/_/g, ' '));

    let descLen = 0;
    try {
      const hist = typeof u.face_histogram === 'string' ? JSON.parse(u.face_histogram) : u.face_histogram;
      if (Array.isArray(hist)) descLen = hist.length;
    } catch (_) {}

    const faceSrc = resolveBioImageSrc(u.face_photo);
    const hasFace = Boolean(faceSrc || descLen >= 128);
    const isHuman = u.face_model === 'human' || descLen >= 512;

    const faceImg = document.getElementById('dpFaceImg');
    const faceIcon = document.getElementById('dpFaceIcon');
    const faceStatus = document.getElementById('dpFaceStatus');
    const avatarWrap = document.getElementById('dpAvatarWrap');

    if (hasFace) {
      if (faceStatus) {
        faceStatus.textContent = isHuman ? 'Terdaftar (Human AI Aktif)' : 'Format Lama — Disarankan Daftar Ulang';
        faceStatus.className = isHuman
          ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5'
          : 'text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5';
      }
      setText('dpFaceSavedAt', formatSavedDate(u.face_saved_at));
      setText('dpBtnFaceLabel', 'Perbarui Wajah AI');

      if (faceImg && faceSrc) {
        faceImg.onload = () => {
          faceImg.classList.remove('hidden');
          if (faceIcon) faceIcon.classList.add('hidden');
        };
        faceImg.onerror = () => {
          faceImg.classList.add('hidden');
          faceImg.removeAttribute('src');
          if (faceIcon) faceIcon.classList.remove('hidden');
        };
        faceImg.src = faceSrc;
      }

      if (avatarWrap && faceSrc) {
        const av = document.createElement('img');
        av.className = 'w-full h-full object-cover';
        av.alt = u.nama || 'Avatar';
        av.onload = () => {
          avatarWrap.innerHTML = '';
          avatarWrap.appendChild(av);
        };
        av.onerror = () => {
          avatarWrap.innerHTML = `<span id="dpInitials">${ini}</span>`;
        };
        av.src = faceSrc;
      }
    } else {
      if (faceImg) { faceImg.classList.add('hidden'); faceImg.removeAttribute('src'); }
      if (faceIcon) faceIcon.classList.remove('hidden');
      if (faceStatus) {
        faceStatus.textContent = 'Belum terdaftar';
        faceStatus.className = 'text-xs font-semibold text-slate-400 mt-0.5';
      }
      setText('dpFaceSavedAt', 'Belum ada data biometrik wajah');
      setText('dpBtnFaceLabel', 'Daftarkan Wajah AI');
    }

    const rawSig = u.signature || (function () { try { return localStorage.getItem('sig_' + u.nip); } catch (_) { return null; } })();
    const sigSrc = resolveBioImageSrc(rawSig);
    const sigImg = document.getElementById('dpSigImg');
    const sigIcon = document.getElementById('dpSigIcon');
    const sigStatus = document.getElementById('dpSigStatus');

    if (rawSig && sigSrc) {
      if (sigStatus) {
        sigStatus.textContent = 'Tersimpan di Database';
        sigStatus.className = 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5';
      }
      setText('dpBtnSigLabel', 'Perbarui Tanda Tangan');
      if (sigImg) {
        sigImg.onload = () => {
          sigImg.classList.remove('hidden');
          if (sigIcon) sigIcon.classList.add('hidden');
        };
        sigImg.onerror = () => {
          sigImg.classList.add('hidden');
          sigImg.removeAttribute('src');
          if (sigIcon) sigIcon.classList.remove('hidden');
        };
        sigImg.src = sigSrc;
      }
    } else {
      if (sigImg) { sigImg.classList.add('hidden'); sigImg.removeAttribute('src'); }
      if (sigIcon) sigIcon.classList.remove('hidden');
      if (sigStatus) {
        sigStatus.textContent = 'Belum dibuat';
        sigStatus.className = 'text-xs font-semibold text-slate-400 mt-0.5';
      }
      setText('dpBtnSigLabel', 'Buat Tanda Tangan');
    }
  }

  let allHolidaysCache = [];

  function populateProfilYearSelect(rows) {
    const sel = document.getElementById('dpHolidayYear');
    if (!sel) return String(new Date().getFullYear());
    const curYear = String(new Date().getFullYear());
    const prevVal = sel.value;
    const years = new Set([String(Number(curYear) - 1), curYear, String(Number(curYear) + 1)]);
    (rows || []).forEach((h) => {
      const y = String(h.tanggal || h.Tanggal || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    });
    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    const targetVal = prevVal && (prevVal === 'ALL' || sorted.includes(prevVal)) ? prevVal : curYear;
    sel.innerHTML = sorted.map((y) => `<option value="${y}">Tahun ${y}</option>`).join('') + '<option value="ALL">Semua Tahun</option>';
    sel.value = targetVal;
    if (window.StitchPicker) {
      if (typeof window.StitchPicker.enhanceSelect === 'function') {
        window.StitchPicker.enhanceSelect('dpHolidayYear', { searchable: false });
      }
      if (typeof window.StitchPicker.refreshSelect === 'function') {
        window.StitchPicker.refreshSelect('dpHolidayYear');
      }
    }
    if (!sel._bound) {
      sel._bound = true;
      sel.addEventListener('change', () => renderHolidays(allHolidaysCache));
    }
    return targetVal;
  }

  function renderHolidays(rows) {
    allHolidaysCache = Array.isArray(rows) ? rows : [];
    const listEl = document.getElementById('dpHolidaysList');
    const selectedYear = populateProfilYearSelect(allHolidaysCache);
    const list = (selectedYear && selectedYear !== 'ALL')
      ? allHolidaysCache.filter((h) => String(h.tanggal || h.Tanggal || '').startsWith(selectedYear))
      : allHolidaysCache;
    setText('dpHolidayCount', `${list.length} Hari`);
    if (!listEl) return;
    if (!list.length) {
      listEl.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">Belum ada jadwal hari libur untuk tahun ${selectedYear === 'ALL' ? 'terpilih' : selectedYear}.</div>`;
      return;
    }
    listEl.innerHTML = list.slice(0, 50).map((h) => {
      const tgl = h.tanggal || h.Tanggal || '-';
      const ket = h.keterangan || h.Keterangan || h.nama || 'Hari Libur';
      return `
        <div class="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs">
          <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">${String(ket).replace(/[<>&]/g, '')}</span>
          <span class="font-mono tabular-nums text-[11px] font-bold text-rose-600 dark:text-rose-400 shrink-0">${String(tgl).slice(0, 10)}</span>
        </div>
      `;
    }).join('');
  }

  async function initProfilPage() {
    const nip = getActiveNip();
    if (!nip) {
      window.location.replace('login.html');
      return;
    }

    const [userRes, jamRes, liburRes] = await Promise.allSettled([
      fetch(`/api/stitch/user-data?nip=${encodeURIComponent(nip)}`).then((r) => r.json()),
      fetch('/api/jam-absen').then((r) => r.ok ? r.json() : null),
      fetch('/api/libur-list').then((r) => r.ok ? r.json() : null)
    ]);

    if (userRes.status === 'fulfilled' && userRes.value?.ok && userRes.value.user) {
      currentUser = userRes.value.user;
      window.MY_ID = String(currentUser.id || '');
      window.MY_NIP = String(currentUser.nip || '');
      renderIdentityAndBiometrics();

      const m = userRes.value.metrics || userRes.value.monthly || {};
      setText('dpStatHadir', String(m.hadir ?? m.hadirDays ?? 0));
      setText('dpStatTelat', String(m.terlambat ?? m.terlambatDays ?? 0));
      setText('dpStatCuti', String(m.cuti ?? m.izin ?? m.cutiDays ?? 0));
    } else {
      setText('dpName', 'Gagal memuat data pegawai');
    }

    if (jamRes.status === 'fulfilled' && jamRes.value) {
      const j = jamRes.value.data || jamRes.value;
      const masuk = j.jam_masuk || j.masuk_mulai || '07:15';
      const pulang = j.jam_pulang || j.pulang_mulai || '14:30';
      const batas = j.batas_masuk || j.masuk_selesai || '08:00';
      setText('dpShiftHours', `${String(masuk).slice(0, 5)} - ${String(pulang).slice(0, 5)}`);
      setText('dpShiftToleransi', `${String(batas).slice(0, 5)} WITA`);
    }

    if (liburRes.status === 'fulfilled' && liburRes.value) {
      const rows = Array.isArray(liburRes.value) ? liburRes.value : (liburRes.value.data || liburRes.value.holidays || []);
      renderHolidays(rows);
    } else {
      renderHolidays([]);
    }
  }

  window.enrollDesktopFace = function () {
    if (!currentUser) return;
    window.MY_ID = String(currentUser.id || '');
    if (typeof window.openCamOverlay !== 'function') {
      Swal.fire('Info', 'Modul kamera Face AI belum siap. Muat ulang halaman.', 'info');
      return;
    }
    window.openCamOverlay({
      isRegister: true,
      onDone: async (cap) => {
        if (!cap || !cap.dataUrl) return;
        try {
          const res = await fetch('/api/stitch/face-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nip: currentUser.nip,
              face_photo: cap.dataUrl,
              face_descriptor: cap.descriptor ? Array.from(cap.descriptor) : [],
              face_model: 'human'
            })
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.message || 'Gagal menyimpan data wajah.');
          currentUser.face_photo = cap.dataUrl;
          currentUser.face_histogram = JSON.stringify(cap.descriptor ? Array.from(cap.descriptor) : []);
          currentUser.face_model = 'human';
          currentUser.face_saved_at = new Date().toISOString();
          renderIdentityAndBiometrics();
          if (typeof window.showDynamicIsland === 'function') {
            window.showDynamicIsland({ type: 'success', title: 'Wajah AI Terdaftar', message: 'Biometrik wajah berhasil disimpan.' });
          } else {
            Swal.fire('Berhasil', 'Biometrik wajah Anda berhasil disimpan.', 'success');
          }
        } catch (err) {
          Swal.fire('Gagal', err.message, 'error');
        }
      }
    });
  };

  function setupSigCanvas() {
    const c = document.getElementById('profilSigCanvas');
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = c.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width || 440));
    const h = Math.max(180, Math.round(rect.height || 208));
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    c._hasInk = false;

    if (c._bound) return;
    c._bound = true;
    let drawing = false;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drawing = true;
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
      const p = pos(e);
      const cx = c.getContext('2d');
      cx.beginPath();
      cx.moveTo(p.x, p.y);
      cx.lineTo(p.x + 0.01, p.y + 0.01);
      cx.stroke();
      c._hasInk = true;
      document.getElementById('dpSigError')?.classList.add('hidden');
    });
    c.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      const cx = c.getContext('2d');
      cx.lineTo(p.x, p.y);
      cx.stroke();
    });
    const stop = (e) => {
      if (!drawing) return;
      drawing = false;
      try { c.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
  }

  window.openDesktopSigModal = function () {
    if (!currentUser) return;
    const modal = document.getElementById('modalProfilSig');
    if (!modal) return;
    document.getElementById('dpSigError')?.classList.add('hidden');
    modal.classList.remove('hidden');
    requestAnimationFrame(setupSigCanvas);
  };

  window.closeDesktopSigModal = function () {
    document.getElementById('modalProfilSig')?.classList.add('hidden');
  };

  window.clearDesktopSig = function () {
    const c = document.getElementById('profilSigCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    c._hasInk = false;
  };

  window.saveDesktopSig = async function () {
    if (!currentUser) return;
    const c = document.getElementById('profilSigCanvas');
    if (!c || !c._hasInk) {
      document.getElementById('dpSigError')?.classList.remove('hidden');
      return;
    }
    const btn = document.getElementById('dpBtnSaveSig');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
    try {
      const dataUrl = c.toDataURL('image/png');
      const res = await fetch('/api/stitch/signature-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: currentUser.nip, signature: dataUrl })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Gagal menyimpan tanda tangan.');
      currentUser.signature = dataUrl;
      try { localStorage.setItem('sig_' + currentUser.nip, dataUrl); } catch (_) {}
      renderIdentityAndBiometrics();
      window.closeDesktopSigModal();
      if (typeof window.showDynamicIsland === 'function') {
        window.showDynamicIsland({ type: 'success', title: 'Tanda Tangan Tersimpan', message: 'Spesimen TTD siap digunakan.' });
      }
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan TTD'; }
    }
  };

  window.logoutDesktopProfil = function () {
    if (window.StitchAuth && typeof window.StitchAuth.logout === 'function') {
      window.StitchAuth.logout();
      return;
    }
    try {
      ['stitch_active_nip', 'MY_NIP', 'MY_ROLE', 'MY_PERMS', '_native_token', 'native_token', '_sess_token'].forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    window.location.replace('login.html');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilPage);
  } else {
    initProfilPage();
  }
})();
