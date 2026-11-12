/* ════ FACE RECOGNITION & CAMERA ════ */
    /* ════════════════════════════════════════════════════════════════
       SISTEM VERIFIKASI WAJAH & SERAGAM — BAPPERIDA Sumba Barat v1.0
       ════════════════════════════════════════════════════════════════
       Alur:
       1. handleAbsen() → buka modal kamera → openCamOverlay()
       2. Muat model BlazeFace (cached setelah pertama kali)
       3. Loop deteksi: wajah → liveness (kedip + geleng) → warna baju
       4. doCapture() → ambil foto → encode base64
       5. Lanjutkan GPS + kirim payload dengan foto
       ════════════════════════════════════════════════════════════════ */



    let _camStream = null;

    // ponytail: cache hot DOM refs (queried 10+ times in detection loop)
    let _cachedLsText = null, _cachedLsIcon = null;
    function _getLsText() { return _cachedLsText || (_cachedLsText = $('lsText')); }
    function _getLsIcon() { return _cachedLsIcon || (_cachedLsIcon = $('lsIcon')); }
    let _blazeModel = null;
    let _modelLoading = false;
    let _detectLoop = null;
    let _liveMatchTimer = null; // interval untuk live face match di overlay kamera
    let _autoCaptured = false; // flag agar auto-capture hanya sekali per sesi
    let _lastHumanScore = '0.00'; // Untuk debugging liveness score Human.js
    let _faceHistory = [];   // riwayat posisi hidung untuk deteksi geleng
    let _eyeHistory = [];   // riwayat eye aspect ratio untuk deteksi kedip
    let _noseYHistory = [];   // riwayat posisi hidung vertikal untuk deteksi angguk
    let _livenessState = { faceOk: false, ch1: false, ch2: false };
    let _captureData = null; // { dataUrl, faceOk, livenessOk, faceMatchScore }
    let _absenCallbackAfterCam = null; // fungsi yang dipanggil setelah kamera selesai
    let _skipVerifikasi = false;
    let _isLive = false;

    // Tantangan liveness ditiadakan sesuai permintaan
    function pickRandomChallenges() { return []; }
    function buildLivenessStepsUI() { }

    // ── Face Recognition helpers (face-api.js descriptor-based) ──
    const FACE_STORE_KEY = STORAGE_KEYS.FACE_REF;
    let FACE_RECOGNITION_ENABLED = null;

    // ponytail: load admin face settings — called from initApp(), NOT at parse time
    async function loadFaceSettingsGlobal() {
      try {
        const res = await apiGet(P.faceSettings);
        if (res.ok) {
          const d = res.data?.settings || res.data || {};
          if (d.liveness_enabled !== undefined) {
            window.FS_LIVENESS_MOBILE = d.liveness_enabled !== false;
            window.FS_FACE_THRESHOLD = parseFloat(d.face_threshold) || 0.55;
            window.FS_MEJA_THRESHOLD = parseFloat(d.meja_threshold) || 0.55;
            window.FS_LIVENESS_SCORE = parseFloat(d.liveness_score) || 0.40;
            window.MANDATORY_FACE_NIPS = d.mandatory_nips || [];
            return;
          }
        }
      } catch {}
      // Fallback: localStorage
      try {
        const raw = localStorage.getItem('face_admin_settings');
        if (raw) {
          const fs = JSON.parse(raw);
          if (fs.liveness_enabled !== undefined) window.FS_LIVENESS_MOBILE = fs.liveness_enabled;
          if (fs.face_threshold !== undefined) window.FS_FACE_THRESHOLD = fs.face_threshold;
          if (fs.meja_threshold !== undefined) window.FS_MEJA_THRESHOLD = fs.meja_threshold;
          if (fs.liveness_score !== undefined) window.FS_LIVENESS_SCORE = fs.liveness_score;
          if (fs.mandatory_nips) window.MANDATORY_FACE_NIPS = fs.mandatory_nips;
        }
      } catch (_) {}
    }

    // Cleanup legacy localStorage biometric data on first load
    try {
      const legacyKeys = [FACE_STORE_KEY, 'face_ref_bapperida', 'face_ref_bapperida_v2'];
      legacyKeys.forEach(k => { if (localStorage.getItem(k)) localStorage.removeItem(k); });
    } catch (_) {}

    function getFaceRef() {
      if (window._faceRefCache && window._faceRefCache[String(MY_ID || '')]) {
        return window._faceRefCache[String(MY_ID || '')];
      }
      return null;
    }

    function _writeFaceRefLocal(uid, faceData) {
      if (!uid) return;
      if (!window._faceRefCache) window._faceRefCache = {};
      window._faceRefCache[uid] = faceData;
    }

    // ── Extract face descriptor menggunakan Human.js ──
    async function getFaceDescriptor(input) {
      let waitStart = Date.now();
      while (_isDetecting && (Date.now() - waitStart < 3000)) {
        await new Promise(r => setTimeout(r, 50));
      }
      const prevDetectState = _isDetecting;
      _isDetecting = true;
      try {
        if (!HumanInstance) return null;
        const res = await _detectWithTimeout(input, 8000);
        return (res && res.face && res.face.length > 0) ? res.face[0].embedding : null;
      } catch (e) {
        if (e.message === 'AI_TIMEOUT') setCamStatus('warn', '<i class="fas fa-exclamation-triangle"></i>', 'AI Terlalu Lambat', '...');
        return null;
      } finally {
        _isDetecting = prevDetectState;
      }
    }

    // ── Extract descriptor from dataUrl (dengan retry 3x) ──
    async function getDescriptorFromDataUrl(dataUrl) {
      if (!dataUrl) return null;
      const extract = async () => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const timeout = setTimeout(() => resolve(null), 15000); // 15 detik
          img.onload = async () => {
            clearTimeout(timeout);
            const cnv = document.createElement('canvas');
            cnv.width = img.width; cnv.height = img.height;
            cnv.getContext('2d').drawImage(img, 0, 0);
            const descriptor = await getFaceDescriptor(img);
            resolve(descriptor);
          };
          img.onerror = () => { clearTimeout(timeout); resolve(null); };
          img.src = dataUrl;
        });
      };
      // Retry 3x
      for (let i = 0; i < 3; i++) {
        const d = await extract();
        if (d) return d;
        await new Promise(r => setTimeout(r, 500));
      }
      return null;
    }

    async function syncFaceToServer(uid, dataUrl, descriptorArray, nama, savedAt, targetNip) {
      if (!uid || uid === 'null' || uid === '') return false;

      // Kompresi sudah dilakukan di doCapture, tidak perlu diulang di sini

      const dLen = (descriptorArray && Array.isArray(descriptorArray)) ? descriptorArray.length : 0;
      const actualModel = dLen >= 512 ? 'human' : 'faceapi';

      const effectiveNip = targetNip || (window._mejaUserMap && window._mejaUserMap[uid] && window._mejaUserMap[uid].nip) || localStorage.getItem('MY_NIP') || '';

      const payload = {
        user_id: uid,
        id: uid,
        nip: effectiveNip,
        nama: nama || 'Pegawai',
        foto_base64: dataUrl,
        face_photo: dataUrl,
        face_descriptor: descriptorArray,
        face_histogram: descriptorArray,
        face_model: actualModel, // Detect from dimension to avoid fallback-induced mismatch
        saved_at: savedAt || new Date().toISOString(),
        savedBy: MY_ID,
        savedByName: (tgUser && tgUser.first_name) || 'System'
      };

      try {
        // ponytail: upload foto Drive bisa >15s (gasUpsert budget 45s, nginx 60s).
        const { ok: faceRegOk, data: res, status } = await apiPost(P.faceRegister, payload, { timeout: 50000 });

        console.log(`[AI] Sync Response Status: ${status}`);

        if (faceRegOk) {
          try {
            const json = res;
            // Upate local cache (memory only for image)
            _writeFaceRefLocal(uid, {
              dataUrl: json.dataUrl || dataUrl,
              descriptor: descriptorArray,
              savedAt: payload.saved_at
            });
            if (typeof loadAdminFaceReg === 'function' && IS_ADMIN) {
              loadAdminFaceReg();
            }
            return true;
          } catch (e) {
            console.error('[AI] JSON Parse Error:', e);
            return true;
          }
        } else {
          console.error('[AI] Sync Failed Detail:', res);
          window._lastAiError = (res && (res.message || res.error))
            || (status ? `HTTP ${status}` : 'Server tidak merespons (jaringan/timeout)');
          return false;
        }
      } catch (e) {
        console.warn('Sync face server error:', e);
        // Optimasi: Simpan error di window agar bisa dibaca caller jika butuh detail
        window._lastAiError = e.message;
        return false;
      }
    }

    /**
     * Simpan referensi wajah user sendiri ke server dan localStorage.
     * @param {string} dataUrl - Foto wajah (data URL)
     * @param {number[]|Float32Array} descriptor - Descriptor vektor wajah
     * @returns {Promise<void>}
     */
        async function saveFaceRef(dataUrl, descriptor) {
      try {
        const uid = String(MY_ID || '');
        const savedAt = new Date().toISOString();
        let descriptorToSave = descriptor ? Array.from(descriptor) : null;

        if (!descriptorToSave && dataUrl) {
          setCamStatus('ok', '<i class="fas fa-search"></i>', 'Verifikasi data wajah...', 'Sedang mencocokkan AI');
          const desc = await getDescriptorFromDataUrl(dataUrl);
          if (desc) descriptorToSave = Array.from(desc);
        }

        if (!descriptorToSave) {
          setCamStatus('bad', '<i class="fas fa-times"></i>', 'Wajah Tidak Jelas', 'Pastikan wajah menghadap lurus ke kamera');
          return false;
        }

        setCamStatus('ok', '<i class="fas fa-satellite-dish"></i>', 'Mengirim...', 'Menyimpan ke server');
        const ok = await syncFaceToServer(uid, dataUrl, descriptorToSave, tgUser.first_name, savedAt);
        if (ok) {
          updateProfilFaceUI();
        } else {
          setCamStatus('bad', '<i class="fas fa-times"></i>', 'Gagal Simpan', window._lastAiError || 'Server tidak merespons');
        }
        return ok;
      } catch (err) { 
        setCamStatus('bad', '<i class="fas fa-times"></i>', 'Error', err.message);
        return false; 
      }
    }

    async function loadFaceFromServer() {
      const uid = await waitForMyId();
      if (!uid) return;
      const uidStr = String(uid);
      try {
        const res = await apiGet(P.faceGet, { user_id: uidStr });
        if (!res.ok) return;
        // data may be object {face_photo, descriptor} or wrapped in array
        const rawFace = res.rows.length ? res.rows[0] : res.data;
        const json = Array.isArray(rawFace) ? rawFace[0] : (rawFace ?? {});
        const photo = json.face_photo || json.dataUrl || json.foto_base64 || null;
        const descriptor = json.face_histogram || json.face_descriptor || json.descriptor || json.histogram || null;
        const savedAt = json.face_saved_at || json.saved_at || json.savedAt || new Date().toISOString();
        const faceModel = json.face_model || (descriptor && JSON.parse(descriptor).length >= 512 ? 'human' : 'faceapi');

        if (photo) {
          _writeFaceRefLocal(uidStr, { dataUrl: photo, descriptor, savedAt, faceModel });
          updateProfilFaceUI();
          updateFaceRegUI();
        }
      } catch (_) { }
    }

    // ── Euclidean distance between two 128-d descriptors ──
    /**
     * Hitung Euclidean distance antara dua descriptor wajah.
     * Semakin kecil nilai, semakin mirip (0 = identik).
     * @param {number[]|Float32Array} desc1
     * @param {number[]|Float32Array} desc2
     * @returns {number} jarak (0.0 – ~1.5)
     */
        function euclideanDistance(desc1, desc2) {
      if (!desc1 || !desc2) return 999;
      // Handle TypedArrays or standard Arrays
      const d1 = Array.isArray(desc1) ? desc1 : Array.from(desc1);
      const d2 = Array.isArray(desc2) ? desc2 : Array.from(desc2);
      if (d1.length !== d2.length || d1.length === 0) return 999;

      let sum = 0;
      for (let i = 0; i < d1.length; i++) {
        const d = d1[i] - d2[i];
        sum += d * d;
      }
      return Math.sqrt(sum);
    }

    /**
     * Pencocokan 1-ke-Banyak (Identification) untuk Meja Absen.
     * Mencari kandidat terbaik dari _allFaceDescriptors.
     */
    /**
     * Cocokkan descriptor wajah dengan seluruh database pegawai (1:N matching).
     * Dipakai oleh Meja Absen untuk mengidentifikasi pegawai tanpa input manual.
     * @param {Float32Array|number[]} capturedDesc - Descriptor wajah dari kamera
     * @returns {Promise<{id: string, score: number}|null>} ID pegawai terbaik & skor kemiripan
     */
        async function matchMejaCandidate(capturedDesc) {
      const allDescriptors = (window._allFaceDescriptors && window._allFaceDescriptors.length)
        ? window._allFaceDescriptors
        : (typeof _allFaceDescriptors !== 'undefined' && _allFaceDescriptors.length ? _allFaceDescriptors : []);

      if (!capturedDesc || !allDescriptors.length) return { id: 'unknown', score: 0 };

      let bestMatch = { id: 'unknown', score: 0 };
      let second = 0;
      const capDim = capturedDesc.length;
      const engine = window._aiEngine || 'human';

      for (const ref of allDescriptors) {
        let refDesc = ref.descriptor;
        if (typeof refDesc === 'string') {
          try { refDesc = JSON.parse(refDesc); } catch (_) { continue; }
        }
        const refDim = (refDesc && Array.isArray(refDesc)) ? refDesc.length : 0;
        let similarity = 0;

        if (engine === 'human' && HumanInstance && capDim >= 512 && refDim >= 512) {
          // Human to Human similarity (0 to 1)
          similarity = HumanInstance.match.similarity(refDesc, capturedDesc);
        } else if (capDim === 128 && refDim === 128) {
          // Face-API Euclidean fallback (higher dist = lower similarity)
          const dist = euclideanDistance(refDesc, capturedDesc);
          // Convert distance to pseudo-similarity (0 to 1). 0.55 threshold => ~0.73 score
          similarity = Math.max(0, 1 - (dist / 1.5)); 
        } else {
          // Dimension mismatch - skip candidate
          continue;
        }

        if (similarity > bestMatch.score) {
          second = bestMatch.score;
          bestMatch = { id: ref.id, score: similarity };
        } else if (similarity > second) {
          second = similarity;
        }
      }

      // Thresholding — admin-configurable via Face Settings panel
      const threshold = window._isMejaMode
        ? (typeof FS_MEJA_THRESHOLD !== 'undefined' ? FS_MEJA_THRESHOLD : 0.55)
        : (typeof FS_FACE_THRESHOLD !== 'undefined' ? FS_FACE_THRESHOLD : (typeof FACE_THRESHOLD !== 'undefined' ? FACE_THRESHOLD : 0.55));
      
      if (bestMatch.score < threshold) {
        return { id: 'unknown', score: bestMatch.score };
      }

      if (second > 0 && bestMatch.score - second < (window.FaceQuality ? window.FaceQuality.THRESHOLDS.ambiguousDelta : 0.05)) {
        return { id: 'unknown', score: bestMatch.score, ambiguous: true };
      }

      return bestMatch;
    }

    /**
     * Mencocokkan wajah dari foto yang diambil kamera dengan referensi tersimpan.
     * @param {string} capturedDataUrl - Data URL gambar dari kamera
     * @param {Float32Array|null} preDescriptor - Descriptor yang sudah dihitung sebelumnya (opsional)
     * @returns {Promise<{matched: boolean, score: number, message: string}>}
     */
    async function matchFace(capturedDataUrl, preDescriptor = null) {
      const ref = getFaceRef();
      if (!ref) return { score: -1, label: 'Belum ada data', cls: 'face-match-skip', capturedDescriptor: null };

      let refDesc = ref.descriptor;
      if (typeof refDesc === 'string') {
        try { refDesc = JSON.parse(refDesc); } catch (e) { refDesc = null; }
      }

      let capturedDescArr = preDescriptor;
      if (!capturedDescArr && capturedDataUrl) {
        const raw = await getDescriptorFromDataUrl(capturedDataUrl);
        capturedDescArr = raw ? Array.from(raw) : null;
      }

      if (refDesc && capturedDescArr && HumanInstance) {
        const refDim = refDesc.length;
        const capDim = capturedDescArr.length;

        if (refDim >= 512 && capDim >= 512) {
          const sim = HumanInstance.match.similarity(refDesc, capturedDescArr);
          const score = Math.round(sim * 100);
          const threshold = typeof FS_FACE_THRESHOLD !== 'undefined' ? FS_FACE_THRESHOLD : FACE_THRESHOLD;
          let label, cls;
          if (sim >= threshold) { label = `<i class="fas fa-check"></i> Cocok ${score}%`; cls = 'face-match-ok'; }
          else if (sim >= threshold - 0.1) { label = `<i class="fas fa-exclamation-triangle"></i> Mirip ${score}%`; cls = 'face-match-warn'; }
          else { label = `<i class="fas fa-times"></i> Tidak Cocok ${score}%`; cls = 'face-match-warn'; }
          return { score, label, cls, similarity: sim, capturedDescriptor: capturedDescArr };
        }

        // Dimensi tidak cocok (descriptor lama format face-api 128-dim)
        return {
          score: 0,
          label: `<i class="fas fa-exclamation-triangle"></i> Data wajah lama — silakan daftarkan ulang`,
          cls: 'face-match-warn',
          capturedDescriptor: capturedDescArr,
          needsUpdate: true
        };
      }

      return { score: 0, label: '<i class="fas fa-exclamation-triangle"></i> Gagal ekstrak wajah', cls: 'face-match-warn', capturedDescriptor: capturedDescArr };
    }

    function updateFaceRegUI() {
      const ref = getFaceRef();
      const card = $('faceRegCard'); if (!card) return;
      const thumb = $('faceRegThumb');
      const thumbEmpty = $('faceRegThumbEmpty');
      const status = $('faceRegStatus');
      const sub = $('faceRegSub');
      const btn = $('btnRegisterFace');

      const descLen = (ref && ref.descriptor) ? (Array.isArray(ref.descriptor) ? ref.descriptor.length : 0) : 0;
      const hasDescriptor = descLen >= 128;
      const isHuman = ref?.faceModel === 'human' || descLen >= 512;

      if (ref) {
        if (thumb && ref.dataUrl) { thumb.src = ref.dataUrl; thumb.style.display = 'block'; }
        else if (thumb) { thumb.style.display = 'none'; }
        if (thumbEmpty) thumbEmpty.style.display = 'none';

        const d = new Date(ref.savedAt);
        const tgl = isNaN(d) ? '—' : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

        if (status) {
          status.innerHTML = isHuman ? '<i class="fas fa-shield-alt"></i> Data Wajah Human Aktif' : (hasDescriptor ? '<i class="fas fa-exclamation-triangle"></i> Format Lama — Perlu Daftar Ulang' : '<i class="fas fa-times"></i> Belum Ada Data Wajah');
          status.style.color = isHuman ? 'var(--success)' : (hasDescriptor ? 'var(--warning)' : 'var(--danger)');
        }
        if (sub) {
          sub.textContent = isHuman ? `Didaftarkan: ${tgl} · Face AI Human aktif` : `Daftarkan ulang wajah agar kompatibel dengan Face AI terbaru`;
        }
        if (btn) {
          btn.innerHTML = hasDescriptor ? '<i class="fas fa-sync"></i> Perbarui' : '<i class="fas fa-camera"></i> Daftarkan Ulang';
        }
      } else {
        if (thumb) thumb.style.display = 'none';
        if (thumbEmpty) thumbEmpty.style.display = 'flex';
        if (status) {
          status.textContent = 'Belum ada data wajah';
          status.style.color = 'var(--muted)';
        }
        if (sub) {
          sub.textContent = 'Daftarkan wajah untuk pengenalan AI otomatis';
        }
        if (btn) {
          btn.innerHTML = '<i class="fas fa-camera"></i> Daftarkan';
        }
      }
    }

    function registerFaceFromPreview() {
      openCamOverlay({
        onDone: async (cap) => {
          if (!cap?.dataUrl) return;
          // btnCapture di doCapture sudah disabled & ganti spinner
          const ok = await saveFaceRef(cap.dataUrl, cap.descriptor);
          if (ok) {
            updateFaceRegUI();
            updateProfilFaceUI();
            setCamStatus('ok', '<i class="fas fa-brain"></i>', 'Data Wajah AI Tersimpan!', 'Wajah Anda berhasil didaftarkan dengan Face AI');
            if (typeof _playMejaChime === 'function') _playMejaChime('success');
            // Biarkan tombol Ambil Foto berubah jadi Selesai atau Tutup
            const btn = $('btnCapture');
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<i class="fas fa-check"></i> Selesai';
              btn.onclick = () => {
                closeCamOverlay(false);
                if (typeof Swal !== 'undefined') {
                  Swal.fire({
                    icon: 'success',
                    title: 'Foto Wajah Berhasil Diperbarui',
                    text: 'Data foto wajah dan biometrik Anda telah berhasil disimpan.',
                    timer: 3500,
                    showConfirmButton: true
                  });
                }
              };
            }
          } else {
            // Error sudah dihandle oleh saveFaceRef via setCamStatus
            const btn = $('btnCapture');
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<i class="fas fa-camera"></i> Coba Lagi';
              btn.onclick = () => doCapture();
            }
            if (typeof Swal !== 'undefined') {
              Swal.fire({
                icon: 'error',
                title: 'Gagal Memperbarui Foto Wajah',
                text: window._lastAiError || 'Wajah tidak terdeteksi jelas atau server tidak merespons.'
              });
            }
          }
        }, onCancel: () => { }, isRegister: true
      });
    }

    function updateProfilFaceUI() {
      const ref = getFaceRef();
      const thumb = $('profilFaceThumb');
      const empty = $('profilFaceEmpty');
      const status = $('profilFaceStatus');
      const sub = $('profilFaceSub');
      const btn = $('btnProfilRegFace');
      if (!status) return;
      const descLen = (ref && ref.descriptor) ? (Array.isArray(ref.descriptor) ? ref.descriptor.length : 0) : 0;
      const hasDescriptor = descLen >= 128;
      const isHuman = descLen >= 512;
      if (ref) {
        if (thumb && ref.dataUrl) { 
          thumb.src = ref.dataUrl; 
          thumb.style.display = 'block'; 
          if (empty) empty.style.display = 'none';
        } else { 
          if (thumb) thumb.style.display = 'none'; 
          if (empty) empty.style.display = 'flex';
        }
        const d = new Date(ref.savedAt);
        const tgl = isNaN(d) ? '—' : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        status.innerHTML = isHuman ? '<i class="fas fa-shield-alt"></i> Face AI: Human' : (hasDescriptor ? '<i class="fas fa-exclamation-triangle"></i> Format Lama — Perlu Daftar Ulang' : '<i class="fas fa-times"></i> Belum Ada Data Wajah');
        status.style.color = isHuman ? 'var(--success)' : (hasDescriptor ? 'var(--warning)' : 'var(--danger)');
        if (sub) sub.textContent = isHuman
          ? `Didaftarkan: ${tgl} · Face AI Advanced aktif`
          : `Daftarkan ulang wajah agar kompatibel dengan Face AI terbaru`;
        if (btn) btn.innerHTML = hasDescriptor ? '<i class="fas fa-sync"></i> Perbarui' : '<i class="fas fa-camera"></i> Daftarkan Ulang';
      } else {
        if (thumb) thumb.style.display = 'none';
        if (empty) empty.style.display = 'flex';
        status.textContent = 'Belum ada data wajah';
        status.style.color = 'var(--muted)';
        if (sub) sub.textContent = 'Daftarkan wajah Anda untuk pengenalan AI otomatis saat absen';
        if (btn) btn.innerHTML = '<i class="fas fa-camera"></i> Daftarkan';
      }
    }


    // ── KONTROL ZOOM KAMERA ──
    async function setCamZoom(val) {
      _camZoomLevel = parseFloat(val);
      const valEl = $('camZoomVal');
      if (valEl) valEl.textContent = _camZoomLevel.toFixed(1) + 'x';

      const vid = $('camVideo');
      if (!vid) return;

      // 1. Coba Hardare Zoom (Track Constraint)
      if (window._camVideoTrack) {
        try {
          const caps = window._camVideoTrack.getCapabilities();
          if (caps.zoom) {
            await window._camVideoTrack.applyConstraints({
              advanced: [{ zoom: _camZoomLevel }]
            });
            // Jika hardware zoom berhasil, pastikan CSS scale netral
            vid.style.transform = 'scaleX(-1)'; 
            return;
          }
        } catch (e) {
          console.warn('[AI] Hardware zoom failed, using CSS fallback:', e);
        }
      }

      // 2. Fallback: Software Zoom (CSS Scale)
      // Mirroring scaleX(-1) dikombinasikan dengan scale(...)
      vid.style.transform = `scaleX(-1) scale(${_camZoomLevel})`;
    }

    /* ── Konfigurasi AI Engine (Human.js ONLY) ── */
    const HUMAN_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.2.1/dist/human.js';
    const HUMAN_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.2.1/models/';

    // Paksa selalu Human — hapus nilai lama jika sebelumnya faceapi
    if (localStorage.getItem(STORAGE_KEYS.AI_ENGINE) === 'faceapi') {
      localStorage.setItem(STORAGE_KEYS.AI_ENGINE, 'human');
    }
    window._aiEngine = 'human';
    let _humanLoaded = false;
    let HumanInstance = null;
    let _isDetecting = false; // Flag Pengaman Loop Deteksi
    let _aiProcessing = false; // Flag Pengaman Ekstraksi
    let _isLoopEnabled = false; // Flag Kontrol Loop Absolut

    // Fungsi Pengaman untuk Reset Total State AI jika terjadi Stuck
    let _matchSessionToken = 0; // Token untuk memvalidasi async result agar tidak leak
    let _matchStabilityCount = 0; // Menghitung berapa frame ID yang sama terdeteksi
    let _mejaStartTime = 0; // Waktu mulai Meja Absen untuk startup delay
    let _mejaLiveSince = 0; // Waktu pertama kali liveness disetujui untuk fallback
    let _gate = { pass: false, boxHist: [] };
    let _gateForceTimer = null, _previewIdleTimer = null, _pendingCapture = null, _ambigSince = 0;
    const ENROLL_SHOTS = 3;
    let _enrollShots = 0, _enrollTaken = []; // 0 = non-enrolmen; direset tiap buka overlay
    let _gateCnv = null;
    let _camZoomLevel = 1.0;
    window._camVideoTrack = null;

    function _forceResetAiState(includeProcessing = true) {
      _isDetecting = false;
      _mejaLiveSince = 0;
      if (includeProcessing) {
        _aiProcessing = false;
        window._isSubmitting = false;
      }
      _autoCaptured = false;
      _captureData = null;
      _lastMejaId = null; // Reset tracker terakhir agar tidak "lengket"
      _lastMejaTime = 0;
      _lastMatchedId = null;
      _matchStabilityCount = 0;
      _camZoomLevel = 1.0;
      const zoomSlider = $('camZoomSlider');
      if (zoomSlider) zoomSlider.value = 1;
      setCamZoom(1.0); // Reset visual zoom
      _matchSessionToken++; // Invalidasi semua pending async match result
      console.log(`[AI] State reset (Proc:${includeProcessing}), Token: ${_matchSessionToken}`);
      
      // Bersihkan UI result jika ada yang nyangkut
      const overlay = $('mejaOverlayResult');
      if (overlay) overlay.style.display = 'none';

      // Bersihkan canvas agar tidak ada sisa frame sebelumnya
      const cnv = $('camCanvas');
      if (cnv) {
        const ctx = cnv.getContext('2d');
        ctx.clearRect(0, 0, cnv.width, cnv.height);
      }

      // Ensure NO hidden element is blocking pointer events
      const camOverlay = $('camOverlay');
      if (camOverlay && camOverlay.classList.contains('hidden')) {
          camOverlay.style.pointerEvents = 'none';
      }
    }

    // Wrapper Timeout untuk menghindari AI Hang selamanya
    async function _detectWithTimeout(source, timeoutMs = 6000) {
      if (!HumanInstance) return null;
      return Promise.race([
        HumanInstance.detect(source),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs))
      ]);
    }

    function _refreshAiBadge() {
      const b = $('aiEngineBadge');
      if (!b) return;
      b.textContent = 'Mesin: Human AI (1024-dim)';
      b.style.color = 'var(--info)';
      b.style.opacity = '1';
    }

    /**
     * Deteksi backend terbaik yang didukung perangkat.
     * Urutan: WebGL (tercepat) → WASM (stabil di mobile) → cpu (fallback)
     */
    async function _detectBestBackend() {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl) {
          gl.getExtension('WEBGL_lose_context')?.loseContext();
          return 'webgl';
        }
      } catch (_) {}
      return 'wasm';
    }

    /**
     * Deteksi apakah device adalah perangkat mobile/HP dengan resource terbatas.
     * Digunakan untuk menentukan inputSize yang optimal.
     */
    function _isMobileDevice() {
      return (navigator.hardwareConcurrency || 4) <= 4 ||
             /Android|iPhone|iPad/i.test(navigator.userAgent);
    }

    async function _loadHumanScript() {
      if (window.Human || (window.Human && window.Human.default)) { _humanLoaded = true; return; }

      let srcToLoad = HUMAN_CDN;

      try {
        const cached = await idb.get('master_data', 'human_script');
        if (cached && cached.blob) {
          srcToLoad = URL.createObjectURL(cached.blob);
          console.log('[AI] Memuat Human.js dari cache lokal (Offline)');
        }
      } catch (e) {
        console.warn('[AI] Gagal membaca cache Human.js', e);
      }

      // Timeout eksplisit 20 detik untuk mencegah hang
      await Promise.race([
        new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = srcToLoad;
          s.onload = () => {
            if (srcToLoad.startsWith('blob:')) URL.revokeObjectURL(srcToLoad);
            if (window.Human) { _humanLoaded = true; resolve(); }
            else reject(new Error('Namespace Human tidak ditemukan di script.'));
          };
          s.onerror = () => {
            if (srcToLoad.startsWith('blob:')) URL.revokeObjectURL(srcToLoad);
            reject(new Error('Gagal memuat Human.js dari ' + (srcToLoad.startsWith('blob:') ? 'Cache Lokal' : 'CDN')));
          };
          document.head.appendChild(s);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Script load timeout (20s)')), 20000))
      ]);
    }


    // ── Muat Model Human.js (satu-satunya engine) ──
    /**
     * Memuat dan menginisialisasi Human.js secara on-demand.
     * Menampilkan progress bar di UI selama proses loading.
     * @returns {Promise<boolean>} true jika model berhasil dimuat
     */
    async function loadAIModels() {
      if (_modelsReady) return true;
      if (_modelLoading) {
        // Tunggu hingga loading selesai (jika background pre-warm sedang berjalan)
        return new Promise(resolve => {
          const check = setInterval(() => {
            if (!_modelLoading) { clearInterval(check); resolve(_modelsReady); }
          }, 200);
          setTimeout(() => { clearInterval(check); resolve(_modelsReady); }, 30000);
        });
      }
      _modelLoading = true;

      try {
        console.log('[AI] Memuat Human.js Engine...');

        // Langkah 1: Muat Script
        await _loadHumanScript();
        _updateModelProgress(0, 15);

        // Langkah 2: Deteksi backend terbaik secara otomatis
        const bestBackend = await _detectBestBackend();
        const isMobile = _isMobileDevice();
        const inputSize = isMobile ? 256 : 1024; // Optimasi 256 pada mobile untuk performa low-end
        console.log(`[AI] Device: ${isMobile ? 'Mobile' : 'Desktop'} | Backend: ${bestBackend} | InputSize: ${inputSize}`);

        const config = {
          backend: bestBackend,
          modelBasePath: HUMAN_MODELS,
          filter: { enabled: false },
          cacheModels: true,
          warmup: 'none', // Kita handle warmup sendiri
          face: {
            enabled: true,
            detector: {
              enabled: true,
              rotation: true,
              modelPath: 'blazeface.json',
              maxDetected: 1,
              minConfidence: 0.2,
              inputSize
            },
            mesh: { enabled: false },
            iris: { enabled: false },
            description: { enabled: true, modelPath: 'faceres.json' },
            emotion: { enabled: false },
            liveness: { enabled: window.FS_LIVENESS_MOBILE !== false } // Admin-controlled: default ON, toggle in Face Settings
          },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          gesture: { enabled: false },
          segmentation: { enabled: false }
        };

        // Langkah 3: Inisialisasi Instance
        let HumanConstructor = window.Human;
        if (window.Human && typeof window.Human.Human === 'function') HumanConstructor = window.Human.Human;
        else if (window.Human && typeof window.Human.default === 'function') HumanConstructor = window.Human.default;

        if (typeof HumanConstructor !== 'function') {
          throw new Error('Gagal menemukan Class Human (window.Human bukan constructor).');
        }

        HumanInstance = new HumanConstructor(config);
        window.HumanInstance = HumanInstance; // Expose ke global scope untuk auth.js
        _updateModelProgress(0, 30);

        // Langkah 4: Set Backend TFJS
        if (HumanInstance.tf) {
          try {
            await HumanInstance.tf.setBackend(bestBackend);
            await HumanInstance.tf.ready();
            console.log(`[AI] TFJS backend aktif: ${await HumanInstance.tf.getBackend()}`);
            if (isMobile) {
              try {
                HumanInstance.tf.env().set('WEBGL_FORCE_F16_TEXTURING', true);
                HumanInstance.tf.env().set('WEBGL_PACK', true);
                console.log('[AI] Mobile TFJS flags applied: FP16 & Packing enabled');
              } catch (err) {
                console.warn('[AI] Gagal mengatur environment flags:', err);
              }
            }
          } catch (e) {
            console.warn('[AI] Backend manual gagal, biarkan Human memilih otomatis:', e.message);
          }
        }

        // Langkah 5: Load Model Weights (timeout 20 detik)
        _updateModelProgress(0, 50);
        try {
          await Promise.race([
            HumanInstance.load(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Model load timeout (20s)')), 20000))
          ]);
        } catch (loadErr) {
          console.warn('[AI] Model load failed, clearing IndexedDB cache and retrying...', loadErr.message);
          // Clear TFJS/Human IndexedDB cache so models are fully re-downloaded
          try { indexedDB.deleteDatabase('tensorflowjs'); } catch (_) {}
          try { indexedDB.deleteDatabase('human-models'); } catch (_) {}
          // New instance with cache disabled to force fresh download
          config.cacheModels = false;
          HumanInstance = new HumanConstructor(config);
          window.HumanInstance = HumanInstance;
          await Promise.race([
            HumanInstance.load(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Model load retry timeout (20s)')), 20000))
          ]);
          console.log('[AI] Model load succeeded after IndexedDB cache clear');
        }
        _updateModelProgress(1, 70);

        // Langkah 6: Warmup dengan canvas dummy kecil (compile shader sekali)
        console.log('[AI] Warming up TFJS shaders...');
        try {
          const dummy = document.createElement('canvas');
          dummy.width = inputSize; dummy.height = inputSize;
          await HumanInstance.warmup({ warmup: 'face', canvas: dummy });
        } catch (e) {
          console.warn('[AI] Warmup error (non-fatal):', e.message);
        }

        _updateModelProgress(2, 90);
        _modelsReady = true;
        _modelLoading = false;
        _refreshAiBadge();
        console.log('[AI] Human.js siap digunakan.');
        return true;

      } catch (e) {
        console.error('[AI] Gagal memuat Human.js:', e);
        _modelsReady = false;
        _modelLoading = false;
        return false;
      }
    }

    /**
     * Pre-warm Human.js di background tanpa memblokir UI.
     * Dipanggil 3 detik setelah app siap agar kamera terasa instan.
     */
    async function _prewarmHumanInBackground() {
      if (_modelsReady || _modelLoading) return;
      console.log('[AI] Background pre-warm dimulai...');
      _refreshAiBadge();
      try {
        await loadAIModels();
        console.log('[AI] Background pre-warm selesai — kamera siap instan.');
      } catch (e) {
        console.warn('[AI] Background pre-warm gagal (non-fatal):', e.message);
      }
    }

    // Alias untuk kompatibilitas mundur
    async function loadFaceApiModels() { return loadAIModels(); }

    /* ── Buka overlay kamera ── */
    async function openCamOverlay(onDone) {
      const isMeja = onDone === 'meja';
      _forceResetAiState(); // Reset total sebelum mulai

      // Optimasi: Reset UI Meja secara eksplisit & Tambah Stability Delay
      const mejaResult = $('mejaOverlayResult');
      if (mejaResult) mejaResult.style.display = 'none';
      _isStreamStable = false;
      _mejaStartTime = 0; // Reset waktu mulai, akan di-set saat video benar-benar play

      _absenCallbackAfterCam = onDone;
      window._isMejaMode = isMeja;

      const overlay = $('camOverlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        if (isMeja) overlay.classList.add('meja-kiosk');
        else overlay.classList.remove('meja-kiosk');
        overlay.style.pointerEvents = 'auto';
      }
      $('modelLoading').style.display = 'block';
      if ($('mlTitle')) $('mlTitle').innerHTML = _modelsReady ? '<i class="fas fa-camera"></i> Membuka Kamera...' : 'Memuat Model AI Deteksi Wajah'; // Dynamic title
      if ($('mlHint')) $('mlHint').textContent = _modelsReady ? 'Mengaktifkan sensor perangkat, harap tunggu...' : 'Harap tunggu sebentar...';
      $('camVideoWrap').style.display = 'none';
      $('camStatus').style.display = 'none';
      $('faceRegCard').style.display = 'none';
      $('camPreview').classList.remove('show');
      _gate = { pass: false, boxHist: [] };
      clearTimeout(_gateForceTimer);
      _enrollShots = onDone?.isRegister ? ENROLL_SHOTS : 0;
      _enrollTaken = [];

      // Tampilkan/sembunyikan tombol capture
      const btnCap = $('btnCapture');
      if (btnCap) {
        btnCap.style.display = isMeja ? 'none' : 'flex';
        btnCap.disabled = true;
        btnCap.innerHTML = _enrollShots > 1
          ? '<i class="fas fa-camera"></i> Ambil Foto (1)/' + _enrollShots
          : '<i class="fas fa-camera"></i> Ambil Foto & Lanjutkan';
      }
      const _pvUse = $('camPreviewUse'), _pvRetry = $('camPreviewRetry');
      if (_pvUse) _pvUse.onclick = _previewUse;
      if (_pvRetry) _pvRetry.onclick = _previewRetry;

      _gateForceTimer = setTimeout(() => {
        if (window._isMejaMode) return;
        const b = $('btnCapture');
        if (b && b.disabled) {
          b.disabled = false;
          b.innerHTML = '<i class="fas fa-bolt"></i> Tetap Ambil';
          setCamStatus('warn', '<i class="fas fa-bolt"></i>', 'Kualitas Belum Ideal', 'Boleh tetap ambil foto');
        }
      }, 10000);

      const livenessUI = $('livenessMini');
      if (livenessUI) livenessUI.style.display = isMeja ? 'block' : 'none';

      // Panduan oval wajah selalu tampil untuk mode verifikasi
      const faceGuideEl = $('faceGuideWrap');
      if (faceGuideEl) faceGuideEl.style.display = 'flex';

      // Ubah judul kamera sesuai mode
      // Catatan: untuk isRegister, judul sudah di-set oleh caller (misal adminCaptureFaceFor)
      const titleEl = $('camHeaderTitle');
      if (titleEl) {
        if (!onDone?.isRegister && !isMeja) titleEl.innerHTML = '<i class="fas fa-camera"></i> Verifikasi Wajah';
        // isRegister & isMeja: biarkan judul yang sudah diset caller
      }

      // Reset UI progress
      _updateModelProgress(0, 0);

      // --- MULAI INISIALISASI KAMERA DENGAN TIERED FALLBACK ---
      let stream = null;
      const isPortrait = window.innerHeight > window.innerWidth;
      
      try {
        console.log('[AI] Camera Initialization: Fast Constraint');
        const constraints = { video: { facingMode: 'user' } };
        
        // Pada perangkat mobile, meminta constraint resolusi spesifik seringkali 
        // membuat browser bernegosiasi terlalu lama dengan hardware (menambah delay 2-4 detik).
        // Jadi kita hanya request resolusi tinggi di desktop.
        if (!_isMobileDevice()) {
          constraints.video.width = { ideal: isPortrait ? 768 : 1024 };
          constraints.video.height = { ideal: isPortrait ? 1024 : 768 };
        }
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e1) {
        console.warn('[AI] Fast Constraint Failed:', e1.name);
        try {
          console.log('[AI] Camera Fallback: Basic');
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e2) {
          console.error('[AI] All camera tiers failed:', e2);
          $('modelLoading').style.display = 'block';
          if ($('mlTitle')) $('mlTitle').textContent = 'Kamera Gagal';
          if ($('mlHint')) $('mlHint').innerHTML = `<span style="color:var(--danger)">Gagal mengakses kamera: ${e2.name || 'Unknown Error'}.<br>Pastikan izin kamera sudah diberikan.</span>`;
          window._isAbsenSubmitting = false;
          return;
        }
      }

      // Jika berhasil mendapatkan stream
      if (stream) {
        _camStream = stream;
        const vid = $('camVideo');
        vid.srcObject = _camStream;
        await new Promise(r => { vid.onloadedmetadata = r; });
        await vid.play();
        
        // STABILITY FIX: Baru set _mejaStartTime & _isStreamStable SETELAH video play
        _mejaStartTime = Date.now();
        setTimeout(() => { 
          _isStreamStable = true; 
          console.log('[AI] Stream marked as STABLE');
        }, 2500); // Bertambah menjadi 2.5 detik agar sensor benar-benar stabil

        // Ambil track untuk kontrol zoom/flash
        window._camVideoTrack = _camStream.getVideoTracks()[0];
        
        // Inisialisasi Slider Zoom berdasarkan kapabilitas hardware
        const zoomSlider = $('camZoomSlider');
        if (zoomSlider && window._camVideoTrack) {
          try {
            const caps = window._camVideoTrack.getCapabilities();
            if (caps && caps.zoom) {
              zoomSlider.min = caps.zoom.min;
              zoomSlider.max = caps.zoom.max;
              zoomSlider.step = caps.zoom.step || 0.1;
            } else {
              zoomSlider.min = 1; zoomSlider.max = 3; zoomSlider.step = 0.1;
            }
          } catch (_) { 
            zoomSlider.min = 1; zoomSlider.max = 3; zoomSlider.step = 0.1;
          }
        }
      }

      // ── MODE VERIFIKASI WAJAH — Muat AI atau langsung mulai jika sudah pre-warmed ──
      if (_modelsReady) {
        // AI sudah siap dari background pre-warm — langsung buka kamera!
        console.log('[AI] Pre-warm sudah selesai, kamera langsung aktif.');
        $('modelLoading').style.display = 'none';
        $('camVideoWrap').style.display = 'block';
        $('camStatus').style.display = 'flex';
      } else {
        const ready = await loadAIModels();
        if (!ready) {
          setCamStatus('warn', '<i class="fas fa-exclamation-triangle"></i>', 'AI Gagal Dimuat', 'Gunakan tombol manual untuk ambil foto');
          if (btnCap) btnCap.disabled = false;
        }
        $('modelLoading').style.display = 'none';
        $('camVideoWrap').style.display = 'block';
        $('camStatus').style.display = 'flex';
      }

      if (MY_ID && !onDone?.isRegister && !window._isMejaMode) {
        updateFaceRegUI();
        $('faceRegCard').style.display = 'block';
      }

      startDetectLoop();
    }

    // Fitur Toggle Flash (Torch)
    let _isFlashOn = false;
    async function toggleFlash() {
      if (!window._camVideoTrack) return;
      try {
        _isFlashOn = !_isFlashOn;
        await window._camVideoTrack.applyConstraints({
          advanced: [{ torch: _isFlashOn }]
        });
        const btn = $('camFlashBtn');
        if (_isFlashOn) {
          btn.style.background = 'rgba(255,193,7,.8)';
          btn.style.borderColor = '#ffc107';
          btn.style.color = '#fff';
        } else {
          btn.style.background = 'rgba(255,255,255,.15)';
          btn.style.borderColor = 'rgba(255,255,255,.3)';
          btn.style.color = '#fff';
        }
      } catch (e) {
        console.warn('Flash tidak didukung atau terhalang:', e);
      }
    }

    function closeCamOverlay(triggeredByUser) {
      clearTimeout(_gateForceTimer);
      clearTimeout(_previewIdleTimer);
      _pendingCapture = null;
      _hidePreview();
      if (window._isMejaMode) {
        stopMejaAbsen();
        return;
      }

      _isFlashOn = false;
      stopDetectLoop();
      stopCamStream();

      // Tutup Modal
      const overlay = $('camOverlay');
      if (overlay) {
          overlay.classList.add('hidden');
          overlay.classList.remove('meja-kiosk');
          overlay.style.pointerEvents = 'none';
      }
      setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');

      // Kembalikan UI ke kondisi awal
      $('camVideoWrap').style.display = 'block';
      $('camPreview').classList.remove('show');
      $('camPreviewImg').src = '';

      // Kembalikan judul & panduan wajah untuk sesi berikutnya
      const titleEl = $('camHeaderTitle');
      if (titleEl) titleEl.innerHTML = '<i class="fas fa-camera"></i> Verifikasi Wajah';
      const faceGuideEl = $('faceGuideWrap');
      if (faceGuideEl) faceGuideEl.style.display = 'flex';

      const cb = _absenCallbackAfterCam;
      _absenCallbackAfterCam = null;
      _captureData = null;
      
      // Final global safety check
      _forceResetAiState(true);

      // Panggil onCancel HANYA jika ditutup manual oleh pengguna (bukan setelah onDone selesai)
      if (triggeredByUser && cb) {
        if (typeof cb === 'object' && typeof cb.onCancel === 'function') cb.onCancel();
        window._isAbsenSubmitting = false; // Lepas lock agar user bisa coba lagi
      }
    }

    function stopCamStream() {
      if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null; }
    }

    /* ── BUKTI OVERLAY (Untuk Keterangan) ── */
    async function openBuktiOverlay(onDone) {
      _absenCallbackAfterCam = onDone;
      _captureData = null;

      $('buktiOverlay').classList.remove('hidden');
      $('buktiPreviewCam').classList.remove('show');

      const btnCap = $('btnBuktiCapture');
      if (btnCap) {
        btnCap.disabled = true;
        btnCap.innerHTML = '<i class="fas fa-camera"></i> Ambil Foto Bukti';
      }

      try {
        _camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
        });
        const vid = $('buktiVideo');
        vid.srcObject = _camStream;
        await new Promise(r => { vid.onloadedmetadata = r; });
        await vid.play();
        if (btnCap) btnCap.disabled = false;
      } catch (e) {
        // Fallback non-constraint
        try {
          _camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const vid = $('buktiVideo');
          vid.srcObject = _camStream;
          await new Promise(r => { vid.onloadedmetadata = r; });
          await vid.play();
          if (btnCap) btnCap.disabled = false;
        } catch (e2) {
          alert('Gagal mengakses kamera: Pastikan izin kamera aktif.');
        }
      }
    }

    function closeBuktiOverlay() {
      stopCamStream();
      $('buktiOverlay').classList.add('hidden');
      $('buktiPreviewCam').classList.remove('show');
      $('buktiPreviewCamImg').src = '';
      _absenCallbackAfterCam = null;
      _captureData = null;
    }

    async function doBuktiCapture() {
      if (_captureData) return;
      _captureData = true;

      const btnCap = $('btnBuktiCapture');
      if (btnCap) {
        btnCap.disabled = true;
        btnCap.innerHTML = '<span class="spinner"></span> Memproses...';
      }

      const vid = $('buktiVideo');
      const cnv = document.createElement('canvas');
      cnv.width = vid.videoWidth;
      cnv.height = vid.videoHeight;
      const ctx = cnv.getContext('2d');
      ctx.drawImage(vid, 0, 0);
      const rawDataUrl = cnv.toDataURL('image/jpeg', 0.85);

      stopCamStream();

      let dataUrl = rawDataUrl;
      try {
        dataUrl = await compressImage(rawDataUrl, 1280, 0.7);
      } catch (err) {
        console.error('[doBuktiCapture] compress image failed:', err);
      }

      // Tampilkan Preview Singkat
      $('buktiPreviewCamImg').src = dataUrl;
      $('buktiPreviewCam').classList.add('show');

      const cb = _absenCallbackAfterCam;
      _absenCallbackAfterCam = null;

      setTimeout(async () => {
        try {
          if (typeof cb === 'function') {
            await cb({ dataUrl });
          } else if (cb?.onDone) {
            await cb.onDone({ dataUrl });
          }
        } catch (err) {
          console.error('[doBuktiCapture] callback error:', err);
        } finally {
          closeBuktiOverlay();
        }
      }, 800);
    }

    function stopDetectLoop() {
      _isLoopEnabled = false; // Matikan loop secara absolut
      _forceResetAiState(false); // Reset deteksi tapi JANGAN reset _aiProcessing agar lock tidak lepas
      if (_detectLoop) { cancelAnimationFrame(_detectLoop); _detectLoop = null; }
      if (_liveMatchTimer) { clearInterval(_liveMatchTimer); _liveMatchTimer = null; }

      // Bersihkan Canvas
      const cnv = $('camCanvas');
      if (cnv) {
        const ctx = cnv.getContext('2d');
        ctx.clearRect(0, 0, cnv.width, cnv.height);
      }
    }

    function _sampleBrightness(src) {
      if (!_gateCnv) { _gateCnv = document.createElement('canvas'); _gateCnv.width = 32; _gateCnv.height = 32; }
      const cx = _gateCnv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(src, 0, 0, 32, 32);
      const d = cx.getImageData(0, 0, 32, 32).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return Math.round(s / (d.length / 4));
    }
    // ponytail: gate fail-open — bila module belum ter-load, lewatkan (jangan blokir kamera)
    function _gateEvaluate(vid, box) {
      const now = Date.now();
      const hist = _gate.boxHist;
      let stabilityMs = 0;
      if (box) {
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        hist.push({ t: now, cx, cy });
        while (hist.length && now - hist[0].t > 800) hist.shift();
        const last = hist[hist.length - 1];
        let t0 = last.t;
        for (let i = hist.length - 1; i >= 0; i--) {
          const dx = Math.abs(hist[i].cx - last.cx) / vid.videoWidth;
          const dy = Math.abs(hist[i].cy - last.cy) / vid.videoHeight;
          if (dx > 0.03 || dy > 0.03) break;
          t0 = hist[i].t;
        }
        stabilityMs = now - t0;
      }
      const metrics = {
        faceRatioH: box ? box.height / vid.videoHeight : 0,
        centerOffset: box ? Math.max(
          Math.abs((box.x + box.width / 2) / vid.videoWidth - 0.5) * 2,
          Math.abs((box.y + box.height / 2) / vid.videoHeight - 0.5) * 2) : 1,
        brightness: _sampleBrightness(vid),
        stabilityMs,
        livenessScore: parseFloat(_lastHumanScore) || 0,
      };
      if (!window.FaceQuality) return { pass: true, reason: null };
      return window.FaceQuality.evaluateFrameQuality(metrics, {
        livenessThreshold: typeof FS_LIVENESS_SCORE !== 'undefined' ? FS_LIVENESS_SCORE : 0.4,
        livenessEnabled: window.FS_LIVENESS_MOBILE !== false,
      });
    }

    /* ── Loop deteksi wajah (rAF) ── */
    function startDetectLoop() {
      const vid = $('camVideo');
      const cnv = $('camCanvas');
      const ctx = cnv.getContext('2d');
      const wrap = $('camVideoWrap');

      _blinkDetected = false;
      _livenessScore = 0;
      _livenessHistory = [];
      _lastLandmarks = null;
      _isLive = false;
      _gate.boxHist.length = 0;

      _isLoopEnabled = true;
      const loop = async () => {
        if (!_isLoopEnabled || !_modelsReady || !$('camOverlay') || $('camOverlay').classList.contains('hidden')) return;
        
        // STABILITY FIX: Jika stream belum stabil, jangan deteksi apa-apa
        if (!_isStreamStable) {
           _detectLoop = requestAnimationFrame(loop);
           return;
        }

        // Optimasi: Pastikan video sudah benar-benar memutar frame baru (Fresh Frame Check)
        // readyState 4 = HAVE_ENOUGH_DATA, currentTime > 0.5 = sudah lewat frame awal/hitam
        if (vid.readyState < 4 || vid.currentTime < 0.5 || vid.paused) {
           _detectLoop = requestAnimationFrame(loop);
           return;
        }

        if (_isDetecting) {
          _detectLoop = requestAnimationFrame(loop);
          return;
        }

        // Pastikan dimensi video valid (Mencegah deteksi pada frame kosong/hitam di awal loading)
        if (vid.videoWidth === 0 || vid.videoHeight === 0) {
          _detectLoop = requestAnimationFrame(loop);
          return;
        }

        _isDetecting = true;

        try {
          let detection = null;
          if (window._aiEngine === 'human' && HumanInstance) {
            const res = await _detectWithTimeout(vid, 5000);
            if (res && res.face && res.face.length > 0) {
              const f = res.face[0];
              const liveScore = f.live || 0;
              const realScore = f.real || 0;
              const genericScore = f.liveness || 0;
              _lastHumanScore = Math.max(liveScore, realScore, genericScore).toFixed(2);
              const isLiveThreshold = typeof FS_LIVENESS_SCORE !== 'undefined' ? FS_LIVENESS_SCORE : 0.4;
              const isLive = liveScore > isLiveThreshold || realScore > isLiveThreshold || genericScore > isLiveThreshold;
              detection = {
                landmarks: { positions: f.landmarks || [] },
                descriptor: f.embedding || null,
                box: f.box,
                _isHumanLive: isLive
              };
            }
          } else {
            // Human belum siap, tunggu frame berikutnya
            _detectLoop = requestAnimationFrame(loop);
            _isDetecting = false;
            return;
          }

          if (!detection) {
            wrap.className = 'cam-video-wrap face-bad';
            setCamStatus('bad', '<i class="fas fa-meh-blank"></i>', 'Wajah Belum Terlihat', 'Hadapkan wajah ke kamera');
            _livenessState.faceOk = false;
            if (window._isMejaMode) {
              _getLsIcon().innerHTML = '<i class="fas fa-meh-blank"></i>';
              _getLsText().textContent = 'Menunggu Wajah...';
              _getLsText().style.color = 'var(--muted)';
              _matchSessionToken++; // Batalkan semua match result yang sedang berjalan
              _lastMatchedId = null;
              _matchStabilityCount = 0;
            }
          } else {
            _livenessState.faceOk = true;
            wrap.className = 'cam-video-wrap face-ok';

            // Selalu gunakan Human liveness score
            _isLive = detection._isHumanLive;

            const allDesc = (window._allFaceDescriptors && window._allFaceDescriptors.length)
              ? window._allFaceDescriptors
              : (typeof _allFaceDescriptors !== 'undefined' && _allFaceDescriptors.length ? _allFaceDescriptors : []);

            if (_isLive) {
              if (window._isMejaMode) {
                if (allDesc.length === 0) {
                  setCamStatus('warn', '<i class="fas fa-hourglass-half"></i>', 'Memuat Database Wajah...', 'Menghubungkan ke database pegawai');
                } else if (!_lastMatchedId && !(_ambigSince && Date.now() - _ambigSince < 2000)) {
                  setCamStatus('ok', '<i class="fas fa-search"></i>', 'Mencocokkan Identitas...', 'Posisikan wajah di dalam bingkai');
                }
              } else {
                setCamStatus('ok', '<i class="fas fa-shield-alt"></i>', 'Liveness Approved', 'Posisikan wajah & Tekan tombol');
              }
            } else {
              setCamStatus('ok', '<i class="fas fa-hourglass-half"></i>', 'Verifikasi Keaslian...', 'Mohon tetap diam sejenak');
            }

            const gateR = _gateEvaluate(vid, detection.box || null);
            if (!_gate.pass && gateR.pass) {
              _gate.pass = true;
              if ($('btnCapture') && !window._isMejaMode) $('btnCapture').disabled = false;
            }
            if (!gateR.pass && !window._isMejaMode) {
              setCamStatus('warn', '<i class="fas fa-exclamation-triangle"></i>', 'Kualitas Foto Kurang', gateR.reason);
            }

            if (window._isMejaMode) {
              // --- LIVE MATCHING ON VIDEO STREAM ---
              if (!_autoCaptured && _modelsReady) {
                // STARTUP DELAY: Jangan identifikasi jika baru saja kamera terbuka (menunggu sensor stabil)
                if (Date.now() - _mejaStartTime >= 1000) {
                  if (detection.descriptor) {
                    const currentToken = _matchSessionToken;
                    matchMejaCandidate(detection.descriptor).then(match => {
                      if (currentToken !== _matchSessionToken) return;

                      if (match && match.id !== 'unknown') {
                        _ambigSince = 0;
                        if (match.id === _lastMatchedId) {
                          _matchStabilityCount++;
                        } else {
                          _lastMatchedId = match.id;
                          _matchStabilityCount = 1;
                        }

                        const profile = window._mejaUserMap ? window._mejaUserMap[match.id] : null;
                        const nama = profile ? profile.nama : match.id;
                        const score = Math.round(match.score * 100);

                        setCamStatus('ok', '<i class="fas fa-check-circle"></i>', nama, `Wajah Cocok (${score}%) — Memproses presensi...`);

                        const requiredStability = 2;
                        if (_matchStabilityCount < requiredStability) return;

                        if (_isLive && !_autoCaptured && _livenessState.faceOk && gateR.pass) {
                          _autoCaptured = true;
                          console.log(`[AI] Match Confirmed: ${nama} (Score: ${score}%). Finalizing...`);
                          setTimeout(() => {
                            if (currentToken === _matchSessionToken && _livenessState.faceOk && match.id === _lastMatchedId) {
                              doCapture(match.id, detection.descriptor, match.score);
                            } else {
                              _autoCaptured = false;
                            }
                          }, 200);
                        }
                      } else {
                        if (match && match.ambiguous) {
                          _ambigSince = Date.now();
                          setCamStatus('bad', '<i class="fas fa-exclamation-triangle"></i>', 'Wajah Terlalu Mirip', 'Menyerupai lebih dari satu pegawai — coba lagi dengan sudut berbeda');
                        }
                        _lastMatchedId = null;
                        _matchStabilityCount = 0;
                      }
                    });
                  }

                  // Fallback: Jika liveness sudah disetujui stabil >= 1.2 detik dan belum auto-captured,
                  // tangkap frame canvas resolusi penuh untuk ekstraksi & pencocokan akurat.
                  if (_isLive && !_autoCaptured && _livenessState.faceOk && gateR.pass) {
                    if (!_mejaLiveSince) _mejaLiveSince = Date.now();
                    if (Date.now() - _mejaLiveSince >= 1200) {
                      _autoCaptured = true;
                      console.log('[AI] Liveness Approved (1.2s timeout fallback). Auto-capturing frame...');
                      setCamStatus('ok', '<i class="fas fa-camera"></i>', 'Memproses Presensi...', 'Mencocokkan identitas wajah...');
                      setTimeout(() => {
                        if (_livenessState.faceOk && !$('camOverlay').classList.contains('hidden')) {
                          doCapture(null, detection.descriptor);
                        } else {
                          _autoCaptured = false;
                        }
                      }, 200);
                    }
                  } else {
                    _mejaLiveSince = 0;
                  }
                }
              }
            } else {
              if (!_autoCaptured && _modelsReady && _isLive && gateR.pass) {
                _autoCaptured = true;
                setTimeout(() => {
                  if (_livenessState.faceOk && !$('camOverlay').classList.contains('hidden')) {
                    doCapture(null, detection.descriptor);
                  } else {
                    _autoCaptured = false;
                  }
                }, 800);
              }
            }
          }
        } catch (e) {
          console.error('[AI] Loop Error:', e);
        } finally {
          _isDetecting = false;
          if (_isLoopEnabled && $('camOverlay') && !$('camOverlay').classList.contains('hidden')) {
            _detectLoop = requestAnimationFrame(loop);
          }
        }
      };
      loop();
    }

    // window._isSubmitting defined in state.js

    /* ── Helper: Resize Image ── */
    async function _resizeImage(dataUrl, maxW = 640) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (img.width <= maxW) return resolve(dataUrl);
          const ratio = maxW / img.width;
          const cnv = document.createElement('canvas');
          cnv.width = maxW; cnv.height = img.height * ratio;
          cnv.getContext('2d').drawImage(img, 0, 0, cnv.width, cnv.height);
          resolve(cnv.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      });
    }

    /* ── Ambil foto (capture) ── */
    /**
     * Tangkap frame dari kamera, ekstrak descriptor wajah, dan cocokkan.
     * Dipanggil otomatis oleh startDetectLoop() saat wajah terdeteksi.
     * @param {string|null} matchId - ID user yang sudah diidentifikasi sebelumnya
     * @param {Float32Array|null} preDescriptor - Pre-computed descriptor
     * @param {number} preScore - Pre-computed similarity score (0-1)
     */
        async function doCapture(matchId = null, preDescriptor = null, preScore = 0) {
      if (_aiProcessing || window._isSubmitting) {
        console.warn('[AI] Capture ignored: Already processing or submitting.');
        return;
      }
      _aiProcessing = true;
      console.log('[AI] --- Starting Capture & Finalization ---');

      // Update UI Segera
      setCamStatus('ok', '<i class="fas fa-camera"></i>', 'Memproses Foto...', 'Harap tunggu');
      const btnCap = $('btnCapture');
      if (btnCap) {
        btnCap.disabled = true;
        btnCap.innerHTML = '<span class="spinner"></span> Memproses...';
      }

      stopDetectLoop();
      // stopDetectLoop() resets flags via _forceResetAiState(false), 
      // so we MUST re-lock _aiProcessing immediately.
      _aiProcessing = true;

      try {
        const vid = $('camVideo');
        const cnv = $('camCanvas');
        if (!vid || vid.videoWidth === 0) throw new Error('Kamera belum siap, silakan coba lagi.');

        const ctx = cnv.getContext('2d');
        cnv.width = vid.videoWidth;
        cnv.height = vid.videoHeight;

        // Mirroring agar hasil searah dengan preview
        const drawFrame = () => {
          ctx.save();
          ctx.translate(cnv.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(vid, 0, 0);
          ctx.restore();
        };
        const compress = async () => await compressImage(cnv.toDataURL('image/jpeg', 0.9), 640, 0.7);

        const shots = [];
        const deadline = Date.now() + 3000;
        for (let i = 1; i <= 3; i++) {
          if (Date.now() > deadline) break;
          setCamStatus('ok', '<i class="fas fa-camera"></i>', `Menangkap ${i}/3...`, 'Diam sejenak');
          drawFrame();
          const dataUrl = await compress();
          if (dataUrl.length < 5000) { if (i < 3) await new Promise(r => setTimeout(r, 700)); continue; }
          const desc = await getFaceDescriptor(cnv);
          if (desc) shots.push({ dataUrl, desc, bright: _sampleBrightness(cnv) });
          if (i < 3) await new Promise(r => setTimeout(r, 700));
        }

        let dataUrl, descriptor;
        if (shots.length) {
          // frame terbaik: brightness paling dekat 128 (spec), bukan yang terbuka/tergelap
          shots.sort((a, b) => Math.abs(a.bright - 128) - Math.abs(b.bright - 128));
          dataUrl = shots[0].dataUrl;
          descriptor = (window.FaceQuality && shots.length > 1)
            ? window.FaceQuality.mergeDescriptors(shots.map(s => s.desc))
            : shots[0].desc;
        } else if (preDescriptor) {
          // meja: frame burst gagal, pakai descriptor loop yang sudah ada
          drawFrame();
          dataUrl = await compress();
          if (dataUrl.length < 5000) throw new Error('Gagal mengambil gambar yang jelas. Pastikan cahaya cukup.');
          descriptor = preDescriptor;
        } else {
          throw new Error('Gagal mengambil gambar yang jelas. Pastikan cahaya cukup.');
        }

        console.log('[AI] Phase 3: Features extracted. Length:', descriptor?.length);
        _captureData = { dataUrl };
        // stream tetap hidup sampai overlay ditutup (preview Pakai/Ulang butuh stream)

        try {
          if ($('camOverlay').classList.contains('hidden')) return; // overlay ditutup selama burst → batalkan hasil; finally tetap lepas kunci
          if (window._isMejaMode) {
            let bestMatch = { id: matchId, score: preScore };
            
            if (!bestMatch.id || bestMatch.id === 'unknown') {
              console.log('[AI] Phase 4: Matching against Employee Database...');
              bestMatch = await matchMejaCandidate(descriptor);
            } else {
              console.log('[AI] Phase 4: Using Pre-Identified ID:', bestMatch.id);
            }
            
            console.log(`[AI] Match Result: ${bestMatch.id} (score: ${bestMatch.score.toFixed(4)})`);
            if (bestMatch.id && bestMatch.id !== 'unknown' && !bestMatch.ambiguous) {
              const profile = window._mejaUserMap ? window._mejaUserMap[bestMatch.id] : null;
              _pendingCapture = { kind: 'meja', meja: { id: bestMatch.id, descriptor, dataUrl, score: bestMatch.score } };
              $('camPreviewImg').src = dataUrl;
              $('camPreviewMeta').innerHTML = '<span class="cam-preview-badge cpb-ok"><i class="fas fa-check-circle"></i> COCOK ' + Math.round(bestMatch.score * 100) + '%</span> ' + (profile ? profile.nama : bestMatch.id);
              $('camPreview').classList.add('show');
              $('camVideoWrap').style.display = 'none';
              setCamStatus('ok', '<i class="fas fa-check-circle"></i>', 'Periksa Foto', 'Pakai foto ini atau ambil ulang (15 detik)');
              clearTimeout(_previewIdleTimer);
              _previewIdleTimer = setTimeout(() => { if (_pendingCapture && _pendingCapture.kind === 'meja') $('camPreviewUse').click(); }, 15000);
            } else {
              await _onMejaAbsenMatchFound(bestMatch.id, descriptor, dataUrl, bestMatch.score, { ambiguous: !!bestMatch.ambiguous });
            }
          } else {
            console.log('[AI] Phase 4: Preview menunggu konfirmasi Pengguna.');
            _pendingCapture = { kind: 'user', result: { dataUrl, descriptor, faceOk: _livenessState.faceOk || !!descriptor, livenessOk: _isLive || false } };
            $('camPreviewImg').src = dataUrl;
            $('camPreviewMeta').textContent = 'Periksa foto sebelum melanjutkan';
            $('camPreview').classList.add('show');
            $('camVideoWrap').style.display = 'none';
            const capBtn = $('btnCapture');
            if (capBtn) capBtn.style.display = 'none';
            setCamStatus('ok', '<i class="fas fa-check"></i>', 'Periksa Foto', 'Pakai foto ini atau ambil ulang');
          }
        } finally {
          _forceResetAiState(true); // Lepas kunci setelah proses selesai
        }
      } catch (e) {
        console.error('[AI] Fatal Capture Error:', e);
        _forceResetAiState(true);
        setCamStatus('bad', '<i class="fas fa-times"></i>', 'Gagal Memproses', e.message || 'Silakan coba lagi');
        // Aktifkan kembali tombol agar user bisa coba lagi
        const btn = $('btnCapture');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-camera"></i> Coba Lagi';
        }
      }
    }


    async function skipVerifikasi() {
      // Ambil foto lewati liveness check
      _livenessState = { faceOk: true, ch1: true, ch2: true };
      _isLive = true;
      _lastHumanScore = '1.00';
      await doCapture();
    }

    function _hidePreview() {
      $('camPreview').classList.remove('show');
      $('camPreviewImg').src = '';
      $('camPreviewMeta').innerHTML = '';
      $('camVideoWrap').style.display = 'block';
    }
    function _finishUserCapture(result) {
      const cb = _absenCallbackAfterCam;
      closeCamOverlay(false);
      if (!cb) return;
      if (typeof cb === 'function') return cb(result);
      if (cb.onDone) return cb.onDone(result);
    }
    function _previewUse() {
      clearTimeout(_previewIdleTimer);
      const p = _pendingCapture; _pendingCapture = null;
      _hidePreview();
      if (!p) return Promise.resolve();
      if (p.kind === 'meja') return _onMejaAbsenMatchFound(p.meja.id, p.meja.descriptor, p.meja.dataUrl, p.meja.score, { ambiguous: false });
      if (_enrollShots > 0) {
        const step = window.FaceQuality.nextEnrollShot(_enrollTaken, p.result, _enrollShots);
        _enrollTaken = step.shots;
        if (!step.done) {
          setCamStatus(step.skipped ? 'warn' : 'ok', '<i class="fas fa-camera"></i>',
            step.skipped ? 'Wajah Tidak Terbaca' : `Foto ${_enrollTaken.length}/${_enrollShots} Tersimpan`,
            step.skipped ? 'Coba ambil lagi' : 'Geser sedikit posisi, ambil foto berikutnya');
          // re-arm persis pola _previewRetry: video sudah tampil (_hidePreview),
          // reset _gate, label `Ambil Foto (n+1)/3` + disabled ikuti _gate.pass,
          // force-timer 10 dtk 'Tetap Ambil'
          _gate = { pass: false, boxHist: [] };
          const b = $('btnCapture');
          if (b) {
            b.style.display = 'flex';
            b.disabled = !_gate.pass;
            b.innerHTML = '<i class="fas fa-camera"></i> Ambil Foto (' + (_enrollTaken.length + 1) + ')/' + _enrollShots;
            clearTimeout(_gateForceTimer);
            _gateForceTimer = setTimeout(() => {
              if (b.disabled) {
                b.disabled = false;
                b.innerHTML = '<i class="fas fa-bolt"></i> Tetap Ambil';
                setCamStatus('warn', '<i class="fas fa-bolt"></i>', 'Kualitas Belum Ideal', 'Boleh tetap ambil foto');
              }
            }, 10000);
          }
          startDetectLoop();
          return;
        }
        return _finishUserCapture({ ...p.result, descriptor: step.descriptor, dataUrl: step.dataUrl });
      }
      return _finishUserCapture(p.result);
    }
    function _previewRetry() {
      clearTimeout(_previewIdleTimer);
      const p = _pendingCapture; _pendingCapture = null;
      _hidePreview();
      if (p && p.kind === 'meja') {
        _autoCaptured = false;
      } else {
        const b = $('btnCapture');
        if (b) {
          b.style.display = 'flex'; b.disabled = !_gate.pass;
          b.innerHTML = _enrollShots > 1
            ? '<i class="fas fa-camera"></i> Ambil Foto (' + (_enrollTaken.length + 1) + ')/' + _enrollShots
            : '<i class="fas fa-camera"></i> Ambil Foto & Lanjutkan';
          clearTimeout(_gateForceTimer);
          _gateForceTimer = setTimeout(() => {
            if (b.disabled) {
              b.disabled = false;
              b.innerHTML = '<i class="fas fa-bolt"></i> Tetap Ambil';
              setCamStatus('warn', '<i class="fas fa-bolt"></i>', 'Kualitas Belum Ideal', 'Boleh tetap ambil foto');
            }
          }, 10000);
        }
      }
      startDetectLoop();
    }

    /* ── Tutup overlay manual oleh pengguna (tombol <i class="fas fa-times"></i>) ── */
    function closeCamByUser() {
      closeCamOverlay(true); // true = user yang menutup → panggil onCancel
    }

    function startSimpleCapture(isSimpleMode) {
      // Fallback jika model gagal muat atau isSimple mode
      $('btnCapture').disabled = false;
      if (isSimpleMode) {
        setCamStatus('ok', '<i class="fas fa-camera"></i>', 'Kamera Siap', 'Posisikan dokumen/bukti secara jelas lalu tekan Ambil Foto');
      } else {
        setCamStatus('warn', '<i class="fas fa-camera"></i>', 'Kamera Siap', 'Model AI tidak tersedia — foto manual');
      }
    }

    /* ── Helper UI ── */
    function setCamStatus(type, icon, title, sub) {
      if (!_isLoopEnabled && type === 'ok' && icon !== '<i class="fas fa-camera"></i>' && icon !== '<i class="fas fa-check"></i>' && icon !== '<i class="fas fa-times"></i>') return;
      const el = $('camStatus'); if (!el) return;
      el.className = `cam-status ${type}`;
      $('camStatusIcon').innerHTML = icon;
      $('camStatusTitle').textContent = title;
      $('camStatusSub').textContent = sub;
    }
    function setLivenessStep(idx, state) {
      // dihapus mengikuti liveness logic
    }

