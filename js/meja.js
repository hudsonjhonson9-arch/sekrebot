/* ════ MEJA ABSEN (1:N MATCHING) ════ */
    /* ════ MEJA ABSEN (1:N matching) ════ */
    window._isMejaMode = false;
    window._mejaProcessing = false;
    var _blinkDetected = false;
    var _lastEyeRatio = 0;
    var _allFaceDescriptors = [];
    var _mejaGpsLocation = null;
    var _mejaCnt = { masuk: 0, pulang: 0, gagal: 0 };

    // Passive Liveness State
    var _livenessScore = 0;
    var _livenessHistory = [];
    var _lastLandmarks = null;
    // _isLive dikelola oleh face.js
    window._mejaUserMap = {};

    function _setMejaStatus(mode, icon, text, sub) {
      const dot = $('mejaStatusDot');
      const ico = $('mejaStatusIcon');
      const txt = $('mejaStatusText');
      const stxt = $('mejaStatusSub');
      if (dot) { dot.className = 'meja-status-dot' + (mode === 'active' ? ' active' : mode === 'processing' ? ' processing' : ''); }
      if (ico) ico.textContent = icon;
      if (txt) txt.textContent = text;
      if (stxt) stxt.textContent = sub || '';
    }

    function _updateMejaCnt() {
      const msk = $('mejaCntMasuk'); if (msk) msk.textContent = _mejaCnt.masuk;
      const plg = $('mejaCntPulang'); if (plg) plg.textContent = _mejaCnt.pulang;
      const ggl = $('mejaCntGagal'); if (ggl) ggl.textContent = _mejaCnt.gagal;
    }

    function _showMejaResult(type, msg) {
      const el = $('mejaResultCard');
      if (!el) return;
      el.className = 'meja-result-card ' + type;
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    async function _getMejaGps() {
      return new Promise(resolve => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
          () => resolve(null),
          { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
        );
      });
    }
    /* ════ CATATAN: handleMejaLogic telah digantikan oleh logika passive liveness 
       di dalam startDetectLoop untuk akurasi yang lebih baik ════ */

    /**
     * Mulai mode Meja Absen: buka kamera, ambil GPS, dan mulai loop deteksi 1:N.
     * Identifikasi pegawai otomatis tanpa perlu input manual.
     * @returns {Promise<void>}
     */
    async function startMejaAbsen() {
      // 0. RESET TOTAL STATE (Mencegah residu deteksi sebelumnya)
      _lastMejaId = null;
      _lastMejaTime = 0;
      _autoCaptured = false;
      _mejaProcessing = false;
      _mejaStartTime = Date.now(); // Catat waktu mulai
      _mejaCnt = { masuk: 0, pulang: 0, gagal: 0 };
      _updateMejaCnt();
      if (!window._mejaUserMap) window._mejaUserMap = {};

      const btn = $('btnMejaAbsen');
      if (btn) btn.style.display = 'none';
      const btnStop = $('btnMejaStop');
      if (btnStop) btnStop.style.display = 'flex';

      window._isMejaMode = true; // Set Global State
      window._aiEngine = 'human'; // Force Human-AI for matching accuracy
      _isMejaAbsen = true;

      _setMejaStatus('processing', '⏳', 'Memuat Database & GPS...', 'Membuka kamera');

      // 1. LANGSUNG BUKA KAMERA (Non-Blocking)
      // Kamera butuh waktu 1-3 detik untuk menyala di HP, jadi kita lakukan paralel dengan fetch data
      openCamOverlay('meja');
      if ($('btnCapture')) $('btnCapture').style.display = 'none'; // Sembunyikan tombol capture
      if ($('livenessMini')) $('livenessMini').style.display = 'block'; // Tampilkan instruksi kedip
      if ($('camHeaderTitle')) $('camHeaderTitle').textContent = '🖥️ Menyiapkan Meja Absen...';

      // 2. FETCH GPS DAN DATA WAJAH (Try Cache First)
      const loadData = async () => {
      const gps = await _getMejaGps();
      _mejaGpsLocation = gps;
      const locEl = $('mejaLocVal'), accEl = $('mejaLocAccuracy');
      if (_mejaGpsLocation && locEl) {
        locEl.textContent = `${_mejaGpsLocation.lat.toFixed(6)}, ${_mejaGpsLocation.lng.toFixed(6)}`;
        if (accEl) accEl.textContent = `±${Math.round(_mejaGpsLocation.acc)}m`;
      }

      // Try load from local IDB first for instant startup
      try {
        const cached = await idb.get('master_data', 'all_face_descriptors');
        if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
          console.log(`[Meja] Memuat ${cached.data.length} wajah dari cache lokal...`);
          _allFaceDescriptors = cached.data;
          if (cached.userMap) window._mejaUserMap = cached.userMap;
          _setMejaStatus('active', '🔍', `Siap Scan (${_allFaceDescriptors.length} Pegawai - Cache)`, 'Menjalankan Kamera...');
        }
      } catch (e) { console.warn('[Meja] Gagal baca cache:', e); }

      // Fetch descriptors dari userList (include face_histogram)
      // ponytail: face-get-all CORS blocked, pakai userList?format=full sebagai fallback
      try {
        const ur = await apiGet(P.userList + '?format=full');
        if (ur.ok) {
          const ud = (ur.rows?.length ?? 0) ? ur.rows : parseApiResponse(ur.data);
          const users = Array.isArray(ud) ? ud : (ud?.data || []);
          const descs = [];
          const userMap = {};
          for (const u of users) {
            const uid = String(u.ID || u.id || u.telegram_id || '');
            const nama = u.Nama || u.nama || u.username || uid;
            const histRaw = u.face_histogram || u.descriptor || u.face_descriptor;
            if (!histRaw || histRaw === '' || histRaw === '[]') continue;
            let arr;
            try { arr = typeof histRaw === 'string' ? JSON.parse(histRaw) : histRaw; } catch { continue; }
            if (!Array.isArray(arr) || arr.length < 128) continue;
            descs.push({ id: uid, descriptor: arr });
            userMap[uid] = { nama, nip: u.nip || u.NIP || '' };
          }
          if (descs.length > 0) {
            _allFaceDescriptors = descs;
            window._mejaUserMap = userMap;
            _setMejaStatus('active', '🔍', `Siap Scan (${descs.length} Pegawai)`, 'Menjalankan Kamera...');
            // Cache ke IDB supaya startup berikutnya lebih cepat
            await idb.set('master_data', { key: 'all_face_descriptors', data: descs, userMap, updated: Date.now() });
            console.log(`[Meja] Loaded ${descs.length} face descriptors from userList`);
          } else {
            console.warn('[Meja] Tidak ada face descriptor ditemukan di userList');
            _setMejaStatus('active', '⚠️', 'Database Wajah Kosong', 'Daftarkan wajah pegawai terlebih dahulu');
          }
        }
      } catch (e) { console.warn('[Meja] Gagal fetch face descriptors:', e); }
      };

      await loadData();
    }

    /**
     * Hentikan mode Meja Absen dan tutup kamera.
     * @returns {Promise<void>}
     */
    async function stopMejaAbsen() {
      window._isMejaMode = false;
      _isMejaAbsen = false;
      window._mejaProcessing = false;
      _allFaceDescriptors = [];

      closeCamOverlay(false); // Mematikan kamera & stream (programmatic, bukan oleh user)

      _setMejaStatus('idle', '🖥️', 'Sesi Dihentikan', 'Counter tersimpan di atas');
      const btnStart = $('btnMejaAbsen');
      const btnStop = $('btnMejaStop');
      if (btnStart) { btnStart.style.display = 'flex'; btnStart.disabled = false; $('btnMejaText').textContent = 'Mulai Meja Absen'; }
      if (btnStop) btnStop.style.display = 'none';
    }
