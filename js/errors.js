    /* ════ CENTRALIZED ERROR HANDLING ════
       Error codes, custom error class, dan handler terpusat
       untuk semua jenis error di aplikasi absensi.
    */

    /* ── Error Codes ── */
    const ERROR_CODES = {
      // GPS / Lokasi
      GPS_DENIED:        'GPS_DENIED',
      GPS_TIMEOUT:       'GPS_TIMEOUT',
      GPS_UNAVAILABLE:   'GPS_UNAVAILABLE',
      FAKE_GPS:          'FAKE_GPS',
      WEAK_GPS:          'WEAK_GPS',
      GPS_ACCURACY:      'GPS_ACCURACY',

      // Jaringan
      NETWORK_ERROR:     'NETWORK_ERROR',
      SERVER_TIMEOUT:    'SERVER_TIMEOUT',
      WIFI_REQUIRED:     'WIFI_REQUIRED',

      // Auth
      AUTH_REQUIRED:     'AUTH_REQUIRED',
      NOT_REGISTERED:    'NOT_REGISTERED',
      WRONG_NIP:         'WRONG_NIP',

      // Face recognition
      FACE_NOT_REGISTERED:   'FACE_NOT_REGISTERED',
      FACE_NO_MATCH:         'FACE_NO_MATCH',
      FACE_MODEL_NOT_READY:  'FACE_MODEL_NOT_READY',
      FACE_NOT_DETECTED:     'FACE_NOT_DETECTED',

      // Absen
      SUDAH_ABSEN:       'SUDAH_ABSEN',
      BELUM_MASUK:       'BELUM_MASUK',
      DILUAR_JADWAL:     'DILUAR_JADWAL',
      LOKASI_JAUH:       'LOKASI_JAUH',

      // Keterangan
      KET_DUPLIKAT:      'KET_DUPLIKAT',
      KET_FORM_INVALID:  'KET_FORM_INVALID',

      // Generic
      UNKNOWN:           'UNKNOWN',
    };

    /**
     * Custom error class untuk error aplikasi absensi.
     * Membawa error code dan detail tambahan.
     */
    class AbsenError extends Error {
      /**
       * @param {string} message - Pesan error human-readable
       * @param {string} code - Salah satu dari ERROR_CODES
       * @param {any} [details] - Data tambahan untuk debugging
       */
      constructor(message, code = ERROR_CODES.UNKNOWN, details = null) {
        super(message);
        this.name = 'AbsenError';
        this.code = code;
        this.details = details;
      }
    }

    /* ── Peta tampilan error ke UI ── */
    const _ERROR_UI_MAP = {
      [ERROR_CODES.GPS_DENIED]:          { icon: '🚫', title: 'Izin Lokasi Ditolak',      type: 'fail',    hint: 'Aktifkan izin lokasi di pengaturan browser/Telegram.' },
      [ERROR_CODES.GPS_TIMEOUT]:         { icon: '⏱️', title: 'GPS Timeout',              type: 'fail',    hint: 'Sinyal GPS tidak ditemukan. Coba di tempat terbuka.' },
      [ERROR_CODES.GPS_UNAVAILABLE]:     { icon: '📡', title: 'GPS Tidak Tersedia',       type: 'fail',    hint: 'Perangkat ini tidak mendukung GPS.' },
      [ERROR_CODES.FAKE_GPS]:            { icon: '🚫', title: 'Fake GPS Terdeteksi',      type: 'fail',    hint: 'Nonaktifkan aplikasi fake GPS dan coba lagi.' },
      [ERROR_CODES.WEAK_GPS]:            { icon: '⚠️', title: 'Sinyal GPS Lemah',         type: 'warning', hint: 'Pindah ke area yang lebih terbuka.' },
      [ERROR_CODES.GPS_ACCURACY]:        { icon: '📍', title: 'Akurasi GPS Rendah',       type: 'warning', hint: 'Tunggu beberapa saat agar GPS lebih akurat.' },
      [ERROR_CODES.NETWORK_ERROR]:       { icon: '🌐', title: 'Gagal Terhubung Server',   type: 'fail',    hint: 'Periksa koneksi internet dan coba lagi.' },
      [ERROR_CODES.SERVER_TIMEOUT]:      { icon: '⏱️', title: 'Server Tidak Merespons',   type: 'fail',    hint: 'Server sedang sibuk. Coba beberapa saat lagi.' },
      [ERROR_CODES.WIFI_REQUIRED]:       { icon: '📶', title: 'WiFi Kantor Diperlukan',   type: 'fail',    hint: 'Hubungkan ke jaringan WiFi kantor.' },
      [ERROR_CODES.AUTH_REQUIRED]:       { icon: '🔒', title: 'Belum Login',              type: 'fail',    hint: 'Silakan login terlebih dahulu.' },
      [ERROR_CODES.NOT_REGISTERED]:      { icon: '👤', title: 'Belum Terdaftar',          type: 'fail',    hint: 'Hubungi admin untuk mendaftarkan akun Anda.' },
      [ERROR_CODES.FACE_NOT_REGISTERED]: { icon: '😶', title: 'Wajah Belum Didaftarkan', type: 'warning', hint: 'Daftarkan wajah di tab Profil terlebih dahulu.' },
      [ERROR_CODES.FACE_NO_MATCH]:       { icon: '❌', title: 'Wajah Tidak Cocok',        type: 'fail',    hint: 'Pastikan wajah terlihat jelas dan coba lagi.' },
      [ERROR_CODES.FACE_NOT_DETECTED]:   { icon: '🔍', title: 'Wajah Tidak Terdeteksi',   type: 'fail',    hint: 'Posisikan wajah di tengah kamera.' },
      [ERROR_CODES.FACE_MODEL_NOT_READY]:{ icon: '⏳', title: 'Model AI Belum Siap',      type: 'warning', hint: 'Tunggu model AI selesai dimuat.' },
      [ERROR_CODES.SUDAH_ABSEN]:         { icon: 'ℹ️', title: 'Sudah Absen',             type: 'warning', hint: '' },
      [ERROR_CODES.BELUM_MASUK]:         { icon: '⚠️', title: 'Belum Absen Masuk',        type: 'warning', hint: 'Lakukan absen masuk terlebih dahulu.' },
      [ERROR_CODES.DILUAR_JADWAL]:       { icon: '🕐', title: 'Di Luar Jadwal Absen',     type: 'warning', hint: 'HADIR hanya bisa dilakukan sesuai jadwal.' },
      [ERROR_CODES.LOKASI_JAUH]:         { icon: '📍', title: 'Lokasi Terlalu Jauh',      type: 'fail',    hint: 'Anda berada di luar radius lokasi absen yang diizinkan.' },
      [ERROR_CODES.KET_DUPLIKAT]:        { icon: '⚠️', title: 'Keterangan Sudah Ada',     type: 'warning', hint: 'Keterangan untuk tanggal ini sudah pernah diajukan.' },
      [ERROR_CODES.KET_FORM_INVALID]:    { icon: '📋', title: 'Form Tidak Lengkap',       type: 'fail',    hint: 'Lengkapi semua field yang wajib diisi.' },
      [ERROR_CODES.UNKNOWN]:             { icon: '❌', title: 'Terjadi Kesalahan',         type: 'fail',    hint: '' },
    };

    /**
     * Tampilkan error ke result card di UI.
     * Bekerja dengan showResult() yang sudah ada.
     *
     * @param {AbsenError|Error|string} error - Error object atau string pesan
     * @param {string} [cardId='resultCard'] - ID result card target
     * @param {string} [containerId] - ID container (opsional, untuk versi 8-arg showResult)
     */
    function handleAbsenError(error, cardId = 'resultCard', containerId = null) {
      let code   = ERROR_CODES.UNKNOWN;
      let msg    = typeof error === 'string' ? error : (error?.message || 'Terjadi kesalahan tidak diketahui.');

      if (error instanceof AbsenError) {
        code = error.code;
        console.error(`[AbsenError:${code}]`, msg, error.details || '');
      } else {
        console.error('[Error]', msg, error);
      }

      const cfg = _ERROR_UI_MAP[code] || _ERROR_UI_MAP[ERROR_CODES.UNKNOWN];
      const fullMsg = cfg.hint ? `${msg}${msg.endsWith('.') ? '' : '.'} ${cfg.hint}` : msg;

      // Kompatibel dengan dua signature showResult yang ada:
      // showResult(cid, iid, tid, mid, type, icon, title, msg)  — 8 arg (legacy)
      // showResult(cardId, type, icon, title, msg)              — 5 arg (baru)
      if (typeof showResult === 'function') {
        try {
          if (containerId) {
            showResult(containerId, cardId, cardId + 'Icon', cardId + 'Msg', cfg.type, cfg.icon, cfg.title, fullMsg);
          } else {
            showResult(cardId, 'rIcon', 'rTitle', 'rMsg', cfg.type, cfg.icon, cfg.title, fullMsg);
          }
        } catch (_) {
          // Fallback: console saja jika showResult tidak tersedia / arg salah
          console.warn('[handleAbsenError] showResult failed:', cfg.title, fullMsg);
        }
      }
    }

    /**
     * Buat AbsenError dari error GeolocationPositionError browser.
     * @param {GeolocationPositionError} geoErr
     * @returns {AbsenError}
     */
    function geoErrorToAbsenError(geoErr) {
      const codeMap = {
        1: ERROR_CODES.GPS_DENIED,
        2: ERROR_CODES.GPS_UNAVAILABLE,
        3: ERROR_CODES.GPS_TIMEOUT,
      };
      const msgMap = {
        1: 'Izin akses lokasi ditolak.',
        2: 'Lokasi tidak tersedia di perangkat ini.',
        3: 'Permintaan lokasi habis waktu.',
      };
      const code = codeMap[geoErr?.code] || ERROR_CODES.GPS_UNAVAILABLE;
      return new AbsenError(msgMap[geoErr?.code] || geoErr?.message || 'GPS error.', code, geoErr);
    }
