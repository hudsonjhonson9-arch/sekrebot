/* ════ KONTROL KEHADIRAN (JAM JAGA) ════ */

    /**
     * Muat konfigurasi kontrol kehadiran untuk instansi user dari n8n,
     * lalu tampilkan/sebunyikan seksi JAM JAGA di halaman absen.
     */
    async function loadKontrolConfig() {
      const inst = localStorage.getItem('MY_INSTANSI') || window.userProfile?.instansi_id || 'bapperida';
      try {
        const { ok, data } = await apiGet(P.kontrolAbsen, { instansi_id: inst });
        const cfg = ok && data?.config ? data.config : null;
        window._kontrolConfig = cfg;
        renderKontrol(cfg);
      } catch (e) {
        console.warn('[Kontrol] Gagal memuat konfigurasi:', e.message);
      }
    }

    /**
     * Render seksi JAM JAGA berdasarkan config { enabled, times:[{jam,aktif}] }.
     */
    function renderKontrol(cfg) {
      const sec = $('kontrolSection');
      if (!sec) return;
      const en = !!(cfg && cfg.enabled === true);
      sec.style.display = en ? 'block' : 'none';
      if (!en) return;

      const wrap = $('kontrolTimes');
      if (!wrap) return;
      const times = Array.isArray(cfg.times) ? cfg.times.filter(t => t.aktif !== false) : [];
      wrap.innerHTML = times.length
        ? times.map(t =>
            `<button style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:var(--white);border-radius:12px;padding:10px 14px;margin:4px;font-size:13px;cursor:pointer" onclick="handleKontrol('${t.jam || ''}')">🛡️ ${t.jam || 'Jaga'}</button>`)
            .join('')
        : '<div style="color:var(--muted);font-size:12px">Belum ada jam jaga dikonfigurasi.</div>';
    }

    /**
     * Mulai absen jenis KONTROL. Menggunakan ulang seluruh alur handleAbsen
     * (GPS, anti-spoofing, foto) — hanya mengubah jenis_absen + keterangan.
     */
    function handleKontrol(jam) {
      if (window._isAbsenSubmitting) return;
      window._kontrolMode = true;
      window._kontrolKet = jam ? `Kontrol kehadiran jam ${jam}` : 'Cek kehadiran';
      if (typeof handleAbsen === 'function') handleAbsen();
    }