/* ════ MEJA MATCH HANDLER & ADMIN OVERRIDES ════ */
let _lastMejaTime = 0;

async function _onMejaAbsenMatchFound(telegramId, descriptor, dataUrl, distance) {
  const sekarang = Date.now();

  // 1. SISTEM ANTI-SPAM (COOLDOWN)
  // Jika orang yang sama di-scan lagi dalam waktu kurang dari 20 detik, abaikan.
  if (telegramId !== 'unknown' && telegramId === _lastMejaId && (sekarang - _lastMejaTime) < 20000) {
    console.log("User sama terdeteksi terlalu cepat, mengabaikan scan ganda.");
    setTimeout(() => {
      _forceResetAiState(true);
      _autoCaptured = false;
      startDetectLoop();
      setCamStatus('ok', '<i class="fas fa-search"></i>', 'Siap Scan...', 'Posisikan wajah pegawai selanjutnya');
    }, 1500);
    return;
  }

  // LOCK PROSES
  if (window._mejaProcessing) return;
  window._mejaProcessing = true;

  // Safety net: Paksa unlock setelah 15 detik jika terjadi hang
  const safetyTimer = setTimeout(() => {
    console.warn('[Meja] Safety timeout! Force-releasing all locks.');
    window._isSubmitting = false; 
    window._mejaProcessing = false;
    _forceResetAiState(true);
    if ($('mejaOverlayResult')) $('mejaOverlayResult').style.display = 'none';
    _setMejaStatus('active', '<i class="fas fa-exclamation-triangle"></i>', 'Timeout', 'Server tidak merespons, coba scan ulang');
    startDetectLoop();
  }, 15000);

  // 3. STOP DETEKSI SEGERA
  // Matikan deteksi wajah agar tidak menumpuk saat proses kirim data
  stopDetectLoop();

  // Update tracker terakhir
  _lastMejaId = telegramId;
  _lastMejaTime = sekarang;

  const overlay = $('mejaOverlayResult');
  const _moIcon = $('moIcon');
  const _moNama = $('moNama');
  const _moStatus = $('moStatus');
  const _moDetail = $('moDetail');
  overlay.style.display = 'flex';

  // JIKA WAJAH TIDAK DIKENAL
  if (telegramId === 'unknown') {
    _moIcon.innerHTML = '<i class="fas fa-question"></i>';
    _moNama.textContent = 'TIDAK DIKENAL';
    _moStatus.textContent = 'WAJAH BELUM TERDAFTAR';
    _moStatus.style.color = 'var(--danger)';
    _moStatus.style.background = 'rgba(239,68,68,0.2)';
    _moDetail.textContent = 'Mulai ulang scan dalam 3 detik...';

    _mejaCnt.gagal++;
    _updateMejaCnt();
    _setMejaStatus('active', '<i class="fas fa-exclamation-triangle"></i>', 'Wajah Tak Dikenal', 'Pegawai tidak terdaftar di sistem');

    setTimeout(() => {
      overlay.style.display = 'none';
      _forceResetAiState(true);
      window._mejaProcessing = false;

      const vid = $('camVideo');
      if (vid && vid.paused) vid.play().catch(() => { });
      startDetectLoop();
    }, 3000);
    return;
  }

  // JIKA WAJAH DIKENAL (telegramId sekarang berisi NIP dari meja.js)
  if (!window._mejaUserMap) window._mejaUserMap = {};
  const user = window._mejaUserMap[telegramId] || { nama: 'Pegawai', nip: telegramId };
  
  // ── CEK GPS VALIDASI SEBELUM ABSEN ──
  // Jika GPS belum stabil (koordinat 0,0), tolak absen dan minta user pindah area
  if (!_mejaGpsLocation || _mejaGpsLocation.lat === 0 || _mejaGpsLocation.lng === 0) {
    _mejaCnt.gagal++;
    _updateMejaCnt();
    _setMejaStatus('active', '<i class="fas fa-exclamation-triangle"></i>', 'GPS Tidak Terdeteksi', 'Pindah ke area terbuka untuk mendapatkan sinyal GPS');
    setTimeout(() => {
      _forceResetAiState(true);
      window._mejaProcessing = false;
      setCamStatus('ok', '<i class="fas fa-search"></i>', 'Siap Scan...', 'Posisikan wajah pegawai selanjutnya');
    }, 3000);
    return;
  }
  
  const score = Math.max(0, Math.round((distance || 0) * 100));

  if (_moIcon) _moIcon.innerHTML = '<i class="fas fa-hourglass-half"></i>';
  if (_moNama) _moNama.textContent = user.nama;
  if (_moStatus) {
    _moStatus.textContent = 'MEMERIKSA STATUS...';
    _moStatus.style.color = 'var(--gold)';
    _moStatus.style.background = 'rgba(201,168,76,0.2)';
  }
  if (_moDetail) _moDetail.textContent = `Mencocokkan AI: ${score}%`;

  // ── START SUBMISSION PROCESS ──
  window._isSubmitting = true; 
  _setMejaStatus('processing', '<i class="fas fa-hourglass-half"></i>', `Mencatat: ${user.nama}...`, 'Tunggu konfirmasi server');

  try {
    const n = nowWITA();
    const tanggalISO = fmtD(n);
    
    // 1. BUAT LOGIKA PENENTUAN TIPE ABSEN (Masuk/Pulang)
    const tot = n.getHours() * 60 + n.getMinutes();
    const _jH = typeof getJamForTanggal === 'function' ? getJamForTanggal(tanggalISO) : null;
    const jMasukMenit = _jH ? toMenitStr(_jH.masuk) : JAM_MASUK_MENIT;
    const jPulangMenit = _jH ? toMenitStr(_jH.pulang) : JAM_PULANG_MENIT;
    
    let typeKey = 'masuk';
    if (tot > (jMasukMenit + 180) && tot < jPulangMenit) typeKey = 'siang';
    else if (tot >= jPulangMenit - 60) typeKey = 'pulang';

    // 2. GENERATE REQUEST ID SEPERTI DI ABSEN.JS
    const idKey = user.nip || user.telegram_id || 'anon';
    const rid = `absen_${idKey}_${tanggalISO}_${typeKey}`;

    const payload = {
      request_id: rid, // <--- TAMBAHKAN REQUEST ID DI SINI
      telegram_id: user.telegram_id || '', // Tetap kirim telegram_id jika ada
      nama: user.nama,
      nip: user.nip,
      pangkat: user.pangkat || '',
      admin_id: typeof MY_ID !== 'undefined' ? MY_ID : null,
      jam: `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())} WITA`,
      tanggal_iso: tanggalISO,
      latitude: _mejaGpsLocation?.lat ?? 0,
      longitude: _mejaGpsLocation?.lng ?? 0,
      accuracy: _mejaGpsLocation?.acc ?? 0,
      lokasi_nama: 'Meja Absen',
      face_match: score,
      timestamp: Math.floor(Date.now() / 1000),
      source: 'meja_absen',
      meja_token: window._session?.token || ''
    };

    // ── GENERATE SIGNATURE ANTI-SPOOFING ──
    // Wajib: tanpa ini server masuk cabang HMAC lalu ditolak.
    if (typeof generateSignature === 'function') {
      const sigBase = `${payload.request_id}${payload.nip}${payload.latitude}${payload.longitude}${payload.timestamp}${window._session?.token || ''}`;
      payload._signature = await generateSignature(sigBase);
    }

    // Paksa NIP masuk ke URL query agar n8n lebih mudah memproses
    const targetPath = P.absen + (P.absen.includes('?') ? '&' : '?') + 'nip=' + encodeURIComponent(user.nip);
    console.log('[Meja] Sending Payload to n8n:', targetPath, payload);

    const { ok: mejaOk, data: d } = await apiPost(targetPath, payload);
    console.log('[Meja] Server Response:', { mejaOk, data: d });

    const st = _formatMejaStatus(mejaOk, d, user);
    if (st.isSuccess) {
      if (st.isMasuk) _mejaCnt.masuk++; else _mejaCnt.pulang++;
      _playMejaChime('success');
      _speakMeja(`Terima kasih, ${user.nama.split(' ')[0]}`);
    } else if (st.isInfo) {
      _playMejaChime('info');
      _speakMeja(`${user.nama.split(' ')[0]}, ${st.title.toLowerCase()}`);
    } else {
      _mejaCnt.gagal++;
      _playMejaChime('warning');
    }

    _moIcon.innerHTML = st.icon;
    _moIcon.style.color = st.color;
    _moStatus.textContent = st.title;
    _moStatus.style.color = st.color;
    _moStatus.style.background = st.bg;
    _moDetail.textContent = st.detail;
    _setMejaStatus('active', st.icon, `${user.nama} — ${st.title}`, st.isSuccess ? 'Siap scan berikutnya...' : st.detail);
  } catch (e) {
    console.error('[Meja] Submission Fatal Error:', e);
    _moIcon.innerHTML = '<i class="fas fa-plug"></i>';
    _moIcon.style.color = '#f87171';
    _moStatus.textContent = 'GAGAL PROSES';
    _moStatus.style.color = '#f87171';
    _moStatus.style.background = 'rgba(248,113,113,0.2)';
    _moDetail.textContent = e.message || 'Terjadi kesalahan sistem';
    _mejaCnt.gagal++;
    _setMejaStatus('active', '<i class="fas fa-plug"></i>', 'System Error', e.message);
  } finally {
    clearTimeout(safetyTimer); 
    window._isSubmitting = false; 
    _updateMejaCnt();
    await new Promise(r => setTimeout(r, 3500));
    if ($('mejaOverlayResult')) $('mejaOverlayResult').style.display = 'none';
    _forceResetAiState(true);
    window._mejaProcessing = false;
    setCamStatus('ok', '<i class="fas fa-search"></i>', 'Siap Scan...', 'Posisikan wajah pegawai selanjutnya');

    const vid = $('camVideo');
    if (vid && vid.paused) {
      vid.play().catch(e => console.warn('Gagal play video otomatis:', e));
    }
    startDetectLoop();
  }
}

