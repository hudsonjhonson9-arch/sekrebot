/* ════ DESKTOP MODE & ADMIN FACE REGISTRATION ════ */
    /* ════════════════════════════════════════════════════
       ADMIN: DAFTARKAN WAJAH PEGAWAI
    ════════════════════════════════════════════════════════ */
    let _adminFaceTargetId = null;
    let _adminFaceTargetNama = null;

    async function loadAdminFaceReg() {
      const listEl = $('adminFaceRegList');
      const selectEl = $('selectPegawaiFaceReg');
      if (!listEl) return;

      listEl.innerHTML = `<div class="shimmer" style="height:44px;border-radius:10px"></div>`;

      try {
        // Muat daftar pegawai
        const ur = await apiGet(P.userList + '?format=full');
        const ud = ur.ok ? ((ur.rows?.length ?? 0) ? ur.rows : parseApiResponse(ur.data)) : [];
        let users = Array.isArray(ud) ? ud : (ud.data || []);

        // Urutkan berdasarkan ID (numerik)
        users.sort((a, b) => {
          const valA = Number(a.id || a.ID || 999999);
          const valB = Number(b.id || b.ID || 999999);
          return valA - valB;
        });

        // Populate select
        if (selectEl) {
          selectEl.innerHTML = `<option value="">— Pilih Pegawai —</option>` +
            users.map(u => {
              const uid = u.ID || u.id || u.telegram_id || '';
              const nama = u.Nama || u.nama || u.username || String(uid);
              return `<option value="${uid}" data-nama="${nama}">${nama}</option>`;
            }).join('');
        }

        const listEl2 = $('adminFaceRegList');
        if (!listEl2) return;

        if (!users.length) {
          listEl.innerHTML = `<div class="empty-state" style="padding:16px"><div class="empty-icon"><i class="fas fa-users"></i></div><div class="empty-text">Tidak ada pegawai</div></div>`;
          return;
        }

        listEl.innerHTML = users.map(u => {
          const uid = String(u.ID || u.id || u.telegram_id || '');
          const nama = u.Nama || u.nama || u.username || uid;
          // Gunakan metadata has_face & has_signature dari view_user_mgmt
          const hasFace = !!(u.has_face);
          const hasSig = !!(u.has_signature);
          const facePhoto = u.face_photo || null;

          let engineBadge = '';
          if (hasFace) {
            const faceModel = u.face_model || null;
            if (faceModel === 'human') {
              engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(201,168,76,0.2);color:var(--gold);border-radius:4px;margin-left:4px;border:1px solid rgba(201,168,76,0.3);display:inline-block"><i class="fas fa-shield-alt"></i> Human</span>';
            } else if (faceModel === 'faceapi') {
              engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(96,165,250,0.2);color:#60a5fa;border-radius:4px;margin-left:4px;border:1px solid rgba(96,165,250,0.3);display:inline-block"><i class="fas fa-robot"></i> API</span>';
            } else {
              // Fallback to check length if face_histogram is available in 'u'
              const histD = u.face_histogram || u.descriptor;
              if (histD && histD !== '' && histD !== '[]') {
                try {
                  const arr = typeof histD === 'string' ? JSON.parse(histD) : histD;
                  const dLen = Array.isArray(arr) ? arr.length : 0;
                  if (dLen >= 512) engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(201,168,76,0.2);color:var(--gold);border-radius:4px;margin-left:4px;border:1px solid rgba(201,168,76,0.3);display:inline-block"><i class="fas fa-shield-alt"></i> Human</span>';
                  else if (dLen === 128) engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(96,165,250,0.2);color:#60a5fa;border-radius:4px;margin-left:4px;border:1px solid rgba(96,165,250,0.3);display:inline-block"><i class="fas fa-robot"></i> API</span>';
                } catch (e) { }
              }
            }
          }

          const faceS = hasFace ? '<span style="color:#22c55e">OK</span>' : '<span style="color:#ef4444">Belum</span>';
          const sigS = hasSig ? '<span style="color:#22c55e">OK</span>' : '<span style="color:#ef4444">Belum</span>';

          return `
            <div class="face-adm-item" style="padding:15px; border-radius:20px; display:flex; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border); margin-bottom:10px">
              <div class="face-adm-thumb" id="thumb-${uid}" style="width:64px; height:64px; border-radius:18px; flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); cursor:pointer" onclick="adminLoadSinglePhoto('${uid}')">
                ${facePhoto ? `<img src="${facePhoto}" style="width:100%;height:100%;object-fit:cover">` : 
                (hasFace ? '<span style="font-size:10px;color:var(--gold);font-weight:700">LIHAT</span>' : '<span style="opacity:0.3;font-size:32px"><i class="fas fa-user"></i></span>')}
              </div>
              <div class="face-adm-info" style="flex:1; margin-left:14px; min-width:0">
                <div class="face-adm-name" style="font-size:14px; font-weight:800; color:#fff; word-break:break-word; line-height:1.3; margin-bottom:4px">${nama}</div>
                <div class="face-adm-status" style="font-size:10px; color:rgba(255,255,255,0.5)">
                  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px"><i class="fas fa-camera"></i> Wajah: ${faceS}${engineBadge} <span style="margin:0 4px">·</span> <i class="fas fa-pen"></i> TTD: ${sigS}</div>
                  <div style="opacity:0.6; font-size:9px; margin-top:4px">ID: ${uid} &nbsp;·&nbsp; ${u.nip || u.NIP || '—'} &nbsp;·&nbsp; ${u.jabatan || u.Jabatan || '—'}</div>
                </div>
              </div>
              <div class="face-adm-btns" style="display:flex; flex-direction:column; gap:6px; margin-left:12px">
                <button class="face-adm-btn" onclick="adminCaptureFaceFor('${uid}','${nama.replace(/'/g, "&#39;")}')" style="min-width:75px"><i class="fas fa-camera"></i> Wajah</button>
                <button class="face-adm-btn" onclick="adminCaptureSignatureFor('${u.nip || uid}','${nama.replace(/'/g, "&#39;")}')" style="min-width:75px"><i class="fas fa-pen"></i> TTD</button>
              </div>
            </div>`;
        }).join('');

        if (listEl) listEl.style.display = 'block';
        const galleryEl = $('adminFaceGallery');
        if (galleryEl) galleryEl.style.display = 'none';
      } catch (e) {
        const errMsg = e?.message || 'Koneksi gagal';
        const galleryEl = $('adminFaceGallery');
        if (galleryEl) {
          galleryEl.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:16px">
              <div class="empty-icon"><i class="fas fa-plug"></i></div>
              <div class="empty-text">Gagal memuat galeri wajah</div>
              <div class="empty-sub" style="margin-bottom:12px">${errMsg}</div>
              <button onclick="loadAdminFaceReg()"
                style="padding:8px 18px;border-radius:10px;background:var(--gold-dim);border:1px solid rgba(201,168,76,.4);color:var(--gold);font-size:11px;font-weight:700;cursor:pointer">
                <i class="fas fa-sync"></i> Coba Lagi
              </button>
            </div>`;
        }
        // Also reset the select dropdown
        const selectEl = $('selectPegawaiFaceReg');
        if (selectEl) selectEl.innerHTML = '<option value="">— Pilih Pegawai —</option>';
      }
    }

    // Fungsi On-Demand untuk memuat foto profil tunggal agar hemat egress
    async function adminLoadSinglePhoto(uid) {
      const container = $(`thumb-${uid}`);
      if (!container) return;
      
      const original = container.innerHTML;
      container.innerHTML = '<span class="spin-sm"></span>';
      
      try {
        const res = await apiGet(`${P.userList}?user_id=${uid}`);
        if (!res.ok) throw 0;
        const json = res.data ?? {};
        const d = Array.isArray(json) ? (json[0] || {}) : (json.data || json);
        
        if (d && d.face_photo) {
          container.innerHTML = `<img src="${d.face_photo}" style="width:100%;height:100%;object-fit:cover;animation:fadeIn .3s">`;
          container.onclick = null; // Sudah dimuat
        } else {
           container.innerHTML = '<span style="opacity:0.3;font-size:32px"><i class="fas fa-user"></i></span>';
        }
      } catch (e) {
        container.innerHTML = original;
        toast('Gagal memuat foto', 'error');
      }
    }

    function adminCaptureFaceFor(uid, nama, callback, nip) {
      _adminFaceTargetId = uid;
      _adminFaceTargetNama = nama;

      // Ubah judul kamera
      const title = $('camHeaderTitle');
      if (title) title.innerHTML = `<i class="fas fa-camera"></i> Daftar Wajah: ${nama}`;

      openCamOverlay({
        isRegister: true,
        onDone: async (cap) => {
          if (!cap?.dataUrl) return;
          if (typeof Swal !== 'undefined') {
            Swal.fire({ title: 'Menyimpan Wajah...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
          }
          const ok = await saveFaceRefFor(uid, cap.dataUrl, cap.descriptor, nama, nip);
          if (ok) {
            loadAdminFaceReg();
            if (typeof loadFaceStatusAdmin === 'function') loadFaceStatusAdmin();
            if (typeof callback === 'function') callback(cap.dataUrl);
            if (typeof _playMejaChime === 'function') _playMejaChime('success');
            setTimeout(() => {
              closeCamOverlay(false);
              if (typeof Swal !== 'undefined') {
                Swal.fire({
                  icon: 'success',
                  title: 'Foto Wajah Tersimpan',
                  text: `Foto wajah dan biometrik untuk ${nama} berhasil disimpan.`,
                  timer: 3500,
                  showConfirmButton: true
                });
              }
            }, 1200);
          } else {
            if (typeof Swal !== 'undefined') {
              Swal.fire({
                icon: 'error',
                title: 'Gagal Menyimpan Wajah',
                text: window._lastAiError || 'Wajah tidak terdeteksi jelas atau server tidak merespons.'
              });
            }
          }
        },
        onCancel: () => {
          const title = $('camTitle');
          if (title) title.innerHTML = '<i class="fas fa-camera"></i> Verifikasi Wajah';
        }
      });
    }

    function adminCaptureFace() {
      const selectEl = $('selectPegawaiFaceReg');
      if (!selectEl || !selectEl.value) {
        showResult('adminFaceRegResult', 'adminFaceRegRIcon', 'adminFaceRegRTitle', 'adminFaceRegRMsg',
          'warning', '<i class="fas fa-exclamation-triangle"></i>', 'Pilih Pegawai', 'Pilih nama pegawai terlebih dahulu sebelum membuka kamera.');
        dom.show('adminFaceRegResult', 'flex');
        return;
      }
      const uid = selectEl.value;
      const opt = selectEl.options[selectEl.selectedIndex];
      const nama = opt ? (opt.dataset.nama || opt.text) : uid;
      const nip = opt ? (opt.dataset.nip || '') : '';
      adminCaptureFaceFor(uid, nama, null, nip);
    }

    async function saveFaceRefFor(uid, dataUrl, descriptor, nama, nip) {
      try {
        const savedAt = new Date().toISOString();

        // Safety check: Face MUST be detected
        if (!descriptor) {
          if (typeof Swal !== 'undefined') {
            Swal.fire({
              icon: 'warning',
              title: 'Wajah Tidak Terdeteksi',
              text: 'Harap posisikan wajah lurus ke kamera dan ambil foto lagi.'
            });
          }
          return false;
        }
        const descriptorArray = Array.from(descriptor);

        const ok = await syncFaceToServer(uid, dataUrl, descriptorArray, nama, savedAt, nip);

        showResult('adminFaceRegResult', 'adminFaceRegRIcon', 'adminFaceRegRTitle', 'adminFaceRegRMsg',
          ok ? 'success' : 'warning',
          ok ? '<i class="fas fa-check"></i>' : '<i class="fas fa-exclamation-triangle"></i>',
          ok ? 'Wajah Tersimpan!' : 'Gagal Simpan',
          ok ? `Wajah ${nama} berhasil didaftarkan.` : 'Terjadi kesalahan saat menyimpan di server.');
        dom.show('adminFaceRegResult', 'flex');

        return ok;
      } catch (e) {
        console.error('Registration error:', e);
        showResult('adminFaceRegResult', 'adminFaceRegRIcon', 'adminFaceRegRTitle', 'adminFaceRegRMsg',
          'warning', '<i class="fas fa-plug"></i>', 'Koneksi Gagal', 'Gagal menghubungi server pendaftaran wajah.');
        dom.show('adminFaceRegResult', 'flex');
        return false;
      }
    }

    let _allAdminPegawai = []; // Cache untuk pencarian
    let _adminKetSelected = []; // Multi-select: [{id, nama, nip}]

    /**
     * Memuat daftar pegawai ke dalam dropdown Keterangan Admin (Ops).
     */
    async function adminLoadKetPegawai() {
      const el = $('adminKetOptionsList');
      const searchInput = $('adminKetSearchInput');
      if (!el) return;
      
      el.innerHTML = '<div style="padding:15px; text-align:center; font-size:11px; color:var(--muted)"><i class="fas fa-hourglass-half"></i> Memuat daftar pegawai...</div>';
      
      try {
        const res = await apiGet(P.userList + '?format=full');
        const rows = res.ok ? ((res.rows?.length ?? 0) ? res.rows : parseApiResponse(res.data)) : [];
        
        if (!rows.length) {
          el.innerHTML = '<div style="padding:15px; text-align:center; font-size:11px; color:var(--muted)"><i class="fas fa-exclamation-triangle"></i> Tidak ada data pegawai</div>';
          return;
        }

        _allAdminPegawai = rows.map(u => ({
          id: u.id || u.ID || u.telegram_id || '',
          nama: u.nama || u.Nama || u.username || '',
          nip: u.nip || u.NIP || ''
        })).sort((a, b) => a.nama.localeCompare(b.nama));

        renderAdminKetPegawaiList(_allAdminPegawai);

        // Set default tanggal hari ini
        const tglMulaiEl = $('adminKetTglMulai');
        const tglSelesaiEl = $('adminKetTglSelesai');
        const rangeEl = $('adminKetDateRange');
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: (typeof TZ !== 'undefined' ? TZ : undefined) });
        
        if (tglMulaiEl) tglMulaiEl.value = today;
        if (tglSelesaiEl) tglSelesaiEl.value = today;
        
        if (rangeEl && rangeEl._flatpickr) {
          rangeEl._flatpickr.setDate([today, today]);
        }

      } catch (e) {
        el.innerHTML = '<div style="padding:15px; text-align:center; font-size:11px; color:var(--danger)"><i class="fas fa-times"></i> Gagal memuat data</div>';
      }
    }

    function renderAdminKetPegawaiList(list) {
      const el = $('adminKetOptionsList');
      if (!el) return;

      if (list.length === 0) {
        el.innerHTML = '<div style="padding:15px; text-align:center; font-size:11px; color:var(--muted)"><i class="fas fa-search"></i> Tidak ada hasil yang cocok</div>';
        return;
      }

      el.innerHTML = list.map(u => {
        const isSelected = _adminKetSelected.some(s => String(s.id) === String(u.id));
        return `
        <div class="dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectAdminKetPegawai('${u.id}', '${u.nama.replace(/'/g, "\\'")}', '${u.nip}')">
          <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
            <div>
              <span class="item-name">${u.nama}</span>
              <span class="item-nip"><i class="fas fa-id-card"></i> ${u.nip || '—'}</span>
            </div>
            ${isSelected ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' : ''}
          </div>
        </div>
      `;
      }).join('');
    }

    function toggleAdminKetDropdown(forceClose = false) {
      const container = $('adminKetPegawaiContainer');
      if (!container) return;
      
      if (forceClose) {
        container.classList.remove('open');
      } else {
        container.classList.toggle('open');
        if (container.classList.contains('open')) {
          $('adminKetSearchInput').focus();
        }
      }
    }

    function filterAdminKetPegawai(query) {
      const q = query.toLowerCase().trim();
      const filtered = _allAdminPegawai.filter(u => 
        u.nama.toLowerCase().includes(q) || u.nip.toLowerCase().includes(q)
      );
      renderAdminKetPegawaiList(filtered);
      
      // Pastikan dropdown terbuka saat mengetik
      const container = $('adminKetPegawaiContainer');
      if (container && !container.classList.contains('open')) container.classList.add('open');
    }

    function selectAdminKetPegawai(id, nama, nip) {
      const idx = _adminKetSelected.findIndex(s => String(s.id) === String(id));
      if (idx > -1) {
        _adminKetSelected.splice(idx, 1);
      } else {
        _adminKetSelected.push({ id, nama, nip });
      }

      renderAdminKetPills();
      renderAdminKetPegawaiList(_allAdminPegawai);
      syncAdminKetHiddenSelect();

      // Multi-select: dropdown tetap terbuka, kosongkan pencarian
      const searchInput = $('adminKetSearchInput');
      if (searchInput) searchInput.value = '';
      const container = $('adminKetPegawaiContainer');
      if (container && !container.classList.contains('open')) container.classList.add('open');
      if (searchInput) searchInput.focus();

      // Visual feedback
      const trigger = document.querySelector('#adminKetPegawaiContainer .dropdown-trigger');
      if (trigger) {
        trigger.style.borderColor = 'var(--success)';
        setTimeout(() => trigger.style.borderColor = '', 2000);
      }
    }

    // Sinkronkan hidden select dengan selection (kompatibilitas lama)
    function syncAdminKetHiddenSelect() {
      const hiddenSelect = $('adminKetPegawai');
      if (!hiddenSelect) return;
      hiddenSelect.innerHTML = _adminKetSelected.map(u =>
        `<option value="${u.id}" data-nama="${u.nama}" data-nip="${u.nip}" selected>${u.nama}</option>`
      ).join('');
    }

    function renderAdminKetPills() {
      const el = $('adminKetSelectedPills');
      if (!el) return;
      if (_adminKetSelected.length === 0) { el.innerHTML = ''; return; }
      el.innerHTML = _adminKetSelected.map(u => `
        <div class="pegawai-pill">
          <span>${u.nama.split(' ')[0]}</span>
          <i class="fas fa-times-circle" onclick="event.stopPropagation(); selectAdminKetPegawai('${u.id}', '${u.nama.replace(/'/g, "\\'")}', '${u.nip || ''}')"></i>
        </div>
      `).join('');
    }

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      const container = $('adminKetPegawaiContainer');
      if (container && !container.contains(e.target)) {
        toggleAdminKetDropdown(true);
      }
    });

    let _adminKetFileBase64 = null, _adminKetFileMime = null, _adminKetFileName = null;

    /**
     * Handle upload file bukti untuk keterangan admin.
     */
    async function handleAdminKetFile(el) {
      const f = el.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { alert('File terlalu besar (maks 5MB)'); el.value = ''; return; }
      
      const label = $('adminKetFileName');
      if (label) label.innerHTML = '<i class="fas fa-hourglass-half"></i> Memproses...';

      const reader = new FileReader();
      reader.onload = async (e) => {
        let b64 = e.target.result.split(',')[1];
        const mime = f.type;
        
        // Kompres jika gambar
        if (mime.startsWith('image/')) {
           try {
             const compressed = await compressImage(e.target.result, 1024, 0.7);
             b64 = compressed.split(',')[1];
           } catch(err) { console.warn('Gagal kompresi admin bukti', err); }
        }

        _adminKetFileBase64 = b64;
        _adminKetFileMime = mime;
        _adminKetFileName = f.name;

        // UI Feedback
        if (label) label.textContent = f.name;
        dom.show('adminKetPreviewWrap');
        if (mime.startsWith('image/')) {
          dom.show('adminKetPreviewImg');
          dom.hide('adminKetPreviewDoc');
          $('adminKetPreviewImg').src = 'data:' + mime + ';base64,' + b64;
        } else {
          dom.hide('adminKetPreviewImg');
          dom.show('adminKetPreviewDoc');
          setT('adminKetDocName', f.name);
        }
      };
      reader.readAsDataURL(f);
    }

    function clearAdminKetFile() {
      _adminKetFileBase64 = null; _adminKetFileMime = null; _adminKetFileName = null;
      if ($('adminKetFileInput')) $('adminKetFileInput').value = '';
      setT('adminKetFileName', 'Pilih File...');
      dom.hide('adminKetPreviewWrap');
    }

    /**
     * Simpan keterangan pegawai (Izin, Sakit, Tugas) oleh Admin.
     * Mendukung multi-pegawai: di-loop klien, bukti di-upload sekali lalu
     * drive_link-nya dipakai ulang untuk pegawai berikutnya.
     */
    async function adminSimpanKeterangan() {
      const jns = $('adminKetJenis'), msg = $('adminKetPesan');
      const tgl1 = $('adminKetTglMulai'), tgl2 = $('adminKetTglSelesai');
      const btn = $('btnAdminSimpanKet');
      const resEl = $('adminKetResult');

      if (!_adminKetSelected.length || !jns || !msg || !tgl1.value) {
        showResult('adminKetResult', 'adminKetRIcon', 'adminKetRTitle', 'adminKetRMsg', 'warning', '<i class="fas fa-exclamation-triangle"></i>', 'Data Belum Lengkap', 'Pilih pegawai (boleh lebih dari 1), jenis, tgl mulai, dan alasan.');
        if (resEl) { resEl.style.display = 'block'; resEl.className = 'premium-toast r-warning'; }
        return;
      }

      // Validation for proof requirement (matching server-side logic) — cukup 1x
      const start = new Date(tgl1.value);
      const end = new Date(tgl2.value || tgl1.value);
      const durasi = Math.round((end - start) / (864e5)) + 1;
      const adaBukti = !!_adminKetFileBase64;

      if (jns.value === 'TUGAS' && !adaBukti) {
        showResult('adminKetResult', 'adminKetRIcon', 'adminKetRTitle', 'adminKetRMsg', 'warning', '<i class="fas fa-paperclip"></i>', 'Bukti Wajib', 'Surat Tugas / Dinas Luar wajib menyertakan lampiran bukti.');
        if (resEl) { resEl.style.display = 'block'; resEl.className = 'premium-toast r-warning'; }
        return;
      }
      if (jns.value === 'SAKIT' && durasi > 1 && !adaBukti) {
        showResult('adminKetResult', 'adminKetRIcon', 'adminKetRTitle', 'adminKetRMsg', 'warning', '<i class="fas fa-paperclip"></i>', 'Bukti Wajib', `Izin Sakit > 1 hari (${durasi} hari) wajib menyertakan lampiran bukti.`);
        if (resEl) { resEl.style.display = 'block'; resEl.className = 'premium-toast r-warning'; }
        return;
      }

      const targets = _adminKetSelected.slice();
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> MENYIMPAN DATA...'; }
      if (resEl) resEl.style.display = 'none';

      const results = [];
      let driveLink = ''; // Upload bukti terjadi di request pertama; sisanya pakai link ini
      const ts = Date.now();

      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        const payload = {
          user_id: p.id,
          nip: p.nip,
          request_id: `admin_ket_${p.nip || p.id}_${ts}_${i}`,
          user: { id: p.id, nama: p.nama, nip: p.nip },
          jenis: jns.value,
          keterangan: msg.value,
          tgl_mulai: tgl1.value,
          tgl_selesai: tgl2.value || tgl1.value,
          admin_id: MY_ID,
          admin_nama: userProfile?.nama || userProfile?.username || 'Admin',
          source: 'admin_panel',
          timestamp: Math.floor(Date.now() / 1000)
        };
        if (driveLink) {
          payload.drive_link = driveLink; // Reuse bukti yang sudah ter-upload
        } else if (_adminKetFileBase64) {
          payload.bukti_base64 = _adminKetFileBase64;
          payload.bukti_mime = _adminKetFileMime;
          payload.bukti_nama = _adminKetFileName;
        }

        try {
          const { ok, data } = await apiPost(P.keteranganAdd, payload);
          if (ok && data?.ok !== false) {
            if (!driveLink && data?.data?.drive_link) driveLink = data.data.drive_link;
            results.push({ id: p.id, nama: p.nama, ok: true });
          } else {
            results.push({ id: p.id, nama: p.nama, ok: false, message: data?.message || 'Permintaan ditolak oleh server.' });
          }
        } catch (e) {
          results.push({ id: p.id, nama: p.nama, ok: false, message: 'Koneksi bermasalah.' });
        }
      }

      const sukses = results.filter(r => r.ok);
      const gagal = results.filter(r => !r.ok);

      if (gagal.length === 0) {
        const namaStr = targets.length === 1 ? targets[0].nama : `${targets.length} pegawai`;
        showResult('adminKetResult', 'adminKetRIcon', 'adminKetRTitle', 'adminKetRMsg', 'success', '<i class="fas fa-check"></i>', 'Berhasil Disimpan', `Keterangan ${jns.value} untuk ${namaStr} telah masuk ke sistem.`);
        if (resEl) { resEl.style.display = 'block'; resEl.className = 'premium-toast r-success'; }

        // Reset Form dengan Delay agar user sempat lihat status sukses
        setTimeout(() => {
          msg.value = '';
          clearAdminKetFile();
          _adminKetSelected = [];
          renderAdminKetPills();
          syncAdminKetHiddenSelect();
          renderAdminKetPegawaiList(_allAdminPegawai);
          const si = $('adminKetSearchInput'); if (si) si.value = '';
          if (resEl) resEl.style.display = 'none';
        }, 3500);
      } else if (sukses.length === 0) {
        showResult('adminKetResult', 'adminKetRIcon', 'adminKetRTitle', 'adminKetRMsg', 'fail', '<i class="fas fa-times"></i>', 'Gagal Simpan', gagal[0].message);
        if (resEl) { resEl.style.display = 'block'; resEl.className = 'premium-toast r-fail'; }
      } else {
        // Hasil parsial: sukses di-reset, yang gagal tetap terpilih agar bisa diulang
        const gagalIds = new Set(gagal.map(g => String(g.id)));
        _adminKetSelected = _adminKetSelected.filter(p => gagalIds.has(String(p.id)));
        renderAdminKetPills();
        syncAdminKetHiddenSelect();
        renderAdminKetPegawaiList(_allAdminPegawai);
        const siP = $('adminKetSearchInput'); if (siP) siP.value = '';
        showResult('adminKetResult', 'adminKetRIcon', 'adminKetRTitle', 'adminKetRMsg', 'warning', '<i class="fas fa-exclamation-triangle"></i>', 'Tersimpan Sebagian', `${sukses.length} berhasil, ${gagal.length} gagal (${gagal.map(g => g.nama).join(', ')}): ${gagal[0].message}`);
        if (resEl) { resEl.style.display = 'block'; resEl.className = 'premium-toast r-warning'; }
      }

      if (typeof loadKonfirmasiAdmin === 'function') loadKonfirmasiAdmin();
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save" style="margin-right:8px"></i> SIMPAN KETERANGAN'; }
    }

    function initSuperadminAdminKetScoping() {
      const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
      const sec = $('adminKetInstansiSection');
      if (!sec) return;

      if (isSA) {
        sec.style.display = 'block';
        const el = $('adminKetInstansiSelect');
        if (el) {
          if (el.options.length <= 1) { // Not populated yet
            try {
              const cached = localStorage.getItem('absen_instansi_map');
              if (cached) {
                const map = JSON.parse(cached);
                const keys = Object.keys(map);
                el.innerHTML = '<option value="">— Pilih Instansi —</option>' +
                  keys.map(k => {
                    const inst = map[k];
                    const id = inst.id || inst.ID || k;
                    const name = inst.nama_instansi || inst.header || inst.nama || id.toUpperCase();
                    return `<option value="${id}">${name}</option>`;
                  }).join('');
              }
            } catch (e) {
              console.error('[AdminKet Superadmin] populate error:', e);
            }
          }
          // Pre-select current instansi ALWAYS
          const scoped = getScopedInstansiId();
          if (scoped) {
            el.value = scoped;
          }
        }
      } else {
        sec.style.display = 'none';
      }
    }

    function onAdminKetInstansiChange() {
      const el = $('adminKetInstansiSelect');
      if (!el) return;
      let val = el.value;
      if (!val) {
        try {
          const u = JSON.parse(localStorage.getItem('tg_user_obj_v5') || '{}');
          val = u.instansi_id || u.Instansi_Id || 'bapperida';
        } catch (e) {
          val = 'bapperida';
        }
      }
      localStorage.setItem('MY_INSTANSI', val);
      document.documentElement.style.setProperty('--agency-name', `'${val.toUpperCase()}'`);
      if (typeof applyInstansiBranding === 'function') applyInstansiBranding(val);
      if (window.userProfile) {
        window.userProfile.instansi_id = val;
      }
      
      // Invalidate userListOrder cache so it fetches new employees
      if (window.userListOrder) {
        window.userListOrder = [];
      }
      
      // Clear SIMAPO Cache
      if (window._simapoCache && typeof window._simapoCache.clear === 'function') {
        window._simapoCache.clear();
      }

      // Reload dynamic Bidang list for this instansi
      if (typeof loadBidangList === 'function') {
        loadBidangList(val);
      }
      
      // Sync other superadmin dropdowns to match
      const adminSelect = $('adminInstansiSelect');
      if (adminSelect) adminSelect.value = val;
      const rekapSelect = $('rekapInstansiSelect');
      if (rekapSelect) rekapSelect.value = val;
      const tugasSelect = $('tugasInstansiSelect');
      if (tugasSelect) tugasSelect.value = val;
      const lemburSelect = $('lemburInstansiSelect');
      if (lemburSelect) lemburSelect.value = val;
      const pegawaiSelect = $('pegawaiInstansiSelect');
      if (pegawaiSelect) pegawaiSelect.value = val;
      
      // Trigger reloading of all active sections/lists
      adminLoadKetPegawai();
      if (typeof loadKonfirmasiAdmin === 'function') loadKonfirmasiAdmin();
      
      if (typeof loadAdminMgmt === 'function') loadAdminMgmt();
      if (typeof loadPegawaiMgmt === 'function') loadPegawaiMgmt();
      if (typeof loadLiburAdmin === 'function') loadLiburAdmin();
      if (typeof loadLokasiAdmin === 'function') loadLokasiAdmin();
      if (typeof loadFaceStatusAdmin === 'function') loadFaceStatusAdmin();

      // Trigger reloading of SIMAPO components if active
      if (typeof loadAdminSimapoPinjam === 'function') loadAdminSimapoPinjam();
      if (typeof loadAdminSimapoTiket === 'function') loadAdminSimapoTiket();
      if (typeof loadAdminSimapoMaster === 'function') loadAdminSimapoMaster();
    }

    window.initSuperadminAdminKetScoping = initSuperadminAdminKetScoping;
    window.onAdminKetInstansiChange = onAdminKetInstansiChange;

    // Initialize Flatpickr for Admin Keterangan inputs
    document.addEventListener('DOMContentLoaded', () => {
      if (window.flatpickr) {
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: (typeof TZ !== 'undefined' ? TZ : undefined) });
        flatpickr('#adminKetDateRange', {
          mode: 'range',
          dateFormat: 'Y-m-d',
          defaultDate: [today, today],
          locale: { rangeSeparator: ' s/d ' },
          disableMobile: true,
          onChange: function(dates) {
            if (dates.length >= 1) {
              const dari = flatpickr.formatDate(dates[0], 'Y-m-d');
              const sampai = flatpickr.formatDate(dates[dates.length - 1], 'Y-m-d');
              if ($('adminKetTglMulai')) $('adminKetTglMulai').value = dari;
              if ($('adminKetTglSelesai')) $('adminKetTglSelesai').value = sampai;
            }
          }
        });
      }
      makeSearchDd('adminKetJenis', { ph: 'Pilih jenis', h: 45 });
    });

/* ════ DESKTOP SIDEBAR: RESIZABLE & ICON-ONLY COLLAPSE LOGIC ════ */
(function() {
  const MIN_WIDTH = 68;
  const SNAP_COLLAPSE_THRESHOLD = 115;
  const DEFAULT_WIDTH = 260;
  const MAX_WIDTH = 380;
  const STORAGE_KEY_WIDTH = 'hadir_sidebar_w';
  const STORAGE_KEY_COLLAPSED = 'hadir_sidebar_collapsed';

  function applySidebarState(width, isCollapsed) {
    const tabsBar = document.getElementById('tabsBar');
    if (!tabsBar) return;

    if (isCollapsed || width <= SNAP_COLLAPSE_THRESHOLD) {
      document.body.classList.add('sidebar-collapsed');
      tabsBar.classList.add('collapsed');
      document.documentElement.style.setProperty('--sidebar-w', `${MIN_WIDTH}px`);
    } else {
      document.body.classList.remove('sidebar-collapsed');
      tabsBar.classList.remove('collapsed');
      const safeWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width || DEFAULT_WIDTH));
      document.documentElement.style.setProperty('--sidebar-w', `${safeWidth}px`);
    }
  }

  function toggleSidebarCollapse() {
    const tabsBar = document.getElementById('tabsBar');
    if (!tabsBar) return;

    const isCurrentlyCollapsed = document.body.classList.contains('sidebar-collapsed') || tabsBar.classList.contains('collapsed');
    const targetCollapsed = !isCurrentlyCollapsed;

    let targetWidth = DEFAULT_WIDTH;
    if (targetCollapsed) {
      targetWidth = MIN_WIDTH;
    } else {
      try {
        const savedW = parseInt(localStorage.getItem(STORAGE_KEY_WIDTH), 10);
        if (!isNaN(savedW) && savedW > SNAP_COLLAPSE_THRESHOLD) {
          targetWidth = savedW;
        }
      } catch (_) {}
    }

    applySidebarState(targetWidth, targetCollapsed);

    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, targetCollapsed ? '1' : '0');
      if (!targetCollapsed) {
        localStorage.setItem(STORAGE_KEY_WIDTH, String(targetWidth));
      }
    } catch (_) {}
  }

  function initSidebarResize() {
    const resizer = document.getElementById('sidebarResizer');
    const tabsBar = document.getElementById('tabsBar');
    if (!tabsBar) return;

    // 1. Restore saved state from localStorage
    let savedCollapsed = false;
    let savedWidth = DEFAULT_WIDTH;
    try {
      savedCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1';
      const w = parseInt(localStorage.getItem(STORAGE_KEY_WIDTH), 10);
      if (!isNaN(w) && w >= MIN_WIDTH && w <= MAX_WIDTH) {
        savedWidth = w;
      }
    } catch (_) {}

    applySidebarState(savedWidth, savedCollapsed);

    if (!resizer) return;

    // 2. Drag to resize
    let isDragging = false;
    let startX = 0;
    let startWidth = DEFAULT_WIDTH;

    resizer.addEventListener('mousedown', (e) => {
      if (window.innerWidth < 768) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = tabsBar.getBoundingClientRect().width;
      document.body.classList.add('sidebar-resizing');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      let newWidth = startWidth + dx;

      if (newWidth < SNAP_COLLAPSE_THRESHOLD) {
        applySidebarState(MIN_WIDTH, true);
      } else {
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        applySidebarState(newWidth, false);
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('sidebar-resizing');

      const currentWidth = tabsBar.getBoundingClientRect().width;
      const isCollapsed = currentWidth <= SNAP_COLLAPSE_THRESHOLD;

      try {
        localStorage.setItem(STORAGE_KEY_COLLAPSED, isCollapsed ? '1' : '0');
        if (!isCollapsed) {
          localStorage.setItem(STORAGE_KEY_WIDTH, String(Math.round(currentWidth)));
        }
      } catch (_) {}
    });

    // 3. Double-click on resizer to quickly toggle collapse
    resizer.addEventListener('dblclick', () => {
      toggleSidebarCollapse();
    });
  }

  window.toggleSidebarCollapse = toggleSidebarCollapse;
  window.initSidebarResize = initSidebarResize;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarResize);
  } else {
    initSidebarResize();
  }
})();
