/* Stitch Arsip Digital — Sub-menu Controller (Dokumen, Agenda Surat, Agenda SPPD) */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  let _activeTab = 'dokumen'; // 'dokumen' | 'agenda-surat' | 'agenda-sppd'
  let _suratMode = 'masuk';   // 'masuk' | 'keluar'
  let _sppdJenis = '';        // '' | 'DALAM_DAERAH' | 'LUAR_DAERAH'
  let _suratItems = [];
  let _sppdItems = [];

  const TAB_META = {
    dokumen: {
      crumb: 'Arsip Digital • Dokumen',
      fabLabel: 'Tambah Dokumen',
      fabIcon: 'add',
    },
    'agenda-surat': {
      crumb: 'Arsip Digital • Agenda Surat',
      fabLabel: 'Catat Surat',
      fabIcon: 'mail',
    },
    'agenda-sppd': {
      crumb: 'Arsip Digital • Agenda SPPD',
      fabLabel: 'Catat SPPD',
      fabIcon: 'flight_takeoff',
    },
  };

  function resolveTabFromHash() {
    const h = String(w.location.hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'agenda-surat') return 'agenda-surat';
    if (h === 'agenda-sppd') return 'agenda-sppd';
    return 'dokumen';
  }

  function switchTab(tab, updateHash = true) {
    const next = TAB_META[tab] ? tab : 'dokumen';
    _activeTab = next;

    if (updateHash && w.location.hash !== '#' + next) {
      try { w.history.replaceState(null, '', '#' + next); } catch (_) { w.location.hash = next; }
      w.dispatchEvent(new HashChangeEvent('hashchange'));
    }

    const pDok = d.getElementById('arsipPanelDokumen');
    const pSur = d.getElementById('arsipPanelAgendaSurat');
    const pSpp = d.getElementById('arsipPanelAgendaSppd');
    if (pDok) pDok.classList.toggle('hidden', next !== 'dokumen');
    if (pSur) pSur.classList.toggle('hidden', next !== 'agenda-surat');
    if (pSpp) pSpp.classList.toggle('hidden', next !== 'agenda-sppd');

    d.querySelectorAll('[data-arsip-tab-btn]').forEach((btn) => {
      const act = btn.dataset.arsipTabBtn === next;
      btn.className = act
        ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold shadow-sm transition-all cursor-pointer'
        : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-xs font-semibold transition-all cursor-pointer';
    });

    const crumb = d.getElementById('arsipBreadcrumbTitle');
    if (crumb) crumb.textContent = TAB_META[next].crumb;

    const fab = d.getElementById('fabArsipAddDoc');
    if (fab) {
      const ic = fab.querySelector('.material-symbols-outlined');
      const sp = fab.querySelector('span:last-child');
      if (ic) ic.textContent = TAB_META[next].fabIcon;
      if (sp) sp.textContent = TAB_META[next].fabLabel;
    }

    if (next === 'agenda-surat') loadAgendaSurat();
    if (next === 'agenda-sppd') loadAgendaSppd();
  }

  function handleFabClick() {
    if (_activeTab === 'agenda-surat') {
      openSuratModal();
      return;
    }
    if (_activeTab === 'agenda-sppd') {
      openSppdModal();
      return;
    }
    w.ArsipColumns?.openUploadModal();
  }

  function fmtDate(val) {
    if (!val) return '-';
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const dt = new Date(s.slice(0, 10) + 'T00:00:00');
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    return s;
  }

  function statusPill(st) {
    const s = String(st || 'TERCATAT').toUpperCase();
    if (s.includes('SELESAI') || s.includes('TERBIT') || s.includes('DIKIRIM') || s.includes('DISETUJUI')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">${esc(st)}</span>`;
    }
    if (s.includes('DISPOSISI') || s.includes('PROSES') || s.includes('BERJALAN')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300">${esc(st)}</span>`;
    }
    if (s.includes('BATAL') || s.includes('TOLAK')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">${esc(st)}</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${esc(st || 'Tercatat')}</span>`;
  }

  /* ── AGENDA SURAT ──────────────────────────────────────────────────────── */
  function setSuratMode(mode) {
    _suratMode = mode === 'keluar' ? 'keluar' : 'masuk';
    d.querySelectorAll('[data-surat-mode-btn]').forEach((btn) => {
      const act = btn.dataset.suratModeBtn === _suratMode;
      btn.className = act
        ? 'px-3.5 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer'
        : 'px-3.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer';
    });
    const thAsal = d.getElementById('thSuratAsalTujuan');
    if (thAsal) thAsal.textContent = _suratMode === 'masuk' ? 'Asal Surat' : 'Tujuan Surat';
    loadAgendaSurat();
  }

  async function loadAgendaSurat() {
    const tbody = d.getElementById('agendaSuratBody');
    const countEl = d.getElementById('agendaSuratCount');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl text-primary animate-spin align-middle mr-2">progress_activity</span>Memuat agenda surat...</td></tr>';

    const tahun = d.getElementById('agendaSuratYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('agendaSuratSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '60' });
    if (q) params.set('q', q);

    const ep = _suratMode === 'masuk'
      ? `/api/arsip/p/api/agenda/surat-masuk?${params.toString()}`
      : `/api/arsip/p/api/agenda/surat-keluar?${params.toString()}`;

    try {
      const res = await fetch(ep);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      _suratItems = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
      if (countEl) countEl.textContent = `${_suratItems.length} surat`;

      if (!_suratItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">Belum ada data ${_suratMode === 'masuk' ? 'Surat Masuk' : 'Surat Keluar'} untuk tahun ${esc(tahun)}.</td></tr>`;
        return;
      }

      tbody.innerHTML = _suratItems.map((item, i) => {
        const noAgenda = _suratMode === 'masuk'
          ? (item.nomor_agenda || `#${item.id || i + 1}`)
          : (item.nomor_surat || `#${item.nomor_urut || item.id || i + 1}`);
        const noSub = _suratMode === 'masuk'
          ? (item.nomor_surat_asli || '-')
          : (item.bidang_pengonsep || '-');
        const tgl = _suratMode === 'masuk'
          ? fmtDate(item.tanggal_terima || item.tanggal_surat)
          : fmtDate(item.tanggal_surat);
        const pihak = _suratMode === 'masuk'
          ? (item.asal_surat || '-')
          : (item.tujuan_surat || '-');
        const perihal = item.perihal || '-';
        const st = item.status_tindaklanjut || item.status || 'Tercatat';

        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="window.ArsipAgenda?.showSuratDetail(${i})">
            <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">${esc(noAgenda)}<div class="text-[10px] font-normal text-slate-400 truncate max-w-[180px]">${esc(noSub)}</div></td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(tgl)}</td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[200px] truncate">${esc(pihak)}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[300px] truncate">${esc(perihal)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${statusPill(st)}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.showSuratDetail(${i})" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-200 hover:text-[#2563eb] text-[11px] font-semibold cursor-pointer">Detail</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (countEl) countEl.textContent = '0 surat';
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat agenda surat: ${esc(err?.message || 'Koneksi terganggu')}</td></tr>`;
    }
  }

  function showSuratDetail(idx) {
    const item = _suratItems[idx];
    if (!item || !w.Swal) return;
    const isMasuk = _suratMode === 'masuk';
    const rows = [
      ['Nomor Agenda / Surat', isMasuk ? (item.nomor_agenda || '-') : (item.nomor_surat || '-')],
      [isMasuk ? 'Nomor Surat Asli' : 'Bidang Pengonsep', isMasuk ? (item.nomor_surat_asli || '-') : (item.bidang_pengonsep || '-')],
      ['Tanggal Surat', fmtDate(item.tanggal_surat)],
      isMasuk ? ['Tanggal Diterima', fmtDate(item.tanggal_terima)] : null,
      [isMasuk ? 'Asal Surat' : 'Tujuan Surat', isMasuk ? (item.asal_surat || '-') : (item.tujuan_surat || '-')],
      ['Perihal', item.perihal || '-'],
      ['Status', item.status_tindaklanjut || item.status || 'Tercatat'],
      item.diteruskan_kepada ? ['Disposisi Kepada', item.diteruskan_kepada] : null,
      item.catatan_instruksi ? ['Catatan Disposisi', item.catatan_instruksi] : null,
    ].filter(Boolean);

    const fileUrl = item.file_url || item.lampiran_url || '';
    const html = `
      <div class="text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
        ${rows.map(([k, v]) => `<div class="py-2 flex justify-between gap-4"><span class="text-slate-500 shrink-0">${esc(k)}</span><span class="font-semibold text-slate-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}
        ${fileUrl ? `<div class="pt-3"><a href="${esc(fileUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2563eb] text-white font-bold text-xs">Buka Lampiran Berkas</a></div>` : ''}
      </div>
    `;
    w.Swal.fire({
      title: isMasuk ? 'Detail Surat Masuk' : 'Detail Surat Keluar',
      html,
      width: 560,
      confirmButtonText: 'Tutup',
      confirmButtonColor: '#2563eb',
    });
  }

  function openSuratModal() {
    const m = d.getElementById('modalArsipAgendaSurat');
    if (!m) return;
    const isMasuk = _suratMode === 'masuk';
    const titleEl = m.querySelector('[data-surat-modal-title]');
    if (titleEl) titleEl.textContent = isMasuk ? 'Catat Agenda Surat Masuk' : 'Catat Agenda Surat Keluar';
    const lblPihak = m.querySelector('[data-surat-pihak-label]');
    if (lblPihak) lblPihak.textContent = isMasuk ? 'Asal Surat *' : 'Tujuan Surat *';
    m.querySelectorAll('input, textarea').forEach((el) => {
      if (el.type === 'date') el.value = new Date().toISOString().slice(0, 10);
      else el.value = '';
    });
    m.classList.remove('hidden');
    m.classList.add('flex');
    if (w.StitchPicker) {
      m.querySelectorAll('select').forEach((s) => { w.StitchPicker.enhanceSelect?.(s); w.StitchPicker.refresh?.(s); });
      m.querySelectorAll('input[type="date"]').forEach((i) => w.StitchPicker.enhanceDate?.(i));
    }
  }

  function closeSuratModal() {
    const m = d.getElementById('modalArsipAgendaSurat');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  }

  async function submitSurat(btnEl) {
    const m = d.getElementById('modalArsipAgendaSurat');
    if (!m) return;
    const v = (k) => (m.querySelector(`[data-surat-field="${k}"]`)?.value || '').trim();
    const nomor = v('nomor');
    const tanggal = v('tanggal') || new Date().toISOString().slice(0, 10);
    const pihak = v('pihak');
    const perihal = v('perihal');
    const bidang = v('bidang') || 'Sekretariat';
    const keterangan = v('keterangan');

    if (!pihak || !perihal) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Asal/Tujuan surat dan Perihal wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }

    const isMasuk = _suratMode === 'masuk';
    const ep = isMasuk ? '/api/arsip/p/api/agenda/surat-masuk' : '/api/arsip/p/api/agenda/surat-keluar';
    const body = isMasuk
      ? { nomor_surat_asli: nomor, tanggal_surat: tanggal, tanggal_terima: tanggal, asal_surat: pihak, perihal, keterangan, tahun: Number(tanggal.slice(0, 4)) }
      : { nomor_surat: nomor, tanggal_surat: tanggal, tujuan_surat: pihak, perihal, bidang_pengonsep: bidang, keterangan, tahun: Number(tanggal.slice(0, 4)) };

    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || `HTTP ${res.status}`);
      closeSuratModal();
      if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Agenda surat berhasil dicatat.' });
      loadAgendaSurat();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  /* ── AGENDA SPPD ───────────────────────────────────────────────────────── */
  function setSppdJenis(jenis) {
    _sppdJenis = jenis || '';
    d.querySelectorAll('[data-sppd-jenis-btn]').forEach((btn) => {
      const act = (btn.dataset.sppdJenisBtn || '') === _sppdJenis;
      btn.className = act
        ? 'px-3.5 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer'
        : 'px-3.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer';
    });
    loadAgendaSppd();
  }

  async function loadAgendaSppd() {
    const tbody = d.getElementById('agendaSppdBody');
    const countEl = d.getElementById('agendaSppdCount');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl text-primary animate-spin align-middle mr-2">progress_activity</span>Memuat register SPPD...</td></tr>';

    const tahun = d.getElementById('agendaSppdYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('agendaSppdSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '60' });
    if (_sppdJenis) params.set('jenis', _sppdJenis);
    if (q) params.set('q', q);

    try {
      const res = await fetch(`/api/arsip/p/api/agenda/sppd?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      _sppdItems = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
      if (countEl) countEl.textContent = `${_sppdItems.length} SPPD`;

      if (!_sppdItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">Belum ada data Agenda SPPD untuk tahun ${esc(tahun)}.</td></tr>`;
        return;
      }

      tbody.innerHTML = _sppdItems.map((item, i) => {
        const noSppd = item.nomor_sppd || item.nomor_spt || `#${item.id || i + 1}`;
        const noSpt = item.nomor_spt && item.nomor_sppd ? item.nomor_spt : (item.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah');
        const tglRange = `${fmtDate(item.tanggal_berangkat)} – ${fmtDate(item.tanggal_kembali)}`;
        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="window.ArsipAgenda?.showSppdDetail(${i})">
            <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">${esc(noSppd)}<div class="text-[10px] font-normal text-slate-400">${esc(noSpt)}</div></td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[190px] truncate">${esc(item.pelaksana_nama || '-')}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[180px] truncate">${esc(item.tempat_tujuan || '-')}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(tglRange)}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[260px] truncate">${esc(item.maksud_perjalanan || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap text-right">${statusPill(item.status || 'Tercatat')}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (countEl) countEl.textContent = '0 SPPD';
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat register SPPD: ${esc(err?.message || 'Koneksi terganggu')}</td></tr>`;
    }
  }

  function showSppdDetail(idx) {
    const item = _sppdItems[idx];
    if (!item || !w.Swal) return;
    const rows = [
      ['Nomor SPPD', item.nomor_sppd || '-'],
      ['Nomor SPT', item.nomor_spt || '-'],
      ['Jenis Perjalanan', item.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah'],
      ['Pelaksana', item.pelaksana_nama || '-'],
      ['Tempat Tujuan', item.tempat_tujuan || '-'],
      ['Tanggal Berangkat', fmtDate(item.tanggal_berangkat)],
      ['Tanggal Kembali', fmtDate(item.tanggal_kembali)],
      ['Alat Angkutan', item.alat_angkutan || '-'],
      ['Maksud Perjalanan', item.maksud_perjalanan || '-'],
      ['Status', item.status || 'Tercatat'],
    ];
    const html = `<div class="text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">${rows.map(([k, v]) => `<div class="py-2 flex justify-between gap-4"><span class="text-slate-500 shrink-0">${esc(k)}</span><span class="font-semibold text-slate-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}</div>`;
    w.Swal.fire({ title: 'Detail Agenda SPPD', html, width: 560, confirmButtonText: 'Tutup', confirmButtonColor: '#2563eb' });
  }

  function openSppdModal() {
    const m = d.getElementById('modalArsipAgendaSppd');
    if (!m) return;
    const today = new Date().toISOString().slice(0, 10);
    m.querySelectorAll('input, textarea').forEach((el) => {
      el.value = el.type === 'date' ? today : '';
    });
    m.classList.remove('hidden');
    m.classList.add('flex');
    if (w.StitchPicker) {
      m.querySelectorAll('select').forEach((s) => { w.StitchPicker.enhanceSelect?.(s); w.StitchPicker.refresh?.(s); });
      m.querySelectorAll('input[type="date"]').forEach((i) => w.StitchPicker.enhanceDate?.(i));
    }
  }

  function closeSppdModal() {
    const m = d.getElementById('modalArsipAgendaSppd');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  }

  async function submitSppd(btnEl) {
    const m = d.getElementById('modalArsipAgendaSppd');
    if (!m) return;
    const v = (k) => (m.querySelector(`[data-sppd-field="${k}"]`)?.value || '').trim();
    const pelaksana_nama = v('pelaksana');
    const tempat_tujuan = v('tujuan');
    const maksud_perjalanan = v('maksud');
    const jenis_sppd = v('jenis') || 'DALAM_DAERAH';
    const tanggal_berangkat = v('berangkat') || new Date().toISOString().slice(0, 10);
    const tanggal_kembali = v('kembali') || tanggal_berangkat;
    const alat_angkutan = v('angkutan') || 'Kendaraan Dinas Roda 4';

    if (!pelaksana_nama || !tempat_tujuan || !maksud_perjalanan) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Nama pelaksana, tempat tujuan, dan maksud perjalanan wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }

    try {
      const res = await fetch('/api/arsip/p/api/agenda/sppd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jenis_sppd,
          pelaksana_nama,
          tempat_tujuan,
          maksud_perjalanan,
          tanggal_berangkat,
          tanggal_kembali,
          alat_angkutan,
          tahun: Number(tanggal_berangkat.slice(0, 4)),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || `HTTP ${res.status}`);
      closeSppdModal();
      if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Agenda SPPD berhasil dicatat.' });
      loadAgendaSppd();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  /* ── MOBILE #view-arsip SUB-MENU (Dokumen | Agenda Surat | Agenda SPPD) ── */
  let _mTab = 'dokumen';
  let _mSuratMode = 'masuk';
  let _mSppdJenis = '';

  function switchMobileTab(tab) {
    _mTab = (tab === 'agenda-surat' || tab === 'agenda-sppd') ? tab : 'dokumen';
    const pDok = d.getElementById('mobileArsipTabDokumen');
    const pSur = d.getElementById('mobileArsipTabAgendaSurat');
    const pSpp = d.getElementById('mobileArsipTabAgendaSppd');
    if (pDok) pDok.classList.toggle('hidden', _mTab !== 'dokumen');
    if (pSur) pSur.classList.toggle('hidden', _mTab !== 'agenda-surat');
    if (pSpp) pSpp.classList.toggle('hidden', _mTab !== 'agenda-sppd');

    d.querySelectorAll('[data-m-arsip-tab]').forEach((btn) => {
      const act = btn.dataset.mArsipTab === _mTab;
      btn.className = act
        ? 'flex-1 py-2 px-2 rounded-xl bg-[#2563eb] text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1'
        : 'flex-1 py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1';
    });

    if (_mTab === 'agenda-surat') loadMobileAgendaSurat();
    if (_mTab === 'agenda-sppd') loadMobileAgendaSppd();
  }

  function setMobileSuratMode(mode) {
    _mSuratMode = mode === 'keluar' ? 'keluar' : 'masuk';
    _suratMode = _mSuratMode;
    d.querySelectorAll('[data-m-surat-mode]').forEach((btn) => {
      const act = btn.dataset.mSuratMode === _mSuratMode;
      btn.className = act
        ? 'flex-1 py-1.5 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer'
        : 'flex-1 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-semibold cursor-pointer';
    });
    loadMobileAgendaSurat();
  }

  async function loadMobileAgendaSurat() {
    const box = d.getElementById('mobileAgendaSuratList');
    if (!box) return;
    box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl animate-spin text-primary align-middle mr-1">progress_activity</span>Memuat agenda surat...</div>';
    const tahun = String(new Date().getFullYear());
    const q = (d.getElementById('mobileAgendaSuratSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '40' });
    if (q) params.set('q', q);
    const ep = _mSuratMode === 'masuk'
      ? `/api/arsip/p/api/agenda/surat-masuk?${params.toString()}`
      : `/api/arsip/p/api/agenda/surat-keluar?${params.toString()}`;
    try {
      const r = await fetch(ep);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      _suratItems = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      if (!_suratItems.length) {
        box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada data ${_mSuratMode === 'masuk' ? 'Surat Masuk' : 'Surat Keluar'} tahun ${esc(tahun)}.</div>`;
        return;
      }
      box.innerHTML = _suratItems.map((item, i) => {
        const no = _mSuratMode === 'masuk' ? (item.nomor_agenda || `#${item.id || i + 1}`) : (item.nomor_surat || `#${item.nomor_urut || item.id || i + 1}`);
        const pihak = _mSuratMode === 'masuk' ? (item.asal_surat || '-') : (item.tujuan_surat || '-');
        const tgl = fmtDate(_mSuratMode === 'masuk' ? (item.tanggal_terima || item.tanggal_surat) : item.tanggal_surat);
        return `
          <button type="button" onclick="window.ArsipAgenda?.showSuratDetail(${i})" class="w-full text-left p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs hover:border-blue-300 transition-colors cursor-pointer">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-mono text-[11px] font-bold text-primary truncate">${esc(no)}</span>
              ${statusPill(item.status_tindaklanjut || item.status || 'Tercatat')}
            </div>
            <div class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">${esc(item.perihal || '-')}</div>
            <div class="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 gap-2">
              <span class="truncate">${esc(pihak)}</span>
              <span class="font-mono shrink-0">${esc(tgl)}</span>
            </div>
          </button>
        `;
      }).join('');
    } catch (err) {
      box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900">Gagal memuat: ${esc(err?.message || 'Koneksi terganggu')}</div>`;
    }
  }

  function setMobileSppdJenis(jenis) {
    _mSppdJenis = jenis || '';
    _sppdJenis = _mSppdJenis;
    d.querySelectorAll('[data-m-sppd-jenis]').forEach((btn) => {
      const act = (btn.dataset.mSppdJenis || '') === _mSppdJenis;
      btn.className = act
        ? 'flex-1 py-1.5 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer'
        : 'flex-1 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-semibold cursor-pointer';
    });
    loadMobileAgendaSppd();
  }

  async function loadMobileAgendaSppd() {
    const box = d.getElementById('mobileAgendaSppdList');
    if (!box) return;
    box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl animate-spin text-primary align-middle mr-1">progress_activity</span>Memuat agenda SPPD...</div>';
    const tahun = String(new Date().getFullYear());
    const q = (d.getElementById('mobileAgendaSppdSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '40' });
    if (_mSppdJenis) params.set('jenis', _mSppdJenis);
    if (q) params.set('q', q);
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/sppd?${params.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      _sppdItems = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      if (!_sppdItems.length) {
        box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada data Agenda SPPD tahun ${esc(tahun)}.</div>`;
        return;
      }
      box.innerHTML = _sppdItems.map((item, i) => {
        const no = item.nomor_sppd || item.nomor_spt || `#${item.id || i + 1}`;
        return `
          <button type="button" onclick="window.ArsipAgenda?.showSppdDetail(${i})" class="w-full text-left p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs hover:border-blue-300 transition-colors cursor-pointer">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-mono text-[11px] font-bold text-primary truncate">${esc(no)}</span>
              ${statusPill(item.status || 'Tercatat')}
            </div>
            <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(item.pelaksana_nama || '-')} &rarr; ${esc(item.tempat_tujuan || '-')}</div>
            <div class="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1 mt-0.5">${esc(item.maksud_perjalanan || '-')}</div>
            <div class="mt-1.5 font-mono text-[10px] text-slate-400">${esc(fmtDate(item.tanggal_berangkat))} – ${esc(fmtDate(item.tanggal_kembali))}</div>
          </button>
        `;
      }).join('');
    } catch (err) {
      box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900">Gagal memuat: ${esc(err?.message || 'Koneksi terganggu')}</div>`;
    }
  }

  w.ArsipAgenda = {
    switchTab,
    handleFabClick,
    setSuratMode,
    loadAgendaSurat,
    showSuratDetail,
    openSuratModal,
    closeSuratModal,
    submitSurat,
    setSppdJenis,
    loadAgendaSppd,
    showSppdDetail,
    openSppdModal,
    closeSppdModal,
    submitSppd,
    switchMobileTab,
    setMobileSuratMode,
    loadMobileAgendaSurat,
    setMobileSppdJenis,
    loadMobileAgendaSppd,
  };

  function boot() {
    if (!d.getElementById('arsipPanelDokumen')) return;
    switchTab(resolveTabFromHash(), false);
    w.addEventListener('hashchange', () => {
      const t = resolveTabFromHash();
      if (t !== _activeTab) switchTab(t, false);
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