// ── Override existing openSignaturePad for Admin Support ──
const _origOpenSignaturePad = openSignaturePad;
openSignaturePad = function (nip, callback) {
  _sigTargetNip = nip || localStorage.getItem('MY_NIP') || '';
  _sigCallback = callback || null;

  const titleEl = $('sigOverlayTitle');
  if (titleEl) {
    const myNip = localStorage.getItem('MY_NIP') || '';
    if (_sigTargetNip !== myNip) {
      titleEl.innerHTML = `<i class="fas fa-pen"></i> TTD NIP: ${nip}`;
    }
  }
  _origOpenSignaturePad(nip, callback);
};

// ── Admin: Capture Signature Helper ──
function adminCaptureSignatureFor(uid, name) {
  // Look up NIP from the user object
  const nip = window._adminNipMap ? window._adminNipMap[uid] : uid;
  openSignaturePad(nip || uid, (dataUrl) => {
    loadAdminFaceReg();
  });
  const titleEl = $('sigOverlayTitle');
  if (titleEl) titleEl.innerHTML = `<i class="fas fa-pen"></i> TTD: ${name}`;
}

// ── Audio Chime & Speech Feedback untuk Meja Absen (Web Audio API) ──
function _playMejaChime(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!_playMejaChime._ctx) _playMejaChime._ctx = new AudioCtx();
    const ctx = _playMejaChime._ctx;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Melodi D5 (587Hz) -> A5 (880Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc1.connect(gain);
      osc2.connect(gain);
      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.5);
    } else if (type === 'info') {
      // Nada lembut informasi / sudah absen: C5 (523Hz) -> G5 (784Hz)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.22);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.55);
    } else {
      // Nada peringatan / penolakan
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now);
      osc.frequency.linearRampToValueAtTime(220, now + 0.25);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  } catch (e) {
    console.warn('[MejaAudio] Chime failed:', e);
  }
}

