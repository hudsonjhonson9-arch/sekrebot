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
      setCamStatus('ok', '🔍', 'Siap Scan...', 'Posisikan wajah pegawai selanjutnya');
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
    _setMejaStatus('active', '⚠️', 'Timeout', 'Server tidak merespons, coba scan ulang');
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
    _moIcon.textContent = '❓';
    _moNama.textContent = 'TIDAK DIKENAL';
    _moStatus.textContent = 'WAJAH BELUM TERDAFTAR';
    _moStatus.style.color = 'var(--danger)';
    _moStatus.style.background = 'rgba(239,68,68,0.2)';
    _moDetail.textContent = 'Mulai ulang scan dalam 3 detik...';

    _mejaCnt.gagal++;
    _updateMejaCnt();
    _setMejaStatus('active', '⚠️', 'Wajah Tak Dikenal', 'Pegawai tidak terdaftar di sistem');

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
    _setMejaStatus('active', '⚠️', 'GPS Tidak Terdeteksi', 'Pindah ke area terbuka untuk mendapatkan sinyal GPS');
    setTimeout(() => {
      _forceResetAiState(true);
      window._mejaProcessing = false;
      setCamStatus('ok', '🔍', 'Siap Scan...', 'Posisikan wajah pegawai selanjutnya');
    }, 3000);
    return;
  }
  
  const score = Math.max(0, Math.round((distance || 0) * 100));

  if (_moIcon) _moIcon.textContent = '⏳';
  if (_moNama) _moNama.textContent = user.nama;
  if (_moStatus) {
    _moStatus.textContent = 'MEMERIKSA STATUS...';
    _moStatus.style.color = 'var(--gold)';
    _moStatus.style.background = 'rgba(201,168,76,0.2)';
  }
  if (_moDetail) _moDetail.textContent = `Mencocokkan AI: ${score}%`;

  // ── START SUBMISSION PROCESS ──
  window._isSubmitting = true; 
  _setMejaStatus('processing', '⏳', `Mencatat: ${user.nama}...`, 'Tunggu konfirmasi server');

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

    // Paksa NIP masuk ke URL query agar n8n lebih mudah memproses
    const targetPath = P.absen + (P.absen.includes('?') ? '&' : '?') + 'nip=' + encodeURIComponent(user.nip);
    console.log('[Meja] Sending Payload to n8n:', targetPath, payload);

    const { ok: mejaOk, data: d } = await apiPost(targetPath, payload);
    console.log('[Meja] Server Response:', { mejaOk, data: d });

    if (mejaOk && d && d.ok !== false && d.validasi?.is_valid !== false) {
      const jenis = d.jenis_absen || d.validasi?.jenis_absen || 'ABSEN BERHASIL';
      const ismasuk = jenis.toUpperCase().includes('MASUK');
      if (ismasuk) _mejaCnt.masuk++; else _mejaCnt.pulang++;

      _moIcon.textContent = '✅';
      _moStatus.textContent = jenis.toUpperCase();
      _moStatus.style.color = '#4ade80';
      _moStatus.style.background = 'rgba(74,222,128,0.2)';
      _moDetail.textContent = d.validasi?.keterangan || 'Data tercatat di server.';
      _setMejaStatus('active', '✅', `${user.nama} — ${jenis}`, 'Siap scan berikutnya...');
    } else {
      let errMsg = (d && (d.message || d.error)) || 'Ditolak Server';
      if (d && d.validasi && d.validasi.keterangan) errMsg = d.validasi.keterangan;

      const isSudah = errMsg.toLowerCase().includes('sudah');

      _moIcon.textContent = isSudah ? 'ℹ️' : '❌';
      _moStatus.textContent = isSudah ? 'SUDAH ABSEN' : 'GAGAL';
      _moStatus.style.color = isSudah ? '#60a5fa' : '#f87171';
      _moStatus.style.background = isSudah ? 'rgba(96,165,250,0.2)' : 'rgba(248,113,113,0.2)';
      _moDetail.textContent = errMsg;

      if (!isSudah) _mejaCnt.gagal++;
      _setMejaStatus('active', isSudah ? 'ℹ️' : '⚠️', user.nama, errMsg);
    }
  } catch (e) {
    console.error('[Meja] Submission Fatal Error:', e);
    _moIcon.textContent = '🔌';
    _moStatus.textContent = 'GAGAL PROSES';
    _moStatus.style.color = '#f87171';
    _moStatus.style.background = 'rgba(248,113,113,0.2)';
    _moDetail.textContent = e.message || 'Terjadi kesalahan sistem';
    _mejaCnt.gagal++;
    _setMejaStatus('active', '🔌', 'System Error', e.message);
  } finally {
    clearTimeout(safetyTimer); 
    window._isSubmitting = false; 
    _updateMejaCnt();
    await new Promise(r => setTimeout(r, 3500));
    if ($('mejaOverlayResult')) $('mejaOverlayResult').style.display = 'none';
    _forceResetAiState(true);
    window._mejaProcessing = false;
    setCamStatus('ok', '🔍', 'Siap Scan...', 'Posisikan wajah pegawai selanjutnya');

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
      titleEl.textContent = `✍️ TTD NIP: ${nip}`;
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
  if (titleEl) titleEl.textContent = `✍️ TTD: ${name}`;
}

// Auto-init Desktop Mode jika di layar laptop/PC
setTimeout(() => { try { if (typeof initDesktopMode === 'function') initDesktopMode(); } catch (_) { } }, 1000);
