    /* ════ ADMIN LOG ════ */
    /* ════ LOG MANAGEMENT (ADMIN) ════ */
    function getLogId(obj) {
      if (!obj) return '';
      // Prioritas Utama: ID_Log (numeric Primary Key)
      if (obj.ID_Log) return String(obj.ID_Log);
      if (obj.id_log) return String(obj.id_log);
      if (obj.ID_LOG) return String(obj.ID_LOG);
      if (obj.ID_log) return String(obj.ID_log);
      if (obj.Id_Log) return String(obj.Id_Log);
      
      // Case-insensitive check
      for (const k of Object.keys(obj)) {
        const lk = k.toLowerCase();
        if (lk === 'id_log' || lk === 'idlog' || lk === 'log_id') {
          if (obj[k]) return String(obj[k]);
        }
      }
      return '';
    }

    /**
     * Buka modal editor log absensi untuk pegawai tertentu.
     * @param {string} uid - Telegram ID pegawai (kosong = semua pegawai)
     * @param {string} date - Tanggal default format YYYY-MM-DD
     * @param {Object|null} log - Data log existing jika edit, null jika tambah baru
     * @param {string} hintJenis - Hint jenis absen ('MASUK' | 'PULANG' | ...)
     * @returns {Promise<void>}
     */
    async function openLogEditor(uid = '', date = '', log = null, hintJenis = '') {
      const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
      const isAdmin = isSA || (window.userProfile?.role?.toLowerCase().includes('admin')) || !!window.IS_ADMIN;

      if (!isAdmin) {
        alert('Maaf, hanya Admin atau Super Admin yang diizinkan untuk menambah atau mengedit log secara manual.');
        return;
      }

      const modal = $('logModal');
      if (!modal) return;

      // Load pegawai list for dropdown if first time
      await loadLogPegawaiList();

      // Find the existing ID from various sources
      let existingId = log ? getLogId(log) : '';

      // SMART UI DETECTION: If ID still missing, search in our global order cache
      if (!existingId && uid && date) {
        const p = (window.userListOrder || []).find(u => String(u.id) === String(uid));
        if (p) {
          // Check which log we should prioritize based on possible selection
          // If log data was passed but has no ID, or if we have a hintJenis
          const hJ = (hintJenis || '').toUpperCase();
          const isM = hJ.includes('MASUK');
          const isP = hJ.includes('PULANG');

          const logsToCheck = [];
          if (isM) { if (p._rawMasukLog) logsToCheck.push(p._rawMasukLog); }
          else if (isP) { if (p._rawPulangLog) logsToCheck.push(p._rawPulangLog); }
          else {
            if (p._rawMasukLog) logsToCheck.push(p._rawMasukLog);
            if (p._rawPulangLog) logsToCheck.push(p._rawPulangLog);
            if (p._rawKetLog) logsToCheck.push(p._rawKetLog);
          }

          for (const l of logsToCheck) {
            const lid = getLogId(l);
            if (lid) {
              const lTime = (l.Jam || l.jam || '').substring(0, 5);
              const paramTime = log ? ((log.Jam || log.jam || '').substring(0, 5)) : '';
              if (paramTime && lTime === paramTime) {
                existingId = lid;
                break;
              }
              // If we have a hint, and this is the record of that type, we target it
              if (hJ) {
                const lJ = (l['Jenis Absen'] || l.jenis_absen || l.Jenis || '').toUpperCase();
                if (lJ.includes(hJ)) {
                   existingId = lid;
                   break;
                }
              }
            }
          }
        }
      }

      $('editLogId').value = existingId;
      $('inLogPegawai').value = uid;
      $('inLogTanggal').value = date || fmtD(nowWITA());
      $('inLogJam').value = log ? ((log.Jam || log.jam || '').substring(0, 5)) : '';
      $('inLogJenis').value = log ? (log['Jenis Absen'] || log.jenis_absen || log.Jenis || 'MASUK') : (hintJenis || 'MASUK');
      $('inLogKet').value = log ? (log.Ket || log.ket || log.keterangan || '') : '';
      dom.hide('logFormResult');

      const isActualEdit = !!existingId;
      if (isActualEdit) {
        dom.setText('logModalTitle', 'UPDATE LOG ABSEN');
        dom.setText('logModalIcon', '📝');
        dom.setText('btnSaveLogTxt', 'Perbarui Log');
      } else {
        dom.setText('logModalTitle', 'TAMBAH LOG MANUAL');
        dom.setText('logModalIcon', '➕');
        dom.setText('btnSaveLogTxt', 'Simpan Log');
      }

      modal.style.display = 'flex';
    }

    function closeLogEditor() {
      dom.hide('logModal');
    }

    let _pegawaiListCache = null;
    async function loadLogPegawaiList() {
      const select = $('inLogPegawai');
      if (!select) return;
      // Jangan load ulang jika sudah ada isinya (kecuali cuma placeholder)
      if (select.options.length > 1 && _pegawaiListCache) return;

      try {
        const res = await apiGet(P.userList, { format: 'full' });
        if (!res.ok) return;
        
        // Gunakan res.rows yang sudah diparsing otomatis oleh helper apiGet
        const users = (res.rows || []).filter(u => u.id || u.ID);
        _pegawaiListCache = users;

        // Bersihkan dropdown kecuali opsi pertama (placeholder)
        while (select.options.length > 1) select.remove(1);

        // Urutkan berdasarkan Nama agar mudah dicari
        users.sort((a, b) => (a.nama || a.Nama || '').localeCompare(b.nama || b.Nama || ''));

        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id || u.ID;
          opt.textContent = `${u.nama || u.Nama} (${u.nip || u.NIP || u.id || u.ID})`;
          select.appendChild(opt);
        });
      } catch (e) { console.error('Load log pegawai failed', e); }
    }

    /**
     * Simpan entri log absensi (tambah baru atau update yang sudah ada).
     * @returns {Promise<void>}
     */
    let _isLogSubmitting = false; // Idempotency Lock
    
    async function saveLog() {
      if (_isLogSubmitting) return; // Prevent double submission

      const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
      const isAdmin = isSA || (window.userProfile?.role?.toLowerCase().includes('admin')) || !!window.IS_ADMIN;

      if (!isAdmin) {
        alert('Maaf, hanya Admin atau Super Admin yang diizinkan untuk menyimpan log.');
        return;
      }
      
      let editId = $('editLogId').value;
      const uid = $('inLogPegawai').value;
      const tgl = $('inLogTanggal').value;
      const jamRaw = $('inLogJam').value;
      const jenis = $('inLogJenis').value;
      const ket = $('inLogKet').value.trim();

      // SMART DETECTION: If no editId is set, check if we already have this log in memory (rekap view)
      if (!editId && uid && tgl && jenis) {
        const p = (window.userListOrder || []).find(u => String(u.id) === String(uid));
        if (p) {
          const jU = jenis.toUpperCase();
          const isMasuk = jU.includes('MASUK');
          const isPulang = jU.includes('PULANG');
          const existing = isMasuk ? p._rawMasukLog : (isPulang ? p._rawPulangLog : p._rawKetLog);
          const lid = existing ? getLogId(existing) : '';
          if (lid) {
            editId = lid;
            console.log(`[Smart Log] Detected existing record: ${editId}. Switching to EDIT mode.`);
          }
        }
      }

      const isEdit = !!editId;

      if (!uid || !tgl || !jamRaw) {
        showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'warning', '⚠️', 'Data Kurang', 'Pegawai, Tanggal, dan Jam wajib diisi.');
        return;
      }

      _isLogSubmitting = true;
      setBtnL('btnSaveLog', true, 'Menyimpan...');
      try {
        const path = isEdit ? P.logEdit : P.logAdd;

        // ── Stabil Idempotency Key ──
        const reqId = isEdit ? `log_edit_${editId}_${Date.now()}` : `log_add_${uid}_${tgl}_${jenis.replace(/\s+/g, '_')}`;

        // Cari data p untuk nama & nip (utamakan cache dari dropdown)
        const pData = (_pegawaiListCache || []).find(u => String(u.id || u.ID) === String(uid))
          || (window.userListOrder || []).find(u => String(u.id) === String(uid))
          || {};

        const res = await apiPost(path, {
            ID_Log: editId,
            telegram_id: uid,
            nama: pData.nama || pData.Nama || '',
            nip: pData.nip || pData.NIP || '',
            instansi_id: pData.instansi_id || pData.Instansi_Id || '',
            tanggal: tgl,
            jam: jamRaw,
            jenis_absen: jenis,
            keterangan: ket,
            admin_id: localStorage.getItem('MY_NIP') || String(window.userProfile?.nip || window.userProfile?.NIP || '').trim(),
            request_id: reqId, // Include idempotency key
            timestamp: Math.floor(Date.now() / 1000)
          });
        const d = res?.data ?? {};

        if (!res.ok || d.ok === false) {
          showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'fail', '❌', 'Gagal', d.message || 'Gagal menyimpan log.');
        } else {
          showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'success', '✅', 'Berhasil', isEdit ? 'Log absen diperbarui.' : 'Log absen manual ditambahkan.');
          setTimeout(() => {
            closeLogEditor();
            loadRekap(); // Refresh rekap after change
          }, 2000);
        }
      } catch (e) {
        showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'fail', '🔌', 'Koneksi Error', 'Server tidak merespons.');
      } finally {
        _isLogSubmitting = false; // Reset Lock
        setBtnL('btnSaveLog', false, 'Simpan Log');
      }
    }