function _speakMeja(text) {
  try {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'id-ID';
    utt.rate = 1.05;
    utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  } catch (_) { }
}

// ── Format Status Meja Absen (Bervariasi sesuai respon server) ──
function _formatMejaStatus(mejaOk, d, user) {
  // 1. Kasus Idempotent (Sudah tercatat sebelumnya di server hari ini)
  if (d && (d.idempotent === true || (d.message && String(d.message).toLowerCase().includes('idempotent')))) {
    const rawJenis = String(d.jenis_absen || '').toUpperCase();
    const isPulang = rawJenis.includes('PULANG') || String(d.message || '').toLowerCase().includes('pulang');
    if (isPulang) {
      return {
        isSuccess: false,
        isInfo: true,
        icon: '<i class="fas fa-clipboard-check"></i>',
        title: 'SUDAH ABSEN PULANG',
        color: '#a855f7',
        bg: 'rgba(168,85,247,0.2)',
        detail: d.message || 'Pegawai sudah melakukan absen pulang hari ini.'
      };
    }
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-clipboard-check"></i>',
      title: 'SUDAH ABSEN MASUK',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.2)',
      detail: d.message || 'Pegawai sudah melakukan absen masuk hari ini.'
    };
  }

  // 2. Kasus Sukses Absen Baru
  if (mejaOk && d && d.ok !== false && d.validasi?.is_valid !== false) {
    const rawJenis = String(d.jenis_absen || d.validasi?.jenis_absen || '').trim().toUpperCase();
    if (rawJenis === 'MASUK') {
      return {
        isSuccess: true,
        isMasuk: true,
        icon: '<i class="fas fa-check-circle"></i>',
        title: 'MASUK TEPAT WAKTU',
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.2)',
        detail: d.validasi?.keterangan || 'Presensi masuk berhasil dicatat tepat waktu.'
      };
    }
    if (rawJenis.includes('MASUK') && rawJenis.includes('LUAR')) {
      return {
        isSuccess: true,
        isMasuk: true,
        icon: '<i class="fas fa-clock"></i>',
        title: 'DI LUAR JAM MASUK',
        color: '#eab308',
        bg: 'rgba(234,179,8,0.2)',
        detail: d.validasi?.keterangan || 'Presensi masuk dicatat di luar batas waktu normal.'
      };
    }
    if (rawJenis === 'PULANG') {
      return {
        isSuccess: true,
        isMasuk: false,
        icon: '<i class="fas fa-home"></i>',
        title: 'PULANG TEPAT WAKTU',
        color: '#06b6d4',
        bg: 'rgba(6,182,212,0.2)',
        detail: d.validasi?.keterangan || 'Presensi pulang berhasil dicatat. Selamat beristirahat.'
      };
    }
    if (rawJenis.includes('PULANG')) {
      return {
        isSuccess: true,
        isMasuk: false,
        icon: '<i class="fas fa-running"></i>',
        title: 'DI LUAR JAM PULANG',
        color: '#f97316',
        bg: 'rgba(249,115,22,0.2)',
        detail: d.validasi?.keterangan || 'Presensi pulang dicatat di luar batas waktu normal.'
      };
    }
    return {
      isSuccess: true,
      isMasuk: rawJenis.includes('MASUK'),
      icon: '<i class="fas fa-check-circle"></i>',
      title: rawJenis || 'ABSEN BERHASIL',
      color: '#10b981',
      bg: 'rgba(16,185,129,0.2)',
      detail: d.validasi?.keterangan || 'Presensi berhasil dicatat di server.'
    };
  }

  // 3. Kasus Ditolak / Keterangan Khusus
  let errMsg = String((d && (d.message || d.error)) || (d && d.validasi && d.validasi.keterangan) || 'Ditolak Server').trim();
  const errLower = errMsg.toLowerCase();

  if (errLower.includes('lengkap') || (errLower.includes('sudah') && errLower.includes('pulang'))) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-clipboard-check"></i>',
      title: errLower.includes('lengkap') ? 'KEHADIRAN LENGKAP' : 'SUDAH ABSEN PULANG',
      color: '#a855f7',
      bg: 'rgba(168,85,247,0.2)',
      detail: errMsg || 'Absen masuk dan pulang hari ini sudah lengkap.'
    };
  }
  if (errLower.includes('sudah') && errLower.includes('masuk')) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-clipboard-check"></i>',
      title: 'SUDAH ABSEN MASUK',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.2)',
      detail: errMsg || 'Pegawai sudah tercatat absen masuk hari ini.'
    };
  }
  if (errLower.includes('belum') && errLower.includes('masuk')) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-exclamation-triangle"></i>',
      title: 'BELUM ABSEN MASUK',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.2)',
      detail: errMsg || 'Pegawai belum melakukan presensi masuk hari ini.'
    };
  }
  if (errLower.includes('sudah')) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-clipboard-check"></i>',
      title: 'SUDAH ABSEN HARI INI',
      color: '#60a5fa',
      bg: 'rgba(96,165,250,0.2)',
      detail: errMsg
    };
  }
  if (errLower.includes('izin') || errLower.includes('cuti') || errLower.includes('tubel')) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-calendar-alt"></i>',
      title: 'TERCATAT IZIN / CUTI',
      color: '#c084fc',
      bg: 'rgba(192,132,252,0.2)',
      detail: errMsg
    };
  }
  if (errLower.includes('sakit')) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-user-sick"></i>',
      title: 'TERCATAT SAKIT',
      color: '#fb7185',
      bg: 'rgba(251,113,133,0.2)',
      detail: errMsg
    };
  }
  if (errLower.includes('dinas') || errLower.includes('tugas') || errLower.includes('dl')) {
    return {
      isSuccess: false,
      isInfo: true,
      icon: '<i class="fas fa-briefcase"></i>',
      title: 'TERCATAT TUGAS LUAR',
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.2)',
      detail: errMsg
    };
  }
  if (errLower.includes('radius') || errLower.includes('jarak') || errLower.includes('lokasi')) {
    return {
      isSuccess: false,
      isInfo: false,
      icon: '<i class="fas fa-map-marker-alt"></i>',
      title: 'DI LUAR RADIUS KANTOR',
      color: '#f43f5e',
      bg: 'rgba(244,63,94,0.2)',
      detail: errMsg || 'Koordinat GPS Meja Absen berada di luar radius lokasi kantor.'
    };
  }
  if (errLower.includes('wajah') || errLower.includes('face')) {
    return {
      isSuccess: false,
      isInfo: false,
      icon: '<i class="fas fa-question"></i>',
      title: 'WAJAH TIDAK COCOK',
      color: '#f87171',
      bg: 'rgba(248,113,113,0.2)',
      detail: errMsg
    };
  }

  return {
    isSuccess: false,
    isInfo: false,
    icon: '<i class="fas fa-times-circle"></i>',
    title: 'GAGAL ABSEN',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.2)',
    detail: errMsg
  };
}

// Auto-init Desktop Mode jika di layar laptop/PC
setTimeout(() => { try { if (typeof initDesktopMode === 'function') initDesktopMode(); } catch (_) { } }, 1000);
