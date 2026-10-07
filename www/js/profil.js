/* ════ PROFIL & DOKUMEN ════ */
    /* ════ USER PROFILE ════ */
    let userProfile = null;
    window.userProfile = userProfile;
    let _profileLoading = false;

    async function loadUserProfile(isManual = false) {
      if (_profileLoading) return;
      _profileLoading = true;
      
      const uid = await waitForMyId();
      // Tampilkan fallback segera setelah ID tersedia agar user tidak melihat "Memuat..." terlalu lama
      if (uid) setUserFallback(); 

      if (!uid) { _profileLoading = false; setUserFallback(); return; }

      // Tampilkan loading jika manual refresh
      if (isManual) {
        setT('userJabatan', 'Memuat...');
        setT('ketJabatan', 'Memuat...');
      }

      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          const res = await apiGet(P.userList, { user_id: uid });
          if (!res.ok) throw new Error('Network Error');
          // apiGet returns rows (array) + data (raw json)
          // Coba ambil dari rows dulu, lalu fallback ke data
          const d = res.rows.length
            ? res.rows.find(r => String(r.id || r.ID || r.telegram_id) === String(uid)) || res.rows[0]
            : (Array.isArray(res.data) ? (res.data[0] || {}) : (res.data?.data?.[0] || res.data || {}));

          if (d && (d.nama || d.Nama)) {
            const cleanS = (s) => (s && String(s).trim().toLowerCase() !== 'undefined') ? String(s).trim() : '';
            userProfile = {
              nama: cleanS(d.nama || d.Nama),
              jabatan: cleanS(d.jabatan || d.Jabatan),
              nip: cleanS(d.nip || d.NIP),
              username: cleanS(d.username || d.Username || (typeof tgUser !== 'undefined' ? tgUser.username : '')),
              status: cleanS(d.status || d.Status || 'AKTIF'),
              role: cleanS(d.role || d.Role || 'user').toLowerCase().replace(/\s/g, ''),
              instansi_id: cleanS(d.instansi_id || d.Instansi_Id || ''),
              bidang: cleanS(d.bidang || d.Bidang || ''),
              tgl_pangkat: d.tgl_pangkat || d.tgl_kenaikan_pangkat || null,
              tgl_berkala: d.tgl_berkala || d.tgl_kenaikan_berkala || null
            };
            // Persist role and full object for other modules
            if (userProfile.role) {
              localStorage.setItem('MY_ROLE', userProfile.role.toUpperCase());
            }
            localStorage.setItem('tg_user_obj_v5', JSON.stringify(d));
            if (userProfile.instansi_id) {
              const myRole = (userProfile.role || '').toUpperCase();
              const isSA = myRole.includes('SUPER');
              if (!isSA || !localStorage.getItem('MY_INSTANSI')) {
                localStorage.setItem('MY_INSTANSI', userProfile.instansi_id);
              }
              const currentInst = localStorage.getItem('MY_INSTANSI') || userProfile.instansi_id;
              document.documentElement.style.setProperty('--agency-name', `'${currentInst.toUpperCase()}'`);
            }
            window.userProfile = userProfile;
            applyProfile();
            _profileLoading = false;
            return; // Berhasil
          } else {
            // Data kosong atau { ok: false }
            if (attempt === maxAttempts) throw new Error('Pegawai belum terdaftar');
            await new Promise(r => setTimeout(r, 600)); 
          }
        } catch (err) {
          console.warn(`[Profile] Gagal memuat (Attempt ${attempt}/${maxAttempts}):`, err.message);
          if (attempt === maxAttempts) {
            // OTOMATIS: Jika ID Telegram ada tapi tidak ditemukan di DB, arahkan ke registrasi
            if (uid && err.message === 'Pegawai belum terdaftar') {
              console.log('[Profile] User not found in DB, showing registration form...');
              if (typeof switchAuthTab === 'function') {
                switchAuthTab('register');
                const overlay = document.getElementById('authOverlay');
                if (overlay) overlay.style.display = 'flex';
                
                // Pre-fill NIP jika ada di cache tapi ID Telegram belum tertaut
                const cachedNip = localStorage.getItem('MY_NIP');
                if (cachedNip) {
                  const regNip = document.getElementById('regNip');
                  if (regNip) regNip.value = cachedNip;
                }
              }
            }
            break;
          }
          await new Promise(r => setTimeout(r, 600));
        }
      }

      _profileLoading = false;
      // Hanya panggil fallback jika data benar-benar kosong (misal: pertama kali buka)
      // Jika sebelumnya sudah berhasil load, pertahankan data lama agar tidak "hilang" (UX stabil)
      if (!userProfile) {
        setUserFallback();
      } else if (isManual) {
        // Jika manual refresh gagal, beri tahu user tapi jangan hapus data yang ada
        applyProfile();
        console.warn('[Profile] Manual refresh failed, preserving existing data.');
      }
    }
    function fullName() { return window.tgUser?.first_name ? `${window.tgUser.first_name}${window.tgUser.last_name ? ' ' + window.tgUser.last_name : ''}` : 'Pengguna'; }

    /** Terapkan branding header mobile/desktop sesuai instansi aktif */
    function applyInstansiBranding(instansiId) {
      const instId = (instansiId || window.userProfile?.instansi_id || localStorage.getItem('MY_INSTANSI') || (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : '') || '').trim();
      if (!instId) return;

      const instData = typeof getInstansiData === 'function' ? getInstansiData(instId) : null;
      const instName = instData?.nama_instansi
        || (typeof getInstansiName === 'function' ? getInstansiName(instId) : instId.toUpperCase());

      setT('headerOrgSub', instName);
      setT('pegawaiFormTitleText', `DATABASE KEPEGAWAIAN ${String(instName).toUpperCase()}`);
      document.title = `HADIR ${instName}`;

      const logoWrap = $('headerLogoWrap');
      if (logoWrap) {
        const logoUrl = (instData?.logo_url || '').trim();
        const defaultLogo = 'https://raw.githubusercontent.com/hudsonjhonson9-arch/sekrebot/main/Lambang_Kabupaten_Sumba_Barat.png';
        const finalLogo = logoUrl || defaultLogo;
        logoWrap.innerHTML = `<img src="${finalLogo}" alt="${instName}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" onerror="this.parentElement.innerHTML='🏛️'">`;
      }
    }
    window.applyInstansiBranding = applyInstansiBranding;

    function applyProfile() {
      const p = userProfile, n = p.nama || fullName(), i = (n[0] || '?').toUpperCase();
      ['userAvatar', 'ketAvatar'].forEach(id => { const e = $(id); if (e) e.textContent = i; });
      setT('userName', n); setT('ketNama', n);
      setT('userJabatan', p.jabatan || '—'); setT('ketJabatan', p.jabatan || '—');
      setT('userMeta', `NIP: ${p.nip || '—'} · ID: ${window.MY_ID || '—'}`); 
      setT('ketMeta', `NIP: ${p.nip || '—'} · ID: ${window.MY_ID || '—'}`);

      setT('headerOrgName', p.bidang || 'Sekretariat');
      applyInstansiBranding(p.instansi_id);
      // ── Badge status (baca dari data, bukan hardcode) ──
      const st = (p.status || 'AKTIF').toUpperCase();
      const stEmoji = st === 'AKTIF' ? '✅' : st === 'SAKIT' ? '🤒' : st === 'IZIN' ? '🙏' : st === 'TUGAS' ? '💼' : st === 'NONAKTIF' ? '🚫' : '⚙️';
      const stCls = st === 'AKTIF' ? 's-aktif' : st === 'NONAKTIF' ? 's-nonaktif' : 's-ket';
      const b = $('userBadge'); if (b) { b.textContent = `${stEmoji} ${st}`; b.className = `sbadge ${stCls}`; }
      // ── Isi kartu profil besar ──
      const al = $('profilAvatarLg'); if (al) al.textContent = i;
      setT('profilNama', n);
      setT('profilJabatan', p.jabatan || '—');
      setT('profilNip', `NIP: ${p.nip || '—'}`);
      const tb = $('profilTgBadge');
      if (tb) tb.textContent = `🔗 @${window.tgUser?.username || 'Telegram'}`;
      // ── Badge profil besar (dinamis) ──
      const pb = $('profilStatusBadge');
      if (pb) { pb.textContent = `${stEmoji} ${st}`; pb.className = `profil-badge ${stCls === 's-aktif' ? 'aktif-badge' : stCls === 's-nonaktif' ? 'nonaktif-badge' : 'ket-status-badge'}`; }

      // Update global role map for current user
      if (MY_ID && p.role) {
        window._adminRoleMap[MY_ID] = p.role;
        
        // Recalculate IS_ADMIN based on role and NIP
        const myNip = String(p.nip || '').trim();
        const myRole = (p.role || localStorage.getItem('MY_ROLE') || '').toUpperCase();
        window.IS_ADMIN = (typeof ADMIN_NIPS !== 'undefined' && ADMIN_NIPS.includes(myNip)) || 
                          myRole === 'SUPERADMIN' || 
                          myRole === 'ADMIN' ||
                          myRole.includes('SUPER') ||
                          myRole.includes('ADMIN');

        // Jika status admin berubah, re-apply UI
        if (typeof _applyAdminUIExtended === 'function') _applyAdminUIExtended();
        if (typeof _applyAdminUI === 'function') _applyAdminUI();
      }

      // ── Sinkronisasi NIP (Self-healing if corrupted) ──
      if (p.nip && p.nip.toLowerCase() !== 'undefined' && p.nip !== '') {
        const correctNip = String(p.nip).trim();
        if (localStorage.getItem('MY_NIP') !== correctNip) {
          console.log('[Profile] Syncing correct NIP to storage:', correctNip);
          localStorage.setItem('MY_NIP', correctNip);
        }
      }

      renderReminders(p);
      updateProfilFaceUI();
    }
    function setUserFallback() {
      const n = fullName(), i = (n[0] || '?').toUpperCase();
      userProfile = {
        nama: n, jabatan: '', nip: localStorage.getItem('MY_NIP') || '', 
        username: window.tgUser?.username || '', status: 'AKTIF', role: 'user'
      };
      window.userProfile = userProfile;
      
      setT('headerOrgName', 'Sekretariat');
      applyInstansiBranding();

      ['userAvatar', 'ketAvatar'].forEach(id => { const e = $(id); if (e) e.textContent = i; });
      setT('userName', n); setT('ketNama', n);
      setT('userJabatan', '—'); setT('ketJabatan', '—');
      setT('userMeta', `@${window.tgUser?.username || '—'} · ID: ${window.MY_ID || '—'}`);
      setT('ketMeta', `@${window.tgUser?.username || '—'} · ID: ${window.MY_ID || '—'}`);
      const b = $('userBadge'); if (b) { b.textContent = '⚙️ —'; b.className = 'sbadge'; }
      const al = $('profilAvatarLg'); if (al) al.textContent = i;
      setT('profilNama', n);
      setT('profilJabatan', '—');
      setT('profilNip', 'NIP —');
      const tb = $('profilTgBadge'); if (tb) tb.textContent = `🔗 @${window.tgUser?.username || '—'}`;
    }

    /* ════ PENGINGAT KENAIKAN PANGKAT & BERKALA ════ */
    function renderReminders(p) {
      const sec = $('profilReminderSection');
      if (!sec) return;
      const reminders = [];

      // Baca tgl_pangkat & tgl_berkala dari userProfile (jika ada di Google Sheets)
      const tglPangkat = p.tgl_pangkat || p.TglPangkat || p.tgl_kenaikan_pangkat || null;
      const tglBerkala = p.tgl_berkala || p.TglBerkala || p.tgl_kenaikan_berkala || null;
      const now = nowWITA();

      function selisihBulan(tglStr) {
        if (!tglStr) return null;
        const t = new Date(tglStr);
        if (isNaN(t)) return null;
        return Math.round((t - now) / (1000 * 60 * 60 * 24 * 30));
      }

      const bPangkat = selisihBulan(tglPangkat);
      const bBerkala = selisihBulan(tglBerkala);

      if (bPangkat !== null) {
        if (bPangkat <= 0)
          reminders.push({ cls: 'reminder-warn', icon: '🎖️', title: 'Kenaikan Pangkat Sudah Jatuh Tempo!', sub: `Segera ajukan kenaikan pangkat. Tanggal: ${tglPangkat}` });
        else if (bPangkat <= 3)
          reminders.push({ cls: 'reminder-warn', icon: '⚠️', title: `Kenaikan Pangkat ${bPangkat} bulan lagi`, sub: `Segera siapkan berkas. Tanggal: ${tglPangkat}` });
        else if (bPangkat <= 6)
          reminders.push({ cls: 'reminder-info', icon: '📋', title: `Kenaikan Pangkat ${bPangkat} bulan lagi`, sub: `Tanggal kenaikan: ${tglPangkat}` });
        else
          reminders.push({ cls: 'reminder-ok', icon: '✅', title: `Pangkat aman — ${bPangkat} bulan lagi`, sub: `Tanggal kenaikan: ${tglPangkat}` });
      }

      if (bBerkala !== null) {
        if (bBerkala <= 0)
          reminders.push({ cls: 'reminder-warn', icon: '💰', title: 'Kenaikan Berkala Sudah Jatuh Tempo!', sub: `Segera ajukan kenaikan berkala. Tanggal: ${tglBerkala}` });
        else if (bBerkala <= 3)
          reminders.push({ cls: 'reminder-warn', icon: '⚠️', title: `Kenaikan Berkala ${bBerkala} bulan lagi`, sub: `Segera siapkan berkas. Tanggal: ${tglBerkala}` });
        else if (bBerkala <= 6)
          reminders.push({ cls: 'reminder-info', icon: '📋', title: `Kenaikan Berkala ${bBerkala} bulan lagi`, sub: `Tanggal kenaikan: ${tglBerkala}` });
        else
          reminders.push({ cls: 'reminder-ok', icon: '✅', title: `Berkala aman — ${bBerkala} bulan lagi`, sub: `Tanggal kenaikan: ${tglBerkala}` });
      }

      if (!reminders.length) {
        sec.innerHTML = '';
        return;
      }
      sec.innerHTML = `
    <div class="profil-section-title">🔔 Pengingat Kepegawaian</div>
    ${reminders.map(r => `
      <div class="reminder-card ${r.cls}">
        <div class="reminder-icon">${r.icon}</div>
        <div class="reminder-body">
          <div class="reminder-title">${r.title}</div>
          <div class="reminder-sub">${r.sub}</div>
        </div>
      </div>`).join('')}`;
    }

    /* ════ DOKUMEN KEPEGAWAIAN (Google Drive) ════ */
    let dokumenLoaded = false;
    async function loadDokumen() {
      const el = $('dokumenList');
      if (!el) return;

      // 1. Ambil dari Cache IndexedDB (Instant Render)
      try {
        const cachedDocs = await idb.get('master_data', 'dokumen_list');
        if (cachedDocs && cachedDocs.data && cachedDocs.data.length) {
          _renderDokumenList(cachedDocs.data, el);
          dokumenLoaded = true;
        } else {
          el.innerHTML = `<div class="shimmer" style="height:44px;border-radius:10px"></div><div class="shimmer" style="height:44px;border-radius:10px;margin-top:6px"></div>`;
        }
      } catch (e) { console.warn('[Dokumen] Cache Error:', e); }

      // 2. Fetch dari Server di Background (Background Sync)
      try {
        const res = await apiGet(P.dokumenList, { 
          user_id: MY_ID || '', 
          nip: localStorage.getItem('MY_NIP') || '' 
        });
        if (res.ok) {
          const docs = res.rows.length ? res.rows : parseApiResponse(res.data);
          // Update Cache
          await idb.set('master_data', { key: 'dokumen_list', data: docs, updated: Date.now() });
          
          // Re-render jika data belum dimuat atau untuk memastikan data terbaru
          _renderDokumenList(docs, el);
          dokumenLoaded = true;
        } else if (!dokumenLoaded) throw 0;
      } catch {
        if (!dokumenLoaded) {
          el.innerHTML = `<div class="dokumen-empty">🔌 Gagal memuat dokumen.<br><span style="font-size:9px">Pastikan webhook dokumen aktif di n8n.</span></div>`;
        }
      }
    }

    /**
     * Helper untuk merender list HTML dokumen agar konsisten antara cache & server.
     */
    function _renderDokumenList(docs, el) {
      if (!docs.length) {
        el.innerHTML = `<div class="dokumen-empty">📭 Belum ada dokumen tersimpan.<br><span style="font-size:9px;color:var(--muted)">Hubungi admin untuk menambahkan dokumen.</span></div>`;
        return;
      }
      const JENIS_ICON = {
        'SK': '📜', 'SKEP': '📜', 'IJAZAH': '🎓', 'SERTIFIKAT': '🏅',
        'SKP': '📊', 'FOTO': '🖼️', 'KTP': '🪪', 'DEFAULT': '📄'
      };
      if (!window._dokCache) window._dokCache = {};
      
      el.innerHTML = docs.map((d, idx) => {
        const nama = d.nama_dokumen || d.nama || d.name || 'Dokumen';
        const link = d.link || d.webViewLink || d.url || '';
        const jenis = (d.jenis || d.kategori || 'DEFAULT').toUpperCase();
        const icon = JENIS_ICON[jenis] || JENIS_ICON['DEFAULT'];
        const tanggal = d.tanggal || d.uploadedAt || '';
        const id = d.id || '';
        const namaEsc = nama.replace(/'/g, "\\'");

        const b64    = d.file_base64 || d.base64 || d.content || '';
        const mime   = d.mime_type || d.mime || (b64.startsWith('/9j/') ? 'image/jpeg' : 'application/octet-stream');
        const isPdf  = mime.includes('pdf') || (link && link.endsWith('.pdf'));
        const isImg  = mime.startsWith('image/') || ['FOTO','KTP'].includes(jenis);
        const hasB64 = b64.length > 100;
        const cacheKey = 'dok_' + id; 

        if (hasB64) window._dokCache[cacheKey] = { b64, mime, nama };

        const openAttr = (hasB64 || id)
          ? `onclick="_openDokumen('${id}', '${cacheKey}', '${namaEsc}', '${mime}', '${link}')"`
          : (link && link !== '#' && link !== 'null')
            ? `href="${link}" target="_blank" rel="noopener"`
            : `onclick="alert('Dokumen belum memiliki file atau link.')"`;

        const typeLabel = isPdf ? 'PDF' : isImg ? 'Image' : (link ? 'Link' : 'File');
        const typeCls   = isPdf ? 'dok-pdf' : isImg ? 'dok-img' : 'dok-other';

        return `
        <div class="dok-card">
          <div class="dok-card-main" ${openAttr}>
            <div class="dok-icon-wrapper ${typeCls}">
              <span class="dok-main-icon">${icon}</span>
              <span class="dok-type-tag">${typeLabel}</span>
            </div>
            <div class="dok-content">
              <div class="dok-title">${nama}</div>
              <div class="dok-sub">
                <span class="dok-tag">${jenis}</span>
                <span class="dok-dot"></span>
                <span class="dok-date">${tanggal ? tanggal.split('T')[0] : '—'}</span>
              </div>
            </div>
            <div class="dok-action-view">
              <i class="fas fa-external-link-alt"></i>
            </div>
          </div>
          <div class="dok-card-side">
            <button class="dok-btn-del" onclick="hapusDokumen('${id}','${namaEsc}')" title="Hapus">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>`;
      }).join('');
    }
    /* ════ DOKUMEN — TAMBAH & HAPUS ════ */
    let _dokTab = 'upload', _dokFile = null;

    function openDokumenModal() {
      dom.show('dokModalBackdrop', 'flex');
      dom.hide('dokModalMsg');
      $('dokNama').value = ''; $('dokNama2').value = ''; $('dokLink').value = '';
      dom.hide('dokFileName'); _dokFile = null;
      switchDokTab('upload');
    }
    function closeDokumenModal() { dom.hide('dokModalBackdrop'); }
    function switchDokTab(t) {
      _dokTab = t;
      $('dokTabUpload').className = 'dok-tab' + (t === 'upload' ? ' active' : '');
      $('dokTabLink').className = 'dok-tab' + (t === 'link' ? ' active' : '');
      $('dokPanelUpload').style.display = t === 'upload' ? '' : 'none';
      $('dokPanelLink').style.display = t === 'link' ? '' : 'none';
    }
    function onDokFileChange(e) {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { alert('File terlalu besar (maks 5MB)'); e.target.value = ''; return; }
      _dokFile = f;
      $('dokFileName').textContent = '📎 ' + f.name;
      dom.show('dokFileName', 'block');
      if (!$('dokNama').value) $('dokNama').value = f.name.replace(/\.[^.]+$/, '');
    }
    async function submitDokumen() {
      const btn = $('btnSimpanDok');
      const msg = $('dokModalMsg');
      const showMsg = (t, c) => { msg.style.display = 'block'; msg.style.color = c || 'var(--muted)'; msg.textContent = t; };
      btn.disabled = true; btn.textContent = '⏳ Menyimpan...';
      try {
        let payload;
        if (_dokTab === 'upload') {
          const nama = $('dokNama').value.trim();
          if (!nama) { showMsg('⚠️ Nama dokumen wajib diisi', '#f59e0b'); btn.disabled = false; btn.textContent = '💾 Simpan Dokumen'; return; }
          if (!_dokFile) { showMsg('⚠️ Pilih file terlebih dahulu', '#f59e0b'); btn.disabled = false; btn.textContent = '💾 Simpan Dokumen'; return; }
          // Show progress bar
          const prog = $('dokProgress'); prog.style.display = 'block';
          $('dokProgressFill').style.width = '30%';
          const b64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = () => rej();
            r.readAsDataURL(_dokFile);
          });
          $('dokProgressFill').style.width = '60%';
          payload = {
            user_id: MY_ID, 
            nip: localStorage.getItem('MY_NIP') || '',
            nama_dokumen: nama,
            jenis: $('dokJenis').value,
            file_base64: b64, file_name: _dokFile.name,
            mime_type: _dokFile.type,
            mode: 'upload'
          };
          $('dokProgressFill').style.width = '80%';
        } else {
          const nama = $('dokNama2').value.trim();
          const link = $('dokLink').value.trim();
          if (!nama || !link) { showMsg('⚠️ Nama & link wajib diisi', '#f59e0b'); btn.disabled = false; btn.textContent = '💾 Simpan Dokumen'; return; }
          payload = { 
            user_id: MY_ID, 
            nip: localStorage.getItem('MY_NIP') || '',
            nama_dokumen: nama, 
            jenis: $('dokJenis2').value, 
            link, 
            mode: 'link' 
          };
        }
        const { ok: docOk, data: d } = await apiPost(P.dokumenAdd, payload);
        if (d.ok) {
          $('dokProgressFill').style.width = '100%';
          showMsg('✅ Dokumen berhasil disimpan!', '#4ade80');
          dokumenLoaded = false;
          setTimeout(() => { closeDokumenModal(); loadDokumen(); }, 1200);
        } else {
          showMsg('❌ ' + (d.message || 'Gagal menyimpan'), '#ef4444');
        }
      } catch (e) {
        showMsg('❌ Koneksi gagal. Coba lagi.', '#ef4444');
      }
      btn.disabled = false; btn.textContent = '💾 Simpan Dokumen';
    }
    async function hapusDokumen(id, nama) {
      if (!confirm(`Hapus dokumen "${nama}"?
File di Google Drive juga akan dihapus.`)) return;
      try {
        const res = await apiPost(P.dokumenDel, { 
          user_id: MY_ID, 
          nip: localStorage.getItem('MY_NIP') || '',
          id 
        });
        const d = res?.data ?? {};
        if (d.ok) { dokumenLoaded = false; loadDokumen(); }
        else alert('❌ ' + (d.message || 'Gagal menghapus'));
      } catch { alert('❌ Koneksi gagal'); }
    }

    function setT(id, v) { const e = $(id); if (e) e.textContent = v; }


    /**
     * Buka dokumen (PDF / gambar) dengan pola Lazy Loading.
     * Cek cache dulu, jika tidak ada baru ambil dari server (P.dokumenGet).
     */
    async function _openDokumen(id, cacheKey, nama, mime, link) {
      if (!window._dokCache) window._dokCache = {};
      let item = window._dokCache[cacheKey];

      // Jika tidak ada di cache dan ada ID, coba ambil dari server
      if (!item && id) {
        try {
          const btn = event.currentTarget;
          const originalHTML = btn.innerHTML;
          btn.style.opacity = '0.6';
          btn.style.pointerEvents = 'none';
          // Tampilkan loading kecil di icon
          const iconEl = btn.querySelector('.dokumen-icon');
          const oldIcon = iconEl ? iconEl.innerHTML : '';
          if (iconEl) iconEl.innerHTML = '<span class="spin-sm"></span>';

          const res = await apiGet(P.dokumenGet, { id, nip: localStorage.getItem('MY_NIP') || '' });
          if (res.ok) {
            const d = res.rows.length ? res.rows[0] : (res.data?.data?.[0] || res.data || {});
            const b64 = d.file_base64 || d.base64 || d.content || '';
            const realMime = d.mime_type || d.mime || mime || 'application/octet-stream';
            
            if (b64) {
              item = { b64, mime: realMime, nama };
              window._dokCache[cacheKey] = item;
            }
          }
          
          if (iconEl) iconEl.innerHTML = oldIcon;
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
        } catch (e) { console.error("[LazyLoad] Error:", e); }
      }

      // Jika masih tidak ada item (gagal fetch), fallback ke link Drive jika ada
      if (!item) {
        const cleanLink = (link || '').trim();
        if (cleanLink && !['', '-', '#', 'null'].includes(cleanLink)) {
          window.open(cleanLink, '_blank', 'noopener');
        } else {
          alert('❌ File tidak ditemukan atau link tidak tersedia.');
        }
        return;
      }

      // Gunakan logika Blob URL untuk membuka di tab baru
      try {
        const binary = atob(item.b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const blob    = new Blob([bytes], { type: item.mime || 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href   = blobUrl;
        a.target = '_blank';
        a.rel    = 'noopener';
        
        const isPdf = (item.mime || '').includes('pdf');
        const isImg = (item.mime || '').startsWith('image/');
        if (!isPdf && !isImg) a.download = item.nama || 'dokumen';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Revoke URL setelah beberapa saat untuk hemat memori
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      } catch (err) {
        alert('❌ Gagal memproses data file. Format tidak didukung.');
      }
    }
    window._openDokumen = _openDokumen; // Expose ke onclick HTML
