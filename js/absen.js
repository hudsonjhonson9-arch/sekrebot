try {
/* ════ HANDLE ABSEN & PULANG LUAR ════ */
/* ════ HANDLE ABSEN ════ */
// Anti double-submit: track timestamp terakhir klik absen
let _lastAbsenClick = 0;
window._isAbsenSubmitting = false; // Idempotency Lock (global for face.js)

/**
 * Entry point utama untuk absen masuk/pulang dari tab Absen.
 * Menangani flow: validasi jadwal → buka kamera → GPS → kirim ke server.
 * @returns {Promise<void>}
 */
async function handleAbsen() {
  window.handleAbsen = handleAbsen; // Force Global
  console.log('[Absen] handleAbsen triggered. Disabled:', $('btnAbsen').disabled, 'Submitting:', window._isAbsenSubmitting);
  if ($('btnAbsen').disabled || window._isAbsenSubmitting) return;

  // Blokir jika klik dalam 3 detik terakhir (cegah double-tap)
  const now = Date.now();
  console.log('[Absen] Time since last click:', now - _lastAbsenClick);
  if (now - _lastAbsenClick < 3000) return;
  _lastAbsenClick = now;

  // ── SPECIAL EXCEPTION: Force Face Recognition for specific NIP ──
  window._isAbsenSubmitting = true; // Set lock AFTER checks
  const myNip = (localStorage.getItem('MY_NIP') || window.userProfile?.nip || '').trim();
  const myId = window.MY_ID;

  // STRICT VALIDATION: Prevent 'undefined' or empty identity submission
  if (!myNip || !myId || myNip.toLowerCase() === 'undefined' || String(myId).toLowerCase() === 'undefined' || myNip === 'null') {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '🆔', 'Identitas Tidak Valid',
      'Data profil Anda tidak valid atau belum lengkap. Silakan muat ulang halaman atau hubungi admin.');
    window._isAbsenSubmitting = false; return;
  }

  const unlock = () => { window._isAbsenSubmitting = false; };
  if (isDesktop()) {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '🖥️', 'Perangkat Tidak Didukung', 'HADIR hanya dapat dilakukan dari smartphone. Gunakan Telegram di HP Anda.');
    unlock(); return;
  }
  setBtnL('btnAbsen', true, 'Memeriksa...');
  const initData = window.tg?.initData || '';
  const isCapacitor = !!window.Capacitor || window.location.protocol === 'capacitor:';
  // ── Fallback Telegram X: izinkan jika MY_ID valid dari user_list ──
  const isTgX = (!initData && window.MY_ID && window.userProfile) || isCapacitor;
  console.log('[Absen] Identity check:', { hasInitData: !!initData, MY_ID: window.MY_ID, hasProfile: !!window.userProfile, isTgX, isCapacitor });

  if (!initData && !isTgX) {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '⚠️', 'Buka via Telegram', 'Aplikasi harus dibuka melalui Telegram, bukan browser biasa.');
    setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');
    unlock(); return;
  }

  // ── Block if user already has Keterangan / status non-hadir today ──
  const _todayRows = window._todayRows || [];
  const GRP_KETERANGAN = ['IZIN', 'SAKIT', 'TUGAS', 'CUTI', 'DL', 'TUBEL', 'TANPA BERITA', 'ALPA', 'TB'];
  const ketRow = _todayRows.find(r => {
    const j = (r['Jenis Absen'] || r['jenis'] || r['Jenis'] || '').toUpperCase().trim();
    return GRP_KETERANGAN.includes(j);
  });

  if (ketRow) {
    const nmKet = (ketRow['Jenis Absen'] || ketRow['jenis'] || ketRow['Jenis'] || 'KETERANGAN').toUpperCase().trim();
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '🚫', 'Tidak Dapat Absen', `Anda tidak dapat melakukan absen karena status hari ini adalah ${nmKet}.`);
    setBtnL('btnAbsen', false, `🚫 Status: ${nmKet}`);
    $('btnAbsen').disabled = true;
    unlock(); return;
  }

  // ── Cek jaringan WiFi ──
  setBtnL('btnAbsen', true, 'Memeriksa jaringan...');
  await cekJaringan();

  // ── Verifikasi Wajah & Seragam ──
  const isMandatory = typeof MANDATORY_FACE_NIPS !== 'undefined' && MANDATORY_FACE_NIPS.includes(myNip);
  const useFace = (FACE_RECOGNITION_ENABLED || isMandatory) && navigator.onLine;

  console.log('[Absen] Face requirement:', { FACE_RECOGNITION_ENABLED, isMandatory, useFace, onLine: navigator.onLine });
  setBtnL('btnAbsen', true, 'Membuka kamera...');

  if (!useFace) {
    // Face recognition dinonaktifkan admin ATAU perangkat sedang offline
    // KECUALI jika NIP tersebut wajib face (tapi jika offline tetap tidak bisa karena model Human.js butuh load asset)
    await _doAbsenWithGPS(initData, isTgX, null);
    setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');
    return;
  }

  // Cek apakah pegawai sudah daftar wajah
  const _faceRef = getFaceRef();
  if (!_faceRef || !_faceRef.dataUrl) {
    setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '🧠', 'Wajah Belum Didaftarkan',
      'Daftarkan wajah Anda terlebih dahulu melalui tab Profil atau tunggu layar pendaftaran muncul.');
    setTimeout(_showFaceRequiredModal, 500);
    unlock(); return;
  }

  console.log('[Absen] Camera overlay opened.');
  openCamOverlay(async (camResult) => {
    console.log('[Absen] Camera result received:', !!camResult);
    // Dipanggil setelah foto diambil (atau dilewati)
    await _doAbsenWithGPS(initData, isTgX, camResult);
  });

  // Kembalikan tombol ke normal (modal kamera yang handle sekarang)
  setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');
  // Note: window._isAbsenSubmitting tetap true hingga _doAbsenWithGPS selesai
}

