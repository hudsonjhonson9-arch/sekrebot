/* ════ ARSIP NATIVE — Register SPPD (Dalam & Luar Daerah) ════
   Kontrak: window.ArsipSPPD = { mount(el), unmount() }.
   Data dialirkan via proxy /api/arsip/p/api/agenda/*
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* global escapeHtml, apiGet, makeSearchDd */

  const PROXY = '/api/arsip/p/api/agenda';
  let el = null;
  let jenisAktif = 'DALAM_DAERAH'; // 'DALAM_DAERAH' | 'LUAR_DAERAH'
  let tahun = new Date().getFullYear();
  let itemsDD = [];
  let itemsLD = [];
  let totalDD = 0;
  let totalLD = 0;
  let query = '';
  let isLoading = false;

  const $x = (sel) => (el ? el.querySelector(sel) : null);

  function setTile(n) {
    const t = document.querySelector('#arsipHome [data-tile="sppd"] em');
    if (t) t.textContent = n !== undefined ? n + ' reg.' : '—';
  }

  function fmtRupiah(num) {
    const val = Number(num) || 0;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  }

  async function fetchDD() {
    isLoading = true;
    render();
    try {
      const qStr = query ? `&q=${encodeURIComponent(query)}` : '';
      const res = await apiGet(`${PROXY}/sppd?jenis=DALAM_DAERAH&tahun=${tahun}${qStr}`);
      if (res && res.ok && res.data) {
        itemsDD = res.data.items || [];
        totalDD = res.data.total || 0;
        setTile(totalDD + totalLD);
      }
    } catch (e) {
      console.error('[SPPD] Gagal memuat SPPD Dalam Daerah:', e);
    } finally {
      isLoading = false;
      render();
    }
  }

  async function fetchLD() {
    isLoading = true;
    render();
    try {
      const qStr = query ? `&q=${encodeURIComponent(query)}` : '';
      const res = await apiGet(`${PROXY}/sppd?jenis=LUAR_DAERAH&tahun=${tahun}${qStr}`);
      if (res && res.ok && res.data) {
        itemsLD = res.data.items || [];
        totalLD = res.data.total || 0;
        setTile(totalDD + totalLD);
      }
    } catch (e) {
      console.error('[SPPD] Gagal memuat SPPD Luar Daerah:', e);
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    if (!el) return;

    const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : (v || ''));
    const isDD = jenisAktif === 'DALAM_DAERAH';
    const currentList = isDD ? itemsDD : itemsLD;
    const totalReg = totalDD + totalLD;
    const totalBiaya = currentList.reduce((acc, curr) => acc + (Number(curr.total_biaya) || 0), 0);

    let html = `
      <div class="kk-head">
        <h3 class="kk-judul">Register SPPD</h3>
        <select id="sppdTahunSel" class="arsip-search kk-tahun" aria-label="Tahun">
          <option value="2026" ${tahun === 2026 ? 'selected' : ''}>2026</option>
          <option value="2025" ${tahun === 2025 ? 'selected' : ''}>2025</option>
          <option value="2024" ${tahun === 2024 ? 'selected' : ''}>2024</option>
        </select>
        <button type="button" id="btnReloadSppd" class="arsip-act" title="Muat ulang"><i class="fas fa-sync" aria-hidden="true"></i></button>
      </div>

      <div class="kk-ringkas">
        <div class="kk-stat"><b>${totalDD}</b><span>Dalam Daerah</span></div>
        <div class="kk-stat"><b>${totalLD}</b><span>Luar Daerah</span></div>
        <div class="kk-stat"><b>${totalReg}</b><span>Total SPPD</span></div>
        <div class="kk-stat"><b>${fmtRupiah(totalBiaya)}</b><span>Total Biaya</span></div>
      </div>

      <div class="dok-tabs">
        <button type="button" id="btnTabDD" class="dok-tab ${isDD ? 'active' : ''}">
          <i class="fas fa-car" aria-hidden="true" style="margin-right:6px"></i> Dalam Daerah (${totalDD})
        </button>
        <button type="button" id="btnTabLD" class="dok-tab ${!isDD ? 'active' : ''}">
          <i class="fas fa-map-marked-alt" aria-hidden="true" style="margin-right:6px"></i> Luar Daerah (${totalLD})
        </button>
      </div>

      <div class="arsip-toolbar" style="margin-bottom:12px">
        <input id="sppdSearch" class="arsip-search" placeholder="Cari nama pelaksana, tujuan, nomor SPT…" value="${esc(query)}" autocomplete="off">
        <button type="button" id="btnSearchSppd" class="arsip-act ok"><i class="fas fa-search" aria-hidden="true"></i> Cari</button>
      </div>
    `;

    if (isLoading) {
      html += `
        <div class="arsip-placeholder">
          <i class="fas fa-sync fa-spin" style="margin-right:8px" aria-hidden="true"></i> Memuat register SPPD…
        </div>
      `;
      el.innerHTML = html;
      bindEvents();
      return;
    }

    if (!currentList.length) {
      html += `
        <div class="arsip-placeholder">
          <div style="font-size:32px; margin-bottom:10px; opacity:0.6;"><i class="fas ${isDD ? 'fa-car' : 'fa-map-marked-alt'}" aria-hidden="true"></i></div>
          <div style="font-weight:700; color:var(--white);">Belum ada register SPPD ${isDD ? 'Dalam Daerah' : 'Luar Daerah'} tahun ${tahun}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:4px;">SPT & SPPD yang diterbitkan otomatis tersinkronisasi di register ini.</div>
        </div>
      `;
    } else {
      html += `<div class="arsip-sppd-list">`;
      for (const it of currentList) {
        const badgeCls = (it.status === 'Selesai' || it.status === 'Laporan Masuk') ? 'ok' : 'waiting';
        html += `
          <div class="arsip-item-wrap" style="align-items:flex-start; margin-bottom:10px;">
            <div class="arsip-row" style="align-items:flex-start;">
              <span class="arsip-ico" style="--ic:${isDD ? 'var(--gold)' : 'var(--warning)'}; margin-top:2px;">
                <i class="fas ${isDD ? 'fa-car' : 'fa-map-marked-alt'}" aria-hidden="true"></i>
              </span>
              <div class="arsip-item-body">
                <div class="arsip-item-top">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-family:monospace; font-weight:700; color:var(--gold); font-size:12px;">Reg #${esc(it.nomor_register)}</span>
                    ${it.nomor_spt ? `<span style="font-size:11px; color:var(--muted); font-family:monospace;">(SPT: ${esc(it.nomor_spt)})</span>` : ''}
                  </div>
                  <span class="arsip-badge ${badgeCls}">${esc(it.status || 'Pengajuan')}</span>
                </div>
                <div style="font-size:14px; font-weight:700; color:var(--white); margin:5px 0 2px;">
                  ${esc(it.pelaksana_nama || 'Pegawai')}
                  ${it.pelaksana_nip ? `<span style="font-size:11px; font-weight:normal; color:var(--muted); font-family:monospace; margin-left:6px;">NIP. ${esc(it.pelaksana_nip)}</span>` : ''}
                </div>
                <div style="font-size:12px; color:var(--white); margin:4px 0 8px; line-height:1.4;">
                  ${esc(it.maksud_perjalanan || '—')}
                </div>
                <div class="arsip-item-meta" style="display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center;">
                  <span><i class="fas fa-map-marker-alt" style="color:var(--danger); margin-right:4px;"></i> <b>${esc(it.tempat_tujuan || '—')}</b> ${it.provinsi_tujuan ? `(Prov. ${esc(it.provinsi_tujuan)})` : ''}</span>
                  <span><i class="fas fa-calendar-alt" style="color:var(--gold); margin-right:4px;"></i> ${esc(it.tanggal_berangkat || '—')} s/d ${esc(it.tanggal_kembali || '—')} (${esc(it.lama_hari || 1)} Hari)</span>
                  <span><i class="fas fa-money-bill-wave" style="color:var(--success); margin-right:4px;"></i> <b style="color:var(--white); font-family:monospace;">${fmtRupiah(it.total_biaya)}</b></span>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    el.innerHTML = html;
    bindEvents();
    if (typeof makeSearchDd === 'function' && $x('#sppdTahunSel')) {
      makeSearchDd('sppdTahunSel', { ph: 'Tahun', h: 38, noIcon: true });
    }
  }

  function bindEvents() {
    const selThn = $x('#sppdTahunSel');
    if (selThn) {
      selThn.onchange = (e) => {
        tahun = parseInt(e.target.value, 10);
        if (jenisAktif === 'DALAM_DAERAH') fetchDD();
        else fetchLD();
      };
    }

    const btnReload = $x('#btnReloadSppd');
    if (btnReload) {
      btnReload.onclick = () => {
        if (jenisAktif === 'DALAM_DAERAH') fetchDD();
        else fetchLD();
      };
    }

    const btnDD = $x('#btnTabDD');
    const btnLD = $x('#btnTabLD');
    if (btnDD) {
      btnDD.onclick = () => {
        jenisAktif = 'DALAM_DAERAH';
        fetchDD();
      };
    }
    if (btnLD) {
      btnLD.onclick = () => {
        jenisAktif = 'LUAR_DAERAH';
        fetchLD();
      };
    }

    const btnSearch = $x('#btnSearchSppd');
    const inpSearch = $x('#sppdSearch');
    if (btnSearch && inpSearch) {
      btnSearch.onclick = () => {
        query = inpSearch.value;
        if (jenisAktif === 'DALAM_DAERAH') fetchDD();
        else fetchLD();
      };
      inpSearch.onkeydown = (e) => {
        if (e.key === 'Enter') {
          query = inpSearch.value;
          if (jenisAktif === 'DALAM_DAERAH') fetchDD();
          else fetchLD();
        }
      };
    }
  }

  window.ArsipSPPD = {
    mount(targetEl) {
      el = targetEl;
      fetchDD();
      fetchLD();
    },
    unmount() {
      el = null;
    }
  };
})();
