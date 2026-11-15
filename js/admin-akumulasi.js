/* ══ ADMIN: PERINGATAN AKUMULASI WAKTU ══
   On/off + ambang (menit) per instansi, disimpan di tabel pengaturan
   (key='peringatan_akumulasi') via /api/peringatan-akumulasi.
   Scheduler cron 07:00 default OFF — tidak mengirim apa pun sampai
   config instansi ini diaktifkan di sini. */

    let _paData = { enabled: false, ambang_menit: 435, instansi_id: '' };

    async function loadPaAdmin() {
      _paData.instansi_id = localStorage.getItem('MY_INSTANSI') || 'bapperida';
      try {
        const res = await apiGet(P.peringatanAkumulasi, { instansi_id: _paData.instansi_id });
        const c = res.ok && res.data?.config ? res.data.config : null;
        if (c) {
          _paData.enabled = !!c.enabled;
          _paData.ambang_menit = parseInt(c.ambang_menit, 10) || 435;
        }
      } catch (_) {}
      renderPaUI();
    }

    function renderPaUI() {
      const sw = $('paSwitch'), knob = $('paKnob');
      if (sw && knob) {
        sw.style.background = _paData.enabled ? 'var(--accent)' : '#6b7280';
        knob.style.left = _paData.enabled ? '27px' : '3px';
      }
      if ($('paAmbang')) $('paAmbang').value = _paData.ambang_menit;
      if ($('paInstansi')) $('paInstansi').value = _paData.instansi_id;
    }

    function togglePaEnabled() { _paData.enabled = !_paData.enabled; renderPaUI(); }

    async function savePaAdmin() {
      if (!requireAdmin()) return;
      _paData.ambang_menit = parseInt($('paAmbang')?.value, 10) || 435;
      _paData.instansi_id = ($('paInstansi')?.value || 'bapperida').trim();
      const res = await apiPost(P.peringatanAkumulasi, {
        enabled: !!_paData.enabled,
        ambang_menit: _paData.ambang_menit,
        instansi_id: _paData.instansi_id
      });
      if (res.ok) {
        const jam = Math.floor(_paData.ambang_menit / 60), menit = _paData.ambang_menit % 60;
        showResult('paResult', 'paRIcon', 'paRTitle', 'paRMsg', 'success', '<i class="fas fa-check"></i>', 'Tersimpan',
          `Peringatan akumulasi ${_paData.enabled ? 'ON' : 'OFF'} · Ambang ${jam}j ${menit}m (${_paData.ambang_menit} menit) · ${_paData.instansi_id}`);
      } else {
        showResult('paResult', 'paRIcon', 'paRTitle', 'paRMsg', 'fail', '<i class="fas fa-times"></i>', 'Gagal Tersimpan',
          res.message || 'Pastikan sesi admin valid & Anda anggota media (admin/kepala/sekretaris/kabid).');
      }
    }