/* ── Proses GPS + Kirim payload absen (dipanggil setelah kamera) ── */
/**
 * Eksekusi absen dengan validasi GPS (anti-spoofing, radius, akurasi).
 * Dipanggil setelah kamera selesai dan data awal sudah disiapkan.
 * @param {Object} initData - Data awal: { jenis, jam, keterangan, photoUrl, ... }
 * @param {boolean} isTgX - Apakah Telegram X (versi baru) dengan tg.initData
 * @param {Object|null} camResult - Hasil dari camera overlay { dataUrl, descriptor, score }
 * @returns {Promise<void>}
 */
async function _doAbsenWithGPS(initData, isTgX, camResult) {
  if (!navigator.geolocation) {
    handleAbsenError(new AbsenError('Buka di Telegram versi terbaru.', ERROR_CODES.GPS_UNAVAILABLE), 'resultCard');
    setBtnL('btnAbsen', false, 'Coba Lagi'); return;
  }

  // ── Pre-check permission geolocation (Permissions API, tanpa trigger prompt) ──
  const _geoPermState = (_readPermStore()['geolocation']) || 'unknown';
  if (_geoPermState === 'denied') {
    handleAbsenError(new AbsenError(
      'Aktifkan izin lokasi di pengaturan browser atau Telegram, lalu coba lagi.',
      ERROR_CODES.GPS_DENIED), 'resultCard');
    setBtnL('btnAbsen', false, 'Coba Lagi'); return;
  }

  // ── Collect DeviceMotion data (anti-emulator) ──────────────
  let _motionData = { accel_samples: [], gyro_available: false, orientation_available: false };
  try {
    const _motionSamples = [];
    const _motionHandler = (e) => {
      const a = e.accelerationIncludingGravity || {};
      _motionSamples.push({ x: a.x || 0, y: a.y || 0, z: a.z || 0, t: Date.now() });
    };
    window.addEventListener('devicemotion', _motionHandler);
    // Kumpulkan data selama 1.5 detik
    await new Promise(r => setTimeout(r, 1500));
    window.removeEventListener('devicemotion', _motionHandler);
    _motionData.accel_samples = _motionSamples.slice(-10); // 10 sample terakhir
    _motionData.gyro_available = !!window.DeviceOrientationEvent;
    _motionData.orientation_available = 'DeviceOrientationEvent' in window;
  } catch (_) { }

  setBtnL('btnAbsen', true, 'Mengambil GPS...');
  const _gpsT0 = Date.now(); // catat waktu mulai sebelum acquire
  
  await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          console.log('[Absen] GPS acquired:', position.coords.latitude, position.coords.longitude);
      const { latitude, longitude, accuracy } = position.coords;
      const _coords = position.coords;
      const _gpsElapsed = Date.now() - _gpsT0;


      // GPS Fingerprint — data tambahan untuk deteksi fake GPS di server
      // Ambil lokasi sebelumnya dari localStorage untuk cek teleport
      let prevLocData = {};
      try {
        const prevRaw = localStorage.getItem('_prev_loc_bapperida');
        if (prevRaw) prevLocData = JSON.parse(prevRaw);
      } catch (_) { }
      // Simpan lokasi saat ini untuk request berikutnya
      try {
        localStorage.setItem('_prev_loc_bapperida', JSON.stringify({
          lat: _coords.latitude, lng: _coords.longitude,
          acc: accuracy,
          ts: Math.floor(Date.now() / 1000)
        }));
      } catch (_) { }

      const gps_fingerprint = {
        has_altitude: _coords.altitude !== null && _coords.altitude !== undefined,
        has_altitude_acc: _coords.altitudeAccuracy !== null && _coords.altitudeAccuracy !== undefined,
        has_heading: _coords.heading !== null && _coords.heading !== undefined,
        has_speed: _coords.speed !== null && _coords.speed !== undefined,
        altitude: _coords.altitude ?? null,
        altitude_acc: _coords.altitudeAccuracy ?? null,
        speed: _coords.speed ?? null,
        heading: _coords.heading ?? null,
        gps_timestamp: position.timestamp ? Math.floor(position.timestamp / 1000) : null,
        system_timestamp: Math.floor(Date.now() / 1000),
        elapsed_ms: _gpsElapsed,
        // Tambahan anti-fake
        provider: _coords.altitudeAccuracy !== null ? 'fused' : 'network',
        prev_lat: prevLocData.lat || null,
        prev_lng: prevLocData.lng || null,
        prev_timestamp: prevLocData.ts || null,
        // v3: motion data
        motion_data: _motionData,
      };

      /* ══════════════════════════════════════════════════════
         MULTI-LAYER FAKE GPS DETECTION v3
         Skor 0–100: ≥50 → tolak, 30–49 → suspicious/warning
         ══════════════════════════════════════════════════════ */
      const _ua = navigator.userAgent;
      const _flags = [];
      let _score = 0;

      // ── Layer 1: User-Agent pattern ──────────────────────
      const _isTelegramUA = /Telegram-Android\//i.test(_ua);
      const _hasXposed = /xposed|cydia|substrate|frida|objection/i.test(_ua);

      if (!_isTelegramUA) { _score += 20; _flags.push('UA_NOT_TELEGRAM'); }
      if (_hasXposed) { _score += 50; _flags.push('UA_PATCHING_FRAMEWORK'); }
      const _tgVerMatch = _ua.match(/Telegram-Android\/(\d+)\./);
      if (_tgVerMatch && parseInt(_tgVerMatch[1]) < 9) { _score += 10; _flags.push('TG_VERSION_OLD'); }

      // ── Layer 2: Accuracy pattern ─────────────────────────
      const _isIntAcc = Number.isInteger(accuracy);
      const _suspiciousAccList = [1, 2, 3, 5];
      if (_isIntAcc && _suspiciousAccList.includes(accuracy)) { _score += 15; _flags.push('ACCURACY_SUSPICIOUS_LOW'); }

      // ── Layer 3: Acquisition speed (threshold ditingkatkan) ─
      if (_gpsElapsed < 50) { _score += 15; _flags.push('ULTRA_INSTANT_FIX_' + _gpsElapsed + 'ms'); }
      else if (_gpsElapsed < 100) { _score += 10; _flags.push('VERY_INSTANT_FIX_' + _gpsElapsed + 'ms'); }

      // ── Layer 4: Akurasi out-of-range ─────────────────────
      if (accuracy <= 0) {
        handleAbsenError(new AbsenError(
          'Akurasi 0m tidak valid. Nonaktifkan Mock Location di pengaturan developer.',
          ERROR_CODES.FAKE_GPS), 'resultCard');
        setBtnL('btnAbsen', false, '🔄 Coba Lagi'); window._isAbsenSubmitting = false; resolve(); return;
      }
      if (accuracy === 1) { _score += 20; _flags.push('ACCURACY_EXACTLY_1M'); }
      if (accuracy > GPS_MAX_ACCURACY_M) {
        showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '⚠️', 'Sinyal GPS Lemah',
          `Akurasi ${Math.round(accuracy)}m terlalu lemah. Pindah ke area terbuka.`);
        setBtnL('btnAbsen', false, '🔄 Coba Lagi'); window._isAbsenSubmitting = false; resolve(); return;
      }

      // ── Layer 5: Koordinat presisi mencurigakan ───────────
      const _latStr = String(latitude);
      const _lonStr = String(longitude);
      const _latDec = (_latStr.split('.')[1] || '').length;
      if (_latDec >= 7 && (_latStr.endsWith('00') || _lonStr.endsWith('00'))) { _score += 10; _flags.push('COORD_TRAILING_ZEROS'); }

      // ── Layer 6: Altitude check ───────────────────────────
      const _alt = _coords.altitude;
      const _altAcc = _coords.altitudeAccuracy;
      const _hasAlt = _alt !== null && _alt !== undefined;
      if (!_hasAlt) {
        _score += 12; _flags.push('NO_ALTITUDE');
      } else {
        if (Number.isInteger(_alt) && Math.abs(_alt % 10) === 0) {
          _score += 8; _flags.push('ALTITUDE_ROUNDED_' + _alt + 'm');
        }
        if (_altAcc === null || _altAcc === undefined) {
          _score += 6; _flags.push('ALT_NO_ACCURACY');
        }
      }

      // ── Layer 7: Speed anomaly ────────────────────────────
      const _speed = _coords.speed;
      const _hasSpeed = _speed !== null && _speed !== undefined;
      if (_hasSpeed && _speed === 0 && _gpsElapsed < 500) {
        _score += 5; _flags.push('SPEED_EXACTLY_ZERO_INSTANT');
      }
      if (_hasSpeed && _speed > 28) {
        _score += 20; _flags.push('SPEED_TOO_HIGH_' + Math.round(_speed * 3.6) + 'kmh');
      }

      // ── Layer 8: GPS Timestamp vs system time ─────────────
      const _gpsTsAge = Date.now() - position.timestamp;
      if (_gpsTsAge < 0) {
        _score += 30; _flags.push('GPS_TIMESTAMP_FUTURE');
      } else if (_gpsTsAge > 30000) {
        _score += 15; _flags.push('GPS_TIMESTAMP_STALE_' + Math.round(_gpsTsAge / 1000) + 's');
      }

      // ── Layer 9: Konstansi accuracy lintas sesi ───────────
      try {
        const _accHist = JSON.parse(sessionStorage.getItem('_gps_acc_hist') || '[]');
        _accHist.push({ acc: accuracy, ts: Date.now() });
        if (_accHist.length > 5) _accHist.shift();
        sessionStorage.setItem('_gps_acc_hist', JSON.stringify(_accHist));
        if (_accHist.length >= 3) {
          const _allSame = _accHist.every(h => h.acc === accuracy);
          const _allInt = _accHist.every(h => Number.isInteger(h.acc));
          if (_allSame && _allInt) {
            _score += 12; _flags.push('ACCURACY_CONSTANT_' + accuracy + 'm_x' + _accHist.length);
          }
        }
      } catch (_) { }

      // ── Layer 10: Heading check ───────────────────────────
      const _heading = _coords.heading;
      const _hasHeading = _heading !== null && _heading !== undefined;
      if (_hasHeading && (isNaN(_heading) || _heading < 0 || _heading > 360)) {
        _score += 15; _flags.push('HEADING_INVALID_' + _heading);
      }

      // ── Layer 12: DeviceMotion cross-check (anti-emulator) ─
      // HP asli selalu ada micro-vibration dari accelerometer
      if (_motionData.accel_samples.length > 0) {
        const _samples = _motionData.accel_samples;
        const _allZero = _samples.every(s => s.x === 0 && s.y === 0 && s.z === 0);
        if (_allZero) {
          _score += 10; _flags.push('MOTION_ALL_ZERO');
        } else {
          // Cek variance accelerometer — emulator sering memberikan nilai constant
          const _xVals = _samples.map(s => s.x);
          const _xMean = _xVals.reduce((a, b) => a + b, 0) / _xVals.length;
          const _xVar = _xVals.reduce((a, v) => a + (v - _xMean) ** 2, 0) / _xVals.length;
          if (_xVar < 0.0001 && _samples.length >= 5) {
            _score += 8; _flags.push('MOTION_NO_VARIANCE_' + _xVar.toFixed(6));
          }
        }
      } else if (!_motionData.gyro_available) {
        // Tidak ada motion sensor sama sekali = kemungkinan emulator
        _score += 5; _flags.push('NO_MOTION_SENSOR');
      }

      // ── Layer 13: Teleport speed calculation ──────────────
      // Hitung kecepatan perpindahan dari posisi sebelumnya
      if (prevLocData.lat && prevLocData.lng && prevLocData.ts) {
        const _pLat = prevLocData.lat, _pLng = prevLocData.lng, _pTs = prevLocData.ts;
        const _nowTs = Math.floor(Date.now() / 1000);
        const _dtSec = _nowTs - _pTs;
        if (_dtSec > 0 && _dtSec < 86400) { // dalam 24 jam terakhir
          // Haversine distance
          const _R = 6371000;
          const _dLatR = (latitude - _pLat) * Math.PI / 180;
          const _dLngR = (longitude - _pLng) * Math.PI / 180;
          const _a = Math.sin(_dLatR / 2) ** 2 + Math.cos(_pLat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.sin(_dLngR / 2) ** 2;
          const _distM = _R * 2 * Math.atan2(Math.sqrt(_a), Math.sqrt(1 - _a));
          const _speedKmh = (_distM / _dtSec) * 3.6;
          gps_fingerprint.teleport_dist_m = Math.round(_distM);
          gps_fingerprint.teleport_speed_kmh = Math.round(_speedKmh);
          if (_speedKmh > 200) {
            _score += 25; _flags.push('TELEPORT_' + Math.round(_speedKmh) + 'kmh_' + Math.round(_distM) + 'm');
          } else if (_speedKmh > 120) {
            _score += 10; _flags.push('HIGH_SPEED_' + Math.round(_speedKmh) + 'kmh');
          }
        }
      }

      // ── Layer 14: Cross-session accuracy via localStorage ─
      // Cek pola accuracy yang terlalu konsisten antar hari
      try {
        const _lsAccKey = '_gps_acc_history_ls';
        const _lsAccHist = JSON.parse(localStorage.getItem(_lsAccKey) || '[]');
        _lsAccHist.push({ acc: accuracy, ts: Date.now() });
        // Simpan max 10 entry terakhir
        while (_lsAccHist.length > 10) _lsAccHist.shift();
        localStorage.setItem(_lsAccKey, JSON.stringify(_lsAccHist));
        if (_lsAccHist.length >= 5) {
          const _allSameLS = _lsAccHist.every(h => h.acc === accuracy);
          const _allIntLS = _lsAccHist.every(h => Number.isInteger(h.acc));
          if (_allSameLS && _allIntLS) {
            _score += 8; _flags.push('ACC_CONSTANT_CROSS_SESSION_x' + _lsAccHist.length);
          }
        }
      } catch (_) { }

      // ── Layer 15: Coordinate jitter analysis ──────────────
      // GPS asli: koordinat berubah sedikit setiap kali (micro-jitter)
      // Fake GPS: sering memberikan koordinat yang stabil sempurna
      try {
        const _jitterKey = '_gps_jitter_hist';
        const _jitterHist = JSON.parse(sessionStorage.getItem(_jitterKey) || '[]');
        _jitterHist.push({ lat: latitude, lng: longitude, ts: Date.now() });
        if (_jitterHist.length > 5) _jitterHist.shift();
        sessionStorage.setItem(_jitterKey, JSON.stringify(_jitterHist));
        if (_jitterHist.length >= 3) {
          const _allSameLat = _jitterHist.every(h => h.lat === latitude);
          const _allSameLng = _jitterHist.every(h => h.lng === longitude);
          if (_allSameLat && _allSameLng) {
            _score += 15; _flags.push('COORD_NO_JITTER_x' + _jitterHist.length);
          }
        }
      } catch (_) { }

      // ── Evaluasi skor ─────────────────────────────────────
      const _isFake = _score >= 50;
      const _isSuspicious = _score >= GPS_FAKE_SCORE_THRESHOLD && _score < GPS_FAKE_SCORE_THRESHOLD + 20;

      if (_isFake) {
        const _reason = _hasXposed
          ? 'Terdeteksi patching framework (Xposed/Frida).\nNonaktifkan Mock Location di Pengaturan → Opsi Developer.'
          : `Pola GPS mencurigakan (skor: ${_score}).\nPastikan Mock Location dinonaktifkan di Pengaturan Developer.`;
        handleAbsenError(new AbsenError(_reason, ERROR_CODES.FAKE_GPS), 'resultCard');
        setBtnL('btnAbsen', false, '🔄 Coba Lagi');
        try {
          apiFetch(P.absen, {
            method: 'POST', body: JSON.stringify({
              ...{
                user: { id: window.MY_ID, username: window.tgUser?.username || '' },
                latitude, longitude, horizontal_accuracy: accuracy,
                tanggal_iso: fmtD(nowWITA()), jam: '—'
              },
              _fake_detected: true, _score, _flags, source: 'telegram_miniapp', device: _ua
            })
          });
        } catch (_) { }
        window._isAbsenSubmitting = false; resolve(); return;
      }

      // Jika suspicious (30–49): lanjutkan tapi tandai di payload
      const _suspiciousPayload = _isSuspicious ? { _suspicious: true, _score, _flags } : {};
      /* ══ AKHIR DETEKSI ══ */
      const n = nowWITA();
      const tanggal = n.toLocaleDateString('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const tanggalISO = fmtD(n);
      const jam = `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())} WITA`;
      showGPS(latitude, longitude, accuracy, null);
      setBtnL('btnAbsen', true, 'Mengirim Data...');

      // ── Siapkan data foto untuk payload ──
      const fotoInfo = camResult ? {
        foto_base64: camResult.dataUrl || null,
        face_detected: camResult.faceOk || false,
        liveness_ok: camResult.livenessOk || false,
        foto_dilewati: !camResult.faceOk && !camResult.livenessOk
      } : { foto_dilewati: true };

      // ── Stabil Idempotency Key ──
      const myNip = window.userProfile?.nip || localStorage.getItem('MY_NIP') || '';
      
      // Deteksi Tipe Absen (Masuk vs Pulang) yang lebih robust
      const tot = n.getHours() * 60 + n.getMinutes();
      const _jH = typeof getJamForTanggal === 'function' ? getJamForTanggal(tanggalISO) : null;
      const jMasukMenit = _jH ? toMenitStr(_jH.masuk) : JAM_MASUK_MENIT;
      const jPulangMenit = _jH ? toMenitStr(_jH.pulang) : JAM_PULANG_MENIT;
      
      let typeKey = 'masuk';
      if (tot > (jMasukMenit + 180) && tot < jPulangMenit) typeKey = 'siang';
      else if (tot >= jPulangMenit - 60) typeKey = 'pulang';

      const idKey = myNip || window.MY_ID || 'anon';
      const rid = `absen_${idKey}_${tanggalISO}_${typeKey}`;

      // Ambil networkInfo dengan safety check
      const net = (typeof networkInfo !== 'undefined' && networkInfo) ? networkInfo : { checked: false };

      const payload = {
        request_id: rid, 
        nip: myNip,
        telegram_id: window.MY_ID, // Flattened for n8n
        user: {
          id: window.MY_ID, 
          first_name: window.tgUser?.first_name || '', 
          last_name: window.tgUser?.last_name || '', 
          username: window.tgUser?.username || '',
          nama_lengkap: window.userProfile?.nama || '', 
          jabatan: window.userProfile?.jabatan || '', 
          nip: myNip
        },
        latitude, longitude, horizontal_accuracy: accuracy,
        gps_fingerprint,
        tanggal, tanggal_iso: tanggalISO, jam,
        timestamp: Math.floor(Date.now() / 1000), 
        init_data: initData, 
        source: isTgX ? 'telegram_x_fallback' : 'telegram_miniapp', 
        device: navigator.userAgent,
        network_info: {
          ip_public: net.ip_public || null,
          is_kantor: net.is_kantor || null,
          network_type: net.network_type || 'unknown',
          wifi_check_enabled: typeof WIFI_CHECK_ENABLED !== 'undefined' ? WIFI_CHECK_ENABLED : true
        },
        foto_verifikasi: fotoInfo,
        _gps_elapsed_ms: _gpsElapsed, _detection_score: _score, _detection_flags: _flags, ..._suspiciousPayload,
        jenis_absen: window._kontrolMode ? 'KONTROL' : undefined,
        keterangan: window._kontrolMode ? (window._kontrolKet || 'Cek kehadiran') : undefined,
      };
      window._kontrolMode = false;

      // ── GENERATE HMAC SIGNATURE (ANTI-SPOOFING) ──
      if (typeof generateSignature === 'function') {
         const sigBase = `${payload.request_id}${payload.nip}${payload.latitude}${payload.longitude}${payload.timestamp}${window._session?.token || ''}`;
         payload._signature = await generateSignature(sigBase);
      }

      // ── OFFLINE QUEUE INTERCEPTOR ──
      if (!navigator.onLine) {
        payload._is_offline_sync = true;
        const offlineData = {
          endpoint: P.absen,
          method: 'POST',
          payload: payload,
          timestamp: Date.now(),
          type: 'absen'
        };
        await idb.set('offline_queue', offlineData);

        const fotoOfflineKet = camResult?.faceOk ? '\n📸 Wajah: ✅ Tersimpan offline' : '\n📸 Foto: ⚠️ Dilewati';
        showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '📴', 'Tersimpan Sementara Karena Offline',
          `Data absen Anda tersimpan di antrean perangkat.\n📅 ${tanggal}\n🕐 ${jam}\n📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${fotoOfflineKet}\n\nSistem akan mengirim otomatis saat koneksi internet kembali.`);

        setBtnL('btnAbsen', false, '✅ Tersimpan Offline');
        if ($('btnAbsen')) $('btnAbsen').disabled = true;
        logLoaded = false;
        if (typeof autoUpdateStatusAktif === 'function') autoUpdateStatusAktif();
        return;
      }

      console.log('[Absen] Submitting payload to webhook:', payload);
        const { ok: absenOk, data: absenData, status: absenStatus } = await apiPost(P.absen, payload);
        console.log('[Absen] Webhook response:', { absenOk, absenStatus, absenData });

        if (!absenOk) {
          const errMsg = absenStatus === 0 ? 'Server tidak merespons. Periksa koneksi dan coba lagi.' : `Terjadi kesalahan pada server (Status ${absenStatus}).`;
          handleAbsenError(new AbsenError(errMsg, ERROR_CODES.UNKNOWN), 'resultCard');
          setBtnL('btnAbsen', false, '🔄 Coba Lagi');
          window._isAbsenSubmitting = false; resolve(); return;
        }

        const d = absenData || {};
        const ket = d?.message || d?.validasi?.keterangan || 'Data absen diterima';
        let lokNm = d?.validasi?.nama_lokasi || d?.lokasi || null;
        const isValid = (d?.validasi?.is_valid === true) || (d?.ok === true);
        const kode_tolak = d?.validasi?.kode_tolak || '';

        // Jika backend bilang WFH tapi GPS user dalam radius lokasi kantor, tampilkan nama lokasi kantor
        if (lokNm && lokNm.toUpperCase() === 'WFH' && window._lokasiCoords?.length) {
          for (const l of window._lokasiCoords) {
            const R = 6371000, dLat = (l.lat - latitude) * Math.PI / 180, dLon = (l.lon - longitude) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * Math.PI / 180) * Math.cos(l.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (dist <= (l.radius || 150)) { lokNm = l.nama; break; }
          }
        }

        if (lokNm) { 
          const gLok = $('gpsLokasi');
          if (gLok) gLok.textContent = lokNm; 
          const clb = $('clockLocBadge'); 
          if (clb) { clb.textContent = '📍 ' + lokNm; clb.className = 'clock-loc-badge'; } 
        }

        const fotoKet = camResult?.faceOk
          ? `\n📸 Wajah: ✅ Terdeteksi${camResult.livenessOk ? ' · Liveness ✅' : ' · Liveness ⚠️'}`
          : '\n📸 Foto: ⚠️ Wajah tidak terdeteksi (tersimpan untuk admin)';

        if (isValid) {
          showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'success', '✅', 'Absen Berhasil!',
            `${ket}\n📅 ${tanggal}\n🕐 ${jam}\n📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${Math.round(accuracy)}m)${fotoKet}`);
          setBtnL('btnAbsen', false, '✅ Absen Tercatat');
          $('btnAbsen').disabled = true;
          logLoaded = false;
          if (typeof autoUpdateStatusAktif === 'function') autoUpdateStatusAktif();
          setTimeout(loadTodayHistory, 2000);
          if (window.tg) setTimeout(() => window.tg.close(), 3500);

          Swal.fire({
            title: '✅ Absen Berhasil!',
            html: `<b>${ket}</b><br><br>📅 ${tanggal}<br>🕐 ${jam}<br>📍 GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}<br>${fotoKet.replace(/\n/g, '<br>')}`,
            icon: 'success',
            timer: 4000,
            showConfirmButton: true,
            confirmButtonText: 'OK'
          });
        } else if (kode_tolak === 'SUDAH_ABSEN') {
          showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', 'ℹ️', 'Sudah Absen',
            `${ket}\n\nRiwayat HADIR hari ini sudah tercatat. Tidak perlu absen ulang.`);
          setBtnL('btnAbsen', false, '✅ Sudah Tercatat');
          $('btnAbsen').disabled = true;
          logLoaded = false;
          setTimeout(loadTodayHistory, 1500);
          if (window.tg) setTimeout(() => window.tg.close(), 3500);

          Swal.fire({
            title: 'ℹ️ Sudah Absen',
            text: 'Riwayat HADIR hari ini sudah tercatat. Tidak perlu absen ulang.',
            icon: 'info',
            timer: 3000,
            showConfirmButton: true
          });
        } else {
          showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '❌', 'Absen Ditolak',
            `${ket}\n\nKode: ${kode_tolak || 'ERROR'}`);
          setBtnL('btnAbsen', false, '❌ Ditolak');

          Swal.fire({
            title: '❌ Absen Ditolak',
            text: ket + (kode_tolak ? ` (Kode: ${kode_tolak})` : ''),
            icon: 'error',
            confirmButtonText: 'Tutup'
          });
        }
      } catch (err) {
        console.error('[Absen] GPS Success Callback Critical Error:', err);
        handleAbsenError(new AbsenError('Gagal memproses data absen.', ERROR_CODES.UNKNOWN), 'resultCard');
        setBtnL('btnAbsen', false, '🔄 Coba Lagi');
      } finally {
        window._isAbsenSubmitting = false;
        resolve();
      }
    },
    (err) => {
      handleAbsenError(geoErrorToAbsenError(err), 'resultCard');
      setBtnL('btnAbsen', false, '🔄 Coba Lagi');
      window._isAbsenSubmitting = false;
      resolve();
    },
    { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 }
  );
  });
}

