/* ════ ARSIP NATIVE — Agenda Surat Masuk & Keluar ════
   Kontrak: window.ArsipAgenda = { mount(el), unmount() }.
   Data dialirkan via proxy /api/arsip/p/api/agenda/*
════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* global escapeHtml, apiGet, makeSearchDd */

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
    const totalAgenda = totalMasuk + totalKeluar;
    const currentList = isMasuk ? itemsMasuk : itemsKeluar;

    let html = `
      <div class="kk-head">
        <h3 class="kk-judul">Agenda Surat</h3>
        <select id="agendaTahunSel" class="arsip-search kk-tahun" aria-label="Tahun">
          <option value="2026" ${tahun === 2026 ? 'selected' : ''}>2026</option>
          <option value="2025" ${tahun === 2025 ? 'selected' : ''}>2025</option>
          <option value="2024" ${tahun === 2024 ? 'selected' : ''}>2024</option>
        </select>
        <button type="button" id="btnReloadAgenda" class="arsip-act" title="Muat ulang"><i class="fas fa-sync" aria-hidden="true"></i></button>
      </div>

      <div class="kk-ringkas">
        <div class="kk-stat"><b>${totalMasuk}</b><span>Surat Masuk</span></div>
        <div class="kk-stat"><b>${totalKeluar}</b><span>Surat Keluar</span></div>
        <div class="kk-stat"><b>${totalAgenda}</b><span>Total Agenda</span></div>
        <div class="kk-stat"><b>${tahun}</b><span>Tahun</span></div>
      </div>

      <div class="dok-tabs">
        <button type="button" id="btnTabMasuk" class="dok-tab ${isMasuk ? 'active' : ''}">
          <i class="fas fa-inbox" aria-hidden="true" style="margin-right:6px"></i> Surat Masuk (${totalMasuk})
        </button>
        <button type="button" id="btnTabKeluar" class="dok-tab ${!isMasuk ? 'active' : ''}">
          <i class="fas fa-envelope-open-text" aria-hidden="true" style="margin-right:6px"></i> Surat Keluar (${totalKeluar})
        </button>
      </div>

      <div class="arsip-toolbar" style="margin-bottom:12px">
        <input id="agendaSearch" class="arsip-search" placeholder="Cari nomor agenda, nomor surat, perihal…" value="${esc(query)}" autocomplete="off">
        <button type="button" id="btnSearchAgenda" class="arsip-act ok"><i class="fas fa-search" aria-hidden="true"></i> Cari</button>
      </div>
    `;

    if (isLoading) {
      html += `
        <div class="arsip-placeholder">
          <i class="fas fa-sync fa-spin" style="margin-right:8px" aria-hidden="true"></i> Memuat agenda surat…
        </div>
      `;
      el.innerHTML = html;
      bindEvents();
      return;
    }

    if (!currentList.length) {
      html += `
        <div class="arsip-placeholder">
          <div style="font-size:32px; margin-bottom:10px; opacity:0.6;"><i class="fas ${isMasuk ? 'fa-inbox' : 'fa-envelope-open-text'}" aria-hidden="true"></i></div>
          <div style="font-weight:700; color:var(--white);">Belum ada ${isMasuk ? 'surat masuk' : 'surat keluar'} tahun ${tahun}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:4px;">Data agenda persuratan akan tercatat secara otomatis di sini.</div>
        </div>
      `;
    } else {
      html += `<div class="arsip-agenda-list">`;
      for (const it of currentList) {
        if (isMasuk) {
          const badgeCls = (it.status === 'Selesai' || it.status === 'Diarsipkan') ? 'ok' : ((it.status === 'Didisposisi' || it.status === 'Diterima') ? 'waiting' : '');
          html += `
            <div class="arsip-item-wrap" style="align-items:flex-start; margin-bottom:10px;">
              <div class="arsip-row" style="align-items:flex-start;">
                <span class="arsip-ico" style="--ic:var(--gold); margin-top:2px;">
                  <i class="fas fa-inbox" aria-hidden="true"></i>
                </span>
                <div class="arsip-item-body">
                  <div class="arsip-item-top">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <span style="font-family:monospace; font-weight:700; color:var(--gold); font-size:12px;">#${esc(String(it.nomor_agenda).padStart(4, '0'))}</span>
                      <strong style="color:var(--white);">${esc(it.nomor_surat_asli || it.nomor_surat || 'Tanpa Nomor')}</strong>
                    </div>
                    <span class="arsip-badge ${badgeCls}">${esc(it.status || 'Diterima')}</span>
                  </div>
                  <div style="font-size:13px; font-weight:600; color:var(--white); margin:6px 0; line-height:1.4;">
                    ${esc(it.perihal || '—')}
                  </div>
                  <div class="arsip-item-meta" style="display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center;">
                    <span><i class="fas fa-building" style="color:var(--gold); margin-right:4px;"></i> ${esc(it.asal_surat || '—')}</span>
                    <span><i class="fas fa-calendar-alt" style="color:var(--gold); margin-right:4px;"></i> Terima: ${esc(it.tanggal_terima || '—')}</span>
                    ${it.tanggal_surat ? `<span><i class="fas fa-clock" style="color:var(--muted); margin-right:4px;"></i> Tgl Surat: ${esc(it.tanggal_surat)}</span>` : ''}
                    ${it.disposisi_kepada ? `<span><i class="fas fa-user" style="color:var(--gold); margin-right:4px;"></i> Disposisi: ${esc(it.disposisi_kepada)}</span>` : ''}
                  </div>
                </div>
              </div>
              ${it.file_url ? `
                <div class="arsip-actions" style="margin-top:6px;">
                  <a href="${esc(it.file_url)}" target="_blank" rel="noopener" class="arsip-act ok" style="text-decoration:none;">
                    <i class="fas fa-file-pdf"></i> Lihat PDF
                  </a>
                </div>
              ` : ''}
            </div>
          `;
        } else {
          const badgeCls = it.status === 'Ditandatangani' ? 'ok' : (it.status === 'Dibatalkan' ? 'no' : 'waiting');
          html += `
            <div class="arsip-item-wrap" style="align-items:flex-start; margin-bottom:10px;">
              <div class="arsip-row" style="align-items:flex-start;">
                <span class="arsip-ico" style="--ic:var(--success); margin-top:2px;">
                  <i class="fas fa-envelope-open-text" aria-hidden="true"></i>
                </span>
                <div class="arsip-item-body">
                  <div class="arsip-item-top">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <span style="font-family:monospace; font-weight:700; color:var(--gold); font-size:12px;">#${esc(String(it.nomor_urut).padStart(4, '0'))}</span>
                      <strong style="color:var(--white);">${esc(it.nomor_surat || 'Draf')}</strong>
                    </div>
                    <span class="arsip-badge ${badgeCls}">${esc(it.status || 'Draf')}</span>
                  </div>
                  <div style="font-size:13px; font-weight:600; color:var(--white); margin:6px 0; line-height:1.4;">
                    ${esc(it.perihal || '—')}
                  </div>
                  <div class="arsip-item-meta" style="display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center;">
                    <span><i class="fas fa-building" style="color:var(--gold); margin-right:4px;"></i> Tujuan: ${esc(it.tujuan_surat || '—')}</span>
                    <span><i class="fas fa-calendar-alt" style="color:var(--gold); margin-right:4px;"></i> ${esc(it.tanggal_surat || '—')}</span>
                    ${it.bidang_pengonsep ? `<span><i class="fas fa-file-alt" style="color:var(--gold); margin-right:4px;"></i> ${esc(it.bidang_pengonsep)}</span>` : ''}
                  </div>
                </div>
              </div>
              ${it.file_url ? `
                <div class="arsip-actions" style="margin-top:6px;">
                  <a href="${esc(it.file_url)}" target="_blank" rel="noopener" class="arsip-act ok" style="text-decoration:none;">
                    <i class="fas fa-file-pdf"></i> Lihat PDF
                  </a>
                </div>
              ` : ''}
            </div>
          `;
        }
      }
      html += `</div>`;
    }

    el.innerHTML = html;
    bindEvents();
    if (typeof makeSearchDd === 'function' && $x('#agendaTahunSel')) {
      makeSearchDd('agendaTahunSel', { ph: 'Tahun', h: 38, noIcon: true });
    }
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

    const btnReload = $x('#btnReloadAgenda');
    if (btnReload) {
      btnReload.onclick = () => {
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
