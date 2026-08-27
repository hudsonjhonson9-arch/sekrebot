/* ════ ADMIN: KONTROL KEHADIRAN / JAM JAGA SETTINGS ════
   Baca & simpan config 'kontrol_absen' di tabel pengaturan via
   webhook n8n GET/POST /kontrol-absen. */

    let _kkData = { enabled: false, toleransi: 15, times: [], instansi_id: '' };

    async function loadKkAdmin() {
      _kkData.instansi_id = localStorage.getItem('MY_INSTANSI') || 'bapperida';
      try {
        const res = await apiGet(P.kontrolAbsen, { instansi_id: _kkData.instansi_id });
        const c = res.ok && res.data?.config ? res.data.config : null;
        if (c) {
          _kkData.enabled = !!c.enabled;
          _kkData.toleransi = parseInt(c.toleransi, 10) || 15;
          _kkData.times = Array.isArray(c.times) ? c.times.map(t => ({ jam: t.jam || '', aktif: t.aktif !== false })) : [];
        }
      } catch (_) {}
      renderKkUI();
    }

    function renderKkUI() {
      const sw = $('kkSwitch'), knob = $('kkKnob');
      if (sw && knob) {
        sw.style.background = _kkData.enabled ? 'var(--accent)' : '#6b7280';
        knob.style.left = _kkData.enabled ? '27px' : '3px';
      }
      if ($('kkToleransi')) $('kkToleransi').value = _kkData.toleransi;
      if ($('kkInstansi')) $('kkInstansi').value = _kkData.instansi_id;

      const wrap = $('kkTimes');
      if (!wrap) return;
      wrap.innerHTML = '';
      if (!_kkData.times.length) {
        wrap.innerHTML = '<div style="font-size:10px;color:var(--muted);margin-bottom:6px">Belum ada jam jaga.</div>';
        return;
      }
      _kkData.times.forEach((t, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
        row.innerHTML =
          `<input type="time" value="${t.jam}" onchange="kkEditJam(${i}, this.value)" style="flex:1;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--white);font-size:12px">` +
          `<label style="font-size:10px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap"><input type="checkbox" ${t.aktif ? 'checked' : ''} onchange="kkToggleJam(${i})"> Aktif</label>` +
          `<button onclick="removeKkJam(${i})" style="background:none;border:none;color:#ef4444;font-size:14px;cursor:pointer">🗑</button>`;
        wrap.appendChild(row);
      });
    }

    function toggleKkEnabled() { _kkData.enabled = !_kkData.enabled; renderKkUI(); }
    function kkEditJam(i, v) { _kkData.times[i].jam = v; }
    function kkToggleJam(i) { _kkData.times[i].aktif = !_kkData.times[i].aktif; }
    function removeKkJam(i) { _kkData.times.splice(i, 1); renderKkUI(); }
    function addKkJam() { _kkData.times.push({ jam: '12:00', aktif: true }); renderKkUI(); }

    async function saveKkAdmin() {
      if (!requireAdmin()) return;
      _kkData.toleransi = parseInt($('kkToleransi')?.value, 10) || 15;
      _kkData.instansi_id = ($('kkInstansi')?.value || 'bapperida').trim();
      const times = _kkData.times.filter(t => t.jam && t.jam.length === 5);
      const res = await apiPost(P.kontrolAbsen, {
        enabled: !!_kkData.enabled,
        toleransi: _kkData.toleransi,
        times,
        instansi_id: _kkData.instansi_id
      });
      if (res.ok) {
        showResult('kkResult', 'kkRIcon', 'kkRTitle', 'kkRMsg', 'success', '✅', 'Tersimpan',
          `JAM JAGA ${_kkData.enabled ? 'ON' : 'OFF'} · Toleransi ${_kkData.toleransi} menit · ${times.length} jam (${_kkData.instansi_id})`);
      } else {
        showResult('kkResult', 'kkRIcon', 'kkRTitle', 'kkRMsg', 'fail', '❌', 'Gagal Tersimpan',
          'Pastikan webhook kontrol-absen aktif di n8n & sesi admin valid.');
      }
    }