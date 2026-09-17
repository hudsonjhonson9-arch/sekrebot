    /* ════ ADMIN FACE ════ */
    /* ════ JAM PERIODE KHUSUS (ADMIN) ════ */

    function _initPeriodeListeners() {
      ['inPeriodeNama', 'inPeriodeDari', 'inPeriodeSampai', 'inPeriodeMasuk', 'inPeriodePulang'].forEach(id => {
        const el = $(id); if (el) el.addEventListener('input', _updatePeriodePreview);
      });
    }

    function _updatePeriodePreview() {
      const nama = ($('inPeriodeNama')?.value || '').trim();
      const dari = $('inPeriodeDari')?.value || '';
      const sampai = $('inPeriodeSampai')?.value || '';
      const masuk = $('inPeriodeMasuk')?.value || '';
      const pulang = $('inPeriodePulang')?.value || '';
      const box = $('periodePreview');
      if (!box) return;
      if (!nama && !dari && !masuk) { box.style.display = 'none'; return; }
      const fmtD = s => { try { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };
      box.style.display = 'block';
      box.innerHTML =
        `<b style="color:#a78bfa">🌙 ${escapeHtml(nama) || '(belum ada nama)'}</b><br>` +
        `📅 ${dari ? fmtD(dari) : '—'} s.d. ${sampai ? fmtD(sampai) : '—'}<br>` +
        `🟢 Masuk ≤ ${masuk || '—'} &nbsp;·&nbsp; 🔵 Pulang ≥ ${pulang || '—'}`;
    }
    let _faceSigCurrentTab = 'data';
    function switchFaceSigTab(tab) {
      _faceSigCurrentTab = tab;
      const dataTab = $('faceSigTabData');
      const faceTab = $('faceSigTabFace');
      const sigTab = $('faceSigTabSig');
      const btnData = $('tabDataBtn');
      const btnFace = $('tabFaceBtn');
      const btnSig = $('tabSigBtn');
      const btnAdd = $('btnAdminAddData');
      if (!dataTab || !faceTab || !sigTab) return;

      // Reset visibiliti & styling
      [dataTab, faceTab, sigTab].forEach(p => p.style.display = 'none');
      [btnData, btnFace, btnSig].forEach(b => {
        if (b) { b.style.background = 'transparent'; b.style.color = 'var(--muted)'; b.style.fontWeight = '700'; }
      });
      if (btnAdd) btnAdd.style.display = 'none';

      if (tab === 'data') {
        dataTab.style.display = 'block';
        if (btnData) { btnData.style.background = 'var(--gold)'; btnData.style.color = 'var(--bg)'; btnData.style.fontWeight = '800'; }
        if (btnAdd) btnAdd.style.display = 'block';
        // Auto fetch list jika belum ada isi
        loadPegawaiMgmt();
      } else if (tab === 'face') {
        faceTab.style.display = 'block';
        if (btnFace) { btnFace.style.background = 'var(--gold)'; btnFace.style.color = 'var(--bg)'; btnFace.style.fontWeight = '800'; }
        if ($('adminFaceRegList') && $('adminFaceRegList').children.length <= 2) loadAdminFaceReg();
      } else if (tab === 'sig') {
        sigTab.style.display = 'block';
        if (btnSig) { btnSig.style.background = 'var(--gold)'; btnSig.style.color = 'var(--bg)'; btnSig.style.fontWeight = '800'; }
        if (typeof loadAdminSigStatus === 'function') loadAdminSigStatus();
      }
    }

    function refreshFaceSigTab() {
      if (_faceSigCurrentTab === 'data') loadPegawaiMgmt();
      else if (_faceSigCurrentTab === 'face') loadAdminFaceReg();
      else if (_faceSigCurrentTab === 'sig') {
        if (typeof loadAdminSigStatus === 'function') loadAdminSigStatus();
      }
    }

    async function loadJamPeriodeAdmin() {
      const list = $('periodeAdminList');
      if (!list) return;
      list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:11px">⏳ Memuat...</div>';
      try {
        await fetchJamPeriode(); // pakai fungsi yang sudah ada (update jamPeriodeList)
        renderPeriodeAdminList();
      } catch {
        list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--danger);font-size:11px">❌ Gagal memuat periode</div>';
      }
    }

    // Debug: cek tanggal apakah masuk periode atau tidak
    function debugCekPeriode() {
      const tgl = prompt('Masukkan tanggal (YYYY-MM-DD):');
      if (!tgl) return;
      const hasil = getJamForTanggal(tgl);
      const msg = hasil.nama
        ? `✅ ${tgl} → PERIODE: "${hasil.nama}"\nMasuk  : ${hasil.masuk}\nPulang : ${hasil.pulang}`
        : `🔵 ${tgl} → JAM GLOBAL\nMasuk  : ${hasil.masuk}\nPulang : ${hasil.pulang}`;
      alert(msg);
    }

    function renderPeriodeAdminList() {
      const list = $('periodeAdminList');
      if (!list) return;
      if (!jamPeriodeList.length) {
        list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:11px">📭 Belum ada periode khusus</div>';
        return;
      }
      const todayStr = fmtD(nowWITA());
      const fmtTgl = s => { try { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };
      list.innerHTML = jamPeriodeList.map(p => {
        const aktif = todayStr >= p.dari && todayStr <= p.sampai;
        const expired = todayStr > p.sampai;
        const belumMulai = todayStr < p.dari;
        const statusLabel = aktif ? '● Aktif' : expired ? '✕ Expired' : '○ Belum Mulai';
        const statusColor = aktif ? '#a78bfa' : expired ? 'var(--danger)' : 'var(--muted)';
        const borderAlpha = aktif ? '.4' : expired ? '.2' : '.15';
        const bgAlpha = aktif ? '.07' : expired ? '.03' : '.04';
        return `<div style="background:rgba(167,139,250,${bgAlpha});border:1px solid rgba(167,139,250,${borderAlpha});border-radius:10px;padding:10px 12px;margin-bottom:7px;position:relative;${expired ? 'opacity:.6' : ''}">
      <div style="position:absolute;top:8px;right:10px;font-size:8px;font-weight:700;color:${statusColor};background:rgba(0,0,0,.2);border-radius:5px;padding:2px 6px">${statusLabel}</div>
      <div style="font-size:11px;font-weight:800;color:var(--white);margin-bottom:4px;padding-right:70px">${p.nama}</div>
      <div style="font-size:9px;color:var(--muted);margin-bottom:6px">📅 ${fmtTgl(p.dari)} — ${fmtTgl(p.sampai)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span style="font-size:9px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:2px 8px;color:var(--success)">🟢 Masuk ≤ ${p.masuk}</span>
        <span style="font-size:9px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:6px;padding:2px 8px;color:#60a5fa">🔵 Pulang ≥ ${p.pulang}</span>
        ${expired ? `<button onclick="hapusPeriodeAdmin('${p.id}')" style="font-size:8px;padding:2px 8px;border-radius:6px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:var(--danger);cursor:pointer;font-weight:700;margin-left:auto">🗑️ Hapus</button>` : ''}
      </div>
    </div>`;
      }).join('');
    }


    function togglePeriodeForm(show) {
      const form = $('periodeForm');
      const btn = $('btnShowPeriodeForm');
      if (!form || !btn) return;
      form.style.display = show ? 'block' : 'none';
      btn.style.display = show ? 'none' : 'block';
      if (show) {
        // Init with default dates
        const now = new Date();
        const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
        $('inPeriodeDari').value = `${y}-${m}-${d}`;
        $('inPeriodeSampai').value = `${y}-${m}-${d}`;
      }
    }

    async function submitTambahPeriode() {
      const nama = ($('inPeriodeNama')?.value || '').trim();
      const dari = $('inPeriodeDari')?.value || '';
      const sampai = $('inPeriodeSampai')?.value || '';
      const masuk = $('inPeriodeMasuk')?.value || '';
      const pulang = $('inPeriodePulang')?.value || '';

      if (!nama || !dari || !sampai || !masuk || !pulang) {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Field Belum Lengkap', 'Isi semua field: nama, tanggal, jam masuk & pulang.');
        return;
      }
      if (dari > sampai) {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Tanggal Tidak Valid', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
        return;
      }
      const mM = toMenitStr(masuk), mP = toMenitStr(pulang);
      if (mM === null || mP === null || mM >= mP) {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Jam Tidak Valid', 'Jam masuk harus lebih kecil dari jam pulang.');
        return;
      }
      const btn = $('btnTambahPeriode');
      if (btn) { btn.disabled = true; dom.setText('btnTambahPeriodeTxt', 'Menyimpan...'); }
      try {
        const res = await apiPost(P.jamPeriodeAdd, {
            nama, dari, sampai, masuk, pulang, ditambahkan_oleh: MY_ID,
            timestamp: new Date().toISOString()
          });
        if (!res.ok) throw 0;
        // Reset form
        ['inPeriodeNama', 'inPeriodeDari', 'inPeriodeSampai', 'inPeriodeMasuk', 'inPeriodePulang'].forEach(id => { const el = $(id); if (el) el.value = ''; });
        dom.hide('periodePreview');
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'success', '✅', 'Periode Tersimpan!', `🌙 ${nama} (${dari} s.d. ${sampai}) berhasil ditambahkan.`);
        setTimeout(() => togglePeriodeForm(false), 2000);
        await loadJamPeriodeAdmin();
      } catch {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Gagal Menyimpan', 'Pastikan webhook jam-periode-add aktif di n8n.');
      } finally {
        if (btn) { btn.disabled = false; dom.setText('btnTambahPeriodeTxt', '💾 Simpan Periode'); }
      }
    }

    // Alias untuk tombol hapus dari daftar periode (expired)
    function hapusPeriodeAdmin(id) {
      const p = jamPeriodeList.find(x => String(x.id) === String(id));
      const nama = p ? p.nama : id;
      hapusJamPeriode(id, nama);
    }

    async function hapusJamPeriode(id, nama) {
      if (!confirm(`Hapus periode "${nama}"?`)) return;
      try {
        const res = await apiPost(P.jamPeriodeDel, { id });
        if (!res.ok) throw 0;
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'success', '🗑️', 'Periode Dihapus', `"${nama}" berhasil dihapus.`);
        await loadJamPeriodeAdmin();
      } catch {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Gagal Hapus', 'Pastikan webhook jam-periode-delete aktif di n8n.');
      }
    }

    /* ════ FACE RECOGNITION TOGGLE ════ */

    // State lokal yang diubah oleh toggle button, disimpan saat klik Simpan
    let _faceTogglePending = null; // null = belum ada perubahan

    function _applyFaceToggleUI(enabled) {
      const sw = $('faceToggleSwitch');
      const knob = $('faceToggleKnob');
      const label = $('faceToggleLabel');
      const desc = $('faceToggleDesc');
      if (!sw || !knob) return;

      if (enabled) {
        if (sw) sw.style.background = '#22c55e'; // Green
        if (knob) knob.style.left = '27px';    // Right
        if (label) label.textContent = '🟢 Face Recognition Aktif';
        if (desc) desc.textContent = 'Pegawai wajib verifikasi wajah saat absen';
      } else {
        if (sw) sw.style.background = '#6b7280'; // Grey (Neutral Inactive)
        if (knob) knob.style.left = '3px';     // Left
        if (label) label.textContent = '⚪ Face Recognition Nonaktif';
        if (desc) desc.textContent = 'Absen tanpa verifikasi wajah (hanya GPS)';
      }
      // Show toggle card only for superadmin
      const card = $('faceToggleCard');
      if (card) card.style.display = _isSuperAdmin() ? 'block' : 'none';
      // Sinkronisasi UI profil dengan status toggle
      if (typeof updateProfilFaceUI === 'function') updateProfilFaceUI();
    }

    /**
     * Muat status aktif/nonaktif fitur face recognition dari server.
     * @returns {Promise<void>}
     */
        async function loadFaceToggle(instansi_id) {
      const inst = instansi_id || getScopedInstansiId();
      if (!inst) { FACE_RECOGNITION_ENABLED = false; return; }
      try {
        const res = await apiGet(P.faceToggle, { instansi_id: inst });
        if (!res.ok) throw 0;
        const rawFT = res.rows?.length ? res.rows[0] : (res?.data ?? {});
        const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
        FACE_RECOGNITION_ENABLED = d?.enabled !== false;
      } catch {
        FACE_RECOGNITION_ENABLED = false;
      }
      _faceTogglePending = FACE_RECOGNITION_ENABLED;
      _applyFaceToggleUI(FACE_RECOGNITION_ENABLED);
    }

    function toggleFaceRecognition() {
      // Flip state pending (belum ke server sampai klik Simpan)
      _faceTogglePending = !(_faceTogglePending ?? FACE_RECOGNITION_ENABLED);
      _applyFaceToggleUI(_faceTogglePending);
      // Sembunyikan result card jika muncul dari simpan sebelumnya
      const rc = $('faceToggleResult');
      if (rc) rc.style.display = 'none';
    }

    /**
     * Simpan perubahan status face recognition (aktif/nonaktif) ke server.
     * @returns {Promise<void>}
     */
        async function simpanFaceToggle() {
      const enabled = _faceTogglePending ?? FACE_RECOGNITION_ENABLED;
      const btn = $('btnSimpanFaceToggle');
      if (btn) { btn.disabled = true; dom.setText('btnFaceToggleText', '💾 Menyimpan...'); }
      const rc = $('faceToggleResult');
      if (rc) rc.style.display = 'flex';
      try {
        const instId = getScopedInstansiId();
        await apiPost(P.faceToggle, { enabled, instansi_id: instId, admin_id: MY_ID, admin_nips: ADMIN_NIPS });
        FACE_RECOGNITION_ENABLED = enabled;
        _applyFaceToggleUI(enabled);
        showResult('faceToggleResult', 'faceToggleRIcon', 'faceToggleRTitle', 'faceToggleRMsg', 'success', '✅',
          enabled ? 'Face Recognition Diaktifkan' : 'Face Recognition Dinonaktifkan',
          enabled
            ? 'Semua pegawai wajib verifikasi wajah saat absen.'
            : 'HADIR hanya menggunakan GPS, tanpa kamera.'
        );
      } catch {
        // Simpan lokal saja
        FACE_RECOGNITION_ENABLED = enabled;
        showResult('faceToggleResult', 'faceToggleRIcon', 'faceToggleRTitle', 'faceToggleRMsg', 'warning', '⚠️', 'Tersimpan Lokal',
          'Berhasil disimpan di perangkat ini, tapi gagal ke server. Pastikan webhook face-toggle aktif di n8n.');
      } finally {
        if (btn) { setTimeout(() => { btn.disabled = false; dom.setText('btnFaceToggleText', 'Simpan Pengaturan Face Recognition'); }, 2500); }
      }
    }

    /* ════ AUTO INIT ════ */
    // Load lokasi dari server saat startup agar tab Absen langsung menampilkan lokasi
    async function loadLokasiPublik() {
      try {
        const res = await apiGet(P.lokasiList);
        if (!res.ok) throw 0;
        const json = res.rows.length ? res.rows : parseApiResponse(res.data);
        const list = Array.isArray(json) ? json : (json.data || []);
        if (!list.length) return;
        const newLOK = {};
        list.forEach(l => {
          const nama = l.nama_lokasi || l.nama || '';
          const hariRaw = (l.hari || '').toLowerCase();
          if (hariRaw) {
            hariRaw.split(',').map(h => h.trim()).filter(Boolean).forEach(h => {
              if (!newLOK[h]) newLOK[h] = [];
              if (!newLOK[h].includes(nama)) newLOK[h].push(nama);
            });
          }
        });
        Object.keys(LOK_DEF).forEach(k => delete LOK_DEF[k]);
        Object.assign(LOK_DEF, newLOK);
        // Simpan koordinat untuk passive GPS badge
        window._lokasiCoords = list.filter(l => l.latitude && l.longitude).map(l => ({
          nama: l.nama_lokasi || l.nama || 'Kantor',
          lat: parseFloat(l.latitude), lon: parseFloat(l.longitude),
          radius: parseFloat(l.radius) || 150
        }));
        updateClock(); // refresh lokasiList di tab Absen
        _updateLocBadgeGPS(); // update badge lokasi setelah koordinat tersedia
      } catch (_) { }
    }
    loadLokasiPublik();
    // Badge lokasi — dipanggil setelah koordinat lokasi tersedia
    // GPS badge — minta izin 1x, pakai watchPosition permanen (tidak restart)
    let _locWatchId = null;
    let _locPermDenied = false;

    function _applyLocPos(lat, lon) {
      if (!window._lokasiCoords || !window._lokasiCoords.length) return;
      let best = null, bestDist = Infinity;
      window._lokasiCoords.forEach(l => {
        const R = 6371000, dLat = (l.lat - lat) * Math.PI / 180, dLon = (l.lon - lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(l.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist < bestDist) { bestDist = dist; best = l; }
      });
      const clb = $('clockLocBadge'); if (!clb) return;
      if (best && bestDist <= (best.radius || 150)) {
        clb.textContent = '📍 ' + best.nama; clb.className = 'clock-loc-badge';
      } else {
        clb.textContent = '📍 Di luar area kantor'; clb.className = 'clock-loc-badge unknown';
      }
    }

    function _updateLocBadgeGPS() {
      if (!navigator.geolocation || _locPermDenied || _locWatchId !== null) return;

      // ── Permissions API: cek state izin tanpa trigger prompt ──
      const _permState = (_readPermStore()['geolocation']) || 'unknown';
      if (_permState === 'denied') {
        _locPermDenied = true;
        const clb = $('clockLocBadge');
        if (clb) { clb.textContent = '📍 Izin lokasi ditolak'; clb.className = 'clock-loc-badge unknown'; }
        return;
      }

      // ── Coba pakai GPS cache terlebih dulu (TTL 2 menit, badge only) ──
      const _cachedPos = _getCachedGPS();
      if (_cachedPos) {
        _applyLocPos(_cachedPos.lat, _cachedPos.lon);
        // Tetap request fresh position di background (silent, tanpa blok UI)
      }

      // Jika cache hit DAN permission bukan 'prompt', skip re-request saat ini
      if (_cachedPos && _permState === 'granted') return;

      _locWatchId = 1; // tandai sudah dijalankan agar tidak dipanggil ulang
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          _setCachedGPS(latitude, longitude); // simpan ke cache
          _applyLocPos(latitude, longitude);
        },
        err => {
          const clb = $('clockLocBadge');
          if (err && err.code === 1) {
            _locPermDenied = true;
            _writePermStore({ geolocation: 'denied' });
            if (clb) { clb.textContent = '📍 Izin lokasi ditolak'; clb.className = 'clock-loc-badge unknown'; }
          }
          // timeout/unavailable → badge tetap "Mendeteksi", tidak minta lagi
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
      );
    }

    // Initial data loading is now handled by initApp() at the bottom.
    initPermissions(); // pre-check & watch geolocation + camera permissions

    /* ============================================================
       WAJIB DAFTAR WAJAH
       ============================================================ */

    async function _cekWajibFace() {
      await new Promise(r => setTimeout(r, 1200));
      if (!MY_ID) return;
      // Toggle OFF → sembunyikan modal paksa (tidak perlu daftar wajah untuk absen)
      if (!FACE_RECOGNITION_ENABLED) {
        _hideFaceRequiredModal();
        return;
      }
      const ref = getFaceRef();
      if (ref && ref.dataUrl && ref.dataUrl !== '') return;
      _showFaceRequiredModal();
    }

    function _showFaceRequiredModal() {
      const modal = $('faceRequiredModal');
      if (!modal) return;
      modal.style.display = 'flex';
    }

    function _hideFaceRequiredModal() {
      const modal = $('faceRequiredModal');
      if (!modal) return;
      modal.style.display = 'none';
    }

    async function daftarWajahPaksa() {
      const btn = $('btnDaftarWajahPaksa');
      const txt = $('btnDaftarWajahTxt');
      const status = $('faceRequiredStatus');
      if (btn) btn.disabled = true;
      if (txt) txt.textContent = 'Membuka kamera...';

      openCamOverlay({
        isRegister: true, onDone: async (cap) => {
          if (!cap || !cap.dataUrl) {
            if (btn) btn.disabled = false;
            if (txt) txt.textContent = 'Daftarkan Wajah Sekarang';
            if (status) status.textContent = 'Foto tidak berhasil diambil, coba lagi.';
            return;
          }
          if (status) { status.textContent = 'Menyimpan data wajah...'; status.style.color = 'var(--muted)'; }
          const ok = await saveFaceRef(cap.dataUrl, cap.descriptor);
          if (ok) {
            if (status) { status.textContent = 'Wajah berhasil didaftarkan!'; status.style.color = 'var(--success)'; }
            updateFaceRegUI();
            updateProfilFaceUI();
            await new Promise(r => setTimeout(r, 1200));
            _hideFaceRequiredModal();
          } else {
            if (status) { status.textContent = 'Gagal menyimpan. Coba lagi.'; status.style.color = 'var(--danger)'; }
            if (btn) btn.disabled = false;
            if (txt) txt.textContent = 'Daftarkan Wajah Sekarang';
          }
        }, onCancel: () => {
          if (btn) btn.disabled = false;
          if (txt) txt.textContent = 'Daftarkan Wajah Sekarang';
          if (status) { status.textContent = 'Pendaftaran dibatalkan. Wajah wajib didaftarkan untuk absen.'; status.style.color = 'var(--warning)'; }
          setTimeout(_showFaceRequiredModal, 500);
        }
      });
    }

    /* ============================================================
       ADMIN: STATUS WAJAH PEGAWAI
       ============================================================ */

    /**
     * Muat status pendaftaran wajah semua pegawai untuk panel admin.
     * @returns {Promise<void>}
     */
        async function loadFaceStatusAdmin() {
      const list = $('faceStatusAdminList');
      if (!list) return;
      dom.shimmer(list.id, 3);
      try {
        const res = await apiGet(P.userList);
        if (!res.ok) throw 0;
        const json = res.rows.length ? res.rows : parseApiResponse(res.data);

        // Response format: { ok, data: [...], total } — ambil dari data
        const pegawai = (Array.isArray(json)
          ? json
          : Array.isArray(json.data)
            ? json.data
            : []).filter(u => u.id || u.ID);

        // Urutkan berdasarkan ID (numerik)
        pegawai.sort((a, b) => {
          const valA = Number(a.id || a.ID || 999999);
          const valB = Number(b.id || b.ID || 999999);
          return valA - valB;
        });

        if (!pegawai.length) {
          list.innerHTML = '<div style="text-align:center;padding:16px;font-size:11px;color:var(--muted)">Tidak ada data pegawai</div>';
          return;
        }

        // Helper ambil nama — Supabase pakai "Nama" (kapital)
        const getNama = p => p.Nama || p.nama || p.username || p.Username || '—';
        const getUid = p => String(p.id || p.ID || '');
        const getNip = p => p.NIP || p.nip || '';

        // hasFace: face_histogram tidak null, tidak '', dan tidak '[]' (hasil reset)
        const hasFace = p => {
          const hist = p.face_histogram;
          const photo = p.face_photo;
          const validHist = hist && hist !== '[]' && hist !== '';
          const validPhoto = photo && photo !== '';
          return validHist || validPhoto;
        };
        const sudah = pegawai.filter(p => hasFace(p));
        const belum = pegawai.filter(p => !hasFace(p));
        const total = pegawai.length;
        const pct = total > 0 ? Math.round(sudah.length / total * 100) : 0;
        const barColor = pct === 100 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';

        let html = `
      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px 12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;color:var(--white)">Progress Pendaftaran</span>
          <span style="font-size:11px;font-weight:800;color:${barColor}">${sudah.length}/${total} (${pct}%)</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div>
        </div>
        <div style="display:flex;gap:12px;margin-top:6px">
          <span style="font-size:9px;color:var(--success)">✅ Sudah: ${sudah.length}</span>
          <span style="font-size:9px;color:var(--danger)">❌ Belum: ${belum.length}</span>
        </div>
      </div>`;

        if (belum.length) {
          html += `<div style="font-size:9px;font-weight:800;color:var(--danger);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Belum Daftar (${belum.length})</div>`;
          belum.forEach(p => {
            const nama = getNama(p);
            const uid = getUid(p);
            const nip = getNip(p);
            html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:10px;margin-bottom:6px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(239,68,68,.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
            <div style="font-size:9px;color:var(--muted)">${nip ? 'NIP: ' + nip + ' · ' : ''}Belum daftar wajah</div>
          </div>
          <span style="font-size:9px;padding:2px 8px;border-radius:6px;background:rgba(239,68,68,.15);color:var(--danger);font-weight:700;flex-shrink:0">Belum</span>
        </div>`;
          });
        }

        if (sudah.length) {
          html += `<div style="font-size:9px;font-weight:800;color:var(--success);text-transform:uppercase;letter-spacing:.06em;margin:10px 0 6px">Sudah Daftar (${sudah.length})</div>`;
          sudah.forEach(p => {
            const nama = getNama(p);
            const uid = getUid(p);
            const nip = getNip(p);
            const savedAt = p.face_saved_at || null;
            let tgl = '?';
            if (savedAt && savedAt !== '') {
              try { const d = new Date(savedAt); tgl = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; } catch (_) { }
            }
            const thumb = p.face_photo || null;

            // Tentukan Engine Type
            let engineBadge = '';
            const histData = p.face_histogram || p.descriptor;
            if (histData && histData !== '' && histData !== '[]') {
              try {
                const arr = typeof histData === 'string' ? JSON.parse(histData) : histData;
                const dLen = Array.isArray(arr) ? arr.length : 0;
                if (dLen >= 512) engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(201,168,76,0.2);color:var(--gold);border-radius:4px;margin-left:4px;border:1px solid rgba(201,168,76,0.3)">🛡️ Human</span>';
                else if (dLen === 128) engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(96,165,250,0.2);color:#60a5fa;border-radius:4px;margin-left:4px;border:1px solid rgba(96,165,250,0.3)">🤖 API</span>';
              } catch (e) { }
            }

            html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.2);border-radius:10px;margin-bottom:6px">
          <div style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(34,197,94,.3);overflow:hidden;flex-shrink:0;background:rgba(0,0,0,.3)">
            ${thumb
                ? `<img src="${escapeHtml(thumb)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentNode.innerHTML='👤'">`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px">👤</div>`
              }
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
            <div style="font-size:9px;color:var(--muted)">${nip ? 'NIP: ' + nip + ' · ' : ''}Terdaftar: ${tgl}${engineBadge}</div>
          </div>
          <button onclick="resetFacePegawai('${escapeHtml(uid)}','${escapeHtml(nama)}')"
            style="font-size:9px;padding:3px 8px;border-radius:6px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--danger);cursor:pointer;flex-shrink:0;font-weight:700">
            🗑️ Reset
          </button>
        </div>`;
          });
        }

        list.innerHTML = html;
      } catch (e) {
        list.innerHTML = '<div style="text-align:center;padding:16px;font-size:11px;color:var(--muted)">Gagal memuat. Pastikan n8n aktif.</div>';
      }
    }


    /**
     * Reset data wajah pegawai (hapus descriptor dari server & localStorage).
     * @param {string|number} uid - Telegram ID pegawai
     * @param {string} nama - Nama pegawai (untuk konfirmasi)
     * @returns {Promise<void>}
     */
        async function resetFacePegawai(uid, nama) {
  if (!requireAdmin()) return;
      if (!confirm('Reset data wajah ' + nama + '?\nPegawai akan dipaksa daftar ulang saat buka app.')) return;
      try {
        const res = await apiPost(P.faceRegister, { user_id: uid, foto_base64: '', histogram: [], saved_at: '', _reset: true });
        if (res && res.ok) {
          alert('Data wajah ' + nama + ' berhasil direset.');
          loadFaceStatusAdmin();
        } else { alert('Gagal reset. Coba lagi.'); }
      } catch (_) { alert('Gagal terhubung ke server.'); }
    }

    cekJaringan();  // cek jaringan WiFi kantor saat halaman dimuat
    loadWeather();  // muat cuaca Waikabubak

    /* ══ FACE SETTINGS (n8n webhook → pengaturan table) ══ */
    let _fsData = {};

    function _loadFsDefaults() {
      return {
        liveness_enabled: true,
        face_threshold: 0.55,
        meja_threshold: 0.55,
        liveness_score: 0.40,
        mandatory_nips: []
      };
    }

    async function loadFaceSettings() {
      try {
        const res = await apiGet(P.faceSettings);
        if (res.ok) {
          const d = res.data?.settings || res.data || {};
          if (d.liveness_enabled !== undefined) {
            _fsData = {
              liveness_enabled: d.liveness_enabled !== false,
              face_threshold: parseFloat(d.face_threshold) || 0.55,
              meja_threshold: parseFloat(d.meja_threshold) || 0.55,
              liveness_score: parseFloat(d.liveness_score) || 0.40,
              mandatory_nips: d.mandatory_nips || []
            };
            _applyFsUI();
            _applyFsGlobals();
            return;
          }
        }
      } catch {}
      // Fallback: localStorage
      try {
        const raw = localStorage.getItem('face_admin_settings');
        _fsData = raw ? { ..._loadFsDefaults(), ...JSON.parse(raw) } : _loadFsDefaults();
      } catch { _fsData = _loadFsDefaults(); }
      _applyFsUI();
      _applyFsGlobals();
    }

    function _applyFsUI() {
      const sw = $('fsLivenessSwitch');
      const knob = $('fsLivenessKnob');
      if (sw && knob) {
        sw.style.background = _fsData.liveness_enabled ? 'var(--accent)' : '#6b7280';
        knob.style.left = _fsData.liveness_enabled ? '27px' : '3px';
      }
      const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
      const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
      setVal('fsThreshold', _fsData.face_threshold);
      setTxt('fsThresholdVal', _fsData.face_threshold);
      setVal('fsMejaThreshold', _fsData.meja_threshold);
      setTxt('fsMejaThresholdVal', _fsData.meja_threshold);
      setVal('fsLivenessScore', _fsData.liveness_score);
      setTxt('fsLivenessScoreVal', _fsData.liveness_score);
      const nipEl = $('fsMandatoryNips');
      if (nipEl) nipEl.value = (_fsData.mandatory_nips || []).join(',');
    }

    function _applyFsGlobals() {
      window.FS_LIVENESS_MOBILE = _fsData.liveness_enabled;
      window.FS_FACE_THRESHOLD = _fsData.face_threshold;
      window.FS_MEJA_THRESHOLD = _fsData.meja_threshold;
      window.FS_LIVENESS_SCORE = _fsData.liveness_score;
      window.MANDATORY_FACE_NIPS = (_fsData.mandatory_nips || []).filter(n => n.trim());
    }

    function toggleFsLiveness() {
      _fsData.liveness_enabled = !(_fsData.liveness_enabled ?? true);
      _applyFsUI();
    }

    async function saveFaceSettings() {
      _fsData.liveness_enabled = _fsData.liveness_enabled ?? true;
      _fsData.face_threshold = parseFloat($('fsThreshold')?.value) || 0.55;
      _fsData.meja_threshold = parseFloat($('fsMejaThreshold')?.value) || 0.55;
      _fsData.liveness_score = parseFloat($('fsLivenessScore')?.value) || 0.40;
      const nipStr = ($('fsMandatoryNips')?.value || '').trim();
      _fsData.mandatory_nips = nipStr ? nipStr.split(',').map(s => s.trim()).filter(Boolean) : [];

      // Save to server
      let serverOk = false;
      try {
        const res = await apiPost(P.faceSettings, {
          settings: {
            liveness_enabled: _fsData.liveness_enabled,
            face_threshold: _fsData.face_threshold,
            meja_threshold: _fsData.meja_threshold,
            liveness_score: _fsData.liveness_score,
            mandatory_nips: _fsData.mandatory_nips
          }
        });
        serverOk = res.ok;
      } catch {}

      // Also save to localStorage as fallback
      localStorage.setItem('face_admin_settings', JSON.stringify(_fsData));
      _applyFsGlobals();

      if (serverOk) {
        showResult('fsResult', 'fsRIcon', 'fsRTitle', 'fsRMsg', 'success', '✅', 'Tersimpan ke Server',
          `Liveness: ${_fsData.liveness_enabled ? 'ON' : 'OFF'} · Absen: ${_fsData.face_threshold} · Meja: ${_fsData.meja_threshold} · Liveness Min: ${_fsData.liveness_score} · NIP Wajib: ${_fsData.mandatory_nips.length}`);
      } else {
        showResult('fsResult', 'fsRIcon', 'fsRTitle', 'fsRMsg', 'warning', '⚠️', 'Tersimpan Lokal',
          'Gagal sync ke server. Pastikan webhook face-settings aktif di n8n.');
      }
    }



    // ponytail: do NOT call loadFaceSettings() at parse time — moved to initApp()