/* ════ HANDLE PULANG LUAR (LAPANGAN) ════ */
/**
 * Handle absen pulang dari luar kantor (lapangan/dinas luar).
 * Berbeda dari absen pulang biasa — tidak memerlukan GPS kantor.
 * @returns {Promise<void>}
 */
async function handlePulangLuar() {
  if ($('btnPulangLuar').disabled || window._isAbsenSubmitting) return;
  
  window._isAbsenSubmitting = true;
  const myNip = (window.userProfile?.nip || localStorage.getItem('MY_NIP') || '').trim();
  const myId = window.MY_ID;

  if (!myNip || !myId || myNip.toLowerCase() === 'undefined' || String(myId).toLowerCase() === 'undefined') {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '🆔', 'Identitas Tidak Valid',
      'Identitas Anda tidak valid (undefined). Silakan logout dan login kembali.');
    window._isAbsenSubmitting = false;
    return;
  }
  const ket = ($('ketPulangLuar').value || '').trim();
  if (!ket) {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '⚠️', 'Keterangan Wajib Diisi',
      'Tuliskan lokasi/kegiatan lapangan Anda sebelum absen pulang.');
    window._isAbsenSubmitting = false;
    return;
  }
  if (isDesktop()) {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '🖥️', 'Perangkat Tidak Didukung',
      'HADIR hanya dapat dilakukan dari smartphone.');
    window._isAbsenSubmitting = false;
    return;
  }
  const initData = window.tg?.initData || '';
  const isCapacitor = !!window.Capacitor || window.location.protocol === 'capacitor:';
  const isTgX = (!initData && window.MY_ID && window.userProfile) || isCapacitor;
  if (!initData && !isTgX) {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '⚠️', 'Buka via Telegram',
      'Aplikasi harus dibuka melalui Telegram.');
    window._isAbsenSubmitting = false;
    return;
  }
  if (!navigator.geolocation) {
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '❌', 'GPS Tidak Tersedia', 'Buka di Telegram versi terbaru.');
    window._isAbsenSubmitting = false;
    return;
  }

  // ── Block if user already has Keterangan / status non-hadir today ──
  const _todayRows = window._todayRows || [];
  const GRP_KETERANGAN = ['IZIN', 'SAKIT', 'TUGAS', 'CUTI', 'DL', 'TUBEL', 'TANPA BERITA', 'ALPA', 'TB'];
  const ketRow = _todayRows.find(r => {
    const j = (r['Jenis Absen'] || r['jenis'] || r['Jenis'] || '').toUpperCase().trim();
    return GRP_KETERANGAN.includes(j);
  });

  if (ketRow) {
    const nmKet = (ketRow['Jenis Absen'] || ketRow['jenis'] || ketRow['Jenis'] || 'KETERANGAN').toUpperCase().trim();
    showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '🚫', 'Tidak Dapat Absen', `Anda tidak dapat melakukan absen karena status hari ini adalah ${nmKet}.`);
    $('btnPulangLuar').disabled = true;
    const tSpan = $('btnPulangLuarText');
    if (tSpan) tSpan.textContent = `🚫 Status: ${nmKet}`;
    window._isAbsenSubmitting = false;
    return;
  }

  // ── Cek: pegawai harus sudah absen masuk hari ini ──
  const _sudahMasuk = _todayRows.some(r => {
    const j = (getField(r, 'Jenis Absen', 'jenis', 'Jenis') || '').toUpperCase().trim();
    return j === 'MASUK' || j === 'DI LUAR JAM MASUK';
  });
  if (!_sudahMasuk) {
    handleAbsenError(new AbsenError(
      'Anda harus absen masuk terlebih dahulu sebelum absen pulang dari lapangan.',
      ERROR_CODES.BELUM_MASUK), 'resultCard');
    window._isAbsenSubmitting = false;
    return;
  }
  $('btnPulangLuar').disabled = true;
  const tSpan = $('btnPulangLuarText');
  if (tSpan) tSpan.innerHTML = '<span class="spinner"></span> Mengambil GPS...';

  await new Promise((resolve) => {
  navigator.geolocation.getCurrentPosition(
    async ({ coords: { latitude, longitude, accuracy } }) => {
      if (accuracy > GPS_MAX_ACCURACY_M) {
        showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '⚠️', 'Sinyal GPS Lemah',
          `Akurasi ${Math.round(accuracy)}m terlalu lemah. Pindah ke area terbuka.`);
        $('btnPulangLuar').disabled = false;
        if (tSpan) tSpan.textContent = '🏃 Pulang dari Lapangan';
        window._isAbsenSubmitting = false;
        resolve();
        return;
      }
      const n = nowWITA();
      const tanggal = n.toLocaleDateString('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const tanggalISO = fmtD(n);
      const jam = `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())} WITA`;
      showGPS(latitude, longitude, accuracy, 'Lapangan');
      if (tSpan) tSpan.innerHTML = '<span class="spinner"></span> Mengirim...';


        const payload = {
          request_id: `pulang_luar_${window.userProfile?.nip}_${tanggalISO}`, // Stable Idempotency Key
          user: {
            id: window.MY_ID, first_name: window.tgUser?.first_name || '', last_name: window.tgUser?.last_name || '',
            username: window.tgUser?.username || '', nama_lengkap: window.userProfile?.nama || '',
            jabatan: window.userProfile?.jabatan || '', nip: window.userProfile?.nip || ''
          },
          latitude, longitude, horizontal_accuracy: accuracy,
          tanggal, tanggal_iso: tanggalISO, jam,
          jenis_absen: 'PULANG LUAR',
          keterangan: ket,
          skip_radius_check: true,
          timestamp: Math.floor(Date.now() / 1000),
          init_data: initData, source: isTgX ? 'telegram_x_fallback' : 'telegram_miniapp', device: navigator.userAgent
        };

      // ── GENERATE HMAC SIGNATURE (ANTI-SPOOFING) ──
      if (typeof generateSignature === 'function') {
          const nipValue = window.userProfile?.nip || '';
          const sigBase = `${payload.request_id}${nipValue}${payload.latitude}${payload.longitude}${payload.timestamp}${window._session?.token || ''}`;
         payload._signature = await generateSignature(sigBase);
      }

      // ── OFFLINE QUEUE INTERCEPTOR ──
      if (!navigator.onLine) {
        payload._is_offline_sync = true;
        const offlineData = {
          endpoint: P.absen, // Endpoint absen bisa membedakan jenis PULANG LUAR dari body
          method: 'POST',
          payload: payload,
          timestamp: Date.now(),
          type: 'pulang_luar'
        };
        await idb.set('offline_queue', offlineData);

        showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'warning', '📴', 'Tersimpan Sementara Karena Offline',
          `Data Pulang Lapangan Anda tersimpan di perangkat.\n${ket}\n📅 ${tanggal}\n🕐 ${jam}\n\nSistem akan mengirim otomatis saat koneksi internet kembali.`);

        $('btnPulangLuar').disabled = true;
        $('btnAbsen').disabled = true;
        const plf = $('pulangLuarForm'), bpl = $('btnPulangLuar');
        if (plf) plf.classList.remove('show');
        if (bpl) bpl.classList.remove('show');
        logLoaded = false;
        return;
      }

      try {
        const { ok: absenOk, data: absenData, status: absenStatus } = await apiPost(P.absen, payload);
        if (!absenOk) {
          const errMsg = absenStatus === 0 ? 'Server Tidak Merespons. Pastikan n8n & koneksi internet aktif, lalu coba lagi.' : `Terjadi kesalahan pada server (Status ${absenStatus}).`;
          showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '🔌', 'Gagal', errMsg);
          $('btnPulangLuar').disabled = false;
          if (tSpan) tSpan.textContent = '🏃 Pulang dari Lapangan';
          return;
        }
        const d = absenData || {};
        const isValid = (d?.validasi?.is_valid === true) || (d?.ok === true);
        if (isValid) {
          showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'success', '✅', 'Pulang Lapangan Tercatat!',
            `${ket}\n📅 ${tanggal}\n🕐 ${jam}\n📍 GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          $('btnPulangLuar').disabled = true;
          $('btnAbsen').disabled = true;
          const plf = $('pulangLuarForm'), bpl = $('btnPulangLuar');
          if (plf) plf.classList.remove('show');
          if (bpl) bpl.classList.remove('show');
          logLoaded = false;
          autoUpdateStatusAktif(); // update status ke AKTIF jika perlu
          setTimeout(loadTodayHistory, 2000);
          if (tg) setTimeout(() => tg.close(), 3500);
        } else {
          const errMsg = d?.validasi?.keterangan || d?.message || 'Absen ditolak server.';
          showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '❌', 'Gagal', errMsg);
          $('btnPulangLuar').disabled = false;
          if (tSpan) tSpan.textContent = '🏃 Pulang dari Lapangan';
        }
      } catch (err) {
        console.error('[Absen] Error in PulangLuar callback:', err);
        showResult('resultCard', 'rIcon', 'rTitle', 'rMsg', 'fail', '🔌', 'Server Tidak Merespons',
          'Pastikan n8n & ngrok berjalan.');
        $('btnPulangLuar').disabled = false;
        if (tSpan) tSpan.textContent = '🏃 Pulang dari Lapangan';
      } finally {
        window._isAbsenSubmitting = false;
        resolve();
      }
    },
    (err) => {
      const msg = { 1: 'Izin GPS ditolak.', 2: 'GPS tidak tersedia.', 3: 'Timeout GPS. Coba di area terbuka.' };
      handleAbsenError(geoErrorToAbsenError(err), 'resultCard');
      $('btnPulangLuar').disabled = false;
      if (tSpan) tSpan.textContent = '🏃 Pulang dari Lapangan';
      window._isAbsenSubmitting = false;
      resolve();
    },
    { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 }
  );
  });
}
window.handleAbsen = handleAbsen;
window.handlePulangLuar = handlePulangLuar;
} catch (e) {
  console.error('[Absen] Critical Initialization Error:', e);
}
