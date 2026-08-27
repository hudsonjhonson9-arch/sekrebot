/* ════ TANDA TANGAN / SIGNATURE PAD ════ */
    /* ════════════════════════════════════════════════════
       TANDA TANGAN DIGITAL
    ════════════════════════════════════════════════════════ */
    let _sigMode = 'draw';   // 'draw' | 'photo'
    let _sigDrawing = false;
    let _sigHasContent = false;
    let _sigPhotoData = null;     // base64 dari upload foto
    let _sigTargetNip = null;    // NIP pemilik tanda tangan
    let _sigCallback = null;     // callback setelah simpan berhasil

    // ── State tanda tangan tersimpan per pegawai (cache lokal) ──
    let _sigCache = {};

    // ── Buka signature pad ──
    /**
     * Buka overlay untuk menggambar atau mengupload tanda tangan digital.
     * @param {string} nip - NIP pemilik tanda tangan
     * @param {Function|null} callback - Dipanggil setelah simpan berhasil
     */
        function openSignaturePad(nip, callback) {
      _sigTargetNip = nip || localStorage.getItem('MY_NIP') || '';
      _sigCallback = callback || null;
      _sigMode = 'draw';
      _sigHasContent = false;
      _sigPhotoData = null;

      // Reset title
      const titleEl = $('sigOverlayTitle');
      if (titleEl) {
        const myNip = localStorage.getItem('MY_NIP') || '';
        const isOwnSig = _sigTargetNip === myNip;
        titleEl.textContent = isOwnSig ? 'Tanda Tangan Saya' : `Tanda Tangan NIP: ${_sigTargetNip}`;
      }

      // Reset UI
      switchSigMode('draw');
      $('sigOverlay').classList.remove('hidden');

      // Init canvas setelah overlay visible
      requestAnimationFrame(() => {
        _initSigCanvas();
        clearSignaturePad();
      });
    }

    function closeSignaturePad() {
      $('sigOverlay').classList.add('hidden');
      _stopSigCanvas();
    }

    function switchSigMode(mode) {
      _sigMode = mode;
      $('sigTabDraw').classList.toggle('active', mode === 'draw');
      $('sigTabPhoto').classList.toggle('active', mode === 'photo');
      $('sigDrawPanel').style.display = mode === 'draw' ? 'flex' : 'none';
      $('sigPhotoPanel').style.display = mode === 'photo' ? 'flex' : 'none';
      const msgEl = $('sigMsg');
      if (msgEl) msgEl.style.display = 'none';
    }

    // ── Canvas drawing logic ──
    let _sigCtx = null;
    let _sigLastX = 0, _sigLastY = 0;

    function _initSigCanvas() {
      const canvas = $('sigCanvas');
      if (!canvas) return;
      const wrap = $('sigCanvasWrap');
      const W = wrap ? wrap.clientWidth : 340;
      canvas.width = W;
      canvas.height = 200;
      _sigCtx = canvas.getContext('2d');
      _sigCtx.clearRect(0, 0, canvas.width, canvas.height);
      _sigCtx.strokeStyle = '#1a1a2e';
      _sigCtx.lineWidth = 2.5;
      _sigCtx.lineCap = 'round';
      _sigCtx.lineJoin = 'round';
      _sigHasContent = false;

      // Remove old listeners
      canvas.removeEventListener('mousedown', _onSigDown);
      canvas.removeEventListener('mousemove', _onSigMove);
      canvas.removeEventListener('mouseup', _onSigUp);
      canvas.removeEventListener('mouseleave', _onSigUp);
      canvas.removeEventListener('touchstart', _onSigTouchStart, { passive: false });
      canvas.removeEventListener('touchmove', _onSigTouchMove, { passive: false });
      canvas.removeEventListener('touchend', _onSigUp);

      canvas.addEventListener('mousedown', _onSigDown);
      canvas.addEventListener('mousemove', _onSigMove);
      canvas.addEventListener('mouseup', _onSigUp);
      canvas.addEventListener('mouseleave', _onSigUp);
      canvas.addEventListener('touchstart', _onSigTouchStart, { passive: false });
      canvas.addEventListener('touchmove', _onSigTouchMove, { passive: false });
      canvas.addEventListener('touchend', _onSigUp);
    }

    function _stopSigCanvas() {
      const canvas = $('sigCanvas');
      if (!canvas) return;
      canvas.removeEventListener('mousedown', _onSigDown);
      canvas.removeEventListener('mousemove', _onSigMove);
      canvas.removeEventListener('mouseup', _onSigUp);
      canvas.removeEventListener('mouseleave', _onSigUp);
      canvas.removeEventListener('touchstart', _onSigTouchStart, { passive: false });
      canvas.removeEventListener('touchmove', _onSigTouchMove, { passive: false });
      canvas.removeEventListener('touchend', _onSigUp);
    }

    function _getSigPos(canvas, e) {
      const r = canvas.getBoundingClientRect();
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      return {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY
      };
    }

    function _onSigDown(e) {
      _sigDrawing = true;
      const p = _getSigPos(this, e);
      _sigLastX = p.x; _sigLastY = p.y;
      _sigCtx.beginPath();
      _sigCtx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      _sigCtx.fillStyle = '#1a1a2e';
      _sigCtx.fill();
      _sigHasContent = true;
      const hint = $('sigEmptyHint');
      if (hint) hint.style.display = 'none';
    }

    function _onSigMove(e) {
      if (!_sigDrawing) return;
      const p = _getSigPos(this, e);
      _sigCtx.beginPath();
      _sigCtx.moveTo(_sigLastX, _sigLastY);
      _sigCtx.lineTo(p.x, p.y);
      _sigCtx.stroke();
      _sigLastX = p.x; _sigLastY = p.y;
    }

    function _onSigUp() { _sigDrawing = false; }

    function _onSigTouchStart(e) {
      e.preventDefault();
      if (!e.touches[0]) return;
      _onSigDown.call(this, e.touches[0]);
    }
    function _onSigTouchMove(e) {
      e.preventDefault();
      if (!e.touches[0]) return;
      _onSigMove.call(this, e.touches[0]);
    }

    // ── Handle upload foto tanda tangan ──
    function onSigFileChange(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        _showSigMsg('⚠️ Ukuran file terlalu besar (maks 5MB)', 'warn'); return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        _sigPhotoData = ev.target.result;
        // Convert to clean PNG with transparent bg
        _convertSigPhotoToPng(_sigPhotoData, png => {
          _sigPhotoData = png;
          const prev = $('sigUploadPreview');
          const img = $('sigUploadImg');
          const zone = $('sigUploadZone');
          if (img) img.src = png;
          if (prev) prev.style.display = 'block';
          if (zone) zone.style.display = 'none';
        });
      };
      reader.readAsDataURL(file);
    }

    // Convert foto ke PNG transparan (hapus latar putih)
    function _convertSigPhotoToPng(dataUrl, cb) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Scale down if too large
        const MAX = 600;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        // Make near-white pixels transparent
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 200) {
            data[i + 3] = 0; // transparent
          }
        }
        ctx.putImageData(imageData, 0, 0);
        cb(canvas.toDataURL('image/png', 0.92));
      };
      img.onerror = () => cb(dataUrl);
      img.src = dataUrl;
    }

    // ── Clear pad ──
    function clearSignaturePad() {
      if (_sigMode === 'draw') {
        const canvas = $('sigCanvas');
        if (canvas && _sigCtx) _sigCtx.clearRect(0, 0, canvas.width, canvas.height);
        _sigHasContent = false;
        const hint = $('sigEmptyHint');
        if (hint) hint.style.display = 'flex';
      } else {
        _sigPhotoData = null;
        const prev = $('sigUploadPreview');
        const zone = $('sigUploadZone');
        const inp = $('sigFileInput');
        if (prev) prev.style.display = 'none';
        if (zone) zone.style.display = 'block';
        if (inp) inp.value = '';
      }
      const msgEl = $('sigMsg');
      if (msgEl) msgEl.style.display = 'none';
    }

    // ── Save tanda tangan ke server ──
    /**
     * Simpan tanda tangan ke server (sebagai PNG transparan).
     * Mendukung dua mode: gambar di canvas atau upload foto.
     * @returns {Promise<void>}
     */
        async function saveSignature() {
      let dataUrl = null;

      if (_sigMode === 'draw') {
        if (!_sigHasContent) {
          _showSigMsg('⚠️ Tulis tanda tangan Anda terlebih dahulu', 'warn'); return;
        }
        const canvas = $('sigCanvas');
        // Render dengan background putih untuk PNG bersih
        const tmpC = document.createElement('canvas');
        tmpC.width = canvas.width; tmpC.height = canvas.height;
        const tmpCtx = tmpC.getContext('2d');
        tmpCtx.fillStyle = '#ffffff';
        tmpCtx.fillRect(0, 0, tmpC.width, tmpC.height);
        tmpCtx.drawImage(canvas, 0, 0);
        // Buat transparan
        const imgData = tmpCtx.getImageData(0, 0, tmpC.width, tmpC.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 220) { d[i + 3] = 0; }
        }
        tmpCtx.putImageData(imgData, 0, 0);
        dataUrl = tmpC.toDataURL('image/png', 0.92);
      } else {
        if (!_sigPhotoData) {
          _showSigMsg('⚠️ Pilih foto tanda tangan terlebih dahulu', 'warn'); return;
        }
        dataUrl = _sigPhotoData;
      }

      // KOMPRESI: Kurangi beban bandwidth
      try {
        dataUrl = await compressImage(dataUrl, 600, 0.6);
      } catch (e) { console.warn('Gagal kompresi, gunakan original'); }

      // Set loading state
      const btn = $('btnSaveSig');
      const btnTxt = $('btnSaveSigTxt');
      if (btn) btn.disabled = true;
      if (btnTxt) btnTxt.textContent = 'Menyimpan...';

      try {
        const nip = _sigTargetNip || localStorage.getItem('MY_NIP') || '';

        const payload = {
          nip: nip,
          signature: dataUrl,
          savedAt: new Date().toISOString(),
          savedBy: MY_ID
        };
        const { ok: sigOk, data: res } = await apiPost(P.signatureSave, payload);

        if (sigOk) {
          _sigCache[nip] = dataUrl;
          try { localStorage.setItem(`sig_${nip}`, dataUrl); } catch (_) { }

          _showSigMsg('✅ Tanda tangan berhasil disimpan!', 'ok');
          // Update UI profil
          if (nip === localStorage.getItem('MY_NIP')) updateProfilSigUI(dataUrl);
          if (typeof _sigCallback === 'function') _sigCallback(dataUrl);
          setTimeout(() => closeSignaturePad(), 1500);
        } else {
          throw new Error('Server error ' + 200);
        }
      } catch (e) {
        // Fallback: simpan lokal saja
        const nip = _sigTargetNip || localStorage.getItem('MY_NIP') || '';
        _sigCache[nip] = dataUrl;
        try { localStorage.setItem(`sig_${nip}`, dataUrl); } catch (_) { }
        if (nip === localStorage.getItem('MY_NIP')) updateProfilSigUI(dataUrl);
        _showSigMsg('⚠️ Tersimpan lokal (server tidak merespons)', 'warn');
        setTimeout(() => closeSignaturePad(), 1800);
      } finally {
        if (btn) btn.disabled = false;
        if (btnTxt) btnTxt.textContent = 'Simpan Tanda Tangan';
      }
    }

    function _showSigMsg(text, type) {
      const el = $('sigMsg');
      if (!el) return;
      el.style.display = 'block';
      el.textContent = text;
      el.style.cssText = el.style.cssText + `;background:${type === 'ok'
        ? 'rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:var(--success)'
        : 'rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:var(--warning)'
        }`;
    }

    // ── Update profil UI tanda tangan ──
    function updateProfilSigUI(dataUrl) {
      const img = $('profilSigImg');
      const empty = $('profilSigEmpty');
      const status = $('profilSigStatus');
      const sub = $('profilSigSub');
      const btn = $('btnProfilSig');
      if (!status) return;

      if (dataUrl) {
        if (img) { img.src = dataUrl; img.style.display = 'block'; }
        if (empty) empty.style.display = 'none';
        status.textContent = '✅ Tanda Tangan Tersimpan';
        status.style.color = 'var(--success)';
        if (sub) sub.textContent = 'Tanda tangan akan disisipkan pada rekap absen PDF';
        if (btn) btn.textContent = '🔄 Perbarui';
      } else {
        if (img) img.style.display = 'none';
        if (empty) empty.style.display = 'flex';
        status.textContent = 'Belum ada tanda tangan';
        status.style.color = 'var(--muted)';
        if (sub) sub.textContent = 'Daftarkan tanda tangan untuk rekap absen & PDF';
        if (btn) btn.textContent = '✏️ Buat';
      }
    }

    // ── Load tanda tangan dari server atau localStorage ──
    async function loadMySignature() {
      const myNip = localStorage.getItem('MY_NIP') || '';
      if (!myNip) return;
      const cacheKey = `sig_${myNip}`;

      // Cek cache lokal dulu
      let cached = null;
      try { cached = localStorage.getItem(cacheKey); } catch (_) { }
      if (cached) { updateProfilSigUI(cached); _sigCache[myNip] = cached; }

      // Fetch dari server
      try {
        const res = await apiGet(P.signatureGet, { nip: myNip });
        if (res.ok) {
          const d = res?.data ?? {};
          const sig = d.signature || d.data?.signature || null;
          if (sig) {
            _sigCache[myNip] = sig;
            try { localStorage.setItem(cacheKey, sig); } catch (_) { }
            updateProfilSigUI(sig);
          }
        }
      } catch (_) { }
    }

    // ── Admin: Status tanda tangan semua pegawai ──
    async function loadAdminSigStatus() {
      const el = $('adminSigList');
      if (!el) return;
      el.innerHTML = `<div class="shimmer" style="height:40px;border-radius:10px"></div>`;

      try {
        // Parallel: daftar pegawai + daftar tanda tangan
        const [ur, sr] = await Promise.allSettled([
          apiGet(P.userList + '?format=full'),
          apiGet(P.signatureList)
        ]);

        const users = ur.status === 'fulfilled' && ur.value.ok
          ? (ur.value.rows.length ? ur.value.rows : parseApiResponse(ur.value.data))
          : [];

        let sigMap = {};
        if (sr.status === 'fulfilled' && sr.value.ok) {
          const sd = sr.value?.data ?? {};
          const arr = Array.isArray(sd) ? sd : (sd.data || []);
          arr.forEach(s => { sigMap[String(s.nip || s.telegram_id || s.id || '')] = s; });
        }

        if (!users.length) {
          el.innerHTML = `<div class="empty-state" style="padding:12px"><div class="empty-icon">👥</div><div class="empty-text">Tidak ada data pegawai</div></div>`;
          return;
        }

        el.innerHTML = users.map(u => {
          const uid = String(u.ID || u.id || u.telegram_id || '');
          const nip = String(u.nip || u.NIP || '');
          const nama = u.Nama || u.nama || u.username || uid;
          const hasSig = !!sigMap[nip] || !!sigMap[uid];
          const sigData = sigMap[nip] || sigMap[uid] || {};
          const tgl = hasSig && sigData.saved_at
            ? new Date(sigData.saved_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })
            : null;

          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;margin-bottom:5px">
        <div style="font-size:16px">${hasSig ? '✅' : '⬜'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:1px">${hasSig ? `Didaftarkan: ${tgl || '—'}` : 'Belum ada tanda tangan'}</div>
        </div>
        ${hasSig
              ? `<div style="width:60px;height:34px;border-radius:6px;overflow:hidden;border:1px solid var(--border);background:#fff"><img src="${sigData.signature || ''}" style="width:100%;height:100%;object-fit:contain"></div>`
              : `<span style="font-size:9px;color:var(--muted);background:rgba(255,255,255,.05);padding:3px 8px;border-radius:6px">—</span>`
            }
      </div>`;
        }).join('');
      } catch (e) {
        el.innerHTML = `<div class="empty-state" style="padding:12px"><div class="empty-icon">🔌</div><div class="empty-text">Gagal memuat</div></div>`;
      }
    }

    /* ════════════════════════════════════════════════════
       FACE SCAN BADGE UPDATE — kasirjegrup style
    ════════════════════════════════════════════════════════ */
    // Tambahkan face badge info saat wajah terdeteksi (dipanggil dari loop deteksi)
    function _updateCamFaceBadge(faceCount, label) {
      const badge = $('camFaceBadge');
      if (!badge) return;
      if (faceCount === 0) {
        badge.style.display = 'none';
      } else {
        badge.style.display = 'block';
        badge.textContent = label || `👤 ${faceCount} wajah`;
      }
    }

    /* ════════════════════════════════════════════════════
       Logika PATCH sebelumnya telah diintegrasikan langsung
       ke dalam switchTab() dan loadJamAbsen() di atas untuk
       menghindari infinite recursion akibat function hoisting.
    ════════════════════════════════════════════════════════ */

