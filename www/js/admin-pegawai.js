    /* ════ ADMIN PEGAWAI ════ */
    /**
     * Muat daftar pegawai untuk panel manajemen admin.
     * @returns {Promise<void>}
     */
        async function loadPegawaiMgmt() {
      const el = $('pegawaiMgmtList');
      if (!el) return;
      el.innerHTML = '<div class="shimmer" style="height:200px; border-radius:12px"></div>';
      
      try {
        const res = await apiGet(P.userList + '?format=full');
        if (!res.ok) throw new Error('Gagal memuat data');
        const users = (res.rows || []).filter(u => u && (u.id || u.ID));
        window._pegawaiCache = users;

        if (!users.length) {
          el.innerHTML = `<div class="empty-state" style="padding:40px"><div class="empty-icon" style="font-size:40px"><i class="fas fa-users"></i></div><div class="empty-text">Belum ada data pegawai</div></div>`;
          return;
        }

        // Hierarchical Sort
        users.sort((a, b) => {
          const jabA = getJabatanScore(a.jabatan || a.Jabatan);
          const jabB = getJabatanScore(b.jabatan || b.Jabatan);
          if (jabA !== jabB) return jabB - jabA;
          const rankA = getPangkatScore(a.pangkat || a.Pangkat);
          const rankB = getPangkatScore(b.pangkat || b.Pangkat);
          if (rankA !== rankB) return rankB - rankA;
          return String(a.nama || a.Nama || '').localeCompare(String(b.nama || b.Nama || ''), 'id');
        });

        let html = `
          <div class="admin-table-wrapper" style="overflow-x:auto; background:rgba(0,0,0,0.2); border-radius:12px; border:1px solid var(--border)">
            <table class="admin-table" style="width:100%; border-collapse:collapse; font-size:11px; color:var(--white)">
              <thead style="background:rgba(255,255,255,0.03); border-bottom:1px solid var(--border)">
                <tr>
                  <th style="padding:12px; text-align:left; color:var(--gold); width:40px">No</th>
                  <th style="padding:12px; text-align:left; color:var(--gold)">Nama / NIP</th>
                  <th style="padding:12px; text-align:left; color:var(--gold)">Jabatan / Unit</th>
                  <th style="padding:12px; text-align:left; color:var(--gold)">Pangkat</th>
                  <th style="padding:12px; text-align:left; color:var(--gold)">Kontak / HP</th>
                  <th style="padding:12px; text-align:center; color:var(--gold)">Status</th>
                  <th style="padding:12px; text-align:center; color:var(--gold)">Aksi</th>
                </tr>
              </thead>
              <tbody>
        `;

        users.forEach((u, idx) => {
          const uid = String(u.id || u.ID || '');
          const nama = u.nama || u.Nama || '—';
          const nip = u.nip || u.NIP || '—';
          const jab = u.jabatan || u.Jabatan || '—';
          const bid = u.bidang || u.Bidang || '—';
          const pnk = u.pangkat || u.Pangkat || '—';
          const hp = u.nomorhp || u.no_hp || '—';
          const status = (u.status || u.Status || 'AKTIF').toUpperCase();
          const isAktif = status === 'AKTIF';

          html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03); transition:background 0.2s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              <td style="padding:12px; text-align:center; color:var(--muted)">${idx + 1}</td>
              <td style="padding:12px">
                <div style="font-weight:700">${nama}</div>
                <div style="font-size:9px; color:var(--muted)">NIP. ${nip}</div>
              </td>
              <td style="padding:12px">
                <div>${jab}</div>
                <div style="font-size:9px; color:var(--gold); opacity:0.7">${bid}</div>
              </td>
              <td style="padding:12px; color:var(--muted)">${pnk}</td>
              <td style="padding:12px">
                <div style="font-size:9px; color:var(--muted)">ID: ${uid}</div>
                <div style="color:var(--gold)"><i class="fas fa-mobile-alt"></i> ${hp}</div>
              </td>
              <td style="padding:12px; text-align:center">
                <span style="padding:3px 8px; border-radius:20px; font-size:8px; font-weight:800; background:${isAktif ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; color:${isAktif ? '#4ade80' : '#f87171'}; border:1px solid ${isAktif ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}">
                  ${status}
                </span>
              </td>
              <td style="padding:12px; text-align:center">
                <div style="display:flex; gap:6px; justify-content:center">
                  <button onclick="bukaModalSSO('${escapeHtml(uid)}')" class="btn-sm-admin" title="Wewenang SSO & Akun" style="background:rgba(245,158,11,0.12); color:#fbbf24; border-color:rgba(245,158,11,0.25)"><i class="fas fa-user-shield"></i> SSO</button>
                  <button onclick="editPegawai('${escapeHtml(nip)}', event)" class="btn-sm-admin" style="background:rgba(96,165,250,0.1); color:#60a5fa; border-color:rgba(96,165,250,0.2)"><i class="fas fa-pen"></i> Edit</button>
                  <button onclick="deletePegawai('${escapeHtml(uid)}', '${escapeHtml(nama)}', '${escapeHtml(nip)}')" class="btn-sm-admin" style="background:rgba(239,68,68,0.1); color:#f87171; border-color:rgba(239,68,68,0.2)"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
        });

        html += `</tbody></table></div>`;
        el.innerHTML = html;
        
      } catch (e) {
        el.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fas fa-plug"></i> Gagal: ${escapeHtml(e.message)}</div>`;
      }
    }

    function showAddPegawai() {
      const f = $('pegawaiForm');
      if (!f) return;
      dom.setHTML('pegawaiFormTitle', '<i class="fas fa-plus"></i> TAMBAH PEGAWAI BARU');
      $('editPegawaiId').value = '';
      $('inPegawaiId').value = '';
      dom.setDisabled('inPegawaiId', false);
      $('inPegawaiNama').value = '';
      $('inPegawaiNip').value = '';
      $('inPegawaiNoHp').value = '';
      $('inPegawaiJabatan').value = '';
      $('inPegawaiRole').value = 'USER';
      $('inPegawaiStatus').value = 'AKTIF';
      $('inPegawaiJamMasuk').value = '';
      $('inPegawaiJamPulang').value = '';
      $('previewWajahAdmin').innerHTML = '<span><i class="fas fa-user"></i></span>';
      $('previewTTDAdmin').innerHTML = '<span><i class="fas fa-pen-fancy"></i></span>';
      dom.hide('pegawaiFormResult');
      f.style.display = 'block';
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => $('inPegawaiNama').focus(), 500);
    }

    function hidePegawaiForm() {
      const f = $('pegawaiForm');
      if (f) f.style.display = 'none';
      dom.hide('pegawaiFormResult');
    }

    async function editPegawai(nipOrId, ev) {
      const f = $('pegawaiForm');
      if (!f) return;
      if (!requireAdmin()) return;
      
      const btn = ev ? (ev.currentTarget || ev.target) : null;
      let originalInner = '';
      if (btn && btn.tagName === 'BUTTON') {
        originalInner = btn.innerHTML;
        btn.innerHTML = '<span class="spin-sm"></span>';
        btn.disabled = true;
      }

      try {
        let p = null;
        // 1. Coba fetch dari server menggunakan NIP
        try {
          const ur = await apiGet(P.userList + '?nip=' + nipOrId);
          if (ur.ok) {
             const res = (ur.rows?.length ?? 0) ? ur.rows : parseApiResponse(ur.data);
             p = Array.isArray(res) ? res[0] : (res.single ? res : (res.data ? res.data[0] : null));
          }
        } catch(e) { console.warn('Fetch server failed, using local cache'); }

        if (!p) {
          p = (window._pegawaiCache || []).find(x => String(x.nip || x.NIP) === String(nipOrId) || String(x.id || x.ID) === String(nipOrId));
        }
        
        if (!p) throw new Error('Data pegawai tidak ditemukan');

        const uid = String(p.id || p.ID || '');

        dom.setHTML('pegawaiFormTitle', '<i class="fas fa-pen"></i> EDIT DATA PEGAWAI TERPADU');
        $('editPegawaiId').value = uid;
        $('inPegawaiId').value = uid;
        dom.setDisabled('inPegawaiId', true); 
        $('inPegawaiNama').value = p.nama || p.Nama || '';
        $('inPegawaiNip').value = p.nip || p.NIP || '';
        $('inPegawaiNoHp').value = p.nomorhp || p.no_hp || '';
        $('inPegawaiJabatan').value = p.jabatan || p.Jabatan || '';
        $('inPegawaiBidang').value = p.bidang || p.Bidang || 'Sekretariat';
        
        // Preview Wajah
        const faceSrc = p.face_photo || p.Face_Photo || p.foto_base64 || '';
        const previewEl = $('previewWajahAdmin');
        if (previewEl) {
          const faceUrl = typeof driveImgUrl === 'function' ? driveImgUrl(faceSrc, 200) : faceSrc;
          if (faceUrl) {
            previewEl.innerHTML = `<img src="${escapeHtml(faceUrl)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; background:var(--bg-card)">`;
          } else {
            previewEl.innerHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border-radius:50%; font-size:24px; opacity:0.5"><i class="fas fa-user"></i></div>';
          }
        }

        // Preview TTD
        $('previewTTDAdmin').innerHTML = '<span class="spin-sm"></span>';
        try {
           // Gunakan format full atau endpoint signature-get
           const sRes = await apiGet(P.signatureGet, { nip: p.nip || p.NIP });
           const sigData = (sRes.data?.signature || sRes.rows?.[0]?.signature || '');
           const sigUrl = typeof driveImgUrl === 'function' ? driveImgUrl(sigData, 400) : sigData;
            if (sigUrl) {
               $('previewTTDAdmin').innerHTML = `<img src="${escapeHtml(sigUrl)}" style="width:100%; height:100%; object-fit:contain; background:#fff">`;
           } else {
              $('previewTTDAdmin').innerHTML = '<span style="font-size:24px; opacity:0.5"><i class="fas fa-pen-fancy"></i></span>';
           }
        } catch(e) { 
           $('previewTTDAdmin').innerHTML = '<span style="font-size:24px; opacity:0.5"><i class="fas fa-pen-fancy"></i></span>'; 
        }

        // Tipe & Pangkat
        const pkt = (p.pangkat || '').toUpperCase();
        if (pkt.includes('GOLONGAN')) $('inPegawaiTipe').value = 'PPPK';
        else if (pkt.includes('/') || pkt.includes('JURU') || pkt.includes('PENGATUR') || pkt.includes('PENATA') || pkt.includes('PEMBINA')) $('inPegawaiTipe').value = 'PNS';
        else $('inPegawaiTipe').value = 'NONASN';
        
        _updatePangkatDropdown('inPegawaiPangkat', $('inPegawaiTipe').value);
        $('inPegawaiPangkat').value = p.pangkat || '';
        $('inPegawaiRole').value = (p.role || p.Role || 'USER').toUpperCase();
        $('inPegawaiStatus').value = (p.status || p.Status || 'AKTIF').toUpperCase();
        $('inPegawaiJamMasuk').value = p.jam_masuk || '';
        $('inPegawaiJamPulang').value = p.jam_pulang || '';

        f.style.display = 'block';
        f.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $('inPegawaiNama').focus(), 600);
        
      } catch (e) { 
        alert(' Gagal: ' + e.message);
      } finally {
        if (btn && btn.tagName === 'BUTTON') {
          btn.innerHTML = originalInner;
          btn.disabled = false;
        }
      }
    }

    async function savePegawai() {
      const editId = $('editPegawaiId').value;
      const isEdit = !!editId;
      let id = $('inPegawaiId').value.trim();
      const nama = $('inPegawaiNama').value.trim();
      const nip = $('inPegawaiNip').value.trim().replace(/\s/g, '');
      const nohp = $('inPegawaiNoHp').value.trim();
      const jabatan = $('inPegawaiJabatan').value.trim();
      const pangkat = $('inPegawaiPangkat').value;
      const bidang = $('inPegawaiBidang').value;
      const tipe = $('inPegawaiTipe').value;
      const role = $('inPegawaiRole').value;
      const status = $('inPegawaiStatus').value;
      const jamMasuk = $('inPegawaiJamMasuk').value || null;
      const jamPulang = $('inPegawaiJamPulang').value || null;

      if (!isEdit && !id) {
        id = String(Math.floor(1000000000 + Math.random() * 9000000000));
      }

      if (!id || !nama) {
        showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'warning', '<i class="fas fa-exclamation-triangle"></i>', 'Data Kurang', 'Nama wajib diisi.');
        dom.show('pegawaiFormResult');
        return;
      }

      dom.setHTML('btnSavePegawaiTxt', '<i class="fas fa-save"></i> Menyimpan...');
      try {
        const path = isEdit ? P.userEdit : P.userAdd;
        const mainPayload = { 
          id, 
          nama, 
          nip, 
          nomorhp: nohp, 
          jabatan, 
          pangkat, 
          bidang, 
          tipe, 
          role, 
          status, 
          jam_masuk: jamMasuk,
          jam_pulang: jamPulang,
          instansi_id: getScopedInstansiId() 
        };

        const { ok: saveOk, data: d } = await apiPost(path, mainPayload);

        if (!saveOk || (d && d.ok === false)) {
          showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'fail', '<i class="fas fa-times"></i>', 'Gagal', (d && d.message) || 'Gagal menyimpan.');
          dom.show('pegawaiFormResult');
        } else {
          // Sync Admin Role
          const cleanRole = role.toLowerCase();
          if (cleanRole === 'admin' || cleanRole === 'superadmin') {
            try { await apiPost(P.adminAdd, { telegram_id: Number(id), nip, nama, role: cleanRole, ditambahkan_oleh: Number(MY_ID) }); } catch (err) {}
          }

          showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'success', '<i class="fas fa-check"></i>', 'Berhasil', 'Data pegawai telah disimpan.');
          dom.show('pegawaiFormResult');
          setTimeout(() => { hidePegawaiForm(); loadPegawaiMgmt(); }, 1500);
        }
      } catch (e) {
        showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'fail', '<i class="fas fa-plug"></i>', 'Error', e.message);
        dom.show('pegawaiFormResult');
      }
      dom.setHTML('btnSavePegawaiTxt', isEdit ? '<i class="fas fa-save"></i> SIMPAN PERUBAHAN' : '<i class="fas fa-save"></i> SIMPAN DATA');
    }

    /* ════ UNIFIED BIOMETRIC HANDLERS ════ */
    function openFaceCaptureAdmin() {
      const uid = $('editPegawaiId').value;
      const nama = $('inPegawaiNama').value;
      if (!uid) return alert('Pilih pegawai dulu');
      // Trigger pendaftaran wajah spesifik
      if (typeof adminCaptureFaceFor === 'function') {
        adminCaptureFaceFor(uid, nama, (newFace) => {
          if (newFace) {
             $('previewWajahAdmin').innerHTML = `<img src="${newFace}" style="width:100%; height:100%; object-fit:cover; border-radius:50%">`;
          }
        });
      } else {
        alert('Modul kamera belum siap');
      }
    }

    function openSignatureAdmin() {
      const uid = $('editPegawaiId').value;
      const nip = $('inPegawaiNip').value.replace(/\s/g, '');
      const nama = $('inPegawaiNama').value;
      if (!uid) return alert('Pilih pegawai dulu');
      if (!nip) return alert('Pegawai ini belum memiliki NIP. Harap isi NIP terlebih dahulu.');
      // Gunakan fungsi signature yang sudah ada
      if (typeof openSignaturePad === 'function') {
        openSignaturePad(nip, (newSig) => {
          if (newSig) {
            $('previewTTDAdmin').innerHTML = `<img src="${newSig}" style="width:100%; height:100%; object-fit:contain; background:#fff">`;
          }
        });
      } else {
        alert('Modul TTD belum siap');
      }
    }

    /**
     * Hapus data pegawai dari sistem.
     * @param {string|number} uid - Telegram ID pegawai
     * @param {string} nama - Nama pegawai (untuk konfirmasi)
     * @returns {Promise<void>}
     */
        async function deletePegawai(uid, nama, nip) {
      if (!requireAdmin()) return;
      if (!confirm(`Hapus pegawai "${nama}" (NIP: ${nip || uid})?\nData wajah dan ttd mungkin juga tidak akan bisa digunakan lagi.`)) return;
      try {
        const res = await apiPost(P.userDel, { id: uid, nip: nip || '' });
        const d = res?.data ?? {};
        if (d.ok !== false) {
          loadPegawaiMgmt();
        } else {
          alert('Gagal: ' + (d.message || 'Error server'));
        }
      } catch (e) { alert('Server error'); }
    }

    function initSuperadminPegawaiScoping() {
      const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
      const sec = $('pegawaiInstansiSection');
      if (!sec) return;

      if (isSA) {
        sec.style.display = 'block';
        const el = $('pegawaiInstansiSelect');
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
              console.error('[Pegawai Superadmin] populate error:', e);
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

    function onPegawaiInstansiChange() {
      const el = $('pegawaiInstansiSelect');
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
      const adminKetSelect = $('adminKetInstansiSelect');
      if (adminKetSelect) adminKetSelect.value = val;
      
      // Trigger reloading of all active sections/lists
      loadPegawaiMgmt();
      if (typeof adminLoadKetPegawai === 'function') {
        adminLoadKetPegawai(); // Clear logs / reload employee search logs
      }
      
      // Trigger reloading of SIMAPO components if active
      if (typeof loadAdminSimapoPinjam === 'function') loadAdminSimapoPinjam();
      if (typeof loadAdminSimapoTiket === 'function') loadAdminSimapoTiket();
      if (typeof loadAdminSimapoMaster === 'function') loadAdminSimapoMaster();
    }

    // ════════════════════════════════════════════════════════════════════════
    // MANAJEMEN WEWENANG SSO MULTI-APLIKASI
    // ════════════════════════════════════════════════════════════════════════
    async function bukaModalSSO(userId) {
      const users = window._pegawaiCache || [];
      const u = users.find(x => String(x.id || x.ID) === String(userId));
      if (!u) {
        if (typeof showToast === 'function') showToast('Pegawai tidak ditemukan', 'warning');
        return;
      }

      const nama = u.nama || u.Nama || '—';
      const nip = u.nip || u.NIP || '—';
      const jab = u.jabatan || u.Jabatan || '—';
      const bid = u.bidang || u.Bidang || '—';
      const isAktif = u.status_aktif !== false && (u.status || u.Status || '').toUpperCase() !== 'NONAKTIF';
      const p = u.app_permissions || {};

      const abs = p.absensi || { enabled: true, role: 'PEGAWAI' };
      const smp = p.simapo || { enabled: true, role: 'PEGAWAI' };
      const sd = p.satudata || { enabled: false, role: 'KONTRIBUTOR' };
      const prc = p.perencanaan || { enabled: false, role: 'STAF' };
      const web = p.webadmin || { enabled: false, role: 'EDITOR_BERITA' };

      const modalHtml = `
        <div style="text-align:left; font-size:12px; color:var(--white, #f8fafc)">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.04); border-radius:10px; border:1px solid rgba(255,255,255,0.08); margin-bottom:12px">
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff">${escapeHtml(nama)}</div>
              <div style="font-size:11px; color:var(--gold, #f59e0b); font-variant-numeric:tabular-nums">NIP. ${escapeHtml(nip)}</div>
              <div style="font-size:10px; color:#94a3b8">${escapeHtml(jab)} &bull; ${escapeHtml(bid)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:9px; color:#94a3b8; margin-bottom:2px">Status Akun</div>
              <label style="display:inline-flex; align-items:center; cursor:pointer; gap:6px">
                <input type="checkbox" id="sso_status_aktif" ${isAktif ? 'checked' : ''} style="width:16px; height:16px; accent-color:#22c55e">
                <span id="sso_status_label" style="font-weight:700; font-size:11px; color:${isAktif ? '#4ade80' : '#f87171'}">${isAktif ? 'AKTIF' : 'NONAKTIF'}</span>
              </label>
            </div>
          </div>

          <div style="font-size:11px; font-weight:700; color:var(--gold, #f59e0b); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px">
            <i class="fas fa-cubes"></i> Wewenang Akses Aplikasi
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; max-height:270px; overflow-y:auto; padding-right:4px">
            <!-- Absensi -->
            <div style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600">
                <input type="checkbox" id="sso_app_absensi" ${abs.enabled ? 'checked' : ''} style="width:15px; height:15px; accent-color:#f59e0b">
                <span><i class="fas fa-user-clock" style="color:#60a5fa; width:16px"></i> Absensi Digital</span>
              </label>
              <select id="sso_role_absensi" style="padding:3px 6px; border-radius:6px; background:#1e293b; color:#fff; border:1px solid #334155; font-size:11px">
                <option value="PEGAWAI" ${abs.role === 'PEGAWAI' ? 'selected' : ''}>Pegawai</option>
                <option value="ADMIN_ABSEN" ${abs.role === 'ADMIN_ABSEN' ? 'selected' : ''}>Admin Absen</option>
              </select>
            </div>

            <!-- SIMAPO -->
            <div style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600">
                <input type="checkbox" id="sso_app_simapo" ${smp.enabled ? 'checked' : ''} style="width:15px; height:15px; accent-color:#f59e0b">
                <span><i class="fas fa-boxes" style="color:#f59e0b; width:16px"></i> SIMAPO Aset</span>
              </label>
              <select id="sso_role_simapo" style="padding:3px 6px; border-radius:6px; background:#1e293b; color:#fff; border:1px solid #334155; font-size:11px">
                <option value="PEGAWAI" ${smp.role === 'PEGAWAI' ? 'selected' : ''}>Pegawai (Pinjam)</option>
                <option value="BENDAHARA_BARANG" ${smp.role === 'BENDAHARA_BARANG' ? 'selected' : ''}>Bendahara Barang</option>
                <option value="ADMIN_ASET" ${smp.role === 'ADMIN_ASET' ? 'selected' : ''}>Admin Aset</option>
              </select>
            </div>

            <!-- Satu Data -->
            <div style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600">
                <input type="checkbox" id="sso_app_satudata" ${sd.enabled ? 'checked' : ''} style="width:15px; height:15px; accent-color:#f59e0b">
                <span><i class="fas fa-chart-bar" style="color:#10b981; width:16px"></i> Satu Data Daerah</span>
              </label>
              <select id="sso_role_satudata" style="padding:3px 6px; border-radius:6px; background:#1e293b; color:#fff; border:1px solid #334155; font-size:11px">
                <option value="KONTRIBUTOR" ${sd.role === 'KONTRIBUTOR' ? 'selected' : ''}>Kontributor OPD</option>
                <option value="WALIDATA_ADMIN" ${sd.role === 'WALIDATA_ADMIN' ? 'selected' : ''}>Walidata Admin</option>
              </select>
            </div>

            <!-- Perencanaan -->
            <div style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600">
                <input type="checkbox" id="sso_app_perencanaan" ${prc.enabled ? 'checked' : ''} style="width:15px; height:15px; accent-color:#f59e0b">
                <span><i class="fas fa-file-invoice" style="color:#818cf8; width:16px"></i> Perencanaan (PKS)</span>
              </label>
              <select id="sso_role_perencanaan" style="padding:3px 6px; border-radius:6px; background:#1e293b; color:#fff; border:1px solid #334155; font-size:11px">
                <option value="STAF" ${prc.role === 'STAF' ? 'selected' : ''}>Staf Perencana</option>
                <option value="REVIEWER_KABID" ${prc.role === 'REVIEWER_KABID' ? 'selected' : ''}>Reviewer Kabid</option>
                <option value="ADMIN_PERENCANAAN" ${prc.role === 'ADMIN_PERENCANAAN' ? 'selected' : ''}>Admin Perencanaan</option>
              </select>
            </div>

            <!-- Web Portal -->
            <div style="padding:8px 10px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600">
                <input type="checkbox" id="sso_app_webadmin" ${web.enabled ? 'checked' : ''} style="width:15px; height:15px; accent-color:#f59e0b">
                <span><i class="fas fa-globe" style="color:#ec4899; width:16px"></i> Web Portal Bapperida</span>
              </label>
              <select id="sso_role_webadmin" style="padding:3px 6px; border-radius:6px; background:#1e293b; color:#fff; border:1px solid #334155; font-size:11px">
                <option value="EDITOR_BERITA" ${web.role === 'EDITOR_BERITA' ? 'selected' : ''}>Editor Berita</option>
                <option value="SUPERADMIN_PORTAL" ${web.role === 'SUPERADMIN_PORTAL' ? 'selected' : ''}>Superadmin Portal</option>
              </select>
            </div>
          </div>

          <!-- Reset Password Area -->
          <div style="margin-top:12px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center">
            <div>
              <div style="font-size:11px; font-weight:600">Reset Sandi Pegawai</div>
              <div style="font-size:9px; color:#94a3b8">Default: <code style="color:#fbbf24">BapperidaSB2026</code></div>
            </div>
            <button type="button" id="btn_reset_pwd_sso" class="btn-sm-admin" style="background:rgba(239,68,68,0.12); color:#f87171; border-color:rgba(239,68,68,0.3); padding:4px 8px; cursor:pointer; font-size:10px">
              <i class="fas fa-lock"></i> Reset Sandi
            </button>
          </div>
        </div>
      `;

      if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
          title: 'Hak Akses SSO Pegawai',
          html: modalHtml,
          showCancelButton: true,
          confirmButtonText: '<i class="fas fa-save"></i> Simpan Wewenang',
          cancelButtonText: 'Tutup',
          confirmButtonColor: '#22c55e',
          cancelButtonColor: '#475569',
          background: '#0f172a',
          color: '#f8fafc',
          width: '480px',
          didOpen: () => {
            const chkAktif = document.getElementById('sso_status_aktif');
            const lblAktif = document.getElementById('sso_status_label');
            if (chkAktif && lblAktif) {
              chkAktif.addEventListener('change', () => {
                lblAktif.textContent = chkAktif.checked ? 'AKTIF' : 'NONAKTIF';
                lblAktif.style.color = chkAktif.checked ? '#4ade80' : '#f87171';
              });
            }
            const btnReset = document.getElementById('btn_reset_pwd_sso');
            if (btnReset) {
              btnReset.addEventListener('click', () => resetPasswordPegawai(userId, nip, nama));
            }
          },
          preConfirm: () => {
            return {
              status_aktif: document.getElementById('sso_status_aktif')?.checked ?? true,
              app_permissions: {
                absensi: {
                  enabled: document.getElementById('sso_app_absensi')?.checked ?? true,
                  role: document.getElementById('sso_role_absensi')?.value || 'PEGAWAI',
                },
                simapo: {
                  enabled: document.getElementById('sso_app_simapo')?.checked ?? true,
                  role: document.getElementById('sso_role_simapo')?.value || 'PEGAWAI',
                },
                satudata: {
                  enabled: document.getElementById('sso_app_satudata')?.checked ?? false,
                  role: document.getElementById('sso_role_satudata')?.value || 'KONTRIBUTOR',
                },
                perencanaan: {
                  enabled: document.getElementById('sso_app_perencanaan')?.checked ?? false,
                  role: document.getElementById('sso_role_perencanaan')?.value || 'STAF',
                },
                webadmin: {
                  enabled: document.getElementById('sso_app_webadmin')?.checked ?? false,
                  role: document.getElementById('sso_role_webadmin')?.value || 'EDITOR_BERITA',
                },
              },
            };
          },
        });

        if (result.isConfirmed && result.value) {
          await simpanWewenangSSO(userId, result.value.app_permissions, result.value.status_aktif);
        }
      }
    }

    async function simpanWewenangSSO(userId, app_permissions, status_aktif) {
      try {
        const res = await apiPost('/api/user-permissions', {
          id: userId,
          app_permissions,
          status_aktif,
        });
        if (res && res.ok) {
          if (typeof showToast === 'function') showToast('Wewenang SSO pegawai berhasil disimpan.', 'success');
          // Update local cache
          const u = (window._pegawaiCache || []).find(x => String(x.id || x.ID) === String(userId));
          if (u) {
            u.app_permissions = app_permissions;
            u.status_aktif = status_aktif;
            u.status = status_aktif ? 'AKTIF' : 'NONAKTIF';
            u.Status = u.status;
          }
          loadPegawaiMgmt();
        } else {
          if (typeof showToast === 'function') showToast(res?.message || 'Gagal menyimpan wewenang.', 'error');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast('Koneksi gagal: ' + err.message, 'error');
      }
    }

    async function resetPasswordPegawai(userId, nip, nama) {
      if (typeof Swal !== 'undefined') {
        const confirm = await Swal.fire({
          title: 'Reset Sandi Pegawai?',
          text: `Sandi untuk ${nama} (NIP ${nip}) akan disetel ulang ke default: BapperidaSB2026`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Ya, Reset Sandi',
          cancelButtonText: 'Batal',
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#475569',
          background: '#0f172a',
          color: '#f8fafc',
        });
        if (!confirm.isConfirmed) return;
      }
      try {
        const res = await apiPost('/api/user-reset-password', { id: userId });
        if (res && res.ok) {
          if (typeof Swal !== 'undefined') {
            Swal.fire({
              title: 'Sandi Berhasil Direset',
              text: 'Sandi pegawai kini kembali ke default: BapperidaSB2026',
              icon: 'success',
              background: '#0f172a',
              color: '#f8fafc',
            });
          }
        } else {
          if (typeof showToast === 'function') showToast(res?.message || 'Gagal mereset sandi.', 'error');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast('Koneksi gagal: ' + err.message, 'error');
      }
    }

    window.initSuperadminPegawaiScoping = initSuperadminPegawaiScoping;
    window.onPegawaiInstansiChange = onPegawaiInstansiChange;
    window.bukaModalSSO = bukaModalSSO;
    window.simpanWewenangSSO = simpanWewenangSSO;
    window.resetPasswordPegawai = resetPasswordPegawai;

