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

      // ID_Log HANYA dari baris log yang diedit (objek `log` dari tombol Edit).
      // Jangan pernah menebak ID dari cache rekap: tebakan itu bisa salah sasaran
      // (mis. tombol "tambah pulang" malah menimpa log MASUK/keterangan yang ada).
      const existingId = log ? getLogId(log) : '';

      const applyMode = () => {
        $('editLogId').value = existingId;
        if (existingId) {
          dom.setText('logModalTitle', 'UPDATE LOG ABSEN');
          dom.setHTML('logModalIcon', '<i class="fas fa-edit"></i>');
          dom.setText('btnSaveLogTxt', 'Perbarui Log');
        } else {
          dom.setText('logModalTitle', 'TAMBAH LOG MANUAL');
          dom.setHTML('logModalIcon', '<i class="fas fa-plus"></i>');
          dom.setText('btnSaveLogTxt', 'Simpan Log');
        }
      };

      $('inLogPegawai').value = uid;
      $('inLogTanggal').value = date || fmtD(nowWITA());
      $('inLogJam').value = log ? ((log.Jam || log.jam || '').substring(0, 5)) : '';
      $('inLogJenis').value = log ? (log['Jenis Absen'] || log.jenis_absen || log.Jenis || 'MASUK') : (hintJenis || 'MASUK');
      $('inLogKet').value = log ? (log.Ket || log.ket || log.keterangan || '') : '';
      dom.hide('logFormResult');
      applyMode();

      // Tampilkan modal sekarang juga — JANGAN blokir di network.
      modal.style.display = 'flex';

      // Isi dropdown pegawai async (jangan await: fetch user-list + data
      // biometrik inilah sumber "lama bukanya" modal).
      // ponytail: value di-set di baris atas SEBELUM opsi terisi = hilang;
      // set ulang setelah list load + sinkronkan label dropdown.
      loadLogPegawaiList().then(function () {
        if (uid) $('inLogPegawai').value = uid;
        syncSearchDdLabel('inLogPegawai');
      });

      // Tidak ada lagi fallback "cari log lama lalu mode edit": kalau log dengan
      // jenis yang sama memang sudah ada, server /api/log/add akan memperbarui
      // baris itu (upsert per pegawai+tanggal+jenis) — tanpa menebak ID_Log
      // dari baris lain yang bisa salah sasaran.
    }

    function closeLogEditor() {
      dom.hide('logModal');
    }

    // ── Auto-set Jenis Absen dari jam (sekali attach, bukan per-buka modal) ──
    function _autoJenisLog() {
      const jam = $('inLogJam')?.value, tgl = $('inLogTanggal')?.value, sel = $('inLogJenis');
      if (!jam || !tgl || !sel) return;
      // Hanya overwrite jika jenis masih tipe waktu (bukan IZIN/SAKIT/dll yang dipilih manual)
      const TIME_TYPES = ['MASUK', 'PULANG', 'DI LUAR JAM MASUK', 'DI LUAR JAM PULANG'];
      if (!TIME_TYPES.includes(sel.value)) return;
      const tot = toMenitStr(jam);
      if (tot == null) return;
      const j = getJamForTanggal(tgl);
      const jm = toMenitStr(j.masuk) ?? JAM_MASUK_MENIT;
      const jp = toMenitStr(j.pulang) ?? JAM_PULANG_MENIT;
      sel.value = tot <= jm ? 'MASUK' : tot < 720 ? 'DI LUAR JAM MASUK' : tot < jp ? 'DI LUAR JAM PULANG' : 'PULANG';
    }
    document.getElementById('inLogJam')?.addEventListener('change', _autoJenisLog);
    document.getElementById('inLogTanggal')?.addEventListener('change', _autoJenisLog);

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

    /* ── Dropdown pegawai di modal log: searchable (select tersembunyi = value source) ── */
    makeSearchDd('inLogPegawai', { ph: '— Pilih Pegawai —' });

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

      // editId hanya dari field tersembunyi yang diisi openLogEditor dari baris
      // log yang benar-benar diedit. Tanpa tebak-ID: kalau log jenis sama sudah
      // ada, server /add memperbaruinya; kalau belum, server INSERT baris baru.

      const isEdit = !!editId;

      if (!uid || !tgl || !jamRaw) {
        showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'warning', '<i class="fas fa-exclamation-triangle"></i>', 'Data Kurang', 'Pegawai, Tanggal, dan Jam wajib diisi.');
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
          showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'fail', '<i class="fas fa-times"></i>', 'Gagal', d.message || 'Gagal menyimpan log.');
        } else {
          showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'success', '<i class="fas fa-check"></i>', 'Berhasil', (d.updated || isEdit) ? 'Log absen diperbarui.' : 'Log absen manual ditambahkan.');
          setTimeout(() => {
            closeLogEditor();
            loadRekap(); // Refresh rekap after change
          }, 2000);
        }
      } catch (e) {
        showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'fail', '<i class="fas fa-plug"></i>', 'Koneksi Error', 'Server tidak merespons.');
      } finally {
        _isLogSubmitting = false; // Reset Lock
        setBtnL('btnSaveLog', false, 'Simpan Log');
      }
    }

