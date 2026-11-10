/* ════ ARSIP NATIVE — Agenda Surat Masuk & Keluar ════
   Kontrak: window.ArsipAgenda = { mount(el), unmount() }.
   Data dialirkan via proxy /api/arsip/p/api/agenda/*
════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* global escapeHtml, apiFetch, apiGet */

  const PROXY = '/api/arsip/p/api/agenda';
  let el = null;
  let tabAktif = 'masuk'; // 'masuk' | 'keluar'
  let tahun = new Date().getFullYear();
  let itemsMasuk = [];
  let itemsKeluar = [];
  let totalMasuk = 0;
  let totalKeluar = 0;
  let query = '';
  let statusFilter = '';
  let isLoading = false;

  const $x = (sel) => (el ? el.querySelector(sel) : null);
  const isAdmin = () => !!(window.ARSIP && window.ARSIP.IS_ADMIN && window.ARSIP.IS_ADMIN());

  function setTile(n) {
    const t = document.querySelector('#arsipHome [data-tile="agenda"] em');
    if (t) t.textContent = n !== undefined ? n + ' surat' : '—';
  }

  async function fetchMasuk() {
    isLoading = true;
    render();
    try {
      const qStr = query ? `&q=${encodeURIComponent(query)}` : '';
      const stStr = statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : '';
      const res = await apiGet(`${PROXY}/surat-masuk?tahun=${tahun}${qStr}${stStr}`);
      if (res && res.ok && res.data) {
        itemsMasuk = res.data.items || [];
        totalMasuk = res.data.total || 0;
        setTile(totalMasuk + totalKeluar);
      }
    } catch (e) {
      console.error('[Agenda] Gagal memuat surat masuk:', e);
    } finally {
      isLoading = false;
      render();
    }
  }

  async function fetchKeluar() {
    isLoading = true;
    render();
    try {
      const qStr = query ? `&q=${encodeURIComponent(query)}` : '';
      const stStr = statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : '';
      const res = await apiGet(`${PROXY}/surat-keluar?tahun=${tahun}${qStr}${stStr}`);
      if (res && res.ok && res.data) {
        itemsKeluar = res.data.items || [];
        totalKeluar = res.data.total || 0;
        setTile(totalMasuk + totalKeluar);
      }
    } catch (e) {
      console.error('[Agenda] Gagal memuat surat keluar:', e);
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    if (!el) return;

    const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : (v || ''));
    const isMasuk = tabAktif === 'masuk';

    let html = `
      <div class="arsip-section-head" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:18px; font-weight:800; color:var(--white); margin:0;">Agenda Persuratan Digital</h2>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">Tata kelola tertib arsip surat masuk dan keluar BAPPERIDA</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <select id="agendaTahunSel" class="arsip-search" style="width:auto; padding:6px 12px; font-weight:700;">
            <option value="2026" ${tahun === 2026 ? 'selected' : ''}>Tahun 2026</option>
            <option value="2025" ${tahun === 2025 ? 'selected' : ''}>Tahun 2025</option>
          </select>
        </div>
      </div>

      <!-- Sub Tabs -->
      <div style="display:flex; gap:8px; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:16px;">
        <button id="btnTabMasuk" class="arsip-act" style="background:${isMasuk ? 'var(--gold)' : 'transparent'}; color:${isMasuk ? '#000' : 'var(--white)'}; font-weight:700; border-radius:8px 8px 0 0; padding:8px 18px;">
          <i class="fas fa-inbox" style="margin-right:6px;"></i> Surat Masuk (${totalMasuk})
        </button>
        <button id="btnTabKeluar" class="arsip-act" style="background:${!isMasuk ? 'var(--gold)' : 'transparent'}; color:${!isMasuk ? '#000' : 'var(--white)'}; font-weight:700; border-radius:8px 8px 0 0; padding:8px 18px;">
          <i class="fas fa-envelope-open-text" style="margin-right:6px;"></i> Surat Keluar (${totalKeluar})
        </button>
      </div>

      <!-- Filter Toolbar -->
      <div class="arsip-toolbar" style="margin-bottom:16px;">
        <input id="agendaSearch" class="arsip-search" placeholder="Cari nomor agenda / nomor surat / perihal…" value="${esc(query)}" />
        <button id="btnSearchAgenda" class="arsip-act ok"><i class="fas fa-search"></i> Cari</button>
      </div>
    `;

    if (isLoading) {
      html += `
        <div style="padding:24px; text-align:center; color:var(--muted);">
          <div style="font-size:24px; margin-bottom:8px;"><i class="fas fa-sync"></i></div>
          <div style="font-size:12px;">Memuat data agenda persuratan…</div>
        </div>
      `;
      el.innerHTML = html;
      bindEvents();
      return;
    }

    if (isMasuk) {
      if (!itemsMasuk.length) {
        html += `
          <div class="arsip-placeholder" style="text-align:center; padding:32px 16px;">
            <div style="font-size:32px; margin-bottom:8px; color:var(--muted);"><i class="fas fa-inbox"></i></div>
            <div style="font-weight:700; color:var(--white);">Belum ada surat masuk tahun ${tahun}</div>
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">Surat dinas yang dicatat melalui loket tata usaha akan muncul di sini.</div>
          </div>
        `;
      } else {
        html += `
          <div style="overflow-x:auto;">
            <table class="arsip-table" style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.15); color:var(--muted);">
                  <th style="padding:8px 12px; font-weight:700;">No. Agenda</th>
                  <th style="padding:8px 12px; font-weight:700;">Tanggal Terima</th>
                  <th style="padding:8px 12px; font-weight:700;">Pengirim / Asal</th>
                  <th style="padding:8px 12px; font-weight:700;">No. & Tanggal Surat</th>
                  <th style="padding:8px 12px; font-weight:700;">Perihal</th>
                  <th style="padding:8px 12px; font-weight:700;">Status</th>
                  <th style="padding:8px 12px; font-weight:700; text-align:right;">Berkas</th>
                </tr>
              </thead>
              <tbody>
        `;
        for (const it of itemsMasuk) {
          const badgeBg = it.status === 'Didisposisi' ? 'rgba(59,130,246,0.2)' : (it.status === 'Selesai' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)');
          const badgeColor = it.status === 'Didisposisi' ? '#60a5fa' : (it.status === 'Selesai' ? '#4ade80' : '#e2e8f0');
          html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
              <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:var(--gold); font-variant-numeric:tabular-nums;">${esc(it.nomor_agenda)}</td>
              <td style="padding:10px 12px; font-variant-numeric:tabular-nums;">${esc(it.tanggal_terima)}</td>
              <td style="padding:10px 12px; font-weight:600; color:var(--white);">${esc(it.asal_surat)}</td>
              <td style="padding:10px 12px;">
                <div style="font-weight:600;">${esc(it.nomor_surat_asli)}</div>
                <div style="font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums;">${esc(it.tanggal_surat)}</div>
              </td>
              <td style="padding:10px 12px; max-width:280px; line-height:1.4;">${esc(it.perihal)}</td>
              <td style="padding:10px 12px;">
                <span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:700; background:${badgeBg}; color:${badgeColor};">
                  ${esc(it.status || 'Diterima')}
                </span>
              </td>
              <td style="padding:10px 12px; text-align:right;">
                ${it.file_url ? `<a href="${esc(it.file_url)}" target="_blank" rel="noopener" class="arsip-act ok" style="padding:4px 8px; font-size:11px;"><i class="fas fa-file-pdf"></i> PDF</a>` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
              </td>
            </tr>
          `;
        }
        html += `</tbody></table></div>`;
      }
    } else {
      // TAB SURAT KELUAR
      if (!itemsKeluar.length) {
        html += `
          <div class="arsip-placeholder" style="text-align:center; padding:32px 16px;">
            <div style="font-size:32px; margin-bottom:8px; color:var(--muted);"><i class="fas fa-envelope-open-text"></i></div>
            <div style="font-weight:700; color:var(--white);">Belum ada surat keluar tahun ${tahun}</div>
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">Booking dan penerbitan nomor surat dinas resmi akan tercatat di sini.</div>
          </div>
        `;
      } else {
        html += `
          <div style="overflow-x:auto;">
            <table class="arsip-table" style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.15); color:var(--muted);">
                  <th style="padding:8px 12px; font-weight:700;">No. Urut</th>
                  <th style="padding:8px 12px; font-weight:700;">Nomor Surat Resmi</th>
                  <th style="padding:8px 12px; font-weight:700;">Tanggal</th>
                  <th style="padding:8px 12px; font-weight:700;">Tujuan Surat</th>
                  <th style="padding:8px 12px; font-weight:700;">Perihal</th>
                  <th style="padding:8px 12px; font-weight:700;">Bidang</th>
                  <th style="padding:8px 12px; font-weight:700;">Status</th>
                </tr>
              </thead>
              <tbody>
        `;
        for (const it of itemsKeluar) {
          const badgeBg = it.status === 'Ditandatangani' ? 'rgba(34,197,94,0.2)' : (it.status === 'Dibatalkan' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)');
          const badgeColor = it.status === 'Ditandatangani' ? '#4ade80' : (it.status === 'Dibatalkan' ? '#f87171' : '#fbbf24');
          html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
              <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:var(--gold); font-variant-numeric:tabular-nums;">${esc(String(it.nomor_urut).padStart(4, '0'))}</td>
              <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:var(--white); font-variant-numeric:tabular-nums;">${esc(it.nomor_surat)}</td>
              <td style="padding:10px 12px; font-variant-numeric:tabular-nums;">${esc(it.tanggal_surat)}</td>
              <td style="padding:10px 12px; font-weight:600; color:var(--white);">${esc(it.tujuan_surat)}</td>
              <td style="padding:10px 12px; max-width:280px; line-height:1.4;">${esc(it.perihal)}</td>
              <td style="padding:10px 12px; color:var(--muted);">${esc(it.bidang_pengonsep)}</td>
              <td style="padding:10px 12px;">
                <span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:700; background:${badgeBg}; color:${badgeColor};">
                  ${esc(it.status || 'Draf')}
                </span>
              </td>
            </tr>
          `;
        }
        html += `</tbody></table></div>`;
      }
    }

    el.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    const selThn = $x('#agendaTahunSel');
    if (selThn) {
      selThn.onchange = (e) => {
        tahun = parseInt(e.target.value, 10);
        if (tabAktif === 'masuk') fetchMasuk();
        else fetchKeluar();
      };
    }

    const btnMasuk = $x('#btnTabMasuk');
    const btnKeluar = $x('#btnTabKeluar');
    if (btnMasuk) {
      btnMasuk.onclick = () => {
        tabAktif = 'masuk';
        fetchMasuk();
      };
    }
    if (btnKeluar) {
      btnKeluar.onclick = () => {
        tabAktif = 'keluar';
        fetchKeluar();
      };
    }

    const btnSearch = $x('#btnSearchAgenda');
    const inpSearch = $x('#agendaSearch');
    if (btnSearch && inpSearch) {
      btnSearch.onclick = () => {
        query = inpSearch.value;
        if (tabAktif === 'masuk') fetchMasuk();
        else fetchKeluar();
      };
      inpSearch.onkeydown = (e) => {
        if (e.key === 'Enter') {
          query = inpSearch.value;
          if (tabAktif === 'masuk') fetchMasuk();
          else fetchKeluar();
        }
      };
    }
  }

  window.ArsipAgenda = {
    mount(targetEl) {
      el = targetEl;
      fetchMasuk();
      fetchKeluar();
    },
    unmount() {
      el = null;
    }
  };
})();
