/* ════ KETERANGAN / IZIN ════ */
    /* ════ KETERANGAN ════ */
    let selectedJenis = 'IZIN', fileBase64 = null, fileMime = null, fileOrigName = null;
    let _isKetSubmitting = false; // Idempotency Lock
    function toggleIzinJam() {
      const ch = $('checkIzinJam');
      ch.checked = !ch.checked;
      const row = $('rowIzinJam');
      const box = $('labelIzinJam');
      if (ch.checked) {
        row.style.display = 'grid';
        box.style.background = 'var(--gold)';
        box.style.color = 'var(--bg)';
        box.style.borderStyle = 'solid';
        $('izinJamIcon').textContent = '✅';
        // Set default jam jika kosong
        if (!$('inJamMulai').value) $('inJamMulai').value = '08:00';
        if (!$('inJamSelesai').value) $('inJamSelesai').value = '10:00';
      } else {
        row.style.display = 'none';
        box.style.background = 'var(--gold-dim)';
        box.style.color = 'var(--gold)';
        box.style.borderStyle = 'dashed';
        $('izinJamIcon').textContent = '⏰';
      }
    }

    function selectJenis(j, el) {
      selectedJenis = j;
      document.querySelectorAll('.jenis-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      // Tampilkan opsi Izin Jam HANYA untuk IZIN (bukan SAKIT/TUGAS)
      const wrap = $('izinJamWrap');
      if (wrap) {
        const isIzin = (j === 'IZIN');
        wrap.style.display = isIzin ? 'block' : 'none';
        if (!isIzin && $('checkIzinJam').checked) {
          // Reset jika pindah ke SAKIT/TUGAS saat masih tercentang
          $('checkIzinJam').checked = false;
          if ($('rowIzinJam')) dom.hide('rowIzinJam');
          const box = $('labelIzinJam');
          if (box) { box.style.background = 'var(--gold-dim)'; box.style.color = 'var(--gold)'; box.style.borderStyle = 'dashed'; }
          if ($('izinJamIcon')) $('izinJamIcon').textContent = '⏰';
        }
      }
    }
    // Init Flatpickr range picker for keterangan form (default: today)
    (function () {
      const t = fmtD(nowWITA());
      $('tglMulai').value = $('tglSelesai').value = t;
      updateDur();
      const el = document.getElementById('ketDateRangePicker');
      if (el && window.flatpickr) {
        flatpickr(el, {
          mode: 'range',
          dateFormat: 'Y-m-d',
          defaultDate: [t, t],
          locale: { rangeSeparator: ' s/d ' },
          disableMobile: true,
          onChange: function(dates) {
            if (dates.length >= 1) {
              const dari   = flatpickr.formatDate(dates[0], 'Y-m-d');
              const sampai = flatpickr.formatDate(dates[dates.length - 1], 'Y-m-d');
              $('tglMulai').value   = dari;
              $('tglSelesai').value = sampai;
              updateDur();
            }
          }
        });
      }
    })();
    function updateDur() {
      const a = $('tglMulai').value, b = $('tglSelesai').value;
      if (!a || !b) return;
      const d = Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
      if (d > 0) { dom.show('durLabel', 'block'); $('durText').textContent = `📅 Durasi: ${d} hari`; }
    }

    function handleBukti(e, src) {
      const f = e.target.files[0];
      if (!f) return;
      fileOrigName = f.name; fileMime = f.type;
      const lbl = src === 'kamera' ? $('lblKamera') : $('lblGaleri');
      lbl.textContent = '⏳ Memproses...';
      
      const processFile = async () => {
        try {
          let b64 = null;
          if (f.type.startsWith('image/')) {
            const compressedDataUrl = await compressImage(f, 1280, 0.7);
            b64 = compressedDataUrl.split(',')[1];
            fileMime = 'image/jpeg';
          } else {
            b64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = ev => resolve(ev.target.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(f);
            });
          }

          const sizeBytes = atob(b64).length;
          if (sizeBytes > 5 * 1024 * 1024) {
            Swal.fire({
              title: '❌ File Terlalu Besar',
              text: `Ukuran file (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimal 5 MB.`,
              icon: 'error',
              confirmButtonColor: '#3085d6'
            });
            clearBukti();
            return;
          }

          fileBase64 = b64;
          const preview = $('buktiPreview'), img = $('buktiImg');
          preview.classList.add('show');
          if (fileMime.startsWith('image/')) {
            img.src = 'data:' + fileMime + ';base64,' + b64;
            img.style.display = 'block';
          } else { img.style.display = 'none'; }
          $('buktiNamaText').textContent = f.name;
          const btn = src === 'kamera' ? $('btnKamera') : $('btnGaleri');
          document.querySelectorAll('.bukti-btn').forEach(b => b.classList.remove('has-file'));
          btn.classList.add('has-file');
          const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
          lbl.textContent = (f.name.length > 12 ? f.name.substring(0, 10) + '…' : f.name) + ` (${sizeMB}MB)`;
        } catch (err) {
          console.error(err);
          Swal.fire('❌ Gagal', 'Gagal memproses file bukti.', 'error');
          clearBukti();
        }
      };

      processFile();
      e.target.value = '';
    }
    function clearBukti() {
      fileBase64 = null; fileMime = null; fileOrigName = null;
      $('buktiPreview').classList.remove('show'); $('buktiImg').src = '';
      $('buktiNamaText').textContent = '—';
      document.querySelectorAll('.bukti-btn').forEach(b => b.classList.remove('has-file'));
      $('lblKamera').textContent = 'Ambil Foto'; $('lblGaleri').textContent = 'Pilih File';
      if ($('inputKamera')) $('inputKamera').value = '';
      $('inputGaleri').value = '';
    }

    function ambilFotoKeterangan() {
      $('lblKamera').textContent = 'Membuka kamera...';
      openBuktiOverlay({
        onDone: async (cap) => {
          if (!cap || !cap.dataUrl) {
            $('lblKamera').textContent = 'Ambil Foto';
            return;
          }
          try {
            const compressedDataUrl = await compressImage(cap.dataUrl, 1280, 0.7);
            const b64 = compressedDataUrl.split(',')[1];
            const sizeBytes = atob(b64).length;

            if (sizeBytes > 5 * 1024 * 1024) {
              Swal.fire({
                title: '❌ File Terlalu Besar',
                text: `Ukuran foto (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimal 5 MB.`,
                icon: 'error',
                confirmButtonColor: '#3085d6'
              });
              clearBukti();
              return;
            }

            fileBase64 = b64;
            fileMime = 'image/jpeg';
            fileOrigName = 'Kamera_' + Math.floor(Date.now() / 1000) + '.jpg';

            const preview = $('buktiPreview'), img = $('buktiImg');
            preview.classList.add('show');
            img.src = 'data:image/jpeg;base64,' + b64;
            img.style.display = 'block';
            $('buktiNamaText').textContent = fileOrigName;

            $('btnKamera').classList.add('has-file');
            $('btnGaleri').classList.remove('has-file');

            const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
            $('lblKamera').textContent = `Foto Tersimpan (${sizeMB}MB)`;
          } catch (err) {
            console.error(err);
            Swal.fire('❌ Gagal', 'Gagal memproses foto kamera.', 'error');
            clearBukti();
          }
        },
        onCancel: () => {
          $('lblKamera').textContent = 'Ambil Foto';
        }
      });
    }
    /**
     * Kirim pengajuan keterangan/izin ke server.
     * Menangani validasi form, upload bukti foto, dan konfirmasi.
     * @returns {Promise<void>}
     */
        async function handleKet() {
      if ($('btnKet').disabled || _isKetSubmitting) return;
      const tm = $('tglMulai').value, ts = $('tglSelesai').value, k = $('ketText').value.trim();
      if (!tm || !ts) { showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '⚠️', 'Lengkapi Form', 'Tanggal wajib diisi.'); return; }
      if (!k) { showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '⚠️', 'Keterangan Kosong', 'Tuliskan alasan terlebih dahulu.'); return; }
      // ── Validasi bukti wajib (frontend guard — backend juga validasi) ──
      if (selectedJenis === 'TUGAS' && !fileBase64) {
        showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '📎', 'Bukti Wajib',
          'Surat Tugas / Dinas Luar wajib menyertakan bukti (foto surat tugas / dokumen).'); return;
      }
      if (selectedJenis === 'SAKIT' && tm && ts) {
        const _d = Math.round((new Date(ts) - new Date(tm)) / 864e5) + 1;
        if (_d > 1 && !fileBase64) {
          showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '📎', 'Bukti Wajib',
            `Izin Sakit lebih dari 1 hari (${_d} hari) wajib menyertakan bukti (surat dokter / keterangan sakit).`); return;
        }
      }
      if (!window.IS_ADMIN) {
        const now = nowWITA();
        const totMenit = now.getHours() * 60 + now.getMinutes();
        const _jH = typeof getJamForTanggal === 'function' ? getJamForTanggal(fmtD(now)) : null;
        const jMasukMenit = _jH ? toMenitStr(_jH.masuk) : JAM_MASUK_MENIT;
        if (jMasukMenit !== null && totMenit > jMasukMenit) {
          showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '⏰', 'Lewat Batas Waktu',
            `Pengajuan keterangan hanya bisa dikirim sebelum jam masuk (${toHHMM(jMasukMenit)} WITA). Silakan hubungi admin untuk pengajuan manual.`); return;
        }
      }
      setBtnL('btnKet', true, 'Mengirim...');
      _isKetSubmitting = true;
      const payload = {
        nip: userProfile?.nip || localStorage.getItem('MY_NIP') || '',
        request_id: `ket_${userProfile?.nip}_${Date.now()}`, // Idempotency Key
        user: {
          id: MY_ID, first_name: tgUser.first_name || '', last_name: tgUser.last_name || '', username: tgUser.username || '',
          nama_lengkap: userProfile?.nama || '', jabatan: userProfile?.jabatan || '', nip: userProfile?.nip || '',
          instansi_id: userProfile?.instansi_id || localStorage.getItem('MY_INSTANSI') || ''
        },
        jenis: selectedJenis, tgl_mulai: tm, tgl_selesai: ts, keterangan: k,
        jam_mulai: $('checkIzinJam').checked ? $('inJamMulai').value : '',
        jam_selesai: $('checkIzinJam').checked ? $('inJamSelesai').value : '',
        bukti_base64: fileBase64 || null, bukti_mime: fileMime || null, bukti_nama: fileOrigName || null,
        init_data: tg?.initData || '', timestamp: Math.floor(Date.now() / 1000), source: 'telegram_miniapp'
      };
      // ── OFFLINE QUEUE INTERCEPTOR ──
      if (!navigator.onLine) {
        payload._is_offline_sync = true;
        const offlineData = {
          endpoint: P.ket,
          method: 'POST',
          payload: payload,
          timestamp: Date.now(),
          type: 'keterangan'
        };
        await idb.set('offline_queue', offlineData);

        showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '📴', 'Tersimpan Sementara Karena Offline',
          `Pengajuan ${selectedJenis} Anda tersimpan di perangkat. Sistem akan mengirim otomatis saat koneksi internet kembali.`);
        setBtnL('btnKet', false, '✅ Tersimpan Offline');
        dom.setDisabled('btnKet', true);
        ketStatusLoaded = false;
        setTimeout(() => resetKetForm(), 3200);
        return;
      }

      try {
        const { ok: ketOk, data: res } = await apiPost(P.ket, payload);
        let d = {}; try { d = res } catch (_) { }
        // Tampilkan pesan sesuai jenis & status dari server
        if (d.ok === false) {
          showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '⚠️', 'Gagal Mengajukan', d.message || 'Terjadi kesalahan.');
          setBtnL('btnKet', false, '📤 Kirim Keterangan');
          return;
        }
        const isAutoApprove = ['SAKIT', 'TUGAS'].includes(selectedJenis);
        if (isAutoApprove) {
          const label = selectedJenis === 'TUGAS' ? 'Surat Tugas / DL' : 'Izin Sakit';
          showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'success', '✅', `${label} Tercatat Otomatis`,
            `Keterangan ${selectedJenis} Anda telah disetujui otomatis, tercatat di sistem, dan akan disiarkan kepada seluruh pegawai.`);
          setBtnL('btnKet', false, '✅ Tercatat & Disetujui');
        } else {
          showResult('ketResult', 'ketRIcon', 'ketRTitle', 'ketRMsg', 'warning', '⏳', 'IZIN Menunggu Konfirmasi Admin',
            'Pengajuan IZIN Anda telah dikirim. Setelah admin menyetujui, informasi akan disiarkan kepada seluruh pegawai.');
          setBtnL('btnKet', false, '⏳ Menunggu Persetujuan Admin');
        }
        dom.setDisabled('btnKet', true);
        logLoaded = false;
        ketStatusLoaded = false;
        setTimeout(() => loadKetStatus(), 800);
        setTimeout(() => resetKetForm(), 3200);
      } catch {
        handleAbsenError(new AbsenError('Semua server tidak merespons.', ERROR_CODES.NETWORK_ERROR));
        setBtnL('btnKet', false, '📤 Kirim Keterangan');
      } finally {
        _isKetSubmitting = false;
      }
    }

    function resetKetForm() {
      selectedJenis = 'IZIN';
      document.querySelectorAll('#panel-ket .jenis-pill').forEach((p, i) => {
        p.classList.toggle('active', i === 0);
      });
      const t = fmtD(nowWITA());
      $('tglMulai').value = t; $('tglSelesai').value = t; updateDur();
      $('ketText').value = '';
      // Reset Izin Jam
      $('checkIzinJam').checked = false;
      dom.hide('rowIzinJam');
      const box = $('labelIzinJam');
      if (box) {
        box.style.background = 'var(--gold-dim)';
        box.style.color = 'var(--gold)';
        box.style.borderStyle = 'dashed';
        $('izinJamIcon').textContent = '⏰';
      }
      clearBukti();
      dom.setDisabled('btnKet', false);
      setBtnL('btnKet', false, '📤 Kirim Keterangan');
      $('ketResult').classList.remove('show');
    }

    /* ════ KET STATUS LIST ════ */
    let ketStatusCache = [], ketStatusLoaded = false;

    /**
     * Muat daftar keterangan yang pernah diajukan oleh user.
     * @returns {Promise<void>}
     */
        async function loadKetStatus() {
      const el = $('ketStatusList'), btn = $('btnRefreshKet');
      if (btn) btn.disabled = true;
      dom.shimmer(el.id || 'ketList', 2);
      try {
        const res = await apiGet(P.ketList, { user_id: MY_ID || '' });
        if (!res.ok) throw 0;
        const rows = res.rows.length ? res.rows : parseApiResponse(res.data);
        ketStatusCache = rows;
        ketStatusLoaded = true;
        renderKetStatusList(rows);
      } catch {
        el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:16px">Gagal memuat. Tekan 🔄 untuk coba lagi.</div>';
      } finally { if (btn) btn.disabled = false; }
    }

    function renderKetStatusList(rows) {
      const el = $('ketStatusList');
      if (!rows || rows.length === 0) {
        el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:16px">Belum ada pengajuan keterangan.</div>';
        return;
      }
      const JENIS_EMOJI = { 'IZIN': '🙏', 'SAKIT': '🤒', 'TUGAS': '💼' };
      el.innerHTML = rows.slice(0, 20).map((r, i) => {
        // Schema baru Supabase: id_ket, user_id, nama, nip, tanggal, jam, jenis, keterangan, status
        const jenis = (r.jenis || r['Jenis Absen'] || r.jenis_absen || '').trim().toUpperCase()
          .replace(' PENDING', '').replace(' DITOLAK', '').replace(' TOLAK', '').replace(' DISETUJUI', '');
        const status = (r.status || r.Status || '').trim().toUpperCase();
        const isPending = status === 'PENDING' || (!status && (r.jenis || '').toUpperCase().includes('PENDING'));
        const isApproved = status === 'DISETUJUI' || status === 'APPROVED';
        const isRejected = status === 'DITOLAK' || status === 'REJECTED';
        const emoji = JENIS_EMOJI[jenis] || '📝';
        const badgeClass = isPending ? 'ket-badge-pending' : isApproved ? 'ket-badge-approved' : 'ket-badge-rejected';
        const badgeLabel = isPending ? '⏳ PENDING' : isApproved ? '✅ DISETUJUI' : '❌ DITOLAK';
        const tgl = r.tanggal || r.Tanggal || '—';
        const ket = (r.keterangan || r.Ket || r.ket || '').replace(/\|.*$/, '').trim();
        const idKet = r.id_ket || r.ID_Ket || r.row_number || i;
        const actions = isPending ? `<div class="ket-action-row">
      <button class="ket-btn-edit" onclick="openKetEdit(${i})">✏️ Edit</button>
      <button class="ket-btn-del"  onclick="confirmKetDelete(${i})">🗑️ Hapus</button>
    </div>` : '';
        return `<div class="ket-item">
      <div class="ket-item-left">
        <div class="ket-item-jenis">${emoji} ${jenis || '—'}</div>
        <div class="ket-item-tgl">📅 ${tgl}</div>
        <div class="ket-item-ket">${ket || '—'}</div>
      </div>
      <div class="ket-item-right">
        <span class="ket-badge ${badgeClass}">${badgeLabel}</span>
        ${actions}
      </div>
    </div>`;
      }).join('');
    }

    /**
     * Buka modal edit untuk keterangan yang sudah diajukan.
     * @param {number} idx - Index pada array allKetRows
     */
        function openKetEdit(idx) {
      const r = ketStatusCache[idx];
      if (!r) return;
      // Schema baru: jenis (bukan 'Jenis Absen'), id_ket (bukan row_number)
      const raw = (r.jenis || r['Jenis Absen'] || '').toUpperCase()
        .replace(' PENDING', '').replace(' DITOLAK', '').replace(' DISETUJUI', '').trim();
      const idKet = r.id_ket || r.ID_Ket || r.row_number || r.rowNumber || idx;
      $('editKetRowNum').value = idKet;
      $('editKetOrigTglMulai').value = r.tanggal || r.Tanggal || '';
      // Set jenis pills
      ['IZIN', 'SAKIT', 'TUGAS'].forEach(j => {
        const el = $('editJenisPill_' + j);
        if (el) el.classList.toggle('active', j === raw);
      });
      editSelectedJenis = raw || 'IZIN';
      // Schema baru tidak punya tgl_mulai/tgl_selesai terpisah — pakai tanggal
      $('editTglMulai').value = r.tanggal || r['Tgl Mulai'] || r.Tanggal || '';
      $('editTglSelesai').value = r.tanggal || r['Tgl Selesai'] || r.Tanggal || '';
      $('editKetText').value = (r.keterangan || r.Ket || r.ket || '').replace(/\|.*$/, '').trim();
      dom.hide('editKetResult');
      $('ketEditOverlay').classList.add('open');
    }
    function closeKetModal(e) {
      if (e.target === $('ketEditOverlay')) closeKetModalDirect();
    }
    function closeKetModalDirect() {
      $('ketEditOverlay').classList.remove('open');
    }

    let editSelectedJenis = 'IZIN';
    function setEditJenis(j, el) {
      editSelectedJenis = j;
      document.querySelectorAll('#ketEditOverlay .jenis-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
    }

    async function handleKetEdit() {
      const tm = $('editTglMulai').value, ts = $('editTglSelesai').value, k = $('editKetText').value.trim();
      if (!tm || !ts || !k) { showResult('editKetResult', 'editKetRIcon', 'editKetRTitle', 'editKetRMsg', 'warning', '⚠️', 'Lengkapi Form', 'Semua field wajib diisi.'); dom.show('editKetResult', 'flex'); return; }
      const idKet = $('editKetRowNum').value;  // id_ket dari schema baru
      const origTgl = $('editKetOrigTglMulai').value;
      setBtnL('btnSimpanEdit', true, 'Menyimpan...');
      try {
        const res = await apiPost(P.ketEdit, {
            user_id: MY_ID, id_ket: idKet, orig_tanggal: origTgl,
            nip: userProfile?.nip || localStorage.getItem('MY_NIP') || '',
            instansi_id: userProfile?.instansi_id || localStorage.getItem('MY_INSTANSI') || '',
            jenis: editSelectedJenis, tgl_mulai: tm, tgl_selesai: ts, keterangan: k,
            timestamp: Math.floor(Date.now() / 1000)
          });
        const d = res?.data ?? {};
        if (res.ok && d.ok !== false) {
          showResult('editKetResult', 'editKetRIcon', 'editKetRTitle', 'editKetRMsg', 'success', '✅', 'Berhasil', 'Keterangan berhasil diperbarui.');
          dom.show('editKetResult', 'flex');
          setTimeout(() => { closeKetModalDirect(); loadKetStatus(); }, 1200);
        } else {
          showResult('editKetResult', 'editKetRIcon', 'editKetRTitle', 'editKetRMsg', 'fail', '❌', 'Gagal', d.message || 'Terjadi kesalahan.');
          dom.show('editKetResult', 'flex');
        }
      } catch {
        handleAbsenError(new AbsenError('Server tidak merespons.', ERROR_CODES.NETWORK_ERROR));
        dom.show('editKetResult', 'flex');
      }
      setBtnL('btnSimpanEdit', false, '💾 Simpan Perubahan');
    }

    async function confirmKetDelete(idx) {
      const r = ketStatusCache[idx];
      if (!r) return;
      // Schema baru: id_ket, tanggal (satu field), jenis, keterangan
      const idKet = r.id_ket || r.ID_Ket || r.row_number || r.rowNumber || idx;
      const tgl = r.tanggal || r.Tanggal || '?';
      const jenis = (r.jenis || r['Jenis Absen'] || '').replace(' PENDING', '').trim();
      if (!confirm(`Hapus pengajuan ${jenis}\n${tgl}?\nData akan dihapus dari ket_temp dan Log HADIR.`)) return;
      try {
        const res = await apiPost(P.ketDelete, {
            user_id: MY_ID, id_ket: idKet,
            nip: userProfile?.nip || localStorage.getItem('MY_NIP') || '',
            instansi_id: userProfile?.instansi_id || localStorage.getItem('MY_INSTANSI') || '',
            tgl_mulai: tgl, tgl_selesai: tgl, tanggal: tgl,
            timestamp: Math.floor(Date.now() / 1000)
          });
        let d = {}; try { d = res } catch (_) { }
        if (d.ok === false) { alert('Gagal: ' + (d.message || 'Terjadi kesalahan.')); return; }
        loadKetStatus();
      } catch { alert('Gagal menghapus. Coba lagi.'); }
    }

    /* ════ ADMIN KONFIRMASI PANEL ════ */
    async function loadKonfirmasiAdmin() {
      if (!IS_ADMIN) return;
      const el = $('konfirmasiAdminList');
      if (!el) return;
      dom.shimmer(el.id || 'ketHistoryList', 1);
      try {
        // is_admin=true agar n8n grouping per pengajuan & tidak filter by user_id
        const res = await apiGet(`${P.ketList}?is_admin=true&status=PENDING`);
        if (!res.ok) throw 0;
        const d = res.rows && res.rows.length ? res.rows : (res.data || []);
        // Jika d adalah array, gunakan d. Jika d adalah objek yang membungkus data/rows, gunakan itu.
        let rawRows = Array.isArray(d) ? d : (d.data || d.rows || []);
        
        const rows = rawRows.filter(r => {
          const st = (r.status || r.Status || '').toUpperCase();
          return st === 'PENDING';
        });

        if (!rows || rows.length === 0) {
          el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:16px">✅ Tidak ada pengajuan yang menunggu konfirmasi.</div>';
          return;
        }
        const EMOJI = { 'IZIN': '🙏', 'SAKIT': '🤒', 'TUGAS': '💼' };
        el.innerHTML = rows.map((r, i) => {
          // id_ket = ID_Ket baris pertama pengajuan ini (sudah digrouping oleh n8n)
          const idKet = r.id_ket || r.ID_Ket || '';
          if (!idKet) return ''; // skip jika tidak ada id_ket
          const jenis = (r.jenis || r['Jenis Absen'] || r.jenis_absen || '').trim().toUpperCase();
          const em = EMOJI[jenis] || '📝';
          const nama = r.nama || r.Nama || '—';
          const nip = r.nip || r.NIP || '—';
          // Tampilkan range tanggal jika multi-hari
          const tglMulai = r.tgl_mulai || r.tanggal || r.Tanggal || '—';
          const tglSelesai = r.tgl_selesai || r.tanggal || r.Tanggal || tglMulai;
          const durasi = r.durasi || 1;
          const tglLabel = tglMulai === tglSelesai ? tglMulai : `${tglMulai} s.d. ${tglSelesai} (${durasi} hari)`;
          const ket = (r.keterangan || r.Ket || r.ket || '').trim();
          const idKetEsc = String(idKet).replace(/'/g, "\\'");
          const nipEsc = String(nip).replace(/'/g, "\\'");
          return `<div class="konfirm-item" id="konfirm-${idKet}">
        <div class="konfirm-nama">${em} ${nama} <span style="font-size:9px;color:var(--muted);font-weight:400">(IZIN)</span></div>
        <div class="konfirm-detail">🪪 ${nip} · 📅 ${tglLabel}<br>📝 ${ket || '—'}</div>
        <div style="font-size:8px;color:var(--muted);font-family:monospace;margin:3px 0 6px;opacity:.6">${idKet}</div>
        <div class="konfirm-actions">
          <button class="konfirm-btn-ok" onclick="handleKonfirmasi('${idKetEsc}','APPROVE','${jenis}','${tglMulai}','${nipEsc}')">✅ Setujui</button>
          <button class="konfirm-btn-no" onclick="handleKonfirmasi('${idKetEsc}','REJECT','${jenis}','${tglMulai}','${nipEsc}')">❌ Tolak</button>
        </div>
      </div>`;
        }).filter(Boolean).join('');
      } catch {
        el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:16px">Gagal memuat. Tekan 🔄 untuk coba lagi.</div>';
      }
    }

    async function handleKonfirmasi(idKet, action, jenis, tanggal, nip) {
      const konfirm = $('konfirmasiResult');
      if (konfirm) konfirm.style.display = 'none';
      try {
        const res = await apiPost(P.ketApprove, {
            id_ket: idKet, nip, action, jenis, tanggal,
            admin_id: MY_ID, admin_nips: ADMIN_NIPS, timestamp: Math.floor(Date.now() / 1000)
          });
        const d = res?.data ?? {};
        if (res.ok && d.ok !== false) {
          // Hilangkan item dari DOM
          const el = document.getElementById('konfirm-' + idKet);
          if (el) { el.style.opacity = '0.3'; el.style.pointerEvents = 'none'; }
          if (konfirm) {
            showResult('konfirmasiResult', 'konfirmasiRIcon', 'konfirmasiRTitle', 'konfirmasiRMsg',
              action === 'APPROVE' ? 'success' : 'warning',
              action === 'APPROVE' ? '✅' : '❌',
              action === 'APPROVE' ? 'Disetujui' : 'Ditolak',
              `Keterangan ${jenis} tgl ${tanggal} telah ${action === 'APPROVE' ? 'disetujui' : 'ditolak'}.`);
            konfirm.style.display = 'flex';
          }
          setTimeout(() => loadKonfirmasiAdmin(), 1500);
        }
      } catch { alert('Gagal. Coba lagi.'); }
    }

